import { and, asc, desc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';

import { AuditService } from '@verdeo/audit';
import { createAccessToken, hashAccessToken } from '@verdeo/auth';
import { deliveryDetail } from '@verdeo/orders';
import type { RouteOptimizer } from '@verdeo/routing';

import type { Database } from '../index.js';
import {
  accessTokens,
  cancellationReasons,
  cashCollections,
  customerAddresses,
  customers,
  deliveryRoutes,
  deliveryStops,
  messageTemplates,
  operatingSites,
  orderItemSelections,
  orderItems,
  orderStatusHistory,
  orders,
  paymentMethods,
  productFamilies,
  productVariants,
  payments,
  users,
} from '../schema/index.js';
import { PostgresAuditSink } from './postgres-audit-sink.js';
import type { MessagingContext } from './postgres-messaging-service.js';

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface DeliveryContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

export class DeliveryNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'DeliveryNotFoundError';
  }
}

export class DeliveryConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'DeliveryConflictError';
  }
}

type StopStatus = 'pending' | 'en_route' | 'at_address' | 'delivered' | 'skipped';

/**
 * Qué estados de un pedido pueden entrar en una hoja de ruta.
 *
 * CONFIRMED es un pedido en firme; READY es uno que cocina ya produjo. Los dos hay que repartirlos.
 * Un borrador todavía no está vendido, un cancelado no se reparte y un entregado ya salió.
 */
const ROUTABLE_STATUSES = ['CONFIRMED', 'READY'] as const;

// Also the messageTemplates.actionKey an operator configures a template against — kept as a type
// rather than a lookup table since the trigger name already IS the action key.
export const TRIGGER_ACTIONS = ['ON_MY_WAY', 'AT_ADDRESS', 'DELIVERED_THANKS'] as const;
export type TriggerAction = (typeof TRIGGER_ACTIONS)[number];

export interface MessagingSender {
  sendToCustomer(
    customerId: string,
    preferredSiteId: string | null,
    body: string,
    context: MessagingContext,
  ): Promise<{ reason?: string; sent: boolean }>;
}

/**
 * Fase 8 skeleton (DELIVERY_AND_ROUTES.md). Sequencing goes through `RouteOptimizer` (see
 * `@verdeo/routing`) — this class never computes distances itself, only feeds the optimizer the
 * geocoded stops for a day and persists whatever order it returns. Messaging is injected the same
 * way: this class decides *which* template a trigger maps to, `PostgresMessagingService` decides
 * *how* to deliver it — neither needs to know the other's internals.
 */
export class PostgresDeliveryService {
  public constructor(
    private readonly database: Database,
    private readonly optimizer: RouteOptimizer,
    private readonly messaging: MessagingSender,
  ) {}

