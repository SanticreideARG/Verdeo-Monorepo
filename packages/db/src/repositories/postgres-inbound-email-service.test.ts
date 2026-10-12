import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from '../index.js';
import * as schema from '../schema/index.js';
import {
  InboundEmailConflictError,
  PostgresInboundEmailService,
} from './postgres-inbound-email-service.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');
const USER = 'f0000000-0000-4000-8000-000000000001';

let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});

async function base() {
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
  await client.exec(`insert into users (id, display_name) values ('${USER}', 'Isabella')`);
  close = () => client.close();
  const db = drizzle(client, { schema }) as unknown as Database;
  return { client, service: new PostgresInboundEmailService(db) };
}

const mail = (id: string) => ({
  body: 'Celular: 1155550101\nDirección: Julián Álvarez 1010',
  fromAddress: 'web@verdeo.com.ar',
  gmailMessageId: id,
  receivedAt: new Date('2026-10-12T10:00:00Z'),
  subject: 'Pedido online Capital Federal',
});

describe('PostgresInboundEmailService', () => {
  // El script reintenta si la API no respondió: un reintento no puede duplicar el pedido.
  it('guarda cada mail una sola vez aunque llegue dos veces', async () => {
    const { service } = await base();

    const primero = await service.store(mail('m-1'), { rows: [] }, 'pending');
    const repetido = await service.store(mail('m-1'), { rows: [] }, 'pending');

    expect(primero.stored).toBe(true);
    expect(repetido).toEqual({ id: null, stored: false });
    expect(await service.list(['pending'], 10)).toHaveLength(1);
  });

  it('lista sin el cuerpo y trae el cuerpo al abrir uno', async () => {
    const { service } = await base();
    const { id } = await service.store(mail('m-1'), { rows: [] }, 'pending');

    const [resumen] = await service.list(['pending'], 10);
    expect(resumen).not.toHaveProperty('body');
    expect((await service.get(id ?? ''))?.body).toContain('Julián Álvarez');
  });

  // Dos personas aprobando el mismo mail a la vez: sólo una puede.
  it('sólo una persona puede reclamar un mail para aprobarlo', async () => {
    const { service } = await base();
    const { id } = await service.store(mail('m-1'), { rows: [] }, 'pending');

    await service.claim(id ?? '');
    await expect(service.claim(id ?? '')).rejects.toThrow(InboundEmailConflictError);
  });

  it('si el pedido no se pudo crear, el mail vuelve a quedar pendiente', async () => {
    const { service } = await base();
    const { id } = await service.store(mail('m-1'), { rows: [] }, 'pending');
    await service.claim(id ?? '');

    await service.release(id ?? '');

    expect((await service.get(id ?? ''))?.status).toBe('pending');
  });

  it('aprobar guarda los pedidos creados y quién lo hizo', async () => {
    const { service } = await base();
    const { id } = await service.store(mail('m-1'), { rows: [] }, 'pending');
    await service.claim(id ?? '');

    await service.resolve(id ?? '', 'approved', ['0a000000-0000-4000-8000-000000000001'], USER);

    const resuelto = await service.get(id ?? '');
    expect(resuelto).toMatchObject({
      orderIds: ['0a000000-0000-4000-8000-000000000001'],
      resolvedByUserId: USER,
      status: 'approved',
    });
  });

  it('descartar no necesita reclamarlo antes, pero no descarta uno ya aprobado', async () => {
    const { service } = await base();
    const { id } = await service.store(mail('m-1'), { rows: [] }, 'pending');
    await service.resolve(id ?? '', 'discarded', [], USER);
    expect((await service.get(id ?? ''))?.status).toBe('discarded');

    await expect(service.resolve(id ?? '', 'discarded', [], USER)).rejects.toThrow(
      InboundEmailConflictError,
    );
  });

  it('dice cuántos esperan y cuándo llegó el último', async () => {
    const { service } = await base();
    expect(await service.overview()).toEqual({ lastReceivedAt: null, pending: 0 });

    await service.store(mail('m-1'), { rows: [] }, 'pending');
    await service.store(mail('m-2'), { rows: [] }, 'inquiry');

    const resumen = await service.overview();
    expect(resumen.pending).toBe(1);
    expect(resumen.lastReceivedAt).not.toBeNull();
  });
});
