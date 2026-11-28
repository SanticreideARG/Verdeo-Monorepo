import { asc, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from '../index.js';
import { customerTags, orderTags, orders, tagSites, tags } from '../schema/index.js';

type Executor = Pick<Database, 'delete' | 'insert' | 'select' | 'update'>;

/*
 * Tags personalizables (TAGS_Y_STOCK_CON_NOMBRE_PLAN.md, 2026-11-28).
 *
 * Un tag se pone a un cliente, a un pedido o a ambos. El de un cliente marca todos sus pedidos: se
 * calcula al leer, no se copia, así que sacárselo al cliente lo saca de todos. Un tag con ciudades
 * sólo se ve en los pedidos de esas ciudades. Uno archivado no se ofrece, pero lo que ya lo tiene
 * lo sigue mostrando.
 */

export type TagSheetMode = 'CHECK' | 'NAME' | 'OFF';

export interface TagRecord {
  active: boolean;
  appliesTo: 'BOTH' | 'CUSTOMER' | 'ORDER';
  color: string;
  deliverySheet: TagSheetMode;
  id: string;
  name: string;
  ordersSheet: TagSheetMode;
  productionSheet: TagSheetMode;
  siteIds: string[];
  sortOrder: number;
}

/** Un tag puesto en un pedido: propio o heredado del cliente. */
export interface AppliedTag {
  color: string;
  deliverySheet: TagSheetMode;
  fromCustomer: boolean;
  id: string;
  name: string;
  ordersSheet: TagSheetMode;
  productionSheet: TagSheetMode;
}

export interface TagInput {
  active?: boolean | undefined;
  appliesTo?: 'BOTH' | 'CUSTOMER' | 'ORDER' | undefined;
  color?: string | undefined;
  deliverySheet?: TagSheetMode | undefined;
  name?: string | undefined;
  ordersSheet?: TagSheetMode | undefined;
  productionSheet?: TagSheetMode | undefined;
  siteIds?: readonly string[] | undefined;
  sortOrder?: number | undefined;
}

export async function listTags(database: Executor): Promise<TagRecord[]> {
  const rows = await database
    .select()
    .from(tags)
    .orderBy(asc(tags.sortOrder), asc(sql`lower(${tags.name})`));
  const sites = rows.length
    ? await database
        .select()
        .from(tagSites)
        .where(
          inArray(
            tagSites.tagId,
            rows.map((row) => row.id),
          ),
        )
    : [];
  return rows.map((row) => ({
    active: row.active,
    appliesTo: row.appliesTo as TagRecord['appliesTo'],
    color: row.color,
    deliverySheet: row.deliverySheet as TagSheetMode,
    id: row.id,
    name: row.name,
    ordersSheet: row.ordersSheet as TagSheetMode,
    productionSheet: row.productionSheet as TagSheetMode,
    siteIds: sites.filter((site) => site.tagId === row.id).map((site) => site.operatingSiteId),
    sortOrder: row.sortOrder,
  }));
}

export async function getTag(database: Executor, id: string): Promise<TagRecord | null> {
  return (await listTags(database)).find((tag) => tag.id === id) ?? null;
}

/** Alta (sin `id`) o edición de un tag, con sus ciudades. Devuelve el id. */
export async function saveTag(
  database: Executor,
  id: string | null,
  input: TagInput,
  actorUserId: string | null,
): Promise<string> {
  const values = {
    ...(input.active !== undefined ? { active: input.active } : {}),
    ...(input.appliesTo ? { appliesTo: input.appliesTo } : {}),
    ...(input.color ? { color: input.color } : {}),
    ...(input.deliverySheet ? { deliverySheet: input.deliverySheet } : {}),
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.ordersSheet ? { ordersSheet: input.ordersSheet } : {}),
    ...(input.productionSheet ? { productionSheet: input.productionSheet } : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
  };
  let tagId = id;
  if (tagId) {
    await database
      .update(tags)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(tags.id, tagId));
  } else {
    const [created] = await database
      .insert(tags)
      .values({ ...values, createdByUserId: actorUserId, name: input.name?.trim() ?? '' })
      .returning({ id: tags.id });
    if (!created) throw new Error('Tag insert did not return a row');
    tagId = created.id;
  }
  if (input.siteIds) {
    await database.delete(tagSites).where(eq(tagSites.tagId, tagId));
    if (input.siteIds.length > 0)
      await database
        .insert(tagSites)
        .values([...new Set(input.siteIds)].map((operatingSiteId) => ({ operatingSiteId, tagId })));
  }
  return tagId;
}

