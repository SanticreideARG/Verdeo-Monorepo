import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { initialPermissionCatalog } from '@verdeo/rbac';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import { ROLE_DEFAULT_PERMISSIONS, applyRoleDefaults } from './role-defaults.js';
import type { Database } from './index.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

/** Una base con el catálogo de permisos y los tres roles, que es lo que hay antes del seed. */
async function baseConRoles(): Promise<Database> {
  const client = new PGlite();
  await client.waitReady;
  close = () => client.close();

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

  const db = drizzle(client, { schema }) as unknown as Database;
  await db
    .insert(schema.permissions)
    .values([...initialPermissionCatalog])
    .onConflictDoNothing();
  await db
    .insert(schema.roles)
    .values([
      { key: 'superadmin', name: 'Superadmin' },
      { key: 'operador', name: 'Operador' },
      { key: 'repartidor', name: 'Repartidor' },
    ])
    .onConflictDoNothing();
  return db;
}

async function permisosDe(db: Database, roleKey: string): Promise<string[]> {
  const rows = await db
    .select({ key: schema.permissions.key })
    .from(schema.rolePermissions)
    .innerJoin(schema.roles, eq(schema.roles.id, schema.rolePermissions.roleId))
    .innerJoin(schema.permissions, eq(schema.permissions.id, schema.rolePermissions.permissionId))
    .where(eq(schema.roles.key, roleKey));
  return rows.map((row) => row.key).sort();
}

describe('applyRoleDefaults', () => {
  it('le da al operador lo que necesita para trabajar la semana', async () => {
    const db = await baseConRoles();

    await applyRoleDefaults(db);

    const permisos = await permisosDe(db, 'operador');
    // Esto es el agujero que salió a producción: el operador armaba rutas y registraba cobros pero
    // no podía tomar un pedido.
    expect(permisos).toContain('orders.create');
    expect(permisos).toContain('orders.confirm');
    expect(permisos).toContain('customers.create');
    expect(permisos).toEqual([...ROLE_DEFAULT_PERMISSIONS.operador!].sort());
  });

  it('no le da al repartidor ni la plata ni la administración de rutas', async () => {
    const db = await baseConRoles();

    await applyRoleDefaults(db);

    const permisos = await permisosDe(db, 'repartidor');
    expect(permisos).toContain('delivery.execute');
    expect(permisos.filter((key) => key.startsWith('payments.'))).toEqual([]);
    expect(permisos).not.toContain('routes.manage');
    expect(permisos).not.toContain('customers.read');
  });

  it('no toca al superadmin ni le inventa una lista', async () => {
    const db = await baseConRoles();

    await applyRoleDefaults(db);

    expect(await permisosDe(db, 'superadmin')).toEqual([]);
  });

  it('es idempotente y no quita un permiso concedido a mano', async () => {
    const db = await baseConRoles();
    const [operador] = await db
      .select({ id: schema.roles.id })
      .from(schema.roles)
      .where(eq(schema.roles.key, 'operador'))
      .limit(1);
    const [extra] = await db
      .select({ id: schema.permissions.id })
      .from(schema.permissions)
      .where(eq(schema.permissions.key, 'audit.read'))
      .limit(1);
    await db
      .insert(schema.rolePermissions)
      .values({ permissionId: extra!.id, roleId: operador!.id });

    const primera = await applyRoleDefaults(db);
    const segunda = await applyRoleDefaults(db);

    expect(primera.operador).toBeGreaterThan(0);
    expect(segunda).toEqual({ operador: 0, repartidor: 0 });
    // La concesión a mano es una decisión de la operación; correr esto no la revierte.
    expect(await permisosDe(db, 'operador')).toContain('audit.read');
  });
});
