import { AuditService } from '@verdeo/audit';
import { and, eq, ne, sql } from 'drizzle-orm';

import type { Database } from '../index.js';
import {
  customerAddresses,
  customerIdentities,
  customerLogins,
  customerOperatingSites,
  customerPreferences,
  customerRestrictions,
  customers,
  messagingConversations,
  orders,
  surveyResponses,
} from '../schema/index.js';
import { PostgresAuditSink } from './postgres-audit-sink.js';

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface MergeContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

export class CustomerMergeError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CustomerMergeError';
  }
}

export interface MergeResult {
  movedAddresses: number;
  movedIdentities: number;
  movedOrders: number;
  survivorId: string;
  /** Identities that already existed on the survivor and were retired rather than moved. */
  retiredIdentities: number;
}

/**
 * Folds one customer record into another.
 *
 * Ten tables point at a customer and five unique constraints can collide, so this is deliberately
 * explicit about each rather than a loop over foreign keys: every collision has a different right
 * answer, and a generic "update all references" would hit one of them and abort halfway.
 *
 * The merged record is kept as a tombstone rather than deleted. An old link, a printed order or an
 * audit entry pointing at it must still resolve to something, and it should say where the customer
 * went.
 */
export async function mergeCustomers(
  database: Database,
  input: { mergedId: string; survivorId: string },
  context: MergeContext,
): Promise<MergeResult> {
  if (input.survivorId === input.mergedId) {
    throw new CustomerMergeError('No se puede fusionar un cliente consigo mismo.');
  }

  return database.transaction(async (transaction) => {
    const [survivor] = await transaction
      .select({ id: customers.id, mergedInto: customers.mergedIntoCustomerId })
      .from(customers)
      .where(eq(customers.id, input.survivorId))
      .limit(1);
    const [merged] = await transaction
      .select({ id: customers.id, mergedInto: customers.mergedIntoCustomerId })
      .from(customers)
      .where(eq(customers.id, input.mergedId))
      .limit(1);

    if (!survivor || !merged)
      throw new CustomerMergeError('No encontramos alguno de los clientes.');
    // Merging into a tombstone would bury the records one level deeper every time, and the
    // survivor a caller thinks they picked would not be where the data ends up.
    if (survivor.mergedInto) {
      throw new CustomerMergeError('El cliente que elegiste conservar ya fue fusionado en otro.');
    }
    if (merged.mergedInto) {
      throw new CustomerMergeError('Ese cliente ya fue fusionado.');
    }

    await assertLoginsCompatible(transaction, input);

    const movedOrders = await moveOrders(transaction, input);
    const identities = await moveIdentities(transaction, input);
    const movedAddresses = await moveAddresses(transaction, input);
    await moveMemberships(transaction, input);
    await moveSimpleReferences(transaction, input);

    await transaction
      .update(customers)
      .set({
        mergedIntoCustomerId: input.survivorId,
        status: 'merged',
        updatedAt: new Date(),
      })
      .where(eq(customers.id, input.mergedId));

    const audit = new AuditService(new PostgresAuditSink(transaction));
    await audit.record({
      action: 'customer.merged',
      actor: context.actorUserId
        ? { type: 'user', userId: context.actorUserId }
        : { type: 'system' },
      after: {
        movedAddresses,
        movedIdentities: identities.moved,
        movedOrders,
        retiredIdentities: identities.retired,
        survivorId: input.survivorId,
      },
      correlationId: context.correlationId,
      entityId: input.mergedId,
      entityType: 'customer',
      requestId: context.requestId,
      source: context.source,
    });

    return {
      movedAddresses,
      movedIdentities: identities.moved,
      movedOrders,
      retiredIdentities: identities.retired,
      survivorId: input.survivorId,
    };
  });
}

/**
 * Two customer accounts cannot fold into one.
 *
 * `customer_logins` is unique on both sides, so a merge where both records have a login would have
 * to silently drop one — severing a real person's access without telling anyone. Refused instead,
 * with an instruction, because which login survives is not a decision this function should make.
 */
