import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { AuditService } from '@verdeo/audit';
import {
  assertOrderTransition,
  buildKitchenSummary,
  calculateLineTotal,
  calculateOrderTotal,
  resolveOrderComposition,
  type OrderStatus,
} from '@verdeo/orders';

import type { Database } from '../index.js';
import {
  customerIdentities,
  customers,
  domainEvents,
  orderDietaryInstructions,
  orderItemSelections,
  orderItems,
  orders,
  orderStatusHistory,
  productFamilies,
  productVariants,
  salesCycles,
  weeklyMenuItems,
  weeklyMenuOfferings,
  weeklyMenus,
} from '../schema/index.js';
import { PostgresAuditSink } from './postgres-audit-sink.js';

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface OperationsContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

export interface CustomerInput {
  displayName: string;
  email?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  phone?: string | undefined;
}

export interface MenuInput {
  alias: string;
  closeAt: string;
  offerings: readonly {
    currency: string;
    dishes: readonly string[];
    familyName: string;
    mealsPerUnit: number;
    unitPriceMinor: number;
    variantName: string;
  }[];
  openAt: string;
  partialKitchenCutoffAt: string;
}

export interface OrderInput {
  customerId: string;
  deliveryAddress: string;
  deliveryDate: string;
  dietaryInstructions: readonly string[];
  initialStatus?: 'DRAFT' | 'CONFIRMED' | undefined;
  items: readonly {
    offeringId: string;
    quantityUnits: number;
    selectedDishNames?: readonly string[] | undefined;
  }[];
  menuId: string;
  notes?: string | undefined;
  paymentExpectation: string;
  source: string;
}

export class OperationsNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'OperationsNotFoundError';
  }
}

export class OperationsConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'OperationsConflictError';
  }
}

function normalizeEmail(email: string): string {
  return email.trim().normalize('NFKC').toLowerCase();
}

function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

function catalogCode(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function auditActor(context: OperationsContext) {
  return context.actorUserId
    ? ({ type: 'user' as const, userId: context.actorUserId } as const)
    : ({ type: 'system' as const } as const);
}

function translateDatabaseConflict(error: unknown): never {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    throw new OperationsConflictError('Ya existe un registro con esos datos únicos.');
  }
  throw error;
}

async function appendDomainEvent(
  transaction: DatabaseTransaction,
  input: {
    aggregateId: string;
    aggregateType: string;
    correlationId: string;
    name: string;
    payload: Record<string, string>;
  },
) {
  await transaction.insert(domainEvents).values({
    aggregateId: input.aggregateId,
    aggregateType: input.aggregateType,
    correlationId: input.correlationId,
    name: input.name,
    payload: input.payload,
  });
}

export class PostgresOperationsService {
  public constructor(private readonly database: Database) {}

  public async listCustomers(includeSensitive: boolean) {
    const rows = await this.database
      .select({
        createdAt: customers.createdAt,
        displayName: customers.displayName,
        id: customers.id,
        status: customers.status,
      })
      .from(customers)
      .orderBy(asc(customers.displayName))
      .limit(200);

    if (!includeSensitive || rows.length === 0) return rows;

    const identities = await this.database
      .select({
        customerId: customerIdentities.customerId,
        type: customerIdentities.type,
        value: customerIdentities.valueDisplay,
      })
      .from(customerIdentities)
      .where(
        and(
          inArray(
            customerIdentities.customerId,
            rows.map(({ id }) => id),
          ),
          eq(customerIdentities.active, true),
        ),
      );

    return rows.map((row) => ({
      ...row,
      email:
        identities.find((identity) => identity.customerId === row.id && identity.type === 'email')
          ?.value ?? null,
      phone:
        identities.find((identity) => identity.customerId === row.id && identity.type === 'phone')
          ?.value ?? null,
    }));
  }

  public async createCustomer(input: CustomerInput, context: OperationsContext) {
    return this.database
      .transaction((transaction) => this.createCustomerInTransaction(transaction, input, context))
      .catch(translateDatabaseConflict);
  }

