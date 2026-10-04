/**
 * Retirar el rol `repartidor` de una base ya en uso.
 *
 * El reparto dejó de hacerse con cuentas: quien reparte abre el enlace de la ruta del día, que
 * vence y no es un usuario del sistema. Sacarlo del código —del seed, de los permisos por defecto,
 * de las pantallas— no borra lo que ya estaba creado: en una base en uso el rol sigue existiendo,
 * con sus permisos viejos y con la gente que lo tenía asignada. Un rol que no usa nadie es un rol
 * que alguien termina asignando "por las dudas", y entonces vuelve a haber cuentas de repartidor.
 *
 * Qué hace, en una transacción:
 * 1. Quita las concesiones de permisos del rol.
 * 2. Desasigna a quien lo tenga.
 * 3. Borra el rol.
 * 4. Borra las cuentas que quedaron sin ningún rol y sin actividad real.
 *
 * El paso 4 es conservador a propósito. Una cuenta que cobró plata, confirmó un pedido o dejó algo
 * en la auditoría no se borra: su historial la nombra, y borrarla dejaría ese historial hablando de
 * un fantasma. Esas quedan desactivadas y el script dice cuáles y por qué.
 *
 * Es idempotente: correrlo dos veces no cambia nada la segunda.
 */
import { eq, sql } from 'drizzle-orm';

import { createDatabase } from './index.js';
import { requireDatabaseUrl } from './require-database-url.js';
import {
  accessTokens,
  auditEvents,
  cashCollections,
  orderStatusHistory,
  rolePermissions,
  roles,
  userRoles,
  users,
} from './schema/index.js';

const databaseUrl = requireDatabaseUrl('db:retire-repartidor');

const { client, db } = createDatabase(databaseUrl);

try {
  await db.transaction(async (transaction) => {
    const [role] = await transaction
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, 'repartidor'))
      .limit(1);

    if (!role) {
      console.log('El rol repartidor ya no existe. Nada que hacer.');
      return;
    }

    const asignados = await transaction
      .select({ displayName: users.displayName, id: users.id })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(eq(userRoles.roleId, role.id));

    /*
     * Las invitaciones emitidas con este rol.
     *
     * `access_tokens.role_id` es la única referencia a un rol que la base protege con `restrict`:
     * un token es una credencial viva y borrar el rol por debajo lo dejaría apuntando a la nada. Se
     * revocan y se les quita el rol en vez de borrarlos — redimir una invitación a un rol que ya no
     * existe no puede funcionar, y la fila dice cuándo se emitió y si alguien llegó a usarla, que
     * es justo lo que querríamos saber si aparece la duda.
     */
    const tokens = await transaction
      .update(accessTokens)
      .set({ revokedAt: sql`coalesce(${accessTokens.revokedAt}, now())`, roleId: null })
      .where(eq(accessTokens.roleId, role.id))
      .returning({ id: accessTokens.id });
    if (tokens.length > 0) {
      console.log(`Invitaciones revocadas con ese rol: ${String(tokens.length)}.`);
    }

    await transaction.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
    await transaction.delete(userRoles).where(eq(userRoles.roleId, role.id));
    await transaction.delete(roles).where(eq(roles.id, role.id));
    console.log(
      `Rol repartidor borrado. Tenía ${String(asignados.length)} usuario(s) asignado(s).`,
    );

    for (const persona of asignados) {
      const [otroRol] = await transaction
        .select({ roleId: userRoles.roleId })
        .from(userRoles)
        .where(eq(userRoles.userId, persona.id))
        .limit(1);
      if (otroRol) {
        console.log(`· ${persona.displayName}: tiene otros roles, se deja como está.`);
        continue;
      }

      // Lo que haría de esta cuenta parte del historial y no un resto de una prueba.
      const [actividad] = await transaction
        .select({
          cobranzas: sql<number>`(
            select count(*) from ${cashCollections}
            where ${cashCollections.collectedByUserId} = ${persona.id}
          )`,
          historial: sql<number>`(
            select count(*) from ${orderStatusHistory}
            where ${orderStatusHistory.actorUserId} = ${persona.id}
          )`,
          registros: sql<number>`(
            select count(*) from ${auditEvents}
            where ${auditEvents.actorUserId} = ${persona.id}
          )`,
        })
        .from(users)
        .where(eq(users.id, persona.id))
        .limit(1);

      const huella =
        Number(actividad?.cobranzas ?? 0) +
        Number(actividad?.historial ?? 0) +
        Number(actividad?.registros ?? 0);

      if (huella > 0) {
        await transaction
          .update(users)
          .set({ status: 'disabled', updatedAt: new Date() })
          .where(eq(users.id, persona.id));
        console.log(
          `· ${persona.displayName}: desactivada, no borrada — la nombran ${String(huella)} registro(s) del historial.`,
        );
        continue;
      }

      await transaction.delete(users).where(eq(users.id, persona.id));
      console.log(`· ${persona.displayName}: borrada (no dejó rastro en el historial).`);
    }

    /*
     * Los permisos que el rol tenía —`delivery.execute`, `delivery.trigger_messages`— se quedan en
     * el catálogo. Son parte del vocabulario del sistema y alguien podría querer concedérselos a un
     * rol nuevo; lo que no queda es nadie teniéndolos por herencia de un rol retirado.
     */
  });
} finally {
  await client.end();
}
