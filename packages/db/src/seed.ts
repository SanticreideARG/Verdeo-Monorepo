import { eq, inArray } from 'drizzle-orm';

import { initialPermissionCatalog } from '@verdeo/rbac';

import { createDatabase } from './index.js';
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

    // Sharing a customer reference is a PII disclosure (ADR-032), so it defaults to operators only.
    // A reference still resolves to "no disponible" for a viewer without customers.read regardless,
    // but not handing a driver the ability to point colleagues at customer records in the first
    // place is the more conservative default the seed can pick.
    const [shareReferencePermission] = await transaction
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.key, 'chat.share_reference'))
      .limit(1);
    if (shareReferencePermission) {
      const [operadorRole] = await transaction
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, 'operador'))
        .limit(1);
      if (operadorRole) {
        await transaction
          .insert(rolePermissions)
          .values({ permissionId: shareReferencePermission.id, roleId: operadorRole.id })
          .onConflictDoNothing();
      }
    }

    // Fase 8 defaults: operators build/publish routes and handle the money side; drivers only
    // execute their own assigned stops and trigger the semantic delivery messages — never
    // routes.manage/payments.*, so a driver can't reassign stops or touch payment records.
    const operadorPermissions = await transaction
      .select({ id: permissions.id })
      .from(permissions)
      .where(
        inArray(permissions.key, [
          'routes.read',
          'routes.manage',
          'routes.publish',
          'payments.read',
          'payments.record',
          'payments.settle',
        ]),
      );
    const repartidorPermissions = await transaction
      .select({ id: permissions.id })
      .from(permissions)
      .where(
        inArray(permissions.key, ['routes.read', 'delivery.execute', 'delivery.trigger_messages']),
      );
    const [operadorRoleForDelivery] = await transaction
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, 'operador'))
      .limit(1);
    const [repartidorRole] = await transaction
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, 'repartidor'))
      .limit(1);
    if (operadorRoleForDelivery && operadorPermissions.length > 0) {
      await transaction
        .insert(rolePermissions)
        .values(
          operadorPermissions.map((permission) => ({
            permissionId: permission.id,
            roleId: operadorRoleForDelivery.id,
          })),
        )
        .onConflictDoNothing();
    }
    if (repartidorRole && repartidorPermissions.length > 0) {
      await transaction
        .insert(rolePermissions)
        .values(
          repartidorPermissions.map((permission) => ({
            permissionId: permission.id,
            roleId: repartidorRole.id,
          })),
        )
        .onConflictDoNothing();
    }

    // Fase 6 default: only staff can run AI tasks (`ai.use`), and only for the operational
    // drafting the V1 catalog covers — rewriting a message, extracting a candidate order,
    // summarizing kitchen data. `ai.prompts.manage`/`ai.providers.manage`/`ai.budgets.manage`
    // stay superadmin-only (Gisela's controls per AI_CORE.md), not granted here.
    const [aiUsePermission] = await transaction
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.key, 'ai.use'))
      .limit(1);
    if (aiUsePermission && operadorRoleForDelivery) {
      await transaction
        .insert(rolePermissions)
        .values({ permissionId: aiUsePermission.id, roleId: operadorRoleForDelivery.id })
        .onConflictDoNothing();
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

    // "Cocina informa cuántos productos salieron" (WEEKLY_MENU_AND_PRODUCTION.md) — the one
    // production.* permission the spec names a role for. `production.read`/`production.generate`
    // and `production.adjust_surplus` stay superadmin-only until a role is chosen for them.
    const [reportPermission] = await transaction
      .select({ id: permissions.id })
      .from(permissions)
      .where(eq(permissions.key, 'production.report'))
      .limit(1);
    if (reportPermission) {
      const [cocinaRole] = await transaction
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.key, 'cocina'))
        .limit(1);
      if (cocinaRole) {
        await transaction
          .insert(rolePermissions)
          .values({ permissionId: reportPermission.id, roleId: cocinaRole.id })
          .onConflictDoNothing();
      }
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
    const defaultHelpArticles = [
      {
        body: 'Verdeo se organiza por secciones en el menú lateral: cada una corresponde a una parte de la operación (pedidos, cocina, clientes, etc.). Solo ves las secciones para las que tenés permiso — si te falta acceso a algo, pedíselo a un administrador.',
        category: 'General',
        key: 'general-bienvenida',
        ordinal: 0,
        requiredPermission: null,
        title: 'Cómo está organizado Verdeo',
      },
      {
        body: '"Tomar y confirmar pedidos" ofrece dos formas de elegir cliente: "Buscar cliente" (por nombre o número, para clientes existentes) y "Nuevo cliente" (alta rápida con nombre y teléfono). Elegí el origen del pedido con cuidado — algunos orígenes (como "Venta de oportunidad") activan validaciones extra contra el excedente disponible.',
        category: 'Pedidos',
        key: 'pedidos-tomar-pedido',
        ordinal: 0,
        requiredPermission: 'orders.read',
        title: 'Tomar un pedido nuevo',
      },
      {
        body: 'En "Ver pedidos" podés filtrar por estado, buscar por número o cliente, y exportar a CSV. Cada pedido tiene su propio historial de estados y de ediciones (con motivo), visible desde su detalle.',
        category: 'Pedidos',
        key: 'pedidos-ver-pedidos',
        ordinal: 1,
        requiredPermission: 'orders.read',
        title: 'Buscar y filtrar pedidos',
      },
      {
        body: '"Cierre de pedidos" consolida la demanda confirmada del ciclo por variedad y tamaño, separando las unidades base de las Intuitivo (que llevan su propia composición). Desde ahí podés informar producción real, tomar snapshots parcial/final, y generar las etiquetas de cocina bajo demanda.',
        category: 'Cocina',
        key: 'cocina-cierre-pedidos',
        ordinal: 0,
        requiredPermission: 'production.read',
        title: 'Cierre de pedidos y producción',
      },
      {
        body: 'El botón "Generar etiquetas" abre una página imprimible con una etiqueta por unidad física del ciclo (o de un pedido puntual, desde su detalle). El formato de hoja (etiquetas por página) y el fondo se configuran una sola vez en Ajustes → Etiquetas.',
        category: 'Cocina',
        key: 'cocina-etiquetas',
        ordinal: 1,
        requiredPermission: 'production.read',
        title: 'Generar etiquetas de cocina',
      },
      {
        body: 'La ficha de cada cliente guarda direcciones, restricciones alimentarias, e historial de pedidos. Al dar de alta un cliente nuevo elegí siempre una ciudad — es lo que determina en qué operación queda el cliente.',
        category: 'Clientes',
        key: 'clientes-ficha',
        ordinal: 0,
        requiredPermission: 'customers.read',
        title: 'Ficha de cliente',
      },
      {
        body: 'Desde "Encuestas" armás un cuestionario con preguntas de texto libre o de opciones, y lo enviás a un cliente puntual: se genera un enlace y un QR de un solo uso. Los resultados agregados (sin identificar quién respondió qué) se ven en "Resultados" de cada encuesta.',
        category: 'Clientes',
        key: 'clientes-encuestas',
        ordinal: 1,
        requiredPermission: 'surveys.read',
        title: 'Encuestas a clientes',
      },
      {
        body: 'Auditoría muestra cada mutación relevante del sistema (quién, qué, cuándo) con filtros por entidad, acción y fecha. Es de solo lectura — registra lo que otros servicios ya escriben, no permite modificar nada.',
        category: 'Administración',
        key: 'admin-auditoria',
        ordinal: 0,
        requiredPermission: 'audit.read',
        title: 'Auditoría del sistema',
      },
    ];
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