  private async createCustomerInTransaction(
    transaction: DatabaseTransaction,
    input: CustomerInput,
    context: OperationsContext,
  ) {
    const [created] = await transaction
      .insert(customers)
      .values({
        displayName: input.displayName,
        firstName: input.firstName,
        lastName: input.lastName,
      })
      .returning({
        createdAt: customers.createdAt,
        displayName: customers.displayName,
        id: customers.id,
        status: customers.status,
      });
    if (!created) throw new Error('Customer creation did not return a row');

    const identityValues = [
      input.email
        ? {
            customerId: created.id,
            primary: true,
            type: 'email',
            valueDisplay: input.email.trim(),
            valueNormalized: normalizeEmail(input.email),
          }
        : null,
      input.phone
        ? {
            customerId: created.id,
            primary: true,
            type: 'phone',
            valueDisplay: input.phone.trim(),
            valueNormalized: normalizePhone(input.phone),
          }
        : null,
    ].filter((value) => value !== null);

    if (identityValues.length > 0)
      await transaction.insert(customerIdentities).values(identityValues);

    const audit = new AuditService(new PostgresAuditSink(transaction));
    await audit.record({
      action: 'customer.created',
      actor: auditActor(context),
      after: { status: created.status },
      correlationId: context.correlationId,
      entityId: created.id,
      entityType: 'customer',
      requestId: context.requestId,
      source: context.source,
    });
    await appendDomainEvent(transaction, {
      aggregateId: created.id,
      aggregateType: 'customer',
      correlationId: context.correlationId,
      name: 'CUSTOMER_CREATED',
      payload: { customerId: created.id },
    });

    return {
      ...created,
      email: input.email?.trim() ?? null,
      phone: input.phone?.trim() ?? null,
    };
  }

  public async listMenus(onlyPublished = false) {
    const menuRows = await this.database
      .select({
        closeAt: salesCycles.closeAt,
        cycleAlias: salesCycles.alias,
        cycleId: salesCycles.id,
        cycleStatus: salesCycles.status,
        id: weeklyMenus.id,
        openAt: salesCycles.openAt,
        partialKitchenCutoffAt: salesCycles.partialKitchenCutoffAt,
        publishedAt: weeklyMenus.publishedAt,
        revision: weeklyMenus.revision,
        status: weeklyMenus.status,
      })
      .from(weeklyMenus)
      .innerJoin(salesCycles, eq(salesCycles.id, weeklyMenus.salesCycleId))
      .where(onlyPublished ? eq(weeklyMenus.status, 'PUBLISHED') : undefined)
      .orderBy(desc(salesCycles.openAt));

    if (menuRows.length === 0) return [];
    const offeringRows = await this.database
      .select({
        currency: weeklyMenuOfferings.currency,
        familyName: productFamilies.displayName,
        id: weeklyMenuOfferings.id,
        mealsPerUnit: productVariants.mealsPerUnit,
        menuId: weeklyMenuOfferings.weeklyMenuId,
        unitPriceMinor: weeklyMenuOfferings.unitPriceMinor,
        variantName: productVariants.displayName,
      })
      .from(weeklyMenuOfferings)
      .innerJoin(productVariants, eq(productVariants.id, weeklyMenuOfferings.productVariantId))
      .innerJoin(productFamilies, eq(productFamilies.id, productVariants.productFamilyId))
      .where(
        and(
          inArray(
            weeklyMenuOfferings.weeklyMenuId,
            menuRows.map(({ id }) => id),
          ),
          eq(weeklyMenuOfferings.active, true),
        ),
      )
      .orderBy(asc(productFamilies.displayName), asc(productVariants.displayName));
    const itemRows =
      offeringRows.length === 0
        ? []
        : await this.database
            .select({
              dishName: weeklyMenuItems.dishName,
              offeringId: weeklyMenuItems.offeringId,
              slot: weeklyMenuItems.slot,
            })
            .from(weeklyMenuItems)
            .where(
              inArray(
                weeklyMenuItems.offeringId,
                offeringRows.map(({ id }) => id),
              ),
            )
            .orderBy(asc(weeklyMenuItems.slot));

    return menuRows.map((menu) => ({
      cycle: {
        alias: menu.cycleAlias,
        closeAt: menu.closeAt,
        id: menu.cycleId,
        openAt: menu.openAt,
        partialKitchenCutoffAt: menu.partialKitchenCutoffAt,
        status: menu.cycleStatus,
      },
      id: menu.id,
      offerings: offeringRows
        .filter((offering) => offering.menuId === menu.id)
        .map((offering) => ({
          ...offering,
          dishes: itemRows
            .filter((item) => item.offeringId === offering.id)
            .map((item) => item.dishName),
        })),
      publishedAt: menu.publishedAt,
      revision: menu.revision,
      status: menu.status,
    }));
  }

