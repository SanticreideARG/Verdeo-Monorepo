import { and, asc, desc, eq, isNull, notInArray, sql } from 'drizzle-orm';

import { AuditService } from '@verdeo/audit';

import type { Database } from '../index.js';
import {
  cashCollections,
  cashSettlements,
  customers,
  orders,
  paymentMethods,
  payments,
  users,
} from '../schema/index.js';
import { PostgresAuditSink } from './postgres-audit-sink.js';

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface PaymentsContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

export class PaymentsNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PaymentsNotFoundError';
  }
}

export class PaymentsConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PaymentsConflictError';
  }
}

// A method the customer actually paid with, rather than what they said at checkout, decides
// whether cash needs settling later or the order is paid outright (PAYMENTS.md: cash collected by
// a repartidor is TO_SETTLE until rendido; anything else — transfer, card, a manual Mercado Pago
// confirmation today — has no cash-in-hand step, so it goes straight to PAID).
const CASH_METHODS = new Set(['efectivo', 'cash']);

/**
 * PAYMENTS.md's three-state model, built on immutable transaction rows rather than one mutable
 * status field: `payments.status` is a derived summary, `cashCollections`/`cashSettlements` are
 * the actual history it's derived from. A settlement never edits a collection — it references it —
 * so "who collected what, when, and who later settled it" survives even after the order's status
 * moves past it.
 */
export class PostgresPaymentsService {
  public constructor(private readonly database: Database) {}

