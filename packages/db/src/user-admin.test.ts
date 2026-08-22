import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from './index.js';
import { PostgresUserAdminRepository } from './repositories/postgres-user-admin-repository.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function migratedDatabase(): Promise<{
  client: PGlite;
  close: () => Promise<void>;
  db: Database;
}> {
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
  return {
    client,
    close: () => client.close(),
    db: drizzle(client, { schema }) as unknown as Database,
  };
}

const OPERADOR_ROLE = '10000000-0000-4000-8000-000000000001';
const REPARTIDOR_ROLE = '10000000-0000-4000-8000-000000000002';
const ORDERS_READ = '20000000-0000-4000-8000-000000000001';
const ORDERS_EDIT = '20000000-0000-4000-8000-000000000002';
const USER = '30000000-0000-4000-8000-000000000001';
const ADMIN = '30000000-0000-4000-8000-000000000002';

const seed = `
  insert into roles (id, key, name) values
    ('${OPERADOR_ROLE}', 'operador', 'Operador'),
    ('${REPARTIDOR_ROLE}', 'repartidor', 'Repartidor');
  insert into permissions (id, key, group_name, description) values
    ('${ORDERS_READ}', 'orders.read', 'orders', 'Ver pedidos'),
    ('${ORDERS_EDIT}', 'orders.edit', 'orders', 'Editar pedidos');
  insert into role_permissions (role_id, permission_id) values
    ('${OPERADOR_ROLE}', '${ORDERS_READ}'),
    ('${OPERADOR_ROLE}', '${ORDERS_EDIT}'),
    ('${REPARTIDOR_ROLE}', '${ORDERS_READ}');
  insert into users (id, display_name, email_normalized) values
    ('${USER}', 'María Pérez', 'maria@example.com'),
    ('${ADMIN}', 'Superadmin', 'admin@example.com');
  insert into user_roles (user_id, role_id) values ('${USER}', '${OPERADOR_ROLE}');
`;

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function seededRepository(): Promise<PostgresUserAdminRepository> {
  const { client, close: closeDatabase, db } = await migratedDatabase();
  close = closeDatabase;
  await client.exec(seed);
  return new PostgresUserAdminRepository(db);
}

describe('user admin: detail', () => {
  it('returns roles and the effective permissions they grant', async () => {
    const repository = await seededRepository();
    const detail = await repository.getDetail(USER);
    expect(detail?.roles.map((role) => role.key)).toEqual(['operador']);
    expect(detail?.effectivePermissions).toEqual(['orders.edit', 'orders.read']);
    expect(detail?.overrides).toEqual([]);
  });

  it('returns null for an unknown user', async () => {
    const repository = await seededRepository();
    await expect(repository.getDetail('00000000-0000-4000-8000-000000000099')).resolves.toBeNull();
  });
});

describe('user admin: status', () => {
  it('disables and reactivates a user', async () => {
    const repository = await seededRepository();
    const disabled = await repository.setStatus(USER, false);
    expect(disabled.status).toBe('disabled');
    const reactivated = await repository.setStatus(USER, true);
    expect(reactivated.status).toBe('active');
  });
});

describe('user admin: roles', () => {
  it('replaces the role set and recomputes effective permissions', async () => {
    const repository = await seededRepository();
    const updated = await repository.setRoles(USER, [REPARTIDOR_ROLE], ADMIN);
    expect(updated.roles.map((role) => role.key)).toEqual(['repartidor']);
    // orders.edit came only from operador; it's gone once that role is removed.
    expect(updated.effectivePermissions).toEqual(['orders.read']);
  });

  it('clears roles entirely when given an empty list', async () => {
    const repository = await seededRepository();
    const updated = await repository.setRoles(USER, [], ADMIN);
    expect(updated.roles).toEqual([]);
    expect(updated.effectivePermissions).toEqual([]);
  });
});

describe('user admin: permission overrides', () => {
  it('a deny override removes a role-granted permission', async () => {
    const repository = await seededRepository();
    const updated = await repository.setPermissionOverrides(
      USER,
      [{ effect: 'deny', permissionId: ORDERS_EDIT }],
      ADMIN,
    );
    expect(updated.effectivePermissions).toEqual(['orders.read']);
    expect(updated.overrides).toEqual([
      { effect: 'deny', permissionId: ORDERS_EDIT, permissionKey: 'orders.edit', reason: null },
    ]);
  });

  it('an allow override grants a permission no role provides', async () => {
    const repository = await seededRepository();
    // Repartidor alone would only have orders.read; grant it orders.edit as an exception.
    await repository.setRoles(USER, [REPARTIDOR_ROLE], ADMIN);
    const updated = await repository.setPermissionOverrides(
      USER,
      [{ effect: 'allow', permissionId: ORDERS_EDIT, reason: 'Cobertura temporal' }],
      ADMIN,
    );
    expect(updated.effectivePermissions).toEqual(['orders.edit', 'orders.read']);
    expect(updated.overrides[0]?.reason).toBe('Cobertura temporal');
  });

  it('replaces the override set instead of accumulating', async () => {
    const repository = await seededRepository();
    await repository.setPermissionOverrides(
      USER,
      [{ effect: 'deny', permissionId: ORDERS_READ }],
      ADMIN,
    );
    const replaced = await repository.setPermissionOverrides(USER, [], ADMIN);
    expect(replaced.overrides).toEqual([]);
    expect(replaced.effectivePermissions).toEqual(['orders.edit', 'orders.read']);
  });
});

describe('user admin: catalog reads', () => {
  it('lists roles and the permission catalog', async () => {
    const repository = await seededRepository();
    const roles = await repository.listRoles();
    expect(roles.map((role) => role.key).sort()).toEqual(['operador', 'repartidor']);
    const catalog = await repository.listPermissionsCatalog();
    expect(catalog.map((entry) => entry.key).sort()).toEqual(['orders.edit', 'orders.read']);
  });
});