  public async currentPublishedMenu() {
    const menus = await this.listMenus(true);
    const now = Date.now();
    return (
      menus.find(
        (menu) => menu.cycle.openAt.getTime() <= now && menu.cycle.closeAt.getTime() >= now,
      ) ?? null
    );
  }

  public async createMenu(input: MenuInput, context: OperationsContext) {
    return this.database
      .transaction(async (transaction) => {
        const [cycle] = await transaction
          .insert(salesCycles)
          .values({
            alias: input.alias,
            closeAt: new Date(input.closeAt),
            openAt: new Date(input.openAt),
            partialKitchenCutoffAt: new Date(input.partialKitchenCutoffAt),
            status: 'DRAFT',
          })
          .returning({ id: salesCycles.id });
        if (!cycle) throw new Error('Sales cycle creation did not return a row');

        const [menu] = await transaction
          .insert(weeklyMenus)
          .values({ salesCycleId: cycle.id })
          .returning({ id: weeklyMenus.id });
        if (!menu) throw new Error('Menu creation did not return a row');

        for (const offering of input.offerings) {
          const familyCode = catalogCode(offering.familyName);
          const [family] = await transaction
            .insert(productFamilies)
            .values({ code: familyCode, displayName: offering.familyName })
            .onConflictDoUpdate({
              set: { displayName: offering.familyName, updatedAt: new Date() },
              target: productFamilies.code,
            })
            .returning({ id: productFamilies.id });
          if (!family) throw new Error('Product family upsert did not return a row');

          const variantCode = catalogCode(offering.variantName);
          const [variant] = await transaction
            .insert(productVariants)
            .values({
              code: variantCode,
              displayName: offering.variantName,
              mealsPerUnit: offering.mealsPerUnit,
              productFamilyId: family.id,
            })
            .onConflictDoUpdate({
              set: {
                displayName: offering.variantName,
                mealsPerUnit: offering.mealsPerUnit,
                updatedAt: new Date(),
              },
              target: [productVariants.productFamilyId, productVariants.code],
            })
            .returning({ id: productVariants.id });
          if (!variant) throw new Error('Product variant upsert did not return a row');

          const [createdOffering] = await transaction
            .insert(weeklyMenuOfferings)
            .values({
              currency: offering.currency.toUpperCase(),
              productVariantId: variant.id,
              unitPriceMinor: offering.unitPriceMinor,
              weeklyMenuId: menu.id,
            })
            .returning({ id: weeklyMenuOfferings.id });
          if (!createdOffering) throw new Error('Menu offering creation did not return a row');

          await transaction.insert(weeklyMenuItems).values(
            offering.dishes.map((dishName, index) => ({
              dishName,
              offeringId: createdOffering.id,
              slot: index + 1,
            })),
          );
        }

        const audit = new AuditService(new PostgresAuditSink(transaction));
        await audit.record({
          action: 'weekly_menu.created',
          actor: auditActor(context),
          after: { revision: 1, status: 'DRAFT' },
          correlationId: context.correlationId,
          entityId: menu.id,
          entityType: 'weekly_menu',
          metadata: { salesCycleId: cycle.id },
          requestId: context.requestId,
          source: context.source,
        });

        return menu.id;
      })
      .then(async (menuId) => {
        const menu = (await this.listMenus()).find(({ id }) => id === menuId);
        if (!menu) throw new Error('Created menu could not be reloaded');
        return menu;
      })
      .catch(translateDatabaseConflict);
  }

