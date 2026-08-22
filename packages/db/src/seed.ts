import { eq, inArray } from 'drizzle-orm';

import { initialPermissionCatalog } from '@verdeo/rbac';

import { createDatabase } from './index.js';
import {
  customerOperatingSites,
  customers,
  geographicZones,
  operatingSiteOrderCounters,
  operatingSites,
  permissions,
  rolePermissions,
  roles,
  userOperatingSites,
  userRoles,
} from './schema/index.js';

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

    // Chat reaches operators, superadmins and drivers. Superadmin already holds every permission,
    // so only the other two need an explicit grant. Expressed as data: no code checks a role name.
    const chatPermissions = await transaction
      .select({ id: permissions.id })
      .from(permissions)
      .where(inArray(permissions.key, ['chat.use', 'chat.presence.read']));
    if (chatPermissions.length > 0) {
      const chatRoles = await transaction
        .select({ id: roles.id })
        .from(roles)
        .where(inArray(roles.key, ['operador', 'repartidor']));
      if (chatRoles.length > 0) {
        await transaction
          .insert(rolePermissions)
          .values(
            chatRoles.flatMap(({ id }) =>
              chatPermissions.map((permission) => ({ permissionId: permission.id, roleId: id })),
            ),
          )
          .onConflictDoNothing();
      }
    }

    const [neuquenSite] = await transaction
      .insert(operatingSites)
      .values({
        displayName: 'Neuquén',
        orderPrefix: 'NQN',
        slug: 'neuquen',
        sortOrder: 0,
        timezone: 'America/Argentina/Buenos_Aires',
      })
      .onConflictDoUpdate({
        set: {
          displayName: 'Neuquén',
          updatedAt: new Date(),
        },
        target: operatingSites.slug,
      })
      .returning({ id: operatingSites.id });
    if (!neuquenSite) throw new Error('Could not seed the Neuquén operating site');

    await transaction
      .insert(geographicZones)
      .values({
        displayName: 'Neuquén',
        operatingSiteId: neuquenSite.id,
        slug: 'neuquen',
        sortOrder: 0,
      })
      .onConflictDoNothing();

    await transaction
      .insert(operatingSiteOrderCounters)
      .values({ operatingSiteId: neuquenSite.id })
      .onConflictDoNothing();

    const superadminUsers = await transaction
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(eq(userRoles.roleId, superadmin.id));
    if (superadminUsers.length > 0) {
      await transaction
        .insert(userOperatingSites)
        .values(
          superadminUsers.map(({ userId }) => ({
            active: true,
            defaultSite: true,
            operatingSiteId: neuquenSite.id,
            userId,
          })),
        )
        .onConflictDoNothing();
    }

    const customerRows = await transaction.select({ customerId: customers.id }).from(customers);
    if (customerRows.length > 0) {
      await transaction
        .insert(customerOperatingSites)
        .values(
          customerRows.map(({ customerId }) => ({
            customerId,
            operatingSiteId: neuquenSite.id,
          })),
        )
        .onConflictDoNothing();
    }
  });
} finally {
  await client.end();
}
