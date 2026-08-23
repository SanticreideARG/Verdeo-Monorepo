import { and, asc, desc, eq, inArray, isNull, notInArray } from 'drizzle-orm';

import { AuditService } from '@verdeo/audit';
import type { RouteOptimizer } from '@verdeo/routing';

import type { Database } from '../index.js';
import {
  customerAddresses,
  customers,
  deliveryRoutes,
  deliveryStops,
  messageTemplates,
  operatingSites,
  orderStatusHistory,
  orders,
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
   * Proposes a route for every CONFIRMED, geocoded, not-already-routed order due that day at that
   * site. "Puede existir pedido sin delivery como excepción": an order with no address coordinates
   * yet is simply left off — an operator handles it manually, nothing blocks on it.
   */
  public async createRoute(
    operatingSiteId: string,
    deliveryDate: string,
    label: string | undefined,
    context: DeliveryContext,
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
            eq(orders.status, 'CONFIRMED'),
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
        after: { stopCount: geocoded.length },
        correlationId: context.correlationId,
        entityId: route.id,
        entityType: 'delivery_route',
        requestId: context.requestId,
        source: context.source,
      });

      return this.loadRouteDetail(transaction, route.id);
    });
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
      .leftJoin(users, eq(users.id, deliveryStops.assignedUserId))
      .where(eq(deliveryStops.routeId, routeId))
      .orderBy(asc(deliveryStops.sequence));

    return { ...route, stops };
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

  public async assignStop(stopId: string, assignedUserId: string | null, context: DeliveryContext) {
    return this.database.transaction(async (transaction) => {
      const [current] = await transaction
        .select({ assignedUserId: deliveryStops.assignedUserId })
        .from(deliveryStops)
        .where(eq(deliveryStops.id, stopId))
        .limit(1);
      if (!current) throw new DeliveryNotFoundError('Stop not found');

      const [updated] = await transaction
        .update(deliveryStops)
        .set({ assignedUserId, updatedAt: new Date() })
        .where(eq(deliveryStops.id, stopId))
        .returning();

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'delivery.stop_assigned',
        actor: context.actorUserId
          ? { type: 'user', userId: context.actorUserId }
          : { type: 'system' },
        after: { assignedUserId },
        before: { assignedUserId: current.assignedUserId },
        correlationId: context.correlationId,
        entityId: stopId,
        entityType: 'delivery_stop',
        requestId: context.requestId,
        source: context.source,
      });

      return updated;
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
   * PII-safe stop list for the delivery app (DELIVERY_AND_ROUTES.md "Delivery App"): first name
   * only, no phone/email/notes/history. Only published routes and only this repartidor's assigned
   * stops — a driver never sees another driver's list.
   */
  public async listStopsForUser(userId: string) {
    const rows = await this.database
      .select({
        customerDisplayName: customers.displayName,
        deliveryAddress: orders.deliveryAddressSnapshot,
        deliveryLocationUrl: orders.deliveryLocationUrlSnapshot,
        id: deliveryStops.id,
        paymentExpectation: orders.paymentExpectation,
        publicNumber: orders.publicNumber,
        routeId: deliveryStops.routeId,
        sequence: deliveryStops.sequence,
        status: deliveryStops.status,
        totalMinor: orders.totalMinor,
      })
      .from(deliveryStops)
      .innerJoin(deliveryRoutes, eq(deliveryRoutes.id, deliveryStops.routeId))
      .innerJoin(orders, eq(orders.id, deliveryStops.orderId))
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(
        and(
          eq(deliveryStops.assignedUserId, userId),
          eq(deliveryRoutes.status, 'published'),
          isNull(deliveryStops.deliveredAt),
        ),
      )
      .orderBy(asc(deliveryStops.sequence));

    return rows.map(({ customerDisplayName, ...row }) => ({
      ...row,
      customerFirstName: customerDisplayName.split(' ')[0] ?? customerDisplayName,
    }));
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
