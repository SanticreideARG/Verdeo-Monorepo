import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { hashPassword, verifyPassword } from '@verdeo/auth';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from './index.js';
import {
  PasswordResetError,
  PostgresPasswordResetService,
} from './repositories/postgres-password-reset-service.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const USER = 'f0000000-0000-4000-8000-000000000001';
const OTHER = 'f0000000-0000-4000-8000-000000000002';
const SESSION = 'f0000000-0000-4000-8000-0000000000a1';
const OLD_SESSION = 'f0000000-0000-4000-8000-0000000000a2';
const CURRENT = 'contraseña-actual-larga';
const NEXT = 'contraseña-nueva-larga';

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
});

async function seeded({ status = 'active' }: { status?: string } = {}) {
  const client = new PGlite();
  await client.waitReady;
  for (const file of readdirSync(migrationsFolder)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    for (const statement of readFileSync(join(migrationsFolder, file), 'utf8')
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !/^(--[^\n]*\n?)*$/.test(part))) {
      await client.exec(statement);
    }
  }
  close = () => client.close();

  const hash = await hashPassword(CURRENT);
  await client.exec(`
    insert into users (id, display_name, email_normalized, status) values
      ('${USER}', 'Isabella', 'isabella@ejemplo.com', '${status}'),
      ('${OTHER}', 'Otra', 'otra@ejemplo.com', 'active');
    insert into password_credentials (user_id, password_hash, failed_attempts, locked_until)
    values ('${USER}', '${hash}', 4, now() + interval '30 minutes');
    insert into sessions (id, user_id, token_hash, expires_at) values
      ('${SESSION}', '${USER}', 'hash-actual', now() + interval '1 day'),
      ('${OLD_SESSION}', '${USER}', 'hash-vieja', now() + interval '1 day');
  `);

  const service = new PostgresPasswordResetService(
    drizzle(client, { schema }) as unknown as Database,
  );
  return { client, service };
}

async function storedHash(client: PGlite): Promise<string> {
  const rows = await client.query<{ password_hash: string }>(
    `select password_hash from password_credentials where user_id = '${USER}'`,
  );
  return rows.rows[0]?.password_hash ?? '';
}

describe('request', () => {
  it('issues a link for a real active account', async () => {
    const { service } = await seeded();

    const issued = await service.request('  Isabella@Ejemplo.com  ');

    expect(issued).toMatchObject({ displayName: 'Isabella', email: 'isabella@ejemplo.com' });
    expect(issued?.token.length).toBeGreaterThan(20);
  });

  /**
   * Estos tres casos tienen que ser indistinguibles desde afuera. Si contestaran distinto, el
   * endpoint sería una forma de averiguar quién trabaja acá.
   */
  it('returns null for an unknown address and for a disabled account', async () => {
    const { service } = await seeded();
    expect(await service.request('nadie@ejemplo.com')).toBeNull();

    const disabled = await seeded({ status: 'disabled' });
    expect(await disabled.service.request('isabella@ejemplo.com')).toBeNull();
  });

  it('stops after five links in the window', async () => {
    const { service } = await seeded();
    for (let index = 0; index < 5; index += 1) {
      expect(await service.request('isabella@ejemplo.com')).not.toBeNull();
    }

    expect(await service.request('isabella@ejemplo.com')).toBeNull();
  });

  // Sólo el hash: un volcado de la tabla no debe alcanzar para entrar a ninguna cuenta.
  it('never stores the raw token', async () => {
    const { client, service } = await seeded();
    const issued = await service.request('isabella@ejemplo.com');

    const rows = await client.query<{ token_hash: string }>(
      `select token_hash from password_reset_tokens`,
    );
    expect(rows.rows[0]?.token_hash).not.toBe(issued?.token);
  });
});

