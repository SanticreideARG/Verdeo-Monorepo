import { and, eq, sql } from 'drizzle-orm';

import { WEEKDAY_NAMES, weekdayOf } from '@verdeo/orders';

import type { Database } from '../index.js';
import { deliveryRuns, orders } from '../schema/index.js';

type Executor = Pick<Database, 'delete' | 'insert' | 'select' | 'update'>;

/** "Domingo 18": cómo se llama un reparto creado solo. */
export function runLabel(date: string): string {
  const name = WEEKDAY_NAMES[weekdayOf(date)] ?? '';
  return `${name.charAt(0).toLocaleUpperCase('es-AR')}${name.slice(1)} ${String(Number(date.slice(8, 10)))}`;
}

/**
 * El reparto al que entra un pedido con esa fecha, en su ciudad (DELIVERY_RUNS_PLAN.md, regla 1).
 *
 * - Si hay repartos abiertos ese día: el marcado "de siempre"; si no hay ninguno marcado y hay uno
 *   solo, ése; si hay varios sin marcar, ninguno (queda "sin reparto" para elegir).
 * - Si ese día sólo hay repartos ya consolidados o en la calle: ninguno. El pedido no se cuela en
 *   una lista cerrada; queda "sin reparto", con aviso.
 * - Si no hay ningún reparto ese día: se crea uno ("Domingo 18"), marcado como creado solo.
 */
async function runFor(executor: Executor, operatingSiteId: string, deliveryDate: string) {
  const runs = await executor
    .select({ id: deliveryRuns.id, isDefault: deliveryRuns.isDefault, status: deliveryRuns.status })
    .from(deliveryRuns)
    .where(
      and(
        eq(deliveryRuns.operatingSiteId, operatingSiteId),
        eq(deliveryRuns.deliveryDate, deliveryDate),
        sql`${deliveryRuns.status} <> 'cancelled'`,
      ),
    );
  const open = runs.filter((run) => run.status === 'planned');
  if (open.length > 0) {
    const preferred =
      open.find((run) => run.isDefault) ?? (open.length === 1 ? open[0] : undefined);
    return preferred?.id ?? null;
  }
  if (runs.length > 0) return null;
  const [created] = await executor
    .insert(deliveryRuns)
    .values({
      autoCreated: true,
      deliveryDate,
      isDefault: true,
      label: runLabel(deliveryDate),
      operatingSiteId,
    })
    .returning({ id: deliveryRuns.id });
  return created?.id ?? null;
}

/** Un reparto creado solo que se quedó sin pedidos no tiene razón de existir (regla 7). */
export async function dropEmptyAutoRun(executor: Executor, runId: string | null) {
  if (!runId) return;
  const [run] = await executor
    .select({ autoCreated: deliveryRuns.autoCreated })
    .from(deliveryRuns)
    .where(eq(deliveryRuns.id, runId))
    .limit(1);
  if (!run?.autoCreated) return;
  const [left] = await executor
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.deliveryRunId, runId))
    .limit(1);
  if (!left) await executor.delete(deliveryRuns).where(eq(deliveryRuns.id, runId));
}

/**
 * Pone un pedido en el reparto que le toca por su fecha y su ciudad. Se llama al crearlo y cada
 * vez que cambia su fecha. Un pedido cancelado sale de su reparto (`leaveRun`).
 */
export async function assignOrderToRun(executor: Executor, orderId: string) {
  const [order] = await executor
    .select({
      deliveryDate: orders.deliveryDate,
      deliveryRunId: orders.deliveryRunId,
      operatingSiteId: orders.operatingSiteId,
      status: orders.status,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order || order.status === 'CANCELLED') return null;
  const runId = await runFor(executor, order.operatingSiteId, String(order.deliveryDate));
  if (runId !== order.deliveryRunId) {
    await executor.update(orders).set({ deliveryRunId: runId }).where(eq(orders.id, orderId));
    await dropEmptyAutoRun(executor, order.deliveryRunId);
  }
  return runId;
}

/** Saca un pedido de su reparto (cancelado o eliminado). */
export async function leaveRun(executor: Executor, orderId: string) {
  const [order] = await executor
    .select({ deliveryRunId: orders.deliveryRunId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order?.deliveryRunId) return;
  await executor.update(orders).set({ deliveryRunId: null }).where(eq(orders.id, orderId));
  await dropEmptyAutoRun(executor, order.deliveryRunId);
}