  /**
   * Propone una ruta con todo pedido listo para salir ese día en esa operación: geocodificado y que
   * no esté ya en otra ruta activa. "Puede existir pedido sin delivery como excepción": un pedido
   * sin coordenadas queda afuera —lo maneja un operador a mano— y no bloquea nada.
   *
   * Entran los CONFIRMED y los READY, y lo segundo importa más de lo que parece. READY significa que
   * cocina ya lo produjo: es justamente el pedido que hay que repartir. Tomando sólo CONFIRMED,
   * marcar los pedidos listos por zona —que es como trabaja cocina— los sacaba del pozo de ruteo, y
   * la ciudad entera se volvía irruteable sin que nada lo dijera. Fue exactamente lo que pasó con
   * los veintiséis pedidos de Neuquén.
   */
  public async createRoute(
    operatingSiteId: string,
    deliveryDate: string,
    label: string | undefined,
    context: DeliveryContext,
    /*
     * Acotar la hoja a una zona.
     *
     * Sin esto se arma con la ciudad entera. Una ciudad con varias zonas reparte por zona —es como
     * sale el repartidor—, así que una hoja por zona es una hoja que se puede seguir; una sola con
     * todas las paradas mezcladas obliga a cruzar la ciudad de ida y vuelta.
     */
    geographicZoneId?: string,
  ) {
    return this.database.transaction(async (transaction) => {
      const [site] = await transaction
        .select({
          originLatitude: operatingSites.originLatitude,
          originLongitude: operatingSites.originLongitude,
        })
        .from(operatingSites)
        .where(eq(operatingSites.id, operatingSiteId))
        .limit(1);
      if (!site) throw new DeliveryNotFoundError('Operating site not found');

      const alreadyRoutedOrderIds = await transaction
        .select({ orderId: deliveryStops.orderId })
        .from(deliveryStops)
        .innerJoin(deliveryRoutes, eq(deliveryRoutes.id, deliveryStops.routeId))
        .where(inArray(deliveryRoutes.status, ['draft', 'published']));

      const candidates = await transaction
        .select({
          id: orders.id,
          latitude: customerAddresses.latitude,
          longitude: customerAddresses.longitude,
        })
        .from(orders)
        .innerJoin(customerAddresses, eq(customerAddresses.id, orders.deliveryAddressId))
        .where(
          and(
            eq(orders.operatingSiteId, operatingSiteId),
            eq(orders.deliveryDate, deliveryDate),
            inArray(orders.status, ROUTABLE_STATUSES),
            // La zona se filtra por la dirección de entrega y no por el cliente: manda dónde se
            // entrega (ADR-031), que es lo mismo que decide de qué ciudad es el pedido.
            ...(geographicZoneId ? [eq(customerAddresses.geographicZoneId, geographicZoneId)] : []),
            ...(alreadyRoutedOrderIds.length > 0
              ? [
                  notInArray(
                    orders.id,
                    alreadyRoutedOrderIds.map((row) => row.orderId),
                  ),
                ]
              : []),
          ),
        );
      const geocoded = candidates.filter(
        (candidate): candidate is typeof candidate & { latitude: string; longitude: string } =>
          candidate.latitude !== null && candidate.longitude !== null,
      );

      const [route] = await transaction
        .insert(deliveryRoutes)
        .values({
          createdByUserId: context.actorUserId ?? null,
          deliveryDate,
          label: label ?? null,
          operatingSiteId,
        })
        .returning();
      if (!route) throw new Error('Route creation did not return a row');

      if (geocoded.length > 0) {
        const origin =
          site.originLatitude !== null && site.originLongitude !== null
            ? { latitude: Number(site.originLatitude), longitude: Number(site.originLongitude) }
            : null;
        const sequenced = this.optimizer.sequence(
          origin,
          geocoded.map((order) => ({
            id: order.id,
            latitude: Number(order.latitude),
            longitude: Number(order.longitude),
          })),
        );
        await transaction.insert(deliveryStops).values(
          sequenced.map((stop, index) => ({
            orderId: stop.id,
            routeId: route.id,
            sequence: index + 1,
          })),
        );
      }

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'delivery.route_created',
        actor: context.actorUserId
          ? { type: 'user', userId: context.actorUserId }
          : { type: 'system' },
        // La zona queda en la auditoría: la ruta no la guarda como columna, así que si no está acá
        // no hay forma de saber después por qué esa hoja tenía sólo una parte de la ciudad.
        after: { geographicZoneId: geographicZoneId ?? null, stopCount: geocoded.length },
        correlationId: context.correlationId,
        entityId: route.id,
        entityType: 'delivery_route',
        requestId: context.requestId,
        source: context.source,
      });

      return this.loadRouteDetail(transaction, route.id);
    });
  }

  /**
   * Qué días hay pedidos esperando una ruta, y cuántos.
   *
   * Es lo que el formulario necesita para no fallar en silencio. La fecha de entrega de un pedido
   * es la del cierre de su semana —no "mañana"—, así que un campo de fecha libre con "mañana" por
   * defecto proponía rutas para días en los que no hay nada, y el resultado era "0 paradas" sin
   * decir por qué. Ofreciendo las fechas que sí tienen pedidos, el error deja de ser posible.
   *
   * Cuenta por separado lo que se puede rutear y lo que no, porque "hay 30 pedidos y 0 paradas"
   * tiene dos causas muy distintas: sin geocodificar (hay que resolver el domicilio) o ya ruteado
   * (está en otra hoja). Sin esa distinción no hay forma de saber qué hacer al respecto.
   */
  public async routableDates(operatingSiteId: string, geographicZoneId?: string) {
    const alreadyRouted = this.database
      .select({ orderId: deliveryStops.orderId })
      .from(deliveryStops)
      .innerJoin(deliveryRoutes, eq(deliveryRoutes.id, deliveryStops.routeId))
      .where(inArray(deliveryRoutes.status, ['draft', 'published']));

    const rows = await this.database
      .select({
        deliveryDate: orders.deliveryDate,
        geocoded: sql<number>`count(*) filter (
          where ${customerAddresses.latitude} is not null
            and ${customerAddresses.longitude} is not null
            and ${orders.id} not in ${alreadyRouted}
        )`,
        routed: sql<number>`count(*) filter (where ${orders.id} in ${alreadyRouted})`,
        total: sql<number>`count(*)`,
      })
      .from(orders)
      .leftJoin(customerAddresses, eq(customerAddresses.id, orders.deliveryAddressId))
      .where(
        and(
          eq(orders.operatingSiteId, operatingSiteId),
          inArray(orders.status, ROUTABLE_STATUSES),
          ...(geographicZoneId ? [eq(customerAddresses.geographicZoneId, geographicZoneId)] : []),
        ),
      )
      .groupBy(orders.deliveryDate)
      .orderBy(asc(orders.deliveryDate));

    return rows.map((row) => ({
      deliveryDate: row.deliveryDate,
      geocoded: Number(row.geocoded),
      routed: Number(row.routed),
      total: Number(row.total),
    }));
  }

  public async listRoutes(operatingSiteId?: string) {
    const rows = await this.database
      .select({
        deliveryDate: deliveryRoutes.deliveryDate,
        id: deliveryRoutes.id,
        label: deliveryRoutes.label,
        operatingSiteId: deliveryRoutes.operatingSiteId,
        publishedAt: deliveryRoutes.publishedAt,
        status: deliveryRoutes.status,
      })
      .from(deliveryRoutes)
      .where(operatingSiteId ? eq(deliveryRoutes.operatingSiteId, operatingSiteId) : undefined)
      .orderBy(desc(deliveryRoutes.deliveryDate));

    const counts = await this.database
      .select({ count: deliveryStops.id, routeId: deliveryStops.routeId })
      .from(deliveryStops);
    const countByRoute = new Map<string, number>();
    for (const row of counts)
      countByRoute.set(row.routeId, (countByRoute.get(row.routeId) ?? 0) + 1);

    return rows.map((row) => ({ ...row, stopCount: countByRoute.get(row.id) ?? 0 }));
  }

  public async getRouteDetail(routeId: string) {
    const detail = await this.loadRouteDetail(this.database, routeId);
    if (!detail) throw new DeliveryNotFoundError('Route not found');
    return detail;
  }

  private async loadRouteDetail(database: Database | DatabaseTransaction, routeId: string) {
    const [route] = await database
      .select()
      .from(deliveryRoutes)
      .where(eq(deliveryRoutes.id, routeId))
      .limit(1);
    if (!route) return null;

    const stops = await database
      .select({
        assignedUserDisplayName: users.displayName,
        assignedUserId: deliveryStops.assignedUserId,
        customerDisplayName: customers.displayName,
        deliveredAt: deliveryStops.deliveredAt,
        deliveryAddress: orders.deliveryAddressSnapshot,
        // El enlace de ubicación es lo que el repartidor abre en el teléfono: sin esto, la lista que
        // se le pasa son direcciones escritas que hay que tipear en un mapa.
        deliveryLocationUrl: orders.deliveryLocationUrlSnapshot,
        /*
         * Las coordenadas del domicilio.
         *
         * El enlace compartido existe sólo si alguien lo mandó por chat, y en la mayoría de los
         * pedidos no está: la lista que se le pasaba al repartidor eran direcciones escritas para
         * tipear a mano en un mapa. Con esto se arma el enlace igual.
         */
        deliveryLatitude: customerAddresses.latitude,
        deliveryLongitude: customerAddresses.longitude,
        id: deliveryStops.id,
        orderId: deliveryStops.orderId,
        paymentExpectation: orders.paymentExpectation,
        publicNumber: orders.publicNumber,
        sequence: deliveryStops.sequence,
        status: deliveryStops.status,
        totalMinor: orders.totalMinor,
      })
      .from(deliveryStops)
      .innerJoin(orders, eq(orders.id, deliveryStops.orderId))
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .leftJoin(customerAddresses, eq(customerAddresses.id, orders.deliveryAddressId))
      .leftJoin(users, eq(users.id, deliveryStops.assignedUserId))
      .where(eq(deliveryStops.routeId, routeId))
      .orderBy(asc(deliveryStops.sequence));

    const detalles = await this.itemDetails(
      database,
      stops.map((stop) => ({
        customerDisplayName: stop.customerDisplayName,
        orderId: stop.orderId,
      })),
    );

    return {
      ...route,
      stops: stops.map((stop) => ({
        ...stop,
        detail: detalles.get(stop.orderId) ?? '',
        // `numeric` llega como texto desde Postgres; el contrato pide números.
        deliveryLatitude: stop.deliveryLatitude === null ? null : Number(stop.deliveryLatitude),
        deliveryLongitude: stop.deliveryLongitude === null ? null : Number(stop.deliveryLongitude),
      })),
    };
  }

  /**
   * Borrar una propuesta.
   *
   * Sólo borradores: una ruta publicada ya está en el teléfono de alguien, y sus paradas entregadas
   * son parte de lo que pasó ese día. Una propuesta, en cambio, es un intento — y proponer es
   * barato, así que se acumulan. Sin poder borrarlas la lista se llena de "0 paradas · Borrador" y
   * deja de decir cuál es la ruta de mañana.
   *
   * Las paradas se van con la ruta por cascada, y los pedidos vuelven a estar disponibles para otra
   * ruta: `createRoute` excluye lo que está en una ruta activa, y ésta deja de existir.
   */
  public async deleteRoute(routeId: string, context: DeliveryContext) {
    return this.database.transaction(async (transaction) => {
      const [current] = await transaction
        .select({ status: deliveryRoutes.status })
        .from(deliveryRoutes)
        .where(eq(deliveryRoutes.id, routeId))
        .limit(1);
      if (!current) throw new DeliveryNotFoundError('Route not found');
      if (current.status !== 'draft')
        throw new DeliveryConflictError(
          'Sólo se puede borrar una ruta en borrador. Una ruta publicada ya salió a la calle.',
        );

      const [stopCount] = await transaction
        .select({ total: sql<number>`count(*)` })
        .from(deliveryStops)
        .where(eq(deliveryStops.routeId, routeId));

      // La auditoría va antes del borrado: después la fila ya no está y no queda quién dice qué se
      // borró ni cuántas paradas tenía.
      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'delivery.route_deleted',
        actor: context.actorUserId
          ? { type: 'user', userId: context.actorUserId }
          : { type: 'system' },
        before: { status: current.status, stopCount: Number(stopCount?.total ?? 0) },
        correlationId: context.correlationId,
        entityId: routeId,
        entityType: 'delivery_route',
        requestId: context.requestId,
        source: context.source,
      });

      await transaction.delete(deliveryRoutes).where(eq(deliveryRoutes.id, routeId));
      return { deleted: true, stopCount: Number(stopCount?.total ?? 0) };
    });
  }

  public async publishRoute(routeId: string, context: DeliveryContext) {
    return this.database.transaction(async (transaction) => {
      const [current] = await transaction
        .select({ status: deliveryRoutes.status })
        .from(deliveryRoutes)
        .where(eq(deliveryRoutes.id, routeId))
        .limit(1);
      if (!current) throw new DeliveryNotFoundError('Route not found');
      if (current.status !== 'draft')
        throw new DeliveryConflictError('Solo una ruta en borrador puede publicarse.');

      await transaction
        .update(deliveryRoutes)
        .set({ publishedAt: new Date(), status: 'published', updatedAt: new Date() })
        .where(eq(deliveryRoutes.id, routeId));

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'delivery.route_published',
        actor: context.actorUserId
          ? { type: 'user', userId: context.actorUserId }
          : { type: 'system' },
        correlationId: context.correlationId,
        entityId: routeId,
        entityType: 'delivery_route',
        requestId: context.requestId,
        source: context.source,
      });

      return this.loadRouteDetail(transaction, routeId);
    });
  }

  /** Two-pass sequence rewrite: every stop first moves to a value outside the real 1..n range, then
   * down to its final position, so the unique (routeId, sequence) index never sees a collision
   * mid-transaction. */
  public async reorderStops(routeId: string, orderedStopIds: readonly string[]) {
    return this.database.transaction(async (transaction) => {
      const stops = await transaction
        .select({ id: deliveryStops.id })
        .from(deliveryStops)
        .where(eq(deliveryStops.routeId, routeId));
      const knownIds = new Set(stops.map((stop) => stop.id));
      if (
        orderedStopIds.length !== stops.length ||
        !orderedStopIds.every((id) => knownIds.has(id))
      ) {
        throw new DeliveryConflictError('El nuevo orden no coincide con las paradas de la ruta.');
      }

      for (const [index, stopId] of orderedStopIds.entries()) {
        await transaction
          .update(deliveryStops)
          .set({ sequence: index + 1 + 100_000 })
          .where(eq(deliveryStops.id, stopId));
      }
      for (const [index, stopId] of orderedStopIds.entries()) {
        await transaction
          .update(deliveryStops)
          .set({ sequence: index + 1, updatedAt: new Date() })
          .where(eq(deliveryStops.id, stopId));
      }

      return this.loadRouteDetail(transaction, routeId);
    });
  }

  /**
   * Qué lleva cada pedido, ya escrito y listo para mostrar.
   *
   * Una consulta para todas las paradas y no una por parada: una hoja de ruta de veinte paradas
   * son veinte viajes a la base que se resuelven con uno.
   */
  private async itemDetails(
    database: Database | DatabaseTransaction,
    paradas: readonly { customerDisplayName: string; orderId: string }[],
  ): Promise<Map<string, string>> {
    const detalles = new Map<string, string>();
    if (paradas.length === 0) return detalles;

    const lineas = await database
      .select({
        // Sale del catálogo y no de comparar el nombre: una variedad que después se renombró sigue
        // reconociéndose como Intuitivo.
        composable: sql<boolean>`coalesce(${productFamilies.kind} = 'COMPOSABLE', false)`,
        familyName: orderItems.productNameSnapshot,
        id: orderItems.id,
        orderId: orderItems.orderId,
        quantityUnits: orderItems.quantityUnits,
        variantName: orderItems.variantSnapshot,
      })
      .from(orderItems)
      .leftJoin(productVariants, eq(productVariants.id, orderItems.productVariantId))
      .leftJoin(productFamilies, eq(productFamilies.id, productVariants.productFamilyId))
      .where(
        inArray(
          orderItems.orderId,
          paradas.map((parada) => parada.orderId),
        ),
      )
      // Sin orden explícito la línea de un pedido de dos viandas puede cambiar entre lecturas, y
      // el operador que compara la hoja de ruta con el mensaje de WhatsApp ve dos textos distintos.
      .orderBy(orderItems.createdAt, orderItems.productNameSnapshot);

    /*
     * Los platos elegidos de cada Intuitivo, en una consulta y no una por parada.
     *
     * Ordenados por `slot`, que es el orden en que la persona los eligió: ese mismo orden es el
     * que sale impreso en la etiqueta, y leer la lista contra la caja sólo sirve si coinciden.
     */
    const platos =
      lineas.length === 0
        ? []
        : await database
            .select({
              dishName: orderItemSelections.dishNameSnapshot,
              orderItemId: orderItemSelections.orderItemId,
            })
            .from(orderItemSelections)
            .where(
              inArray(
                orderItemSelections.orderItemId,
                lineas.map((linea) => linea.id),
              ),
            )
            .orderBy(orderItemSelections.slot);

    for (const parada of paradas) {
      const nombre = parada.customerDisplayName.split(' ')[0] ?? parada.customerDisplayName;
      detalles.set(
        parada.orderId,
        deliveryDetail(
          lineas
            .filter((linea) => linea.orderId === parada.orderId)
            .map((linea) => ({
              ...linea,
              dishes: platos
                .filter((plato) => plato.orderItemId === linea.id)
                .map((plato) => plato.dishName),
            })),
          nombre,
        ),
      );
    }
    return detalles;
  }

  /**
   * El enlace del repartidor.
   *
   * No hay cuenta que crear: quien reparte hoy puede no ser quien reparte mañana, y pedirle al
   * equipo que dé de alta y de baja usuarios para eso era una gestión que nadie iba a hacer. Lo que
   * existe de verdad es una ruta de un día, así que el acceso es a esa ruta: se genera, se manda
   * por WhatsApp y vence. Si se filtra, lo que expone es la hoja de un día —nombres de pila,
   * direcciones y qué cobrar— y no una cuenta del sistema.
   *
   * El token se guarda hasheado, como todos: si la base se filtra, los enlaces vivos no viajan con
   * ella. Generar uno nuevo revoca el anterior — dos enlaces vivos de la misma ruta es alguien
   * repartiendo con una hoja que ya no vale.
   */
  public async issueRouteLink(
    routeId: string,
    ttlHours: number,
    context: DeliveryContext,
  ): Promise<{ expiresAt: Date; token: string }> {
    return this.database.transaction(async (transaction) => {
      const [route] = await transaction
        .select({ deliveryDate: deliveryRoutes.deliveryDate, status: deliveryRoutes.status })
        .from(deliveryRoutes)
        .where(eq(deliveryRoutes.id, routeId))
        .limit(1);
      if (!route) throw new DeliveryNotFoundError('Route not found');
      if (route.status !== 'published') {
        throw new DeliveryConflictError(
          'La ruta todavía es un borrador. Publicala antes de pasarle el enlace a alguien.',
        );
      }

      await transaction
        .update(accessTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(accessTokens.deliveryRouteId, routeId), isNull(accessTokens.revokedAt)));

      const token = createAccessToken();
      const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
      await transaction.insert(accessTokens).values({
        createdByUserId: context.actorUserId ?? null,
        deliveryRouteId: routeId,
        expiresAt,
        kind: 'route_access',
        label: `Reparto ${route.deliveryDate}`,
        tokenHash: hashAccessToken(token),
      });

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'delivery.route_link_issued',
        actor: context.actorUserId
          ? { type: 'user', userId: context.actorUserId }
          : { type: 'system' },
        after: { expiresAt: expiresAt.toISOString() },
        correlationId: context.correlationId,
        entityId: routeId,
        entityType: 'delivery_route',
        requestId: context.requestId,
        source: context.source,
      });

      return { expiresAt, token };
    });
  }

  /** Cortar el acceso de un enlace ya entregado, sin tocar la ruta. */
  public async revokeRouteLink(routeId: string, context: DeliveryContext) {
    await this.database
      .update(accessTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(accessTokens.deliveryRouteId, routeId), isNull(accessTokens.revokedAt)));
    await new AuditService(new PostgresAuditSink(this.database)).record({
      action: 'delivery.route_link_revoked',
      actor: context.actorUserId
        ? { type: 'user', userId: context.actorUserId }
        : { type: 'system' },
      correlationId: context.correlationId,
      entityId: routeId,
      entityType: 'delivery_route',
      requestId: context.requestId,
      source: context.source,
    });
  }

  /**
   * La ruta que abre un enlace, o nada si el enlace no sirve.
   *
   * Nunca dice por qué: a quien tiene un enlace vencido le sirve lo mismo "pedí uno nuevo", y un
   * mensaje distinto por cada causa le contaría a quien lo encontró de casualidad qué tan cerca
   * estuvo.
   */
  private async routeIdForToken(rawToken: string): Promise<string | null> {
    const [record] = await this.database
      .select({
        deliveryRouteId: accessTokens.deliveryRouteId,
        expiresAt: accessTokens.expiresAt,
        id: accessTokens.id,
        revokedAt: accessTokens.revokedAt,
      })
      .from(accessTokens)
      .where(
        and(
          eq(accessTokens.tokenHash, hashAccessToken(rawToken)),
          eq(accessTokens.kind, 'route_access'),
        ),
      )
      .limit(1);
    if (!record?.deliveryRouteId) return null;
    if (record.revokedAt || record.expiresAt <= new Date()) return null;
    await this.database
      .update(accessTokens)
      .set({ lastUsedAt: new Date(), useCount: sql`${accessTokens.useCount} + 1` })
      .where(eq(accessTokens.id, record.id));
    return record.deliveryRouteId;
  }

  /**
   * La hoja de reparto que ve quien tiene el enlace.
   *
   * Lleva lo que hace falta para entregar y nada más: nombre de pila, dirección, cómo entrar, en
   * qué horario recibe, qué entregar, cuánto cobrar y con qué medio. Sin teléfono, sin apellido,
   * sin historial — la consulta directamente no los selecciona, así que no hay nada acá que se
   * pueda filtrar por error.
   */
  public async routeSheetByToken(rawToken: string) {
    const routeId = await this.routeIdForToken(rawToken);
    if (!routeId) return null;

    const [route] = await this.database
      .select({
        deliveryDate: deliveryRoutes.deliveryDate,
        id: deliveryRoutes.id,
        label: deliveryRoutes.label,
        originLatitude: operatingSites.originLatitude,
        originLongitude: operatingSites.originLongitude,
        siteName: operatingSites.displayName,
        status: deliveryRoutes.status,
      })
      .from(deliveryRoutes)
      .innerJoin(operatingSites, eq(operatingSites.id, deliveryRoutes.operatingSiteId))
      .where(eq(deliveryRoutes.id, routeId))
      .limit(1);
    if (!route) return null;

    const stops = await this.sheetStops(routeId);
    return {
      deliveryDate: route.deliveryDate,
      label: route.label,
      originLatitude: route.originLatitude === null ? null : Number(route.originLatitude),
      originLongitude: route.originLongitude === null ? null : Number(route.originLongitude),
      failureReasons: await this.database
        .select({ displayName: cancellationReasons.displayName, id: cancellationReasons.id })
        .from(cancellationReasons)
        .where(eq(cancellationReasons.active, true))
        .orderBy(asc(cancellationReasons.sortOrder)),
      siteName: route.siteName,
      stops,
      ...this.sheetTotals(stops),
    };
  }

  /** Que la parada sea de la ruta de ese enlace. Sin esto, con un enlace válido se podría tocar
   * cualquier parada del sistema pasando otro id. */
  private async stopInTokenRoute(rawToken: string, stopId: string): Promise<string> {
    const routeId = await this.routeIdForToken(rawToken);
    if (!routeId) throw new DeliveryNotFoundError('Route link is not valid');
    const [stop] = await this.database
      .select({ routeId: deliveryStops.routeId })
      .from(deliveryStops)
      .where(eq(deliveryStops.id, stopId))
      .limit(1);
    if (!stop || stop.routeId !== routeId) throw new DeliveryNotFoundError('Stop not found');
    return routeId;
  }

  /**
   * "No se pudo entregar", desde el enlace.
   *
   * Quien está en la puerta es quien sabe que la entrega falló, y era lo único que la app de
   * reparto hacía y el sitio no: sin esto, una parada que no se pudo entregar quedaba pendiente
   * para siempre o se marcaba entregada, que es peor. El motivo sale de la misma lista cerrada que
   * usa el panel, porque después se cuenta cuántas entregas fallaron y por qué.
   */
  public async reportFailedByToken(
    rawToken: string,
    stopId: string,
    cancellationReasonId: string,
    context: DeliveryContext,
  ) {
    await this.stopInTokenRoute(rawToken, stopId);
    return this.reportFailedDelivery(stopId, cancellationReasonId, undefined, context);
  }

  /** Los tres avisos al cliente, desde el enlace: voy en camino, llegué, entregado. */
  public async triggerMessageByToken(
    rawToken: string,
    stopId: string,
    action: TriggerAction,
    context: DeliveryContext,
  ) {
    await this.stopInTokenRoute(rawToken, stopId);
    return this.triggerMessage(stopId, action, context);
  }

  /** Las paradas de una ruta con todo lo que hace falta para entregarlas. */
  private async sheetStops(routeId: string) {
    const rows = await this.database
      .select({
        accessNotes: customerAddresses.accessNotes,
        collectedMinor: sql<number>`coalesce((
          select sum(c.amount_minor) from cash_collections c where c.order_id = ${orders.id}
        ), 0)`,
        customerDisplayName: customers.displayName,
        deliveryAddress: orders.deliveryAddressSnapshot,
        deliveryLatitude: customerAddresses.latitude,
        deliveryLocationUrl: orders.deliveryLocationUrlSnapshot,
        deliveryLongitude: customerAddresses.longitude,
        deliveryNote: deliveryStops.deliveryNote,
        deliveryWindow: customerAddresses.deliveryWindow,
        id: deliveryStops.id,
        orderId: deliveryStops.orderId,
        paymentExpectation: orders.paymentExpectation,
        prepaid: sql<boolean>`coalesce(${payments.status} = 'PAID', false)`,
        publicNumber: orders.publicNumber,
        sequence: deliveryStops.sequence,
        status: deliveryStops.status,
        totalMinor: orders.totalMinor,
      })
      .from(deliveryStops)
      .innerJoin(orders, eq(orders.id, deliveryStops.orderId))
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .leftJoin(customerAddresses, eq(customerAddresses.id, orders.deliveryAddressId))
      .leftJoin(payments, eq(payments.orderId, orders.id))
      .where(eq(deliveryStops.routeId, routeId))
      .orderBy(asc(deliveryStops.sequence));

    const detalles = await this.itemDetails(
      this.database,
      rows.map((row) => ({ customerDisplayName: row.customerDisplayName, orderId: row.orderId })),
    );

    return rows.map(({ customerDisplayName, orderId, ...row }) => ({
      ...row,
      collectedMinor: Number(row.collectedMinor),
      customerFirstName: customerDisplayName.split(' ')[0] ?? customerDisplayName,
      deliveryLatitude: row.deliveryLatitude === null ? null : Number(row.deliveryLatitude),
      deliveryLongitude: row.deliveryLongitude === null ? null : Number(row.deliveryLongitude),
      detail: detalles.get(orderId) ?? '',
    }));
  }

  /**
   * Cómo va la ruta, para quien la mira desde el panel.
   *
   * Es la misma cuenta que ve quien reparte, no una segunda: cuántas entregó, cuánta plata levantó
   * y cuánta falta. Que las dos pantallas discrepen sobre cuánto hay en la calle sería peor que no
   * mostrarlo.
   */
  public async routeProgress(routeId: string) {
    const stops = await this.sheetStops(routeId);
    return this.sheetTotals(stops);
  }

  /** Lo que hay que rendir y lo que falta entregar, calculado una vez para toda la hoja. */
  private sheetTotals(
    stops: readonly {
      collectedMinor: number;
      prepaid: boolean;
      status: string;
      totalMinor: number;
    }[],
  ) {
    return {
      collectedMinor: stops.reduce((total, stop) => total + stop.collectedMinor, 0),
      deliveredCount: stops.filter((stop) => stop.status === 'delivered').length,
      pendingCollectionMinor: stops
        .filter((stop) => stop.status !== 'delivered' && !stop.prepaid)
        .reduce((total, stop) => total + stop.totalMinor, 0),
      stopCount: stops.length,
    };
  }

  /**
   * Confirmar una entrega desde el enlace.
   *
   * Cobrar es parte de entregar, así que va en el mismo movimiento y en la misma transacción: una
   * entrega marcada sin su cobro es plata que nadie sabe que está en la calle. Lo cobrado se
   * registra como una cobranza de la ruta —no de un usuario, porque no hay usuario— y el pedido
   * queda `TO_SETTLE` si el medio es efectivo, que es lo que después se rinde.
   */
  public async confirmStopByToken(
    rawToken: string,
    stopId: string,
    input: { collected: boolean; note?: string | undefined },
    context: DeliveryContext,
  ) {
    const routeId = await this.routeIdForToken(rawToken);
    if (!routeId) throw new DeliveryNotFoundError('Route link is not valid');

    return this.database.transaction(async (transaction) => {
      const [stop] = await transaction
        .select({
          orderId: deliveryStops.orderId,
          paymentExpectation: orders.paymentExpectation,
          prepaid: sql<boolean>`coalesce(${payments.status} = 'PAID', false)`,
          routeId: deliveryStops.routeId,
          status: deliveryStops.status,
          totalMinor: orders.totalMinor,
        })
        .from(deliveryStops)
        .innerJoin(orders, eq(orders.id, deliveryStops.orderId))
        .leftJoin(payments, eq(payments.orderId, orders.id))
        .where(eq(deliveryStops.id, stopId))
        .limit(1);
      if (!stop || stop.routeId !== routeId) throw new DeliveryNotFoundError('Stop not found');
      if (stop.status === 'delivered') {
        throw new DeliveryConflictError('Esa parada ya está confirmada.');
      }

      await transaction
        .update(deliveryStops)
        .set({
          deliveredAt: new Date(),
          deliveryNote: input.note?.trim() ? input.note.trim() : null,
          status: 'delivered',
          updatedAt: new Date(),
        })
        .where(eq(deliveryStops.id, stopId));

      const [order] = await transaction
        .select({ status: orders.status })
        .from(orders)
        .where(eq(orders.id, stop.orderId))
        .limit(1);
      if (order && order.status !== 'DELIVERED') {
        await transaction
          .update(orders)
          .set({ status: 'DELIVERED', updatedAt: new Date() })
          .where(eq(orders.id, stop.orderId));
        await transaction.insert(orderStatusHistory).values({
          actorUserId: null,
          fromStatus: order.status,
          orderId: stop.orderId,
          reason: 'Entrega confirmada desde el enlace de la ruta',
          toStatus: 'DELIVERED',
        });
      }

      if (input.collected && !stop.prepaid) {
        await transaction
          .insert(payments)
          .values({
            amountMinor: stop.totalMinor,
            expectedMethod: stop.paymentExpectation,
            orderId: stop.orderId,
            status: 'PENDING',
          })
          .onConflictDoNothing();
        await transaction.insert(cashCollections).values({
          amountMinor: stop.totalMinor,
          deliveryRouteId: routeId,
          method: stop.paymentExpectation,
          orderId: stop.orderId,
        });
        const [method] = await transaction
          .select({ isCash: paymentMethods.isCash })
          .from(paymentMethods)
          .where(eq(paymentMethods.code, stop.paymentExpectation))
          .limit(1);
        // Lo que se cobró en mano queda para rendir; lo demás ya está en la cuenta.
        const enMano = method?.isCash ?? /efectivo/i.test(stop.paymentExpectation);
        await transaction
          .update(payments)
          .set({ status: enMano ? 'TO_SETTLE' : 'PAID', updatedAt: new Date() })
          .where(eq(payments.orderId, stop.orderId));
      }

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'delivery.stop_confirmed_by_link',
        actor: { type: 'system' },
        after: { collected: input.collected, status: 'delivered' },
        before: { status: stop.status },
        correlationId: context.correlationId,
        entityId: stopId,
        entityType: 'delivery_stop',
        metadata: { routeId },
        requestId: context.requestId,
        source: context.source,
      });

      return { id: stopId, status: 'delivered' as const };
    });
  }

  public async updateStopStatus(
    stopId: string,
    status: StopStatus,
    actorUserId: string | undefined,
    context: DeliveryContext,
  ) {
    return this.database.transaction(async (transaction) => {
      const [stop] = await transaction
        .select({ orderId: deliveryStops.orderId, status: deliveryStops.status })
        .from(deliveryStops)
        .where(eq(deliveryStops.id, stopId))
        .limit(1);
      if (!stop) throw new DeliveryNotFoundError('Stop not found');

      await transaction
        .update(deliveryStops)
        .set({
          deliveredAt: status === 'delivered' ? new Date() : null,
          status,
          updatedAt: new Date(),
        })
        .where(eq(deliveryStops.id, stopId));

      if (status === 'delivered') {
        const [order] = await transaction
          .select({ status: orders.status })
          .from(orders)
          .where(eq(orders.id, stop.orderId))
          .limit(1);
        if (order && order.status !== 'DELIVERED') {
          await transaction
            .update(orders)
            .set({ status: 'DELIVERED', updatedAt: new Date() })
            .where(eq(orders.id, stop.orderId));
          await transaction.insert(orderStatusHistory).values({
            actorUserId: actorUserId ?? null,
            fromStatus: order.status,
            orderId: stop.orderId,
            reason: 'Entrega confirmada por el repartidor',
            toStatus: 'DELIVERED',
          });
        }
      }

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'delivery.stop_status_changed',
        actor: actorUserId ? { type: 'user', userId: actorUserId } : { type: 'system' },
        after: { status },
        before: { status: stop.status },
        correlationId: context.correlationId,
        entityId: stopId,
        entityType: 'delivery_stop',
        requestId: context.requestId,
        source: context.source,
      });

      return { id: stopId, status };
    });
  }

  /**
   * The delivery that could not be handed over.
   *
   * Until now "delivered" was the only ending a repartidor could record, so a failed drop either
   * got marked delivered or was left hanging on the route forever. This cancels the order with a
   * category and closes the stop in one transaction.
   *
   * Deliberately its own method rather than letting the delivery app call the order-cancel
   * endpoint: that one requires `orders.cancel`, which a repartidor has no business holding, and
   * it would mean shipping order ids to a client that is otherwise kept PII-thin.
   */
  public async reportFailedDelivery(
    stopId: string,
    cancellationReasonId: string,
    actorUserId: string | undefined,
    context: DeliveryContext,
  ) {
    return this.database.transaction(async (transaction) => {
      const [stop] = await transaction
        .select({ orderId: deliveryStops.orderId, status: deliveryStops.status })
        .from(deliveryStops)
        .where(eq(deliveryStops.id, stopId))
        .limit(1);
      if (!stop) throw new DeliveryNotFoundError('Stop not found');

      const [reason] = await transaction
        .select({ displayName: cancellationReasons.displayName, id: cancellationReasons.id })
        .from(cancellationReasons)
        .where(eq(cancellationReasons.id, cancellationReasonId))
        .limit(1);
      if (!reason) throw new DeliveryNotFoundError('Cancellation reason not found');

      await transaction
        .update(deliveryStops)
        .set({ deliveredAt: null, status: 'skipped', updatedAt: new Date() })
        .where(eq(deliveryStops.id, stopId));

      const [order] = await transaction
        .select({ status: orders.status })
        .from(orders)
        .where(eq(orders.id, stop.orderId))
        .limit(1);
      if (order && order.status !== 'CANCELLED') {
        await transaction
          .update(orders)
          .set({
            cancellationNotes: 'Reportado desde la app de reparto',
            cancellationReasonId: reason.id,
            status: 'CANCELLED',
            updatedAt: new Date(),
          })
          .where(eq(orders.id, stop.orderId));
        await transaction.insert(orderStatusHistory).values({
          actorUserId: actorUserId ?? null,
          fromStatus: order.status,
          orderId: stop.orderId,
          reason: `Entrega fallida: ${reason.displayName}`,
          toStatus: 'CANCELLED',
        });
      }

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'delivery.stop_failed',
        actor: actorUserId ? { type: 'user', userId: actorUserId } : { type: 'system' },
        after: { cancellationReason: reason.displayName, status: 'skipped' },
        before: { status: stop.status },
        correlationId: context.correlationId,
        entityId: stopId,
        entityType: 'delivery_stop',
        requestId: context.requestId,
        source: context.source,
      });

      return { id: stopId, status: 'skipped' as const };
    });
  }

  /**
   * "Estoy en camino / en el domicilio / gracias por su compra" — semantic actions only; the
   * repartidor never sees or handles the customer's number (DELIVERY_AND_ROUTES.md "Mensajes"). No
   * matching active template (an operator hasn't configured one for that actionKey yet) or no
   * WhatsApp identity on file both come back as a clean `sent:false`, not an error — a trigger with
   * nothing configured to send is an expected, recoverable state, not a bug.
   */
  public async triggerMessage(
    stopId: string,
    action: TriggerAction,
    context: DeliveryContext,
  ): Promise<{ reason?: string; sent: boolean }> {
    const [stop] = await this.database
      .select({
        customerId: orders.customerId,
        operatingSiteId: orders.operatingSiteId,
      })
      .from(deliveryStops)
      .innerJoin(orders, eq(orders.id, deliveryStops.orderId))
      .where(eq(deliveryStops.id, stopId))
      .limit(1);
    if (!stop) throw new DeliveryNotFoundError('Stop not found');

    const [template] = await this.database
      .select({ body: messageTemplates.body })
      .from(messageTemplates)
      .where(and(eq(messageTemplates.actionKey, action), eq(messageTemplates.active, true)))
      .limit(1);
    if (!template) return { reason: 'no_template', sent: false };

    return this.messaging.sendToCustomer(stop.customerId, stop.operatingSiteId, template.body, {
      actorUserId: context.actorUserId,
      correlationId: context.correlationId,
      requestId: context.requestId,
      source: context.source,
    });
  }
}