async function assertLoginsCompatible(
  transaction: DatabaseTransaction,
  input: { mergedId: string; survivorId: string },
): Promise<void> {
  const logins = await transaction
    .select({ customerId: customerLogins.customerId })
    .from(customerLogins)
    .where(
      sql`${customerLogins.customerId} in (${input.survivorId}::uuid, ${input.mergedId}::uuid)`,
    );

  if (logins.length < 2) {
    // At most one login: it either stays put or moves across with everything else.
    await transaction
      .update(customerLogins)
      .set({ customerId: input.survivorId, updatedAt: new Date() })
      .where(eq(customerLogins.customerId, input.mergedId));
    return;
  }

  throw new CustomerMergeError(
    'Los dos clientes tienen una cuenta de acceso. Desvinculá una antes de fusionar: si no, ' +
      'alguien perdería el acceso sin enterarse.',
  );
}

/** Orders are `on delete restrict`, so they must move for the tombstone to be legal at all. */
async function moveOrders(
  transaction: DatabaseTransaction,
  input: { mergedId: string; survivorId: string },
): Promise<number> {
  const moved = await transaction
    .update(orders)
    .set({ customerId: input.survivorId, updatedAt: new Date() })
    .where(eq(orders.customerId, input.mergedId))
    .returning({ id: orders.id });
  return moved.length;
}

/**
 * An identity the survivor already holds is retired rather than moved: the unique index on
 * (type, value) where active would reject the move, and the duplicate is precisely why these two
 * records are being merged.
 */
async function moveIdentities(
  transaction: DatabaseTransaction,
  input: { mergedId: string; survivorId: string },
): Promise<{ moved: number; retired: number }> {
  const survivorIdentities = await transaction
    .select({ type: customerIdentities.type, value: customerIdentities.valueNormalized })
    .from(customerIdentities)
    .where(
      and(eq(customerIdentities.customerId, input.survivorId), eq(customerIdentities.active, true)),
    );
  const held = new Set(survivorIdentities.map((row) => `${row.type}:${row.value}`));

  const incoming = await transaction
    .select({
      id: customerIdentities.id,
      type: customerIdentities.type,
      value: customerIdentities.valueNormalized,
    })
    .from(customerIdentities)
    .where(eq(customerIdentities.customerId, input.mergedId));

  let moved = 0;
  let retired = 0;
  for (const identity of incoming) {
    if (held.has(`${identity.type}:${identity.value}`)) {
      await transaction
        .update(customerIdentities)
        .set({ active: false, primary: false, updatedAt: new Date() })
        .where(eq(customerIdentities.id, identity.id));
      retired += 1;
      continue;
    }
    await transaction
      .update(customerIdentities)
      .set({
        customerId: input.survivorId,
        // Never primary on arrival: the survivor already has its own primary per type, and two
        // would violate the partial unique index.
        primary: false,
        updatedAt: new Date(),
      })
      .where(eq(customerIdentities.id, identity.id));
    held.add(`${identity.type}:${identity.value}`);
    moved += 1;
  }

  return { moved, retired };
}

/** Addresses move, but never as primary: one active primary per customer is enforced by index. */
async function moveAddresses(
  transaction: DatabaseTransaction,
  input: { mergedId: string; survivorId: string },
): Promise<number> {
  const moved = await transaction
    .update(customerAddresses)
    .set({ customerId: input.survivorId, primary: false, updatedAt: new Date() })
    .where(eq(customerAddresses.customerId, input.mergedId))
    .returning({ id: customerAddresses.id });
  return moved.length;
}

/**
 * Memberships are keyed on (customer, site), so one the survivor already has is dropped rather
 * than moved — it would collide, and it says nothing the survivor's own row does not.
 */
