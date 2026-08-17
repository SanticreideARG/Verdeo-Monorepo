import { eq } from 'drizzle-orm';

import { initialPermissionCatalog } from '@verdeo/rbac';

import { createDatabase } from './index.js';
import { permissions, rolePermissions, roles } from './schema/index.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error('DATABASE_URL is required');

const initialRoles = [
  { key: 'superadmin', name: 'Superadmin', description: 'Administración completa del sistema' },
  { key: 'operador', name: 'Operador', description: 'Operación comercial configurable' },
  { key: 'repartidor', name: 'Repartidor', description: 'Operación de reparto configurable' },
  { key: 'cocina', name: 'Cocina', description: 'Rol reservado para operación de cocina' },
  { key: 'cliente', name: 'Cliente', description: 'Acceso del cliente a sus propios recursos' },
] as const;

const { client, db } = createDatabase(databaseUrl);

try {
  await db.transaction(async (transaction) => {
    await transaction
      .insert(permissions)
      .values([...initialPermissionCatalog])
      .onConflictDoNothing();
    await transaction
      .insert(roles)
      .values([...initialRoles])
      .onConflictDoNothing();

    const [superadmin] = await transaction
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, 'superadmin'))
      .limit(1);

    if (!superadmin) throw new Error('Could not seed the superadmin role');

    const permissionRows = await transaction.select({ id: permissions.id }).from(permissions);

    if (permissionRows.length > 0) {
      await transaction
        .insert(rolePermissions)
        .values(permissionRows.map(({ id }) => ({ permissionId: id, roleId: superadmin.id })))
        .onConflictDoNothing();
    }
  });
} finally {
  await client.end();
}