  private async ensurePayment(
    database: Database | DatabaseTransaction,
    orderId: string,
  ): Promise<{ amountMinor: number; currency: string; id: string; status: string }> {
    const [existing] = await database
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .limit(1);
    if (existing) return existing;

    const [order] = await database
      .select({
        currency: orders.currency,
        paymentExpectation: orders.paymentExpectation,
        totalMinor: orders.totalMinor,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) throw new PaymentsNotFoundError('Order not found');

    const [created] = await database
      .insert(payments)
      .values({
        amountMinor: order.totalMinor,
        currency: order.currency,
        expectedMethod: order.paymentExpectation,
        orderId,
      })
      .onConflictDoNothing()
      .returning();
    if (created) return created;

    // Lost the race to a concurrent ensurePayment call; the row exists now.
    const [row] = await database
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .limit(1);
    if (!row) throw new Error('Payment creation did not return a row');
    return row;
  }

  // The catalog is the source of truth once a code is registered in it; an unrecognized or
  // not-yet-migrated code (e.g. free text typed before this catalog existed) falls back to the
  // original hardcoded heuristic so existing behavior never regresses.
  private async resolveIsCash(
    database: Database | DatabaseTransaction,
    method: string,
  ): Promise<boolean> {
    const normalized = method.trim().toLowerCase();
    const [catalogEntry] = await database
      .select({ isCash: paymentMethods.isCash })
      .from(paymentMethods)
      .where(sql`lower(${paymentMethods.code}) = ${normalized}`)
      .limit(1);
    if (catalogEntry) return catalogEntry.isCash;
    return CASH_METHODS.has(normalized);
  }

  public async listPaymentMethods() {
    return this.database
      .select({
        active: paymentMethods.active,
        code: paymentMethods.code,
        displayName: paymentMethods.displayName,
        id: paymentMethods.id,
        isCash: paymentMethods.isCash,
        sortOrder: paymentMethods.sortOrder,
      })
      .from(paymentMethods)
      .orderBy(asc(paymentMethods.sortOrder), asc(paymentMethods.displayName));
  }

  public async updatePaymentMethods(
    methods: readonly {
      active: boolean;
      code: string;
      displayName: string;
      isCash: boolean;
    }[],
    context: PaymentsContext,
  ) {
    const actorUserId = context.actorUserId;
    const codes = methods.map((method) => method.code.trim().toLowerCase());

    return this.database.transaction(async (transaction) => {
      const before = await transaction
        .select({
          active: paymentMethods.active,
          code: paymentMethods.code,
          displayName: paymentMethods.displayName,
          isCash: paymentMethods.isCash,
        })
        .from(paymentMethods);

      if (codes.length > 0) {
        await transaction.delete(paymentMethods).where(notInArray(paymentMethods.code, codes));
      }

      for (const [index, method] of methods.entries()) {
        const code = method.code.trim().toLowerCase();
        await transaction
          .insert(paymentMethods)
          .values({
            active: method.active,
            code,
            displayName: method.displayName.trim(),
            isCash: method.isCash,
            sortOrder: index,
          })
          .onConflictDoUpdate({
            set: {
              active: method.active,
              displayName: method.displayName.trim(),
              isCash: method.isCash,
              sortOrder: index,
              updatedAt: new Date(),
            },
            target: paymentMethods.code,
          });
      }

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'payment_methods.updated',
        actor: actorUserId ? { type: 'user', userId: actorUserId } : { type: 'system' },
        after: { methods: [...methods] },
        before: { methods: [...before] },
        correlationId: context.correlationId,
        entityId: 'payment-methods',
        entityType: 'payment_methods',
        requestId: context.requestId,
        source: context.source,
      });

      return transaction
        .select({
          active: paymentMethods.active,
          code: paymentMethods.code,
          displayName: paymentMethods.displayName,
          id: paymentMethods.id,
          isCash: paymentMethods.isCash,
          sortOrder: paymentMethods.sortOrder,
        })
        .from(paymentMethods)
        .orderBy(asc(paymentMethods.sortOrder), asc(paymentMethods.displayName));
    });
  }

  public async getOrCreateForOrder(orderId: string) {
    return this.ensurePayment(this.database, orderId);
  }

  public async listByStatus(status?: string) {
    return this.database
      .select({
        amountMinor: payments.amountMinor,
        currency: payments.currency,
        customerDisplayName: customers.displayName,
        expectedMethod: payments.expectedMethod,
        id: payments.id,
        orderId: payments.orderId,
        publicNumber: orders.publicNumber,
        status: payments.status,
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(status ? eq(payments.status, status) : undefined)
      .orderBy(desc(payments.createdAt));
  }

  public async recordCollection(
    orderId: string,
    amountMinor: number,
    method: string,
    context: PaymentsContext,
  ) {
    const actorUserId = context.actorUserId;
    if (!actorUserId) throw new PaymentsConflictError('Se requiere un usuario autenticado.');

    return this.database.transaction(async (transaction) => {
      await this.ensurePayment(transaction, orderId);

      const [collection] = await transaction
        .insert(cashCollections)
        .values({ amountMinor, collectedByUserId: actorUserId, method, orderId })
        .returning();
      if (!collection) throw new Error('Collection creation did not return a row');

      const nextStatus = (await this.resolveIsCash(transaction, method)) ? 'TO_SETTLE' : 'PAID';
      await transaction
        .update(payments)
        .set({ status: nextStatus, updatedAt: new Date() })
        .where(eq(payments.orderId, orderId));

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'payments.collection_recorded',
        actor: { type: 'user', userId: actorUserId },
        after: { amountMinor, method, status: nextStatus },
        correlationId: context.correlationId,
        entityId: collection.id,
        entityType: 'cash_collection',
        requestId: context.requestId,
        source: context.source,
      });

      return collection;
    });
  }

  public async listUnsettledCollections(collectedByUserId?: string) {
    return this.database
      .select({
        amountMinor: cashCollections.amountMinor,
        collectedAt: cashCollections.collectedAt,
        collectedByUserId: cashCollections.collectedByUserId,
        id: cashCollections.id,
        method: cashCollections.method,
        orderId: cashCollections.orderId,
        publicNumber: orders.publicNumber,
      })
      .from(cashCollections)
      .innerJoin(orders, eq(orders.id, cashCollections.orderId))
      .leftJoin(cashSettlements, eq(cashSettlements.collectionId, cashCollections.id))
      .where(
        and(
          isNull(cashSettlements.id),
          collectedByUserId ? eq(cashCollections.collectedByUserId, collectedByUserId) : undefined,
        ),
      )
      .orderBy(desc(cashCollections.collectedAt));
  }

  public async settleCollection(
    collectionId: string,
    receivedByUserId: string,
    context: PaymentsContext,
  ) {
    const actorUserId = context.actorUserId;
    if (!actorUserId) throw new PaymentsConflictError('Se requiere un usuario autenticado.');

    return this.database.transaction(async (transaction) => {
      const [collection] = await transaction
        .select({ amountMinor: cashCollections.amountMinor, orderId: cashCollections.orderId })
        .from(cashCollections)
        .where(eq(cashCollections.id, collectionId))
        .limit(1);
      if (!collection) throw new PaymentsNotFoundError('Collection not found');

      const [existingSettlement] = await transaction
        .select({ id: cashSettlements.id })
        .from(cashSettlements)
        .where(eq(cashSettlements.collectionId, collectionId))
        .limit(1);
      if (existingSettlement) throw new PaymentsConflictError('Esta cobranza ya fue rendida.');

      const [settlement] = await transaction
        .insert(cashSettlements)
        .values({
          amountMinor: collection.amountMinor,
          collectionId,
          receivedByUserId,
          settledByUserId: actorUserId,
        })
        .returning();
      if (!settlement) throw new Error('Settlement creation did not return a row');

      // PAID only once every collection for this order is settled — most orders have exactly one,
      // but nothing here assumes that.
      const [unsettled] = await transaction
        .select({ id: cashCollections.id })
        .from(cashCollections)
        .leftJoin(cashSettlements, eq(cashSettlements.collectionId, cashCollections.id))
        .where(and(eq(cashCollections.orderId, collection.orderId), isNull(cashSettlements.id)))
        .limit(1);
      if (!unsettled) {
        await transaction
          .update(payments)
          .set({ status: 'PAID', updatedAt: new Date() })
          .where(eq(payments.orderId, collection.orderId));
      }

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'payments.collection_settled',
        actor: { type: 'user', userId: actorUserId },
        after: { amountMinor: collection.amountMinor, receivedByUserId },
        correlationId: context.correlationId,
        entityId: settlement.id,
        entityType: 'cash_settlement',
        requestId: context.requestId,
        source: context.source,
      });

      return settlement;
    });
  }

  public async dashboard(operatingSiteId?: string) {
    const scoped = operatingSiteId ? eq(orders.operatingSiteId, operatingSiteId) : undefined;

    const [totals] = await this.database
      .select({
        paidTotalMinor: sql<number>`coalesce(sum(${payments.amountMinor}) filter (where ${payments.status} = 'PAID'), 0)`,
        pendingTotalMinor: sql<number>`coalesce(sum(${payments.amountMinor}) filter (where ${payments.status} = 'PENDING'), 0)`,
        toSettleTotalMinor: sql<number>`coalesce(sum(${payments.amountMinor}) filter (where ${payments.status} = 'TO_SETTLE'), 0)`,
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(scoped);

    const unsettledByCollector = await this.database
      .select({
        amountMinor: sql<number>`sum(${cashCollections.amountMinor})`,
        collectedByUserId: cashCollections.collectedByUserId,
        collectorDisplayName: users.displayName,
      })
      .from(cashCollections)
      .innerJoin(orders, eq(orders.id, cashCollections.orderId))
      .innerJoin(users, eq(users.id, cashCollections.collectedByUserId))
      .leftJoin(cashSettlements, eq(cashSettlements.collectionId, cashCollections.id))
      .where(and(isNull(cashSettlements.id), scoped))
      .groupBy(cashCollections.collectedByUserId, users.displayName);

    return {
      cashByRepartidor: unsettledByCollector,
      ...(totals ?? { paidTotalMinor: 0, pendingTotalMinor: 0, toSettleTotalMinor: 0 }),
    };
  }
}
