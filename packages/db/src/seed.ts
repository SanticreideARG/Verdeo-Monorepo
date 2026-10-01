import { and, eq, notExists, sql } from 'drizzle-orm';

import { initialPermissionCatalog } from '@verdeo/rbac';

import { DEFAULT_HELP_ARTICLES } from './help-articles.js';
import { createDatabase } from './index.js';
import { applyRoleDefaults } from './role-defaults.js';
import {
  customerOperatingSites,
  customers,
  geographicZones,
  helpArticles,
  operatingSiteOrderCounters,
  operatingSites,
  permissions,
  rolePermissions,
  roles,
  surplusConfigs,
  userOperatingSites,
  userRoles,
} from './schema/index.js';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) throw new Error('DATABASE_URL is required');

const initialRoles = [
  { key: 'superadmin', name: 'Superadmin', description: 'Administración completa del sistema' },
  { key: 'operador', name: 'Operador', description: 'Operación comercial configurable' },
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

    // Lo que puede hacer cada rol recién creado vive en `role-defaults.ts`, que es lo mismo que
    // aplica `db:seed-permissions` contra una base ya en uso. Tenerlo acá suelto fue lo que dejó al
    // operador sin permisos de pedidos en producción.
    await applyRoleDefaults(transaction);

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

    /*
     * Sólo los clientes que no tienen NINGUNA ciudad asignada.
     *
     * Antes esto asignaba Neuquén a todos los clientes de la base. Corrido sobre una instalación
     * nueva es correcto —los únicos clientes son los de demostración, y son de Neuquén—, pero
     * corrido sobre una base ya poblada le agrega una membresía a Neuquén a cada cliente existente:
     * pasó en producción y dejó 220 clientes de Mendoza y Buenos Aires apareciendo también en la
     * lista de Neuquén. La lista de clientes filtra por membresía, así que un cliente asignado a dos
     * ciudades aparece en las dos.
     *
     * `onConflictDoNothing` no alcanzaba, porque no había conflicto: era una fila legítimamente
     * nueva para una ciudad distinta.
     */
    const customerRows = await transaction
      .select({ customerId: customers.id })
      .from(customers)
      .where(
        notExists(
          transaction
            .select({ one: sql`1` })
            .from(customerOperatingSites)
            .where(
              and(
                eq(customerOperatingSites.customerId, customers.id),
                eq(customerOperatingSites.status, 'active'),
              ),
            ),
        ),
      );
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

    // The V1 coefficient is a single global row with no natural unique key to upsert on, so this
    // checks for an existing row instead of relying on onConflictDoNothing() — otherwise reseeding
    // would insert a second row every time.
    const [existingSurplusConfig] = await transaction
      .select({ id: surplusConfigs.id })
      .from(surplusConfigs)
      .limit(1);
    if (!existingSurplusConfig) {
      await transaction.insert(surplusConfigs).values({ coefficientPercent: '0' });
    }

    // Default "ayuda modularizada" content — one article per major section, gated by the same
    // permission that already gates the screen it's about. `onConflictDoUpdate` on `key` keeps the
    // text current on every reseed instead of accumulating stale duplicates.
    const defaultHelpArticles = DEFAULT_HELP_ARTICLES;
    for (const article of defaultHelpArticles) {
      await transaction
        .insert(helpArticles)
        .values(article)
        .onConflictDoUpdate({
          set: {
            active: true,
            body: article.body,
            category: article.category,
            ordinal: article.ordinal,
            requiredPermission: article.requiredPermission,
            title: article.title,
            updatedAt: new Date(),
          },
          target: helpArticles.key,
        });
    }
  });
} finally {
  await client.end();
}