  public async publishMenu(menuId: string, context: OperationsContext) {
    await this.database.transaction(async (transaction) => {
      const [current] = await transaction
        .select({ salesCycleId: weeklyMenus.salesCycleId, status: weeklyMenus.status })
        .from(weeklyMenus)
        .where(eq(weeklyMenus.id, menuId))
        .limit(1);
      if (!current) throw new OperationsNotFoundError('Weekly menu not found');
      if (current.status !== 'DRAFT')
        throw new OperationsConflictError('Only draft menus can be published');

      const publishedAt = new Date();
      await transaction
        .update(weeklyMenus)
        .set({ publishedAt, status: 'PUBLISHED', updatedAt: publishedAt })
        .where(eq(weeklyMenus.id, menuId));
      await transaction
        .update(salesCycles)
        .set({ status: 'OPEN', updatedAt: publishedAt })
        .where(eq(salesCycles.id, current.salesCycleId));

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'weekly_menu.published',
        actor: auditActor(context),
        after: { status: 'PUBLISHED' },
        before: { status: current.status },
        correlationId: context.correlationId,
        entityId: menuId,
        entityType: 'weekly_menu',
        requestId: context.requestId,
        source: context.source,
      });
    });

    const menu = (await this.listMenus()).find(({ id }) => id === menuId);
    if (!menu) throw new OperationsNotFoundError('Weekly menu not found');
    return menu;
  }

  public async createOrder(input: OrderInput, context: OperationsContext) {
    return this.database
      .transaction((transaction) => this.createOrderInTransaction(transaction, input, context))
      .catch(translateDatabaseConflict);
  }

  public async createPublicOrder(
    input: Omit<OrderInput, 'customerId'> & { customer: CustomerInput },
    context: OperationsContext,
  ) {
    return this.database
      .transaction(async (transaction) => {
        const identityCandidates = [
          input.customer.email
            ? { type: 'email', value: normalizeEmail(input.customer.email) }
            : null,
          input.customer.phone
            ? { type: 'phone', value: normalizePhone(input.customer.phone) }
            : null,
        ].filter((identity) => identity !== null);
        const resolvedIds = new Set<string>();

        for (const identity of identityCandidates) {
          const [row] = await transaction
            .select({ customerId: customerIdentities.customerId })
            .from(customerIdentities)
            .where(
              and(
                eq(customerIdentities.type, identity.type),
                eq(customerIdentities.valueNormalized, identity.value),
                eq(customerIdentities.active, true),
              ),
            )
            .limit(1);
          if (row) resolvedIds.add(row.customerId);
        }
        if (resolvedIds.size > 1) {
          throw new OperationsConflictError(
            'The supplied identities belong to different customers',
          );
        }

        const existingCustomerId = [...resolvedIds][0];
        const customer = existingCustomerId
          ? { id: existingCustomerId }
          : await this.createCustomerInTransaction(transaction, input.customer, context);

        return this.createOrderInTransaction(
          transaction,
          { ...input, customerId: customer.id, initialStatus: 'CONFIRMED' },
          context,
        );
      })
      .catch(translateDatabaseConflict);
  }

  private async createOrderInTransaction(
    transaction: DatabaseTransaction,
    input: OrderInput,
    context: OperationsContext,
  ) {
    const [menu] = await transaction
      .select({ salesCycleId: weeklyMenus.salesCycleId, status: weeklyMenus.status })
      .from(weeklyMenus)
      .where(eq(weeklyMenus.id, input.menuId))
      .limit(1);
    if (!menu) throw new OperationsNotFoundError('Weekly menu not found');
    if (menu.status !== 'PUBLISHED')
      throw new OperationsConflictError('Orders require a published menu');

    const [customer] = await transaction
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, input.customerId), eq(customers.status, 'active')))
      .limit(1);
    if (!customer) throw new OperationsNotFoundError('Active customer not found');

    const resolvedItems: {
      currency: string;
      dishSelections: readonly string[];
      offeringId: string;
      productNameSnapshot: string;
      productVariantId: string;
      quantityUnits: number;
      totalMinor: number;
      unitPriceMinor: number;
      variantSnapshot: string;
    }[] = [];

    for (const item of input.items) {
      const [offering] = await transaction
        .select({
          currency: weeklyMenuOfferings.currency,
          familyName: productFamilies.displayName,
          id: weeklyMenuOfferings.id,
          productVariantId: productVariants.id,
          unitPriceMinor: weeklyMenuOfferings.unitPriceMinor,
          variantName: productVariants.displayName,
        })
        .from(weeklyMenuOfferings)
        .innerJoin(productVariants, eq(productVariants.id, weeklyMenuOfferings.productVariantId))
        .innerJoin(productFamilies, eq(productFamilies.id, productVariants.productFamilyId))
        .where(
          and(
            eq(weeklyMenuOfferings.id, item.offeringId),
            eq(weeklyMenuOfferings.weeklyMenuId, input.menuId),
            eq(weeklyMenuOfferings.active, true),
          ),
        )
        .limit(1);
      if (!offering) throw new OperationsNotFoundError('Published menu offering not found');

      const baseDishes = await transaction
        .select({ dishName: weeklyMenuItems.dishName })
        .from(weeklyMenuItems)
        .where(eq(weeklyMenuItems.offeringId, offering.id))
        .orderBy(asc(weeklyMenuItems.slot));
      const variantUniverse = await transaction
        .select({ dishName: weeklyMenuItems.dishName })
        .from(weeklyMenuItems)
        .innerJoin(weeklyMenuOfferings, eq(weeklyMenuOfferings.id, weeklyMenuItems.offeringId))
        .innerJoin(productVariants, eq(productVariants.id, weeklyMenuOfferings.productVariantId))
        .where(
          and(
            eq(weeklyMenuOfferings.weeklyMenuId, input.menuId),
            eq(productVariants.displayName, offering.variantName),
          ),
        );
      const composition = resolveOrderComposition({
        allowedDishes: new Set(variantUniverse.map(({ dishName }) => dishName)),
        baseDishes: baseDishes.map(({ dishName }) => dishName),
        familyName: offering.familyName,
        ...(item.selectedDishNames ? { selectedDishes: item.selectedDishNames } : {}),
      });

      resolvedItems.push({
        currency: offering.currency,
        dishSelections: composition.dishSelections,
        offeringId: offering.id,
        productNameSnapshot: composition.productNameSnapshot,
        productVariantId: offering.productVariantId,
        quantityUnits: item.quantityUnits,
        totalMinor: calculateLineTotal(item.quantityUnits, offering.unitPriceMinor),
        unitPriceMinor: offering.unitPriceMinor,
        variantSnapshot: offering.variantName,
      });
    }

    const currency = resolvedItems[0]?.currency;
    if (!currency || resolvedItems.some((item) => item.currency !== currency)) {
      throw new OperationsConflictError('All order items must use the same currency');
    }
    const initialStatus = input.initialStatus ?? 'DRAFT';
    const [createdOrder] = await transaction
      .insert(orders)
      .values({
        currency,
        customerId: input.customerId,
        deliveryAddressSnapshot: input.deliveryAddress,
        deliveryDate: input.deliveryDate,
        notes: input.notes,
        paymentExpectation: input.paymentExpectation,
        salesCycleId: menu.salesCycleId,
        source: input.source,
        status: initialStatus,
        totalMinor: calculateOrderTotal(resolvedItems.map(({ totalMinor }) => totalMinor)),
        weeklyMenuId: input.menuId,
      })
      .returning({ id: orders.id });
    if (!createdOrder) throw new Error('Order creation did not return a row');

    for (const item of resolvedItems) {
      const [createdItem] = await transaction
        .insert(orderItems)
        .values({
          offeringId: item.offeringId,
          orderId: createdOrder.id,
          productNameSnapshot: item.productNameSnapshot,
          productVariantId: item.productVariantId,
          quantityUnits: item.quantityUnits,
          totalMinor: item.totalMinor,
          unitPriceMinor: item.unitPriceMinor,
          variantSnapshot: item.variantSnapshot,
        })
        .returning({ id: orderItems.id });
      if (!createdItem) throw new Error('Order item creation did not return a row');

      if (item.dishSelections.length > 0) {
        await transaction.insert(orderItemSelections).values(
          item.dishSelections.map((dishNameSnapshot, index) => ({
            dishNameSnapshot,
            orderItemId: createdItem.id,
            slot: index + 1,
          })),
        );
      }
    }
    if (input.dietaryInstructions.length > 0) {
      await transaction.insert(orderDietaryInstructions).values(
        input.dietaryInstructions.map((instruction) => ({
          instruction,
          orderId: createdOrder.id,
        })),
      );
    }
    await transaction.insert(orderStatusHistory).values({
      actorUserId: context.actorUserId,
      orderId: createdOrder.id,
      toStatus: initialStatus,
    });

    const audit = new AuditService(new PostgresAuditSink(transaction));
    await audit.record({
      action: 'order.created',
      actor: auditActor(context),
      after: { status: initialStatus },
      correlationId: context.correlationId,
      entityId: createdOrder.id,
      entityType: 'order',
      metadata: { salesCycleId: menu.salesCycleId, source: input.source },
      requestId: context.requestId,
      source: context.source,
    });
    await appendDomainEvent(transaction, {
      aggregateId: createdOrder.id,
      aggregateType: 'order',
      correlationId: context.correlationId,
      name: initialStatus === 'CONFIRMED' ? 'ORDER_CONFIRMED' : 'ORDER_CREATED',
      payload: { orderId: createdOrder.id, salesCycleId: menu.salesCycleId },
    });

    const order = await this.loadOrder(transaction, createdOrder.id);
    if (!order) throw new Error('Created order could not be reloaded');
    return order;
  }

  public async listOrders() {
    const orderIds = await this.database
      .select({ id: orders.id })
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(200);
    return Promise.all(orderIds.map(({ id }) => this.loadOrder(this.database, id))).then((rows) =>
      rows.filter((row) => row !== null),
    );
  }

  private async loadOrder(database: Database | DatabaseTransaction, orderId: string) {
    const [row] = await database
      .select({
        createdAt: orders.createdAt,
        currency: orders.currency,
        customerDisplayName: customers.displayName,
        customerId: customers.id,
        deliveryAddress: orders.deliveryAddressSnapshot,
        deliveryDate: orders.deliveryDate,
        id: orders.id,
        menuId: orders.weeklyMenuId,
        notes: orders.notes,
        paymentExpectation: orders.paymentExpectation,
        publicNumber: orders.publicNumber,
        source: orders.source,
        status: orders.status,
        totalMinor: orders.totalMinor,
        updatedAt: orders.updatedAt,
      })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!row) return null;

    const itemRows = await database
      .select({
        id: orderItems.id,
        productName: orderItems.productNameSnapshot,
        quantityUnits: orderItems.quantityUnits,
        totalMinor: orderItems.totalMinor,
        unitPriceMinor: orderItems.unitPriceMinor,
        variantName: orderItems.variantSnapshot,
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId));
    const selections =
      itemRows.length === 0
        ? []
        : await database
            .select({
              dishName: orderItemSelections.dishNameSnapshot,
              orderItemId: orderItemSelections.orderItemId,
              slot: orderItemSelections.slot,
            })
            .from(orderItemSelections)
            .where(
              inArray(
                orderItemSelections.orderItemId,
                itemRows.map(({ id }) => id),
              ),
            )
            .orderBy(asc(orderItemSelections.slot));
    const instructions = await database
      .select({ instruction: orderDietaryInstructions.instruction })
      .from(orderDietaryInstructions)
      .where(eq(orderDietaryInstructions.orderId, orderId));

    return {
      ...row,
      customer: { displayName: row.customerDisplayName, id: row.customerId },
      dietaryInstructions: instructions.map(({ instruction }) => instruction),
      items: itemRows.map((item) => ({
        ...item,
        dishSelections: selections
          .filter((selection) => selection.orderItemId === item.id)
          .map((selection) => selection.dishName),
      })),
    };
  }

  public async transitionOrder(
    orderId: string,
    targetStatus: OrderStatus,
    reason: string | undefined,
    confirmedReversal: boolean,
    context: OperationsContext,
  ) {
    await this.database.transaction(async (transaction) => {
      const [current] = await transaction
        .select({ status: orders.status })
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      if (!current) throw new OperationsNotFoundError('Order not found');

      const fromStatus = current.status as OrderStatus;
      assertOrderTransition(fromStatus, targetStatus);
      const isReversal =
        (fromStatus === 'READY' && targetStatus === 'CONFIRMED') ||
        (fromStatus === 'DELIVERED' && targetStatus === 'READY') ||
        (fromStatus === 'CANCELLED' && targetStatus === 'CONFIRMED');
      if (isReversal && !confirmedReversal) {
        throw new OperationsConflictError('Status reversals require explicit confirmation');
      }
      if (targetStatus === 'CANCELLED' && !reason) {
        throw new OperationsConflictError('Cancellation requires a reason');
      }

      await transaction
        .update(orders)
        .set({ status: targetStatus, updatedAt: new Date() })
        .where(eq(orders.id, orderId));
      await transaction.insert(orderStatusHistory).values({
        actorUserId: context.actorUserId,
        fromStatus,
        orderId,
        reason,
        toStatus: targetStatus,
      });

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'order.status_changed',
        actor: auditActor(context),
        after: { status: targetStatus },
        before: { status: fromStatus },
        correlationId: context.correlationId,
        entityId: orderId,
        entityType: 'order',
        ...(reason ? { metadata: { reason } } : {}),
        requestId: context.requestId,
        source: context.source,
      });
      await appendDomainEvent(transaction, {
        aggregateId: orderId,
        aggregateType: 'order',
        correlationId: context.correlationId,
        name: `ORDER_${targetStatus}`,
        payload: { orderId },
      });
    });

    const order = await this.loadOrder(this.database, orderId);
    if (!order) throw new OperationsNotFoundError('Order not found');
    return order;
  }

  public async kitchenSummary(cycleId: string) {
    const [cycle] = await this.database
      .select({ alias: salesCycles.alias, id: salesCycles.id })
      .from(salesCycles)
      .where(eq(salesCycles.id, cycleId))
      .limit(1);
    if (!cycle) throw new OperationsNotFoundError('Sales cycle not found');

    const lines = await this.database
      .select({
        customerDisplayName: customers.displayName,
        familyName: orderItems.productNameSnapshot,
        orderId: orders.id,
        orderItemId: orderItems.id,
        orderPublicNumber: orders.publicNumber,
        quantityUnits: orderItems.quantityUnits,
        variantName: orderItems.variantSnapshot,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(
        and(
          eq(orders.salesCycleId, cycleId),
          inArray(orders.status, ['CONFIRMED', 'READY', 'DELIVERED']),
        ),
      )
      .orderBy(asc(orders.publicNumber));
    const selections =
      lines.length === 0
        ? []
        : await this.database
            .select({
              dishName: orderItemSelections.dishNameSnapshot,
              orderItemId: orderItemSelections.orderItemId,
              slot: orderItemSelections.slot,
            })
            .from(orderItemSelections)
            .where(
              inArray(
                orderItemSelections.orderItemId,
                lines.map(({ orderItemId }) => orderItemId),
              ),
            )
            .orderBy(asc(orderItemSelections.slot));
    const instructions =
      lines.length === 0
        ? []
        : await this.database
            .select({
              instruction: orderDietaryInstructions.instruction,
              orderId: orderDietaryInstructions.orderId,
            })
            .from(orderDietaryInstructions)
            .where(
              inArray(orderDietaryInstructions.orderId, [
                ...new Set(lines.map(({ orderId }) => orderId)),
              ]),
            );

    return {
      ...buildKitchenSummary(
        lines.map((line) => ({
          ...line,
          dietaryInstructions: instructions
            .filter((instruction) => instruction.orderId === line.orderId)
            .map((instruction) => instruction.instruction),
          dishSelections: selections
            .filter((selection) => selection.orderItemId === line.orderItemId)
            .map((selection) => selection.dishName),
        })),
      ),
      cycle,
      generatedAt: new Date(),
    };
  }
}
