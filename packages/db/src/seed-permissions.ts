/**
 * Poner al día el catálogo de permisos de una base ya en uso.
 *
 * `seed.ts` inserta el catálogo, pero también carga datos de demostración: no es algo que se pueda
 * volver a correr contra producción cada vez que se agrega un permiso. Esto hace sólo la parte que
 * hace falta —las filas de `permissions` y la concesión al superadmin, que por definición los tiene
 * todos— y es idempotente: correrlo dos veces no cambia nada la segunda.
 *
 * Sin esto, un permiso nuevo existe en el código y no en la base, así que la pantalla que lo pide
 * queda invisible para todo el mundo, incluido el superadmin.
 */
import { eq } from 'drizzle-orm';

import { initialPermissionCatalog } from '@verdeo/rbac';

import { createDatabase } from './index.js';
import { permissions, rolePermissions, roles } from './schema/index.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const { client, db } = createDatabase(databaseUrl);

try {
  await db.transaction(async (transaction) => {
    const inserted = await transaction
      .insert(permissions)
      .values([...initialPermissionCatalog])
      .onConflictDoNothing()
      .returning({ key: permissions.key });
    console.log(
      inserted.length > 0
        ? `Permisos nuevos: ${inserted.map(({ key }) => key).join(', ')}`
        : 'Sin permisos nuevos.',
    );

    const [superadmin] = await transaction
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, 'superadmin'))
      .limit(1);
    if (!superadmin) throw new Error('No existe el rol superadmin');

    const all = await transaction.select({ id: permissions.id }).from(permissions);
    const granted = await transaction
      .insert(rolePermissions)
      .values(all.map(({ id }) => ({ permissionId: id, roleId: superadmin.id })))
      .onConflictDoNothing()
      .returning({ permissionId: rolePermissions.permissionId });
    console.log(`Concesiones nuevas al superadmin: ${String(granted.length)}.`);
  });
} finally {
  await client.end();
}
