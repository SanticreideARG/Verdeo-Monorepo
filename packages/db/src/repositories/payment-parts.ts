import { and, asc, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from '../index.js';
import { orderPaymentParts, orders } from '../schema/index.js';

type Executor = Pick<Database, 'delete' | 'insert' | 'select' | 'update'>;

/*
 * Pago dividido (2026-11-17): parte en efectivo, parte por transferencia, cada parte con su tilde.
 *
 * Un pedido sin partes se cobra entero con su medio y su tilde de siempre. Con partes, el medio del
 * pedido pasa a ser "Efectivo + Transferencia" y `orders.paid_at` se llena sólo cuando están
 * cobradas todas: lo que en el resto del sistema pregunta "¿está cobrado?" sigue mirando eso.
 */

export interface PaymentPartInput {
  /** Se ignora en la última: se lleva lo que falta para el total. */
  amountMinor?: number | undefined;
  method: string;
}

export interface PaymentPart {
  amountMinor: number;
  method: string;
  paidAt: Date | null;
  position: number;
}

/** Si el medio de una parte (`p.method`) es efectivo, como lo decide el catálogo de medios. */
const PART_IS_CASH = sql.raw(
  `coalesce((select pm.is_cash from payment_methods pm where lower(pm.display_name) = lower(p.method) or lower(pm.code) = lower(p.method) limit 1), lower(p.method) like '%efectivo%')`,
);

/**
 * Lo que se cobra en efectivo de un pedido dividido; null si el pedido no está dividido. Es lo que
 * cobra quien reparte: la transferencia no pasa por sus manos.
 */
export const splitCashMinor = sql<
  number | null
>`(select case when count(*) = 0 then null else coalesce(sum(p.amount_minor) filter (where ${PART_IS_CASH}), 0)::int end from order_payment_parts p where p.order_id = ${orders.id})`;

/** Los medios en efectivo de un pedido dividido ("Efectivo"), para quien reparte. */
export const splitCashMethods = sql<
  string | null
>`(select string_agg(p.method, ' + ' order by p.position) filter (where ${PART_IS_CASH}) from order_payment_parts p where p.order_id = ${orders.id})`;

/** Si lo que no es efectivo de un pedido dividido ya está cobrado; null si no está dividido. */
export const splitTransferPaid = sql<
  boolean | null
>`(select case when count(*) = 0 then null else coalesce(bool_and(p.paid_at is not null) filter (where not ${PART_IS_CASH}), true) end from order_payment_parts p where p.order_id = ${orders.id})`;

/** "Efectivo + Transferencia": el medio del pedido cuando el pago está dividido. */
export function splitLabel(parts: readonly { method: string }[]): string {
  return parts.map((part) => part.method.trim()).join(' + ');
}

/**
 * Las partes con su monto: la última se lleva lo que falta para el total. Devuelve un error, en
 * palabras, si no cierran.
 */
export function resolveParts(
  parts: readonly PaymentPartInput[],
  totalMinor: number,
): { error: string } | { parts: { amountMinor: number; method: string }[] } {
  if (parts.length < 2) return { error: 'Un pago dividido necesita al menos dos partes.' };
  const head = parts.slice(0, -1);
  const last = parts.at(-1);
  if (!last) return { error: 'Un pago dividido necesita al menos dos partes.' };
  if (head.some((part) => !part.amountMinor || part.amountMinor <= 0))
    return { error: 'Cada parte del pago tiene que tener un monto mayor a cero.' };
  const rest = totalMinor - head.reduce((sum, part) => sum + (part.amountMinor ?? 0), 0);
  if (rest <= 0)
    return {
      error:
        'Las partes del pago suman el total del pedido o más: a la última no le queda nada. Revisá los montos.',
    };
  return {
    parts: [
      ...head.map((part) => ({ amountMinor: part.amountMinor ?? 0, method: part.method.trim() })),
      { amountMinor: rest, method: last.method.trim() },
    ],
  };
}

/** Las partes de varios pedidos, en orden. Un pedido sin dividir no aparece. */
export async function paymentPartsByOrder(
  executor: Pick<Database, 'select'>,
  orderIds: readonly string[],
): Promise<Map<string, PaymentPart[]>> {
  const result = new Map<string, PaymentPart[]>();
  if (orderIds.length === 0) return result;
  const rows = await executor
    .select({
      amountMinor: orderPaymentParts.amountMinor,
      method: orderPaymentParts.method,
      orderId: orderPaymentParts.orderId,
      paidAt: orderPaymentParts.paidAt,
      position: orderPaymentParts.position,
    })
    .from(orderPaymentParts)
    .where(inArray(orderPaymentParts.orderId, [...orderIds]))
    .orderBy(asc(orderPaymentParts.orderId), asc(orderPaymentParts.position));
  for (const { orderId, ...part } of rows) {
    const list = result.get(orderId);
    if (list) list.push(part);
    else result.set(orderId, [part]);
  }
  return result;
}

/**
 * El tilde del pedido según el de sus partes: cobrado cuando lo están todas, con la fecha y la
 * persona de la última. Un pedido sin partes no se toca.
 */
export async function syncPaidFromParts(executor: Executor, orderId: string): Promise<void> {
  const parts = await executor
    .select({ paidAt: orderPaymentParts.paidAt, paidByUserId: orderPaymentParts.paidByUserId })
    .from(orderPaymentParts)
    .where(eq(orderPaymentParts.orderId, orderId));
  if (parts.length === 0) return;
  const all = parts.every((part) => part.paidAt !== null);
  const last = all
    ? parts.reduce((latest, part) =>
        (part.paidAt?.getTime() ?? 0) > (latest.paidAt?.getTime() ?? 0) ? part : latest,
      )
    : null;
  await executor
    .update(orders)
    .set({
      paidAt: last?.paidAt ?? null,
      paidByUserId: last?.paidByUserId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));
}

/**
 * Guarda las partes de un pedido, o las borra con una lista vacía.
 *
 * Una parte que queda igual (mismo medio y mismo monto) conserva su tilde. Si el pedido no estaba
 * dividido y ya figuraba cobrado, las partes nacen cobradas: dividir un pago que ya entró no lo
 * vuelve pendiente.
 */
export async function savePaymentParts(
  executor: Executor,
  orderId: string,
  parts: readonly { amountMinor: number; method: string }[],
  order: { paidAt: Date | null; paidByUserId: string | null },
): Promise<void> {
  const existing = await executor
    .select()
    .from(orderPaymentParts)
    .where(eq(orderPaymentParts.orderId, orderId))
    .orderBy(asc(orderPaymentParts.position));
  await executor.delete(orderPaymentParts).where(eq(orderPaymentParts.orderId, orderId));
  if (parts.length === 0) return;
  await executor.insert(orderPaymentParts).values(
    parts.map((part, position) => {
      const before = existing[position];
      const same =
        before !== undefined &&
        before.method === part.method &&
        before.amountMinor === part.amountMinor;
      const inherited = existing.length === 0 && order.paidAt !== null;
      return {
        amountMinor: part.amountMinor,
        method: part.method,
        orderId,
        paidAt: same ? before.paidAt : inherited ? order.paidAt : null,
        paidByUserId: same ? before.paidByUserId : inherited ? order.paidByUserId : null,
        position,
      };
    }),
  );
  await syncPaidFromParts(executor, orderId);
}

/**
 * Cuando cambia el total de un pedido dividido, la última parte se lleva la diferencia. Si cambia
 * su monto, su tilde se va: lo cobrado era otro monto. Devuelve un error si ya no entra.
 */
export async function rebalancePaymentParts(
  executor: Executor,
  orderId: string,
  totalMinor: number,
): Promise<string | null> {
  const existing = await executor
    .select()
    .from(orderPaymentParts)
    .where(eq(orderPaymentParts.orderId, orderId))
    .orderBy(asc(orderPaymentParts.position));
  if (existing.length === 0) return null;
  const resolved = resolveParts(existing, totalMinor);
  if ('error' in resolved)
    return 'El nuevo total no alcanza para las partes del pago dividido: cambiá los montos o volvé a un solo medio.';
  const last = existing.at(-1);
  const amountMinor = resolved.parts.at(-1)?.amountMinor;
  if (!last || amountMinor === undefined || amountMinor === last.amountMinor) return null;
  await executor
    .update(orderPaymentParts)
    .set({ amountMinor, paidAt: null, paidByUserId: null, updatedAt: new Date() })
    .where(
      and(eq(orderPaymentParts.orderId, orderId), eq(orderPaymentParts.position, last.position)),
    );
  await syncPaidFromParts(executor, orderId);
  return null;
}
