/**
 * Qué puede hacer cada rol recién creado.
 *
 * Los permisos del superadmin no se enumeran: por definición tiene todos, y cualquier lista sería
 * una segunda fuente de verdad que se desactualiza con el próximo permiso nuevo. El operador sí se
 * enumera, porque lo que no está acá es deliberado: no toca usuarios ni auditoría.
 *
 * Esto vivía repartido en cuatro bloques de `seed.ts`, que carga además datos de demostración y por
 * eso no se puede volver a correr contra producción. La consecuencia fue que el rol `operador` salió
 * a producción sin ningún permiso de `orders.*` ni de `customers.*`: podía armar rutas y registrar
 * cobros, pero no tomar un pedido, que es su trabajo. Ahora la lista es data, la aplica una función
 * idempotente, y `db:seed-permissions` —que sí se puede correr contra una base en uso— la pone al
 * día.
 */
import { eq, inArray } from 'drizzle-orm';

import type { Database } from './index.js';
import { permissions, rolePermissions, roles } from './schema/index.js';

type Ejecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * El operador es quien atiende la semana: carga clientes y pedidos, los confirma, manda mensajes,
 * mira lo que cocina tiene que producir, arma y publica las rutas, y registra los cobros.
 *
 * Queda afuera, a propósito: usuarios, roles y excepciones; crear ciudades y zonas; borrar, fusionar
 * o restringir un cliente y ver sus datos sensibles; revertir un estado o forzar un ciclo cerrado;
 * editar y publicar el landing; la auditoría; los respaldos; los artículos de ayuda; la
 * configuración de proveedores de IA, presupuestos y prompts; reemplazar un menú ya distribuido;
 * ajustar excedentes; y forzar un cobro. Todo eso es de quien administra el sistema.
 */
const OPERADOR = [
  'sites.read',
  'customers.read',
  'customers.create',
  'customers.edit',
  'orders.read',
  'orders.create',
  'orders.edit',
  'orders.confirm',
  'orders.cancel',
  'chat.use',
  'chat.presence.read',
  // Compartir la referencia de un cliente es revelar datos personales (ADR-032).
  'chat.share_reference',
  'messages.read',
  'messages.send',
  'messages.templates.use',
  'production.read',
  'production.report',
  'menus.distribute',
  'routes.read',
  'routes.manage',
  'routes.publish',
  'payments.read',
  'payments.record',
  'payments.settle',
  'surveys.read',
  'stats.read',
  'calendar.use',
  // Sólo el redactado operativo que cubre el catálogo V1 (reescribir un mensaje, extraer un pedido
  // de una conversación, resumir datos de cocina). Los controles de IA quedan de quien administra.
  'ai.use',
] as const;

/*
 * No hay rol de repartidor.
 *
 * El reparto dejó de gestionarse con cuentas: quien reparte abre el enlace de la ruta del día
 * (`/reparto/:token`), que vence y no es un usuario del sistema. Un rol que no usa nadie es un rol
 * que alguien termina asignando "por las dudas", y entonces sí hay una cuenta más que mantener.
 */
export const ROLE_DEFAULT_PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
  operador: OPERADOR,
};

/**
 * Conceder los permisos que le faltan a cada rol, sin quitar ninguno.
 *
 * No quita nada por dos razones: una concesión hecha a mano desde la pantalla de roles es una
 * decisión de la operación, y correr esto no debería revertirla; y un permiso que se saca de la
 * lista acá puede seguir siendo el correcto para una instalación concreta. Para quitar está la
 * pantalla de roles.
 *
 * Devuelve cuántas concesiones nuevas hizo cada rol, que es lo único que un script puede informar
 * con sentido: "0" significa que ya estaba al día.
 */
export async function applyRoleDefaults(database: Ejecutor): Promise<Record<string, number>> {
  const resultado: Record<string, number> = {};

  for (const [roleKey, keys] of Object.entries(ROLE_DEFAULT_PERMISSIONS)) {
    const [role] = await database
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, roleKey))
      .limit(1);
    if (!role) continue;

    const filas = await database
      .select({ id: permissions.id })
      .from(permissions)
      .where(inArray(permissions.key, [...keys]));
    if (filas.length === 0) {
      resultado[roleKey] = 0;
      continue;
    }

    const nuevas = await database
      .insert(rolePermissions)
      .values(filas.map(({ id }) => ({ permissionId: id, roleId: role.id })))
      .onConflictDoNothing()
      .returning({ permissionId: rolePermissions.permissionId });
    resultado[roleKey] = nuevas.length;
  }

  return resultado;
}
