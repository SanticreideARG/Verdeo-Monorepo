/**
 * Sets up a repartidor you can actually log in as, with a published route full of real stops.
 *
 * The delivery app can't be tested from the dashboard: it needs a user bound to a token, and stops
 * assigned to that user on a published route. This builds all three from whatever orders already
 * exist, and prints the login link.
 *
 * Idempotent for the user and the role — reruns reuse them and issue a fresh token, which is the
 * point: tokens expire, and getting a new one shouldn't mean cleaning up first.
 *
 *   pnpm --filter @verdeo/db exec tsx src/seed-delivery-test.ts
 */
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { createAccessToken, hashAccessToken } from '@verdeo/auth';

import { createDatabase } from './index.js';
import {
  accessTokens,
  customerAddresses,
  deliveryRoutes,
  deliveryStops,
  operatingSites,
  orders,
  roles,
  userOperatingSites,
  userRoles,
  users,
} from './schema/index.js';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const APP_ORIGIN = process.env.APP_ORIGIN ?? 'https://verdeo-monorepo-web.vercel.app';
const REPARTIDOR_EMAIL = 'repartidor.prueba@verdeo.local';
const TOKEN_TTL_HOURS = 24 * 30;
const MAX_STOPS = 15;

async function main() {
  const { client, db } = createDatabase(databaseUrl!);

  try {
    // --- The repartidor user -------------------------------------------------------------
    let [user] = await db
      .select({ displayName: users.displayName, id: users.id })
      .from(users)
      .where(eq(users.emailNormalized, REPARTIDOR_EMAIL))
      .limit(1);

    if (!user) {
      const [created] = await db
        .insert(users)
        .values({
          displayName: 'Repartidor de prueba',
          emailNormalized: REPARTIDOR_EMAIL,
          status: 'active',
        })
        .returning({ displayName: users.displayName, id: users.id });
      user = created;
      console.log('Usuario repartidor creado.');
    } else {
      console.log('Usuario repartidor ya existía, se reutiliza.');
    }
    if (!user) throw new Error('No se pudo crear el usuario repartidor');

    // --- Its role ------------------------------------------------------------------------
    const [role] = await db
      .select({ id: roles.id, key: roles.key })
      .from(roles)
      .where(inArray(roles.key, ['repartidor', 'delivery', 'reparto']))
      .limit(1);
    if (!role) {
      throw new Error(
        'No existe un rol de repartidor. Creá uno en Usuarios y volvé a correr este script.',
      );
    }
    await db.insert(userRoles).values({ roleId: role.id, userId: user.id }).onConflictDoNothing();

    // --- A site with orders to deliver ----------------------------------------------------
    const sites = await db
      .select({ displayName: operatingSites.displayName, id: operatingSites.id })
      .from(operatingSites)
      .where(eq(operatingSites.active, true));

    let chosen: { displayName: string; id: string } | undefined;
    let candidates: { deliveryDate: string; id: string }[] = [];
    for (const site of sites) {
      // Only geocoded orders can be routed; that is the same filter createRoute applies.
      const rows = await db
        .select({ deliveryDate: orders.deliveryDate, id: orders.id })
        .from(orders)
        .innerJoin(customerAddresses, eq(customerAddresses.id, orders.deliveryAddressId))
        .where(
          and(
            eq(orders.operatingSiteId, site.id),
            eq(orders.status, 'CONFIRMED'),
            isNotNull(customerAddresses.latitude),
          ),
        )
        .limit(MAX_STOPS);
      if (rows.length > 0) {
        chosen = site;
        candidates = rows;
        break;
      }
    }
    if (!chosen || candidates.length === 0) {
      throw new Error('No hay pedidos CONFIRMED con dirección para armar una ruta de prueba.');
    }

    await db
      .insert(userOperatingSites)
      .values({ defaultSite: true, operatingSiteId: chosen.id, userId: user.id })
      .onConflictDoNothing();

    // --- The route -------------------------------------------------------------------------
    const deliveryDate = candidates[0]!.deliveryDate;
    const [route] = await db
      .insert(deliveryRoutes)
      .values({
        createdByUserId: user.id,
        deliveryDate,
        label: 'Ruta de prueba',
        operatingSiteId: chosen.id,
        publishedAt: new Date(),
        // Published straight away: a draft route is invisible to the delivery app, and an
        // unreachable route is not a test fixture.
        status: 'published',
      })
      .returning({ id: deliveryRoutes.id });
    if (!route) throw new Error('No se pudo crear la ruta');

    await db.insert(deliveryStops).values(
      candidates.map((order, index) => ({
        assignedUserId: user.id,
        orderId: order.id,
        routeId: route.id,
        sequence: index + 1,
      })),
    );

    // --- The token -------------------------------------------------------------------------
    // Issued directly rather than through AccessTokenService so this script needs no session
    // machinery; the hashing is the same function the service uses, so redemption works normally.
    const token = createAccessToken();
    await db.insert(accessTokens).values({
      boundUserId: user.id,
      createdByUserId: user.id,
      expiresAt: new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000),
      kind: 'repartidor_access',
      label: 'Token de prueba de reparto',
      operatingSiteId: chosen.id,
      roleId: role.id,
      tokenHash: hashAccessToken(token),
    });

    console.log(`\nRuta "${'Ruta de prueba'}" publicada en ${chosen.displayName}`);
    console.log(`  ${candidates.length} paradas · entrega ${deliveryDate}`);
    console.log(`\nEntrá con este enlace (vence en 30 días):`);
    console.log(`  ${APP_ORIGIN}/acceso?token=${token}`);
    console.log(`\nO pegá el token a mano en ${APP_ORIGIN}/acceso :`);
    console.log(`  ${token}`);
    console.log(`\nDespués de entrar, la app de reparto está en ${APP_ORIGIN}/delivery`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