describe('consume', () => {
  it('sets the new password', async () => {
    const { client, service } = await seeded();
    const issued = await service.request('isabella@ejemplo.com');

    await service.consume(issued!.token, NEXT);

    expect(await verifyPassword(NEXT, await storedHash(client))).toBe(true);
    expect(await verifyPassword(CURRENT, await storedHash(client))).toBe(false);
  });

  /** Quedar afuera por intentos fallidos es justamente por qué alguien llega a esta pantalla. */
  it('clears the lockout', async () => {
    const { client, service } = await seeded();
    const issued = await service.request('isabella@ejemplo.com');

    await service.consume(issued!.token, NEXT);

    const rows = await client.query<{ failed_attempts: number; locked_until: string | null }>(
      `select failed_attempts, locked_until from password_credentials where user_id = '${USER}'`,
    );
    expect(rows.rows[0]).toMatchObject({ failed_attempts: 0, locked_until: null });
  });

  /** Si el motivo del cambio es que entró otro, dejarle la sesión viva vuelve inútil al cambio. */
  it('revokes every open session of that account', async () => {
    const { client, service } = await seeded();
    const issued = await service.request('isabella@ejemplo.com');

    await service.consume(issued!.token, NEXT);

    const rows = await client.query<{ n: number }>(
      `select count(*)::int as n from sessions where user_id = '${USER}' and revoked_at is null`,
    );
    expect(rows.rows[0]?.n).toBe(0);
  });

  it('refuses a token that was already used', async () => {
    const { service } = await seeded();
    const issued = await service.request('isabella@ejemplo.com');
    await service.consume(issued!.token, NEXT);

    await expect(service.consume(issued!.token, 'otra-contraseña-larga')).rejects.toThrow(
      PasswordResetError,
    );
  });

  // Un enlace viejo en un correo no debe seguir sirviendo después de recuperar la cuenta.
  it('spends the other outstanding links too', async () => {
    const { service } = await seeded();
    const first = await service.request('isabella@ejemplo.com');
    const second = await service.request('isabella@ejemplo.com');

    await service.consume(second!.token, NEXT);

    await expect(service.consume(first!.token, 'otra-contraseña-larga')).rejects.toThrow(
      PasswordResetError,
    );
  });

  it('refuses an expired token', async () => {
    const { client, service } = await seeded();
    const issued = await service.request('isabella@ejemplo.com');
    await client.exec(`update password_reset_tokens set expires_at = now() - interval '1 minute'`);

    await expect(service.consume(issued!.token, NEXT)).rejects.toThrow(PasswordResetError);
  });
});

describe('changeOwn', () => {
  it('changes the password when the current one matches', async () => {
    const { client, service } = await seeded();

    await service.changeOwn({
      currentPassword: CURRENT,
      exceptSessionId: SESSION,
      newPassword: NEXT,
      userId: USER,
    });

    expect(await verifyPassword(NEXT, await storedHash(client))).toBe(true);
  });

  /** Sin esto, cualquiera que agarre la pantalla desbloqueada se queda con la cuenta. */
  it('refuses when the current password is wrong, and changes nothing', async () => {
    const { client, service } = await seeded();

    await expect(
      service.changeOwn({
        currentPassword: 'no-es-la-mia-larga',
        exceptSessionId: SESSION,
        newPassword: NEXT,
        userId: USER,
      }),
    ).rejects.toThrow(PasswordResetError);
    expect(await verifyPassword(CURRENT, await storedHash(client))).toBe(true);
  });

  /** Echar a alguien de la pantalla donde acaba de elegir la contraseña lo haría pensar que falló. */
  it('keeps the session doing the change and revokes the rest', async () => {
    const { client, service } = await seeded();

    await service.changeOwn({
      currentPassword: CURRENT,
      exceptSessionId: SESSION,
      newPassword: NEXT,
      userId: USER,
    });

    const rows = await client.query<{ id: string }>(
      `select id from sessions where user_id = '${USER}' and revoked_at is null`,
    );
    expect(rows.rows.map((row) => row.id)).toEqual([SESSION]);
  });
});