async function moveMemberships(
  transaction: DatabaseTransaction,
  input: { mergedId: string; survivorId: string },
): Promise<void> {
  const survivorSites = await transaction
    .select({ operatingSiteId: customerOperatingSites.operatingSiteId })
    .from(customerOperatingSites)
    .where(eq(customerOperatingSites.customerId, input.survivorId));
  const held = new Set(survivorSites.map((row) => row.operatingSiteId));

  const incoming = await transaction
    .select({ operatingSiteId: customerOperatingSites.operatingSiteId })
    .from(customerOperatingSites)
    .where(eq(customerOperatingSites.customerId, input.mergedId));

  for (const membership of incoming) {
    if (held.has(membership.operatingSiteId)) continue;
    await transaction
      .update(customerOperatingSites)
      .set({ customerId: input.survivorId, updatedAt: new Date() })
      .where(
        and(
          eq(customerOperatingSites.customerId, input.mergedId),
          eq(customerOperatingSites.operatingSiteId, membership.operatingSiteId),
        ),
      );
  }

  // Whatever collided is deleted: it is a duplicate of a row the survivor already has.
  await transaction
    .delete(customerOperatingSites)
    .where(eq(customerOperatingSites.customerId, input.mergedId));
}

/** The tables with no constraint to negotiate — everything simply repoints. */
async function moveSimpleReferences(
  transaction: DatabaseTransaction,
  input: { mergedId: string; survivorId: string },
): Promise<void> {
  await transaction
    .update(customerPreferences)
    .set({ customerId: input.survivorId })
    .where(eq(customerPreferences.customerId, input.mergedId));
  await transaction
    .update(customerRestrictions)
    .set({ customerId: input.survivorId })
    .where(eq(customerRestrictions.customerId, input.mergedId));
  await transaction
    .update(messagingConversations)
    .set({ customerId: input.survivorId })
    .where(eq(messagingConversations.customerId, input.mergedId));
  await transaction
    .update(surveyResponses)
    .set({ customerId: input.survivorId })
    .where(eq(surveyResponses.customerId, input.mergedId));
}

export interface MergeCandidate {
  customerIds: string[];
  customerNames: string[];
  /** Why these records look like the same person. */
  reason: 'duplicate-contact' | 'same-name';
  value: string;
}

/**
 * Records that look like the same person.
 *
 * Note what is *not* a signal here: two customers sharing an **active** contact. The partial unique
 * index on (type, value_normalized) where active makes that state unreachable, so grouping active
 * identities would return nothing, forever. The two signals that do occur:
 *
 * - the same contact where one side is deactivated — the trace left when that index rejected a
 *   duplicate and somebody created a second record instead;
 * - the same name — the ordinary case, one person captured by phone on WhatsApp and again by email
 *   on the public portal, where no contact value ever collides at all.
 *
 * Both are suggestions for a human to look at, never grounds to merge on their own: two real
 * customers can share a name.
 */
export async function findMergeCandidates(
  database: Database,
  limit: number,
): Promise<MergeCandidate[]> {
  const rows = await database.execute(sql`
    select customer_ids, customer_names, reason, value from (
      select
        array_agg(distinct ci.customer_id::text) as customer_ids,
        array_agg(distinct c.display_name) as customer_names,
        'duplicate-contact' as reason,
        min(ci.value_display) as value
      from customer_identities ci
      join customers c on c.id = ci.customer_id
      where c.merged_into_customer_id is null
      group by ci.type, ci.value_normalized
      having count(distinct ci.customer_id) > 1

      union all

      select
        array_agg(distinct c.id::text) as customer_ids,
        array_agg(distinct c.display_name) as customer_names,
        'same-name' as reason,
        min(c.display_name) as value
      from customers c
      where c.merged_into_customer_id is null
      group by lower(btrim(c.display_name))
      having count(*) > 1
    ) candidates
    order by reason, value
    limit ${limit}
  `);

  return resultRows<{
    customer_ids: string[];
    customer_names: string[];
    reason: string;
    value: string;
  }>(rows).map((row) => ({
    customerIds: row.customer_ids,
    customerNames: row.customer_names,
    reason: row.reason === 'same-name' ? 'same-name' : 'duplicate-contact',
    value: row.value,
  }));
}

/**
 * Drizzle's `execute` hands back whatever the driver returns, and the two drivers this project
 * runs on disagree: node-postgres gives a result object with `.rows`, PGlite (the test harness)
 * gives the array directly. Reading `.rows` off the wrong one yields `undefined` in production.
 */
function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown }).rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

/** Kept so the tombstone's own `ne` import is used where a caller filters merged records out. */
export const ACTIVE_CUSTOMERS_FILTER = ne(customers.status, 'merged');