/** Reemplaza los tags propios de un cliente. */
export async function replaceCustomerTags(
  database: Executor,
  customerId: string,
  tagIds: readonly string[],
  actorUserId: string | null,
): Promise<void> {
  await database.delete(customerTags).where(eq(customerTags.customerId, customerId));
  if (tagIds.length > 0)
    await database.insert(customerTags).values(
      [...new Set(tagIds)].map((tagId) => ({
        createdByUserId: actorUserId,
        customerId,
        tagId,
      })),
    );
}

/** Reemplaza los tags propios de un pedido (los heredados del cliente no se tocan acá). */
export async function replaceOrderTags(
  database: Executor,
  orderId: string,
  tagIds: readonly string[],
  actorUserId: string | null,
): Promise<void> {
  await database.delete(orderTags).where(eq(orderTags.orderId, orderId));
  if (tagIds.length > 0)
    await database
      .insert(orderTags)
      .values(
        [...new Set(tagIds)].map((tagId) => ({ createdByUserId: actorUserId, orderId, tagId })),
      );
}

function applied(tag: TagRecord, fromCustomer: boolean): AppliedTag {
  return {
    color: tag.color,
    deliverySheet: tag.deliverySheet,
    fromCustomer,
    id: tag.id,
    name: tag.name,
    ordersSheet: tag.ordersSheet,
    productionSheet: tag.productionSheet,
  };
}

/** Un tag con ciudades vale sólo en ellas; sin ciudades, en todas. */
export function tagAppliesToSite(tag: { siteIds: readonly string[] }, siteId: string | null) {
  return tag.siteIds.length === 0 || (siteId !== null && tag.siteIds.includes(siteId));
}

/** Los tags propios de cada cliente, en el orden de los tags. */
export async function tagsByCustomer(
  database: Executor,
  customerIds: readonly string[],
): Promise<Map<string, AppliedTag[]>> {
  const result = new Map<string, AppliedTag[]>();
  if (customerIds.length === 0) return result;
  const rows = await database
    .select({ customerId: customerTags.customerId, tagId: customerTags.tagId })
    .from(customerTags)
    .where(inArray(customerTags.customerId, [...new Set(customerIds)]));
  if (rows.length === 0) return result;
  const all = await listTags(database);
  for (const tag of all) {
    for (const row of rows) {
      if (row.tagId !== tag.id) continue;
      result.set(row.customerId, [...(result.get(row.customerId) ?? []), applied(tag, false)]);
    }
  }
  return result;
}

/**
 * Los tags de cada pedido: los suyos y los de su cliente, sólo los que valen en la ciudad del
 * pedido. Si un tag está en los dos lados, cuenta como propio del pedido.
 */
export async function tagsByOrder(
  database: Executor,
  orderIds: readonly string[],
): Promise<Map<string, AppliedTag[]>> {
  const result = new Map<string, AppliedTag[]>();
  if (orderIds.length === 0) return result;
  const ids = [...new Set(orderIds)];
  const [own, inherited] = await Promise.all([
    database
      .select({ orderId: orderTags.orderId, tagId: orderTags.tagId })
      .from(orderTags)
      .where(inArray(orderTags.orderId, ids)),
    database
      .select({ orderId: orders.id, tagId: customerTags.tagId })
      .from(orders)
      .innerJoin(customerTags, eq(customerTags.customerId, orders.customerId))
      .where(inArray(orders.id, ids)),
  ]);
  if (own.length === 0 && inherited.length === 0) return result;
  const siteRows = await database
    .select({ id: orders.id, siteId: orders.operatingSiteId })
    .from(orders)
    .where(inArray(orders.id, ids));
  const siteOf = new Map(siteRows.map((row) => [row.id, row.siteId]));
  const all = await listTags(database);
  for (const orderId of ids) {
    const mine = new Set(own.filter((row) => row.orderId === orderId).map((row) => row.tagId));
    const fromCustomer = new Set(
      inherited.filter((row) => row.orderId === orderId).map((row) => row.tagId),
    );
    const list = all
      .filter(
        (tag) =>
          (mine.has(tag.id) || fromCustomer.has(tag.id)) &&
          tagAppliesToSite(tag, siteOf.get(orderId) ?? null),
      )
      .map((tag) => applied(tag, !mine.has(tag.id)));
    if (list.length > 0) result.set(orderId, list);
  }
  return result;
}

/** Los ids de los pedidos que tienen un tag (propio o del cliente), para filtrar listas. */
export function orderHasTagCondition(tagId: string) {
  return sql`(exists (select 1 from ${orderTags} where ${orderTags.orderId} = ${orders.id} and ${orderTags.tagId} = ${tagId}) or exists (select 1 from ${customerTags} where ${customerTags.customerId} = ${orders.customerId} and ${customerTags.tagId} = ${tagId}))`;
}
