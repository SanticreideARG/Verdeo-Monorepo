import { and, asc, desc, eq, gt, gte, ilike, inArray, lt, lte, ne, or, sql } from 'drizzle-orm';

import { AuditService, type JsonValue } from '@verdeo/audit';
import {
  assertCoordinatePair,
  assertTemplateVariables,
  normalizeCustomerIdentity,
  normalizeCustomerText,
} from '@verdeo/customers';
import {
  GeocodingProviderError,
  validateGeocodingCandidates,
  type GeocodingProvider,
} from '@verdeo/geocoding';
import {
  assertOrderTransitionPolicy,
  buildOrdersCsv,
  buildKitchenSummary,
  calculateLineTotal,
  calculateOrderTotal,
  resolveOrderComposition,
  type OrderStatus,
} from '@verdeo/orders';

import type { Database } from '../index.js';
import {
  customerAddresses,
  customerIdentities,
  customerOperatingSites,
  customerPreferences,
  customerRestrictions,
  customers,
  domainEvents,
  geocodingCandidates,
  geographicZones,
  geocodingRequests,
  messageTemplates,
  operatingSiteOrderCounters,
  operatingSites,
  orderDietaryInstructions,
  orderItemSelections,
  orderItems,
  orderRevisions,
  orders,
  orderStatusHistory,
  productFamilies,
  productSizes,
  productVariants,
  salesCycles,
  weeklyMenuItems,
  weeklyMenuOfferings,
  weeklyMenuPrices,
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
  // Active scope. A customer is always created inside one operation (ADR-031).
  operatingSiteId?: string | null | undefined;
  addresses?: readonly CustomerAddressInput[] | undefined;
  displayName: string;
  email?: string | undefined;
  firstName?: string | undefined;
  identities?: readonly CustomerIdentityInput[] | undefined;
  internalNotes?: string | undefined;
  lastName?: string | undefined;
  phone?: string | undefined;
}

export interface CustomerIdentityInput {
  primary: boolean;
  source: string;
  type: string;
  value: string;
  verified: boolean;
}

export interface CustomerIdentityUpdateInput {
  active?: boolean | undefined;
  primary?: boolean | undefined;
  value?: string | undefined;
  verified?: boolean | undefined;
}

export interface CustomerAddressInput {
  accessNotes?: string | undefined;
  // Mandatory operational anchor. The written locality may differ from the operation name.
  geographicZoneId: string;
  city?: string | undefined;
  geocodingStatus: string;
  label: string;
  latitude?: number | undefined;
  locationUrl?: string | undefined;
  longitude?: number | undefined;
  operationalZone?: string | undefined;
  primary: boolean;
  propertyType?: string | undefined;
  sector?: string | undefined;
  source: string;
  unit?: string | undefined;
  writtenAddress: string;
}

export interface CustomerAddressUpdateInput {
  accessNotes?: string | null | undefined;
  active?: boolean | undefined;
  city?: string | null | undefined;
  geocodingStatus?: string | undefined;
  label?: string | undefined;
  latitude?: number | null | undefined;
  locationUrl?: string | null | undefined;
  longitude?: number | null | undefined;
  operationalZone?: string | null | undefined;
  primary?: boolean | undefined;
  propertyType?: string | null | undefined;
  sector?: string | null | undefined;
  source?: string | undefined;
  unit?: string | null | undefined;
  writtenAddress?: string | undefined;
}

export interface AddressGeocodingConfirmInput {
  candidateId?: string | undefined;
  city?: string | null | undefined;
  latitude?: number | undefined;
  locationUrl?: string | null | undefined;
  longitude?: number | undefined;
  operationalZone?: string | null | undefined;
  sector?: string | null | undefined;
}

export interface CustomerUpdateInput {
  displayName?: string | undefined;
  firstName?: string | null | undefined;
  internalNotes?: string | null | undefined;
  lastName?: string | null | undefined;
  status?: string | undefined;
}

export interface CustomerListInput {
  cursor?: string | undefined;
  operatingSiteId?: string | null | undefined;
  limit: number;
  search?: string | undefined;
  status?: string | undefined;
}

export interface MessageTemplateInput {
  actionKey?: string | null | undefined;
  active: boolean;
  body: string;
  channel: string;
  displayName: string;
  key: string;
  scopeReferenceId?: string | null | undefined;
  scopeType: string;
  variables: readonly string[];
}

export interface MenuInput {
  alias: string;
  closeAt: string;
  offerings: readonly {
    composable?: boolean | undefined;
    dishes: readonly string[];
    familyName: string;
    // Deliberate per-variety exception; omitted means the size price applies.
    overridePriceMinor?: number | undefined;
    sizeName: string;
  }[];
  openAt: string;
  partialKitchenCutoffAt: string;
  // One price per size for the whole week. Two varieties of the same size cost the same (ADR-030).
  prices: readonly {
    currency: string;
    mealsPerUnit: number;
    sizeName: string;
    unitPriceMinor: number;
  }[];
}

export type MenuDistributionMode = 'CREATE_MISSING' | 'UPDATE_UNCUSTOMIZED' | 'REPLACE';

export interface MenuDistributionInput {
  /** Required for REPLACE: it overwrites regional customisations. */
  confirmedReplace?: boolean | undefined;
  mode: MenuDistributionMode;
  operatingSiteIds: readonly string[];
}

export interface MenuDistributionResult {
  operatingSiteId: string;
  outcome: 'CREATED' | 'REFRESHED' | 'REPLACED' | 'SKIPPED_EXISTING' | 'SKIPPED_PUBLISHED';
  preservedCustomizations?: number;
  weeklyMenuId: string;
}

export interface OrderInput {
  customerId: string;
  // Active scope. Used only when no stored address supplies the zone; the zone always wins.
  operatingSiteId?: string | null | undefined;
  deliveryAddressId?: string | undefined;
  deliveryAddress: string;
  deliveryDate: string;
  deliveryLocationUrl?: string | undefined;
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

export interface OrderUpdateInput {
  deliveryAddress?: string | undefined;
  deliveryAddressId?: string | null | undefined;
  deliveryDate?: string | undefined;
  deliveryLocationUrl?: string | null | undefined;
  dietaryInstructions?: readonly string[] | undefined;
  items?:
    | readonly {
        offeringId: string;
        quantityUnits: number;
        selectedDishNames?: readonly string[] | undefined;
      }[]
    | undefined;
  notes?: string | null | undefined;
  paymentExpectation?: string | undefined;
  reason: string;
}

export interface OrderListInput {
  cursor?: string | undefined;
  // Null means the consolidated global view; a value restricts to one operation (ADR-028).
  operatingSiteId?: string | null | undefined;
  customerId?: string | undefined;
  cycleId?: string | undefined;
  from?: string | undefined;
  limit: number;
  search?: string | undefined;
  status?: OrderStatus | undefined;
  to?: string | undefined;
  zone?: string | undefined;
}

interface ResolvedOrderItem {
  currency: string;
  dishSelections: readonly string[];
  offeringId: string;
  productNameSnapshot: string;
  productVariantId: string;
  quantityUnits: number;
  totalMinor: number;
  unitPriceMinor: number;
  variantSnapshot: string;
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
  public constructor(
    private readonly database: Database,
    private readonly geocodingProvider: GeocodingProvider,
  ) {}

  public async listCustomers(input: CustomerListInput, includeSensitive: boolean) {
    // A customer keeps one global CRM identity and belongs to an operation through an explicit
    // membership, so scoping filters by membership rather than by a column on the customer.
    const scopeConditions = input.operatingSiteId
      ? [
          inArray(
            customers.id,
            this.database
              .select({ id: customerOperatingSites.customerId })
              .from(customerOperatingSites)
              .where(
                and(
                  eq(customerOperatingSites.operatingSiteId, input.operatingSiteId),
                  eq(customerOperatingSites.status, 'active'),
                ),
              ),
          ),
        ]
      : [];
    const conditions = [
      ...scopeConditions,
      ...(input.cursor ? [gt(customers.id, input.cursor)] : []),
      ...(input.status ? [eq(customers.status, input.status)] : []),
      ...(input.search ? [ilike(customers.displayName, `%${input.search}%`)] : []),
    ];
    let rows = await this.database
      .select({
        createdAt: customers.createdAt,
        displayName: customers.displayName,
        id: customers.id,
        status: customers.status,
      })
      .from(customers)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(customers.id))
      .limit(input.limit + 1);

    if (input.search && includeSensitive) {
      const matchingIdentities = await this.database
        .select({ customerId: customerIdentities.customerId })
        .from(customerIdentities)
        .where(
          and(
            ilike(customerIdentities.valueNormalized, `%${input.search.toLowerCase()}%`),
            eq(customerIdentities.active, true),
          ),
        )
        .limit(input.limit + 1);
      const identityCustomerIds = matchingIdentities.map(({ customerId }) => customerId);
      if (identityCustomerIds.length > 0) {
        const identityRows = await this.database
          .select({
            createdAt: customers.createdAt,
            displayName: customers.displayName,
            id: customers.id,
            status: customers.status,
          })
          .from(customers)
          .where(
            and(
              inArray(customers.id, identityCustomerIds),
              // Contact search must respect the same scope as the name search above.
              ...scopeConditions,
              ...(input.cursor ? [gt(customers.id, input.cursor)] : []),
              ...(input.status ? [eq(customers.status, input.status)] : []),
            ),
          );
        rows = [...new Map([...rows, ...identityRows].map((row) => [row.id, row])).values()]
          .sort((left, right) => left.id.localeCompare(right.id))
          .slice(0, input.limit + 1);
      }
    }

    const hasMore = rows.length > input.limit;
    const pageRows = hasMore ? rows.slice(0, input.limit) : rows;

    if (!includeSensitive || pageRows.length === 0) {
      return {
        items: pageRows,
        nextCursor: hasMore ? (pageRows.at(-1)?.id ?? null) : null,
      };
    }

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
            pageRows.map(({ id }) => id),
          ),
          eq(customerIdentities.active, true),
        ),
      );

    return {
      items: pageRows.map((row) => ({
        ...row,
        email:
          identities.find((identity) => identity.customerId === row.id && identity.type === 'email')
            ?.value ?? null,
        phone:
          identities.find((identity) => identity.customerId === row.id && identity.type === 'phone')
            ?.value ?? null,
        whatsapp:
          identities.find(
            (identity) => identity.customerId === row.id && identity.type === 'whatsapp',
          )?.value ?? null,
      })),
      nextCursor: hasMore ? (pageRows.at(-1)?.id ?? null) : null,
    };
  }

  public async getCustomer(customerId: string, includeSensitive: boolean) {
    const [customer] = await this.database
      .select({
        createdAt: customers.createdAt,
        displayName: customers.displayName,
        firstName: customers.firstName,
        id: customers.id,
        internalNotes: customers.internalNotes,
        lastName: customers.lastName,
        status: customers.status,
        updatedAt: customers.updatedAt,
      })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!customer) throw new OperationsNotFoundError('Customer not found');

    const customerOrders = await this.database
      .select({
        createdAt: orders.createdAt,
        currency: orders.currency,
        deliveryDate: orders.deliveryDate,
        id: orders.id,
        publicNumber: orders.publicNumber,
        status: orders.status,
        totalMinor: orders.totalMinor,
      })
      .from(orders)
      .where(eq(orders.customerId, customerId))
      .orderBy(desc(orders.createdAt))
      .limit(100);

    if (!includeSensitive) {
      return {
        createdAt: customer.createdAt,
        displayName: customer.displayName,
        firstName: customer.firstName,
        id: customer.id,
        lastName: customer.lastName,
        orders: customerOrders,
        status: customer.status,
        updatedAt: customer.updatedAt,
      };
    }

    const [identities, addresses, preferences, restrictions] = await Promise.all([
      this.database
        .select({
          active: customerIdentities.active,
          createdAt: customerIdentities.createdAt,
          id: customerIdentities.id,
          primary: customerIdentities.primary,
          source: customerIdentities.source,
          type: customerIdentities.type,
          value: customerIdentities.valueDisplay,
          verified: customerIdentities.verified,
        })
        .from(customerIdentities)
        .where(eq(customerIdentities.customerId, customerId))
        .orderBy(desc(customerIdentities.primary), asc(customerIdentities.type)),
      this.database
        .select({
          accessNotes: customerAddresses.accessNotes,
          active: customerAddresses.active,
          city: customerAddresses.city,
          createdAt: customerAddresses.createdAt,
          geocodingStatus: customerAddresses.geocodingStatus,
          id: customerAddresses.id,
          label: customerAddresses.label,
          latitude: customerAddresses.latitude,
          locationUrl: customerAddresses.locationUrl,
          longitude: customerAddresses.longitude,
          operationalZone: customerAddresses.operationalZone,
          primary: customerAddresses.primary,
          propertyType: customerAddresses.propertyType,
          sector: customerAddresses.sector,
          source: customerAddresses.source,
          unit: customerAddresses.unit,
          writtenAddress: customerAddresses.writtenAddress,
        })
        .from(customerAddresses)
        .where(eq(customerAddresses.customerId, customerId))
        .orderBy(desc(customerAddresses.primary), desc(customerAddresses.createdAt)),
      this.database
        .select({
          active: customerPreferences.active,
          category: customerPreferences.category,
          createdAt: customerPreferences.createdAt,
          id: customerPreferences.id,
          source: customerPreferences.source,
          value: customerPreferences.value,
        })
        .from(customerPreferences)
        .where(eq(customerPreferences.customerId, customerId))
        .orderBy(asc(customerPreferences.category), desc(customerPreferences.createdAt)),
      this.database
        .select({
          active: customerRestrictions.active,
          createdAt: customerRestrictions.createdAt,
          id: customerRestrictions.id,
          reason: customerRestrictions.reason,
          resolvedAt: customerRestrictions.resolvedAt,
          type: customerRestrictions.type,
        })
        .from(customerRestrictions)
        .where(eq(customerRestrictions.customerId, customerId))
        .orderBy(desc(customerRestrictions.active), desc(customerRestrictions.createdAt)),
    ]);

    return {
      ...customer,
      addresses: addresses.map((address) => ({
        ...address,
        latitude: address.latitude === null ? null : Number(address.latitude),
        longitude: address.longitude === null ? null : Number(address.longitude),
      })),
      email:
        identities.find((identity) => identity.type === 'email' && identity.active)?.value ?? null,
      identities,
      orders: customerOrders,
      phone:
        identities.find((identity) => identity.type === 'phone' && identity.active)?.value ?? null,
      preferences,
      restrictions,
      whatsapp:
        identities.find((identity) => identity.type === 'whatsapp' && identity.active)?.value ??
        null,
    };
  }

  public async createCustomer(input: CustomerInput, context: OperationsContext) {
    return this.database
      .transaction((transaction) => this.createCustomerInTransaction(transaction, input, context))
      .catch(translateDatabaseConflict);
  }

  /**
   * Imports are deliberately one database transaction: either every contact is
   * persisted (with its audit trail) or the operator can correct the sheet and retry.
   */
  public async importCustomers(inputs: readonly CustomerInput[], context: OperationsContext) {
    return this.database
      .transaction(async (transaction) => {
        const created = [];
        for (const input of inputs) {
          created.push(await this.createCustomerInTransaction(transaction, input, context));
        }
        return created;
      })
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
        displayName: normalizeCustomerText(input.displayName),
        firstName: input.firstName ? normalizeCustomerText(input.firstName) : undefined,
        internalNotes: input.internalNotes,
        lastName: input.lastName ? normalizeCustomerText(input.lastName) : undefined,
      })
      .returning({
        createdAt: customers.createdAt,
        displayName: customers.displayName,
        id: customers.id,
        status: customers.status,
      });
    if (!created) throw new Error('Customer creation did not return a row');

    // A customer becomes visible in an operation through an explicit membership, created in the
    // same transaction as the customer itself.
    if (!input.operatingSiteId)
      throw new OperationsConflictError(
        'Un cliente necesita una operación: elegí una ciudad antes de darlo de alta',
      );
    await transaction
      .insert(customerOperatingSites)
      .values({ customerId: created.id, operatingSiteId: input.operatingSiteId })
      .onConflictDoNothing();

    const suppliedIdentities: CustomerIdentityInput[] = [
      input.email
        ? {
            primary: true,
            source: 'manual',
            type: 'email',
            value: input.email,
            verified: false,
          }
        : null,
      input.phone
        ? {
            primary: true,
            source: 'manual',
            type: 'phone',
            value: input.phone,
            verified: false,
          }
        : null,
      ...(input.identities ?? []),
    ].filter((value) => value !== null);

    const identityValues = [
      ...new Map(
        suppliedIdentities.map((identity) => {
          const type = identity.type.trim().toLowerCase();
          const normalized = normalizeCustomerIdentity(type, identity.value);
          return [
            `${type}\u0000${normalized}`,
            {
              active: true,
              customerId: created.id,
              primary: identity.primary,
              source: identity.source,
              type,
              valueDisplay: normalizeCustomerText(identity.value),
              valueNormalized: normalized,
              verified: identity.verified,
            },
          ] as const;
        }),
      ).values(),
    ];
    const primaryTypes = identityValues.filter(({ primary }) => primary).map(({ type }) => type);
    if (new Set(primaryTypes).size !== primaryTypes.length) {
      throw new OperationsConflictError('Only one primary identity is allowed for each type');
    }

    if (identityValues.length > 0)
      await transaction.insert(customerIdentities).values(identityValues);

    const addressValues = (input.addresses ?? []).map((address) => {
      assertCoordinatePair(address.latitude, address.longitude);
      return {
        ...address,
        customerId: created.id,
        latitude: address.latitude?.toString(),
        longitude: address.longitude?.toString(),
      };
    });
    if (addressValues.filter(({ primary }) => primary).length > 1) {
      throw new OperationsConflictError('Only one primary address is allowed');
    }
    if (addressValues.length > 0) await transaction.insert(customerAddresses).values(addressValues);

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
      whatsapp:
        suppliedIdentities.find((identity) => identity.type.toLowerCase() === 'whatsapp')?.value ??
        null,
    };
  }

  public async updateCustomer(
    customerId: string,
    input: CustomerUpdateInput,
    includeSensitive: boolean,
    context: OperationsContext,
  ) {
    await this.database.transaction(async (transaction) => {
      const [before] = await transaction
        .select({
          displayName: customers.displayName,
          firstName: customers.firstName,
          id: customers.id,
          lastName: customers.lastName,
          status: customers.status,
        })
        .from(customers)
        .where(eq(customers.id, customerId))
        .limit(1);
      if (!before) throw new OperationsNotFoundError('Customer not found');

      const changes = {
        ...(input.displayName !== undefined
          ? { displayName: normalizeCustomerText(input.displayName) }
          : {}),
        ...(input.firstName !== undefined
          ? { firstName: input.firstName ? normalizeCustomerText(input.firstName) : null }
          : {}),
        ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}),
        ...(input.lastName !== undefined
          ? { lastName: input.lastName ? normalizeCustomerText(input.lastName) : null }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        updatedAt: new Date(),
      };
      await transaction.update(customers).set(changes).where(eq(customers.id, customerId));
      await this.auditCustomerMutation(transaction, customerId, 'customer.updated', context, {
        after: { changedFields: Object.keys(input), status: input.status ?? before.status },
        before: { status: before.status },
      });
    });
    return this.getCustomer(customerId, includeSensitive);
  }

  public async addCustomerIdentity(
    customerId: string,
    input: CustomerIdentityInput,
    context: OperationsContext,
  ) {
    const identity = await this.database
      .transaction(async (transaction) => {
        await this.requireCustomer(transaction, customerId);
        const type = input.type.trim().toLowerCase();
        if (input.primary) {
          await transaction
            .update(customerIdentities)
            .set({ primary: false, updatedAt: new Date() })
            .where(
              and(
                eq(customerIdentities.customerId, customerId),
                eq(customerIdentities.type, type),
                eq(customerIdentities.active, true),
              ),
            );
        }
        const [created] = await transaction
          .insert(customerIdentities)
          .values({
            customerId,
            primary: input.primary,
            source: input.source,
            type,
            valueDisplay: normalizeCustomerText(input.value),
            valueNormalized: normalizeCustomerIdentity(type, input.value),
            verified: input.verified,
          })
          .returning();
        if (!created) throw new Error('Identity creation did not return a row');
        await this.auditCustomerMutation(
          transaction,
          customerId,
          'customer.identity_added',
          context,
          {
            metadata: { identityId: created.id, type },
          },
        );
        return created;
      })
      .catch(translateDatabaseConflict);
    return { ...identity, value: identity.valueDisplay };
  }

  public async updateCustomerIdentity(
    customerId: string,
    identityId: string,
    input: CustomerIdentityUpdateInput,
    context: OperationsContext,
  ) {
    return this.database
      .transaction(async (transaction) => {
        const [current] = await transaction
          .select()
          .from(customerIdentities)
          .where(
            and(
              eq(customerIdentities.id, identityId),
              eq(customerIdentities.customerId, customerId),
            ),
          )
          .limit(1);
        if (!current) throw new OperationsNotFoundError('Customer identity not found');
        const nextActive = input.active ?? current.active;
        const nextPrimary = nextActive && (input.primary ?? current.primary);
        if (nextPrimary) {
          await transaction
            .update(customerIdentities)
            .set({ primary: false, updatedAt: new Date() })
            .where(
              and(
                eq(customerIdentities.customerId, customerId),
                eq(customerIdentities.type, current.type),
                eq(customerIdentities.active, true),
              ),
            );
        }
        const [updated] = await transaction
          .update(customerIdentities)
          .set({
            active: nextActive,
            primary: nextPrimary,
            ...(input.value
              ? {
                  valueDisplay: normalizeCustomerText(input.value),
                  valueNormalized: normalizeCustomerIdentity(current.type, input.value),
                }
              : {}),
            ...(input.verified !== undefined ? { verified: input.verified } : {}),
            updatedAt: new Date(),
          })
          .where(eq(customerIdentities.id, identityId))
          .returning();
        if (!updated) throw new Error('Identity update did not return a row');
        await this.auditCustomerMutation(
          transaction,
          customerId,
          'customer.identity_updated',
          context,
          {
            metadata: { identityId, type: current.type },
          },
        );
        return { ...updated, value: updated.valueDisplay };
      })
      .catch(translateDatabaseConflict);
  }

  public async addCustomerAddress(
    customerId: string,
    input: CustomerAddressInput,
    context: OperationsContext,
  ) {
    assertCoordinatePair(input.latitude, input.longitude);
    return this.database
      .transaction(async (transaction) => {
        await this.requireCustomer(transaction, customerId);
        if (input.primary) await this.clearPrimaryAddress(transaction, customerId);
        const [created] = await transaction
          .insert(customerAddresses)
          .values({
            ...input,
            customerId,
            latitude: input.latitude?.toString(),
            longitude: input.longitude?.toString(),
          })
          .returning();
        if (!created) throw new Error('Address creation did not return a row');
        await this.auditCustomerMutation(
          transaction,
          customerId,
          'customer.address_added',
          context,
          {
            metadata: { addressId: created.id },
          },
        );
        return {
          ...created,
          latitude: created.latitude === null ? null : Number(created.latitude),
          longitude: created.longitude === null ? null : Number(created.longitude),
        };
      })
      .catch(translateDatabaseConflict);
  }

  public async updateCustomerAddress(
    customerId: string,
    addressId: string,
    input: CustomerAddressUpdateInput,
    context: OperationsContext,
  ) {
    return this.database
      .transaction(async (transaction) => {
        const [current] = await transaction
          .select()
          .from(customerAddresses)
          .where(
            and(eq(customerAddresses.id, addressId), eq(customerAddresses.customerId, customerId)),
          )
          .limit(1);
        if (!current) throw new OperationsNotFoundError('Customer address not found');
        const { latitude: inputLatitude, longitude: inputLongitude, ...addressChanges } = input;
        const latitude =
          inputLatitude === null
            ? undefined
            : (inputLatitude ?? (current.latitude === null ? undefined : Number(current.latitude)));
        const longitude =
          inputLongitude === null
            ? undefined
            : (inputLongitude ??
              (current.longitude === null ? undefined : Number(current.longitude)));
        assertCoordinatePair(latitude, longitude);
        const nextActive = input.active ?? current.active;
        const nextPrimary = nextActive && (input.primary ?? current.primary);
        if (nextPrimary) await this.clearPrimaryAddress(transaction, customerId);
        const [updated] = await transaction
          .update(customerAddresses)
          .set({
            ...addressChanges,
            active: nextActive,
            primary: nextPrimary,
            ...(inputLatitude !== undefined
              ? { latitude: inputLatitude === null ? null : inputLatitude.toString() }
              : {}),
            ...(inputLongitude !== undefined
              ? { longitude: inputLongitude === null ? null : inputLongitude.toString() }
              : {}),
            updatedAt: new Date(),
          })
          .where(eq(customerAddresses.id, addressId))
          .returning();
        if (!updated) throw new Error('Address update did not return a row');
        await this.auditCustomerMutation(
          transaction,
          customerId,
          'customer.address_updated',
          context,
          {
            metadata: { addressId },
          },
        );
        return {
          ...updated,
          latitude: updated.latitude === null ? null : Number(updated.latitude),
          longitude: updated.longitude === null ? null : Number(updated.longitude),
        };
      })
      .catch(translateDatabaseConflict);
  }

  public async requestAddressGeocoding(
    customerId: string,
    addressId: string,
    input: { idempotencyKey: string },
    context: OperationsContext,
  ) {
    const initialized = await this.database.transaction(async (transaction) => {
      const [address] = await transaction
        .select()
        .from(customerAddresses)
        .where(
          and(
            eq(customerAddresses.id, addressId),
            eq(customerAddresses.customerId, customerId),
            eq(customerAddresses.active, true),
          ),
        )
        .limit(1);
      if (!address) throw new OperationsNotFoundError('Customer address not found');

      const [created] = await transaction
        .insert(geocodingRequests)
        .values({
          addressId,
          idempotencyKey: input.idempotencyKey,
          locationUrl: address.locationUrl,
          providerKey: this.geocodingProvider.key,
          queryText: address.writtenAddress,
          requestedByUserId: context.actorUserId,
        })
        .onConflictDoNothing({ target: geocodingRequests.idempotencyKey })
        .returning();

      if (!created) {
        const [existing] = await transaction
          .select({ addressId: geocodingRequests.addressId, id: geocodingRequests.id })
          .from(geocodingRequests)
          .where(eq(geocodingRequests.idempotencyKey, input.idempotencyKey))
          .limit(1);
        if (!existing || existing.addressId !== addressId) {
          throw new OperationsConflictError(
            'La clave de idempotencia ya fue utilizada para otra solicitud.',
          );
        }
        return { address, created: false as const, requestId: existing.id };
      }

      await transaction
        .update(customerAddresses)
        .set({ geocodingStatus: 'GEOCODING', updatedAt: new Date() })
        .where(eq(customerAddresses.id, addressId));
      await this.auditCustomerMutation(
        transaction,
        customerId,
        'customer.address_geocoding_requested',
        context,
        { metadata: { addressId, geocodingRequestId: created.id } },
      );
      await appendDomainEvent(transaction, {
        aggregateId: customerId,
        aggregateType: 'customer',
        correlationId: context.correlationId,
        name: 'CUSTOMER_ADDRESS_GEOCODING_REQUESTED',
        payload: { addressId, customerId, geocodingRequestId: created.id },
      });
      return { address, created: true as const, requestId: created.id };
    });

    if (!initialized.created) {
      return this.loadAddressGeocodingRequest(customerId, addressId, initialized.requestId);
    }

    let candidates: ReturnType<typeof validateGeocodingCandidates>;
    try {
      candidates = validateGeocodingCandidates(
        await this.geocodingProvider.geocode({
          idempotencyKey: input.idempotencyKey,
          ...(initialized.address.locationUrl
            ? { locationUrl: initialized.address.locationUrl }
            : {}),
          requestId: initialized.requestId,
          writtenAddress: initialized.address.writtenAddress,
        }),
      );
    } catch (error) {
      const errorCode =
        error instanceof GeocodingProviderError ? error.code : 'PROVIDER_UNAVAILABLE';
      const errorMessage =
        error instanceof GeocodingProviderError
          ? error.message.slice(0, 500)
          : 'The geocoding provider is unavailable';
      await this.database.transaction(async (transaction) => {
        await transaction
          .update(geocodingRequests)
          .set({ errorCode, errorMessage, status: 'FAILED', updatedAt: new Date() })
          .where(eq(geocodingRequests.id, initialized.requestId));
        await transaction
          .update(customerAddresses)
          .set({ geocodingStatus: 'NEEDS_LOCATION', updatedAt: new Date() })
          .where(eq(customerAddresses.id, addressId));
        await this.auditCustomerMutation(
          transaction,
          customerId,
          'customer.address_geocoding_failed',
          context,
          {
            metadata: {
              addressId,
              errorCode,
              geocodingRequestId: initialized.requestId,
              providerKey: this.geocodingProvider.key,
            },
          },
        );
      });
      return this.loadAddressGeocodingRequest(customerId, addressId, initialized.requestId);
    }

    const status = candidates.length > 0 ? 'CANDIDATES' : 'NO_MATCH';
    await this.database.transaction(async (transaction) => {
      if (candidates.length > 0) {
        await transaction.insert(geocodingCandidates).values(
          candidates.map((candidate) => ({
            city: candidate.city,
            confidence: candidate.confidence.toString(),
            formattedAddress: candidate.formattedAddress,
            latitude: candidate.latitude.toString(),
            locationUrl: candidate.locationUrl,
            longitude: candidate.longitude.toString(),
            providerCandidateId: candidate.providerCandidateId,
            requestId: initialized.requestId,
            sector: candidate.sector,
          })),
        );
      }
      await transaction
        .update(geocodingRequests)
        .set({ errorCode: null, errorMessage: null, status, updatedAt: new Date() })
        .where(eq(geocodingRequests.id, initialized.requestId));
      await transaction
        .update(customerAddresses)
        .set({
          geocodingStatus: candidates.length > 0 ? 'CANDIDATES' : 'NEEDS_LOCATION',
          updatedAt: new Date(),
        })
        .where(eq(customerAddresses.id, addressId));
      await this.auditCustomerMutation(
        transaction,
        customerId,
        candidates.length > 0
          ? 'customer.address_geocoding_candidates_created'
          : 'customer.address_geocoding_no_match',
        context,
        {
          metadata: {
            addressId,
            candidateCount: candidates.length,
            geocodingRequestId: initialized.requestId,
            providerKey: this.geocodingProvider.key,
          },
        },
      );
    });

    return this.loadAddressGeocodingRequest(customerId, addressId, initialized.requestId);
  }

  public async getAddressGeocodingRequest(
    customerId: string,
    addressId: string,
    requestId: string,
  ) {
    return this.loadAddressGeocodingRequest(customerId, addressId, requestId);
  }

  public async confirmAddressGeocoding(
    customerId: string,
    addressId: string,
    requestId: string,
    input: AddressGeocodingConfirmInput,
    context: OperationsContext,
  ) {
    return this.database.transaction(async (transaction) => {
      const [request] = await transaction
        .select({ id: geocodingRequests.id, status: geocodingRequests.status })
        .from(geocodingRequests)
        .innerJoin(customerAddresses, eq(customerAddresses.id, geocodingRequests.addressId))
        .where(
          and(
            eq(geocodingRequests.id, requestId),
            eq(geocodingRequests.addressId, addressId),
            eq(customerAddresses.customerId, customerId),
          ),
        )
        .limit(1);
      if (!request) throw new OperationsNotFoundError('Geocoding request not found');
      if (!['CANDIDATES', 'NO_MATCH', 'FAILED'].includes(request.status)) {
        throw new OperationsConflictError('La solicitud de geocodificación no puede confirmarse.');
      }

      const [address] = await transaction
        .select()
        .from(customerAddresses)
        .where(and(eq(customerAddresses.id, addressId), eq(customerAddresses.active, true)))
        .limit(1);
      if (!address) throw new OperationsNotFoundError('Customer address not found');

      const [candidate] = input.candidateId
        ? await transaction
            .select()
            .from(geocodingCandidates)
            .where(
              and(
                eq(geocodingCandidates.id, input.candidateId),
                eq(geocodingCandidates.requestId, requestId),
              ),
            )
            .limit(1)
        : [undefined];
      if (input.candidateId && !candidate) {
        throw new OperationsNotFoundError('Geocoding candidate not found');
      }

      const latitude = input.latitude ?? (candidate ? Number(candidate.latitude) : undefined);
      const longitude = input.longitude ?? (candidate ? Number(candidate.longitude) : undefined);
      assertCoordinatePair(latitude, longitude);
      if (latitude === undefined || longitude === undefined) {
        throw new OperationsConflictError('La confirmación requiere coordenadas válidas.');
      }

      const [updated] = await transaction
        .update(customerAddresses)
        .set({
          city: input.city !== undefined ? input.city : (candidate?.city ?? address.city),
          geocodingStatus: 'CONFIRMED',
          latitude: latitude.toString(),
          locationUrl:
            input.locationUrl !== undefined
              ? input.locationUrl
              : (candidate?.locationUrl ?? address.locationUrl),
          longitude: longitude.toString(),
          operationalZone:
            input.operationalZone !== undefined ? input.operationalZone : address.operationalZone,
          sector: input.sector !== undefined ? input.sector : (candidate?.sector ?? address.sector),
          updatedAt: new Date(),
        })
        .where(eq(customerAddresses.id, addressId))
        .returning();
      if (!updated) throw new Error('Address geocoding confirmation did not return a row');

      await transaction
        .update(geocodingRequests)
        .set({
          errorCode: null,
          errorMessage: null,
          selectedCandidateId: candidate?.id ?? null,
          status: 'CONFIRMED',
          updatedAt: new Date(),
        })
        .where(eq(geocodingRequests.id, requestId));
      await transaction
        .update(geocodingRequests)
        .set({ status: 'SUPERSEDED', updatedAt: new Date() })
        .where(
          and(
            eq(geocodingRequests.addressId, addressId),
            ne(geocodingRequests.id, requestId),
            inArray(geocodingRequests.status, ['PENDING', 'CANDIDATES', 'NO_MATCH', 'FAILED']),
          ),
        );
      await this.auditCustomerMutation(
        transaction,
        customerId,
        'customer.address_geocoding_confirmed',
        context,
        {
          after: { geocodingStatus: 'CONFIRMED' },
          before: { geocodingStatus: address.geocodingStatus },
          metadata: {
            addressId,
            correctedCoordinates: input.latitude !== undefined,
            geocodingRequestId: requestId,
            selectedCandidateId: candidate?.id ?? null,
          },
        },
      );
      await appendDomainEvent(transaction, {
        aggregateId: customerId,
        aggregateType: 'customer',
        correlationId: context.correlationId,
        name: 'CUSTOMER_ADDRESS_GEOCODED',
        payload: { addressId, customerId, geocodingRequestId: requestId },
      });
      return {
        ...updated,
        latitude: Number(updated.latitude),
        longitude: Number(updated.longitude),
      };
    });
  }

  public async rejectAddressGeocoding(
    customerId: string,
    addressId: string,
    requestId: string,
    reason: string,
    context: OperationsContext,
  ) {
    await this.database.transaction(async (transaction) => {
      const [request] = await transaction
        .select({ id: geocodingRequests.id, status: geocodingRequests.status })
        .from(geocodingRequests)
        .innerJoin(customerAddresses, eq(customerAddresses.id, geocodingRequests.addressId))
        .where(
          and(
            eq(geocodingRequests.id, requestId),
            eq(geocodingRequests.addressId, addressId),
            eq(customerAddresses.customerId, customerId),
          ),
        )
        .limit(1);
      if (!request) throw new OperationsNotFoundError('Geocoding request not found');
      if (['CONFIRMED', 'REJECTED', 'SUPERSEDED'].includes(request.status)) {
        throw new OperationsConflictError('La solicitud de geocodificación ya fue resuelta.');
      }
      await transaction
        .update(geocodingRequests)
        .set({ status: 'REJECTED', updatedAt: new Date() })
        .where(eq(geocodingRequests.id, requestId));
      await transaction
        .update(customerAddresses)
        .set({ geocodingStatus: 'NEEDS_LOCATION', updatedAt: new Date() })
        .where(eq(customerAddresses.id, addressId));
      await this.auditCustomerMutation(
        transaction,
        customerId,
        'customer.address_geocoding_rejected',
        context,
        { metadata: { addressId, geocodingRequestId: requestId, reason } },
      );
    });
    return this.loadAddressGeocodingRequest(customerId, addressId, requestId);
  }

  public async addCustomerPreference(
    customerId: string,
    input: { category: string; source: string; value: string },
    context: OperationsContext,
  ) {
    return this.database
      .transaction(async (transaction) => {
        await this.requireCustomer(transaction, customerId);
        const [created] = await transaction
          .insert(customerPreferences)
          .values({ customerId, ...input })
          .returning();
        if (!created) throw new Error('Preference creation did not return a row');
        await this.auditCustomerMutation(
          transaction,
          customerId,
          'customer.preference_added',
          context,
          {
            metadata: { category: input.category, preferenceId: created.id },
          },
        );
        return created;
      })
      .catch(translateDatabaseConflict);
  }

  public async updateCustomerPreference(
    customerId: string,
    preferenceId: string,
    input: {
      active?: boolean | undefined;
      category?: string | undefined;
      value?: string | undefined;
    },
    context: OperationsContext,
  ) {
    return this.database
      .transaction(async (transaction) => {
        const [updated] = await transaction
          .update(customerPreferences)
          .set({ ...input, updatedAt: new Date() })
          .where(
            and(
              eq(customerPreferences.id, preferenceId),
              eq(customerPreferences.customerId, customerId),
            ),
          )
          .returning();
        if (!updated) throw new OperationsNotFoundError('Customer preference not found');
        await this.auditCustomerMutation(
          transaction,
          customerId,
          'customer.preference_updated',
          context,
          { metadata: { preferenceId } },
        );
        return updated;
      })
      .catch(translateDatabaseConflict);
  }

  public async addCustomerRestriction(
    customerId: string,
    input: { reason: string; type: string },
    context: OperationsContext,
  ) {
    return this.database.transaction(async (transaction) => {
      await this.requireCustomer(transaction, customerId);
      const [created] = await transaction
        .insert(customerRestrictions)
        .values({
          createdByUserId: context.actorUserId,
          customerId,
          reason: input.reason,
          type: input.type,
        })
        .returning();
      if (!created) throw new Error('Restriction creation did not return a row');
      await this.auditCustomerMutation(
        transaction,
        customerId,
        'customer.restriction_added',
        context,
        {
          metadata: { restrictionId: created.id, type: input.type },
        },
      );
      return created;
    });
  }

  public async updateCustomerRestriction(
    customerId: string,
    restrictionId: string,
    input: { active: boolean; reason?: string | undefined },
    context: OperationsContext,
  ) {
    return this.database.transaction(async (transaction) => {
      const [updated] = await transaction
        .update(customerRestrictions)
        .set({
          active: input.active,
          ...(input.reason ? { reason: input.reason } : {}),
          resolvedAt: input.active ? null : new Date(),
          resolvedByUserId: input.active ? null : context.actorUserId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(customerRestrictions.id, restrictionId),
            eq(customerRestrictions.customerId, customerId),
          ),
        )
        .returning();
      if (!updated) throw new OperationsNotFoundError('Customer restriction not found');
      await this.auditCustomerMutation(
        transaction,
        customerId,
        'customer.restriction_updated',
        context,
        { metadata: { active: String(input.active), restrictionId } },
      );
      return updated;
    });
  }

  public async listMessageTemplates() {
    return this.database.select().from(messageTemplates).orderBy(asc(messageTemplates.displayName));
  }

  public async upsertMessageTemplate(input: MessageTemplateInput, context: OperationsContext) {
    assertTemplateVariables(input.body, input.variables);
    return this.database.transaction(async (transaction) => {
      const [template] = await transaction
        .insert(messageTemplates)
        .values({
          ...input,
          createdByUserId: context.actorUserId,
          updatedByUserId: context.actorUserId,
          variables: [...input.variables],
        })
        .onConflictDoUpdate({
          set: {
            actionKey: input.actionKey,
            active: input.active,
            body: input.body,
            channel: input.channel,
            displayName: input.displayName,
            scopeReferenceId: input.scopeReferenceId,
            scopeType: input.scopeType,
            updatedAt: new Date(),
            updatedByUserId: context.actorUserId,
            variables: [...input.variables],
          },
          target: messageTemplates.key,
        })
        .returning();
      if (!template) throw new Error('Message template upsert did not return a row');
      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'message_template.upserted',
        actor: auditActor(context),
        after: { actionKey: template.actionKey, active: template.active, key: template.key },
        correlationId: context.correlationId,
        entityId: template.id,
        entityType: 'message_template',
        requestId: context.requestId,
        source: context.source,
      });
      await appendDomainEvent(transaction, {
        aggregateId: template.id,
        aggregateType: 'message_template',
        correlationId: context.correlationId,
        name: 'MESSAGE_TEMPLATE_UPSERTED',
        payload: { templateId: template.id },
      });
      return template;
    });
  }

  private async loadAddressGeocodingRequest(
    customerId: string,
    addressId: string,
    requestId: string,
  ) {
    const [request] = await this.database
      .select({
        createdAt: geocodingRequests.createdAt,
        errorCode: geocodingRequests.errorCode,
        id: geocodingRequests.id,
        providerKey: geocodingRequests.providerKey,
        selectedCandidateId: geocodingRequests.selectedCandidateId,
        status: geocodingRequests.status,
        updatedAt: geocodingRequests.updatedAt,
      })
      .from(geocodingRequests)
      .innerJoin(customerAddresses, eq(customerAddresses.id, geocodingRequests.addressId))
      .where(
        and(
          eq(geocodingRequests.id, requestId),
          eq(geocodingRequests.addressId, addressId),
          eq(customerAddresses.customerId, customerId),
        ),
      )
      .limit(1);
    if (!request) throw new OperationsNotFoundError('Geocoding request not found');
    const candidates = await this.database
      .select({
        city: geocodingCandidates.city,
        confidence: geocodingCandidates.confidence,
        formattedAddress: geocodingCandidates.formattedAddress,
        id: geocodingCandidates.id,
        latitude: geocodingCandidates.latitude,
        locationUrl: geocodingCandidates.locationUrl,
        longitude: geocodingCandidates.longitude,
        sector: geocodingCandidates.sector,
      })
      .from(geocodingCandidates)
      .where(eq(geocodingCandidates.requestId, requestId))
      .orderBy(desc(geocodingCandidates.confidence), asc(geocodingCandidates.id));
    return {
      ...request,
      candidates: candidates.map((candidate) => ({
        ...candidate,
        confidence: Number(candidate.confidence),
        latitude: Number(candidate.latitude),
        longitude: Number(candidate.longitude),
      })),
    };
  }

  private async requireCustomer(transaction: DatabaseTransaction, customerId: string) {
    const [customer] = await transaction
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!customer) throw new OperationsNotFoundError('Customer not found');
    return customer;
  }

  private async clearPrimaryAddress(transaction: DatabaseTransaction, customerId: string) {
    await transaction
      .update(customerAddresses)
      .set({ primary: false, updatedAt: new Date() })
      .where(
        and(eq(customerAddresses.customerId, customerId), eq(customerAddresses.primary, true)),
      );
  }

  private async auditCustomerMutation(
    transaction: DatabaseTransaction,
    customerId: string,
    action: string,
    context: OperationsContext,
    details: {
      after?: JsonValue;
      before?: JsonValue;
      metadata?: Record<string, JsonValue>;
    } = {},
  ) {
    const audit = new AuditService(new PostgresAuditSink(transaction));
    await audit.record({
      action,
      actor: auditActor(context),
      ...details,
      correlationId: context.correlationId,
      entityId: customerId,
      entityType: 'customer',
      requestId: context.requestId,
      source: context.source,
    });
    await appendDomainEvent(transaction, {
      aggregateId: customerId,
      aggregateType: 'customer',
      correlationId: context.correlationId,
      name: 'CUSTOMER_UPDATED',
      payload: { customerId },
    });
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
        operatingSiteId: weeklyMenus.operatingSiteId,
        operatingSiteName: operatingSites.displayName,
        partialKitchenCutoffAt: salesCycles.partialKitchenCutoffAt,
        publishedAt: weeklyMenus.publishedAt,
        sourceMenuId: weeklyMenus.sourceMenuId,
        revision: weeklyMenus.revision,
        status: weeklyMenus.status,
      })
      .from(weeklyMenus)
      .innerJoin(salesCycles, eq(salesCycles.id, weeklyMenus.salesCycleId))
      .leftJoin(operatingSites, eq(operatingSites.id, weeklyMenus.operatingSiteId))
      .where(onlyPublished ? eq(weeklyMenus.status, 'PUBLISHED') : undefined)
      .orderBy(desc(salesCycles.openAt));

    if (menuRows.length === 0) return [];
    const offeringRows = await this.database
      .select({
        composable: sql<boolean>`${productFamilies.kind} = 'COMPOSABLE'`,
        familyName: productFamilies.displayName,
        id: weeklyMenuOfferings.id,
        mealsPerUnit: productVariants.mealsPerUnit,
        menuId: weeklyMenuOfferings.weeklyMenuId,
        overrideCurrency: weeklyMenuOfferings.currency,
        overridePriceMinor: weeklyMenuOfferings.unitPriceMinor,
        sizeCurrency: weeklyMenuPrices.currency,
        sizeName: productSizes.displayName,
        sizePriceMinor: weeklyMenuPrices.unitPriceMinor,
        variantName: productVariants.displayName,
      })
      .from(weeklyMenuOfferings)
      .innerJoin(productVariants, eq(productVariants.id, weeklyMenuOfferings.productVariantId))
      .innerJoin(productFamilies, eq(productFamilies.id, productVariants.productFamilyId))
      .innerJoin(productSizes, eq(productSizes.id, productVariants.productSizeId))
      .leftJoin(
        weeklyMenuPrices,
        and(
          eq(weeklyMenuPrices.weeklyMenuId, weeklyMenuOfferings.weeklyMenuId),
          eq(weeklyMenuPrices.productSizeId, productVariants.productSizeId),
        ),
      )
      .where(
        and(
          inArray(
            weeklyMenuOfferings.weeklyMenuId,
            menuRows.map(({ id }) => id),
          ),
          eq(weeklyMenuOfferings.active, true),
        ),
      )
      .orderBy(asc(productFamilies.displayName), asc(productSizes.sortOrder));
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
        .map(
          ({
            overrideCurrency,
            overridePriceMinor,
            sizeCurrency,
            sizePriceMinor,
            ...offering
          }) => ({
            ...offering,
            currency: (overridePriceMinor === null ? sizeCurrency : overrideCurrency) ?? 'ARS',
            dishes: itemRows
              .filter((item) => item.offeringId === offering.id)
              .map((item) => item.dishName),
            // The published price an operator sees is the resolved one, not the raw override.
            priceOverridden: overridePriceMinor !== null,
            unitPriceMinor: overridePriceMinor ?? sizePriceMinor ?? 0,
          }),
        ),
      operatingSiteId: menu.operatingSiteId,
      operatingSiteName: menu.operatingSiteName,
      publishedAt: menu.publishedAt,
      revision: menu.revision,
      sourceMenuId: menu.sourceMenuId,
      status: menu.status,
    }));
  }

  /**
   * The published menu an operation sells this week. Selection, not composition: an operation with
   * its own published revision uses that concrete row, and one without falls back to the global
   * master. Nothing merges global and regional field by field (ADR-028).
   */
  public async currentPublishedMenu(operatingSiteId?: string | null) {
    const menus = await this.listMenus(true);
    const now = Date.now();
    const open = menus.filter(
      (menu) => menu.cycle.openAt.getTime() <= now && menu.cycle.closeAt.getTime() >= now,
    );

    if (operatingSiteId) {
      const regional = open.find((menu) => menu.operatingSiteId === operatingSiteId);
      if (regional) return regional;
    }
    return open.find((menu) => menu.operatingSiteId === null) ?? null;
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

        // Sizes and their prices are established first: an offering only names the size it belongs to.
        const sizeIdsByName = new Map<string, string>();
        for (const [index, price] of input.prices.entries()) {
          const sizeCode = catalogCode(price.sizeName);
          const [size] = await transaction
            .insert(productSizes)
            .values({
              code: sizeCode,
              displayName: price.sizeName,
              mealsPerUnit: price.mealsPerUnit,
              sortOrder: index,
            })
            .onConflictDoUpdate({
              set: {
                displayName: price.sizeName,
                mealsPerUnit: price.mealsPerUnit,
                updatedAt: new Date(),
              },
              target: productSizes.code,
            })
            .returning({ id: productSizes.id });
          if (!size) throw new Error('Product size upsert did not return a row');
          sizeIdsByName.set(price.sizeName, size.id);

          await transaction.insert(weeklyMenuPrices).values({
            currency: price.currency.toUpperCase(),
            productSizeId: size.id,
            unitPriceMinor: price.unitPriceMinor,
            weeklyMenuId: menu.id,
          });
        }

        for (const offering of input.offerings) {
          const sizeId = sizeIdsByName.get(offering.sizeName);
          if (!sizeId)
            throw new OperationsConflictError(
              `El tamaño "${offering.sizeName}" no tiene precio definido para esta semana`,
            );

          const familyCode = catalogCode(offering.familyName);
          const [family] = await transaction
            .insert(productFamilies)
            .values({
              code: familyCode,
              displayName: offering.familyName,
              kind: offering.composable ? 'COMPOSABLE' : 'FIXED',
            })
            .onConflictDoUpdate({
              set: {
                displayName: offering.familyName,
                kind: offering.composable ? 'COMPOSABLE' : 'FIXED',
                updatedAt: new Date(),
              },
              target: productFamilies.code,
            })
            .returning({ id: productFamilies.id });
          if (!family) throw new Error('Product family upsert did not return a row');

          const mealsPerUnit =
            input.prices.find((price) => price.sizeName === offering.sizeName)?.mealsPerUnit ?? 5;
          const variantCode = catalogCode(offering.sizeName);
          const [variant] = await transaction
            .insert(productVariants)
            .values({
              code: variantCode,
              displayName: offering.sizeName,
              mealsPerUnit,
              productFamilyId: family.id,
              productSizeId: sizeId,
            })
            .onConflictDoUpdate({
              set: {
                displayName: offering.sizeName,
                mealsPerUnit,
                productSizeId: sizeId,
                updatedAt: new Date(),
              },
              target: [productVariants.productFamilyId, productVariants.code],
            })
            .returning({ id: productVariants.id });
          if (!variant) throw new Error('Product variant upsert did not return a row');

          const [createdOffering] = await transaction
            .insert(weeklyMenuOfferings)
            .values({
              productVariantId: variant.id,
              weeklyMenuId: menu.id,
              ...(offering.overridePriceMinor === undefined
                ? {}
                : { unitPriceMinor: offering.overridePriceMinor }),
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

  /**
   * Materialises a regional revision of a master menu for each selected operation. A distribution
   * never composes global plus regional at order time: it writes a concrete revision that an order
   * can reference as a stable snapshot (ADR-028).
   *
   * `CREATE_MISSING` only creates where no regional revision exists. `UPDATE_UNCUSTOMIZED` also
   * refreshes the rows nobody edited locally. `REPLACE` overwrites customised rows too, which is
   * why it needs its own permission and an explicit confirmation from the caller.
   */
  public async distributeMenu(
    menuId: string,
    input: MenuDistributionInput,
    context: OperationsContext,
  ) {
    return this.database
      .transaction(async (transaction) => {
        const [master] = await transaction
          .select({
            id: weeklyMenus.id,
            operatingSiteId: weeklyMenus.operatingSiteId,
            salesCycleId: weeklyMenus.salesCycleId,
            status: weeklyMenus.status,
          })
          .from(weeklyMenus)
          .where(eq(weeklyMenus.id, menuId))
          .limit(1);
        if (!master) throw new OperationsNotFoundError('Weekly menu not found');
        if (master.operatingSiteId !== null)
          throw new OperationsConflictError(
            'Sólo un menú global puede distribuirse; este ya pertenece a una operación',
          );
        if (input.mode === 'REPLACE' && !input.confirmedReplace)
          throw new OperationsConflictError(
            'Reemplazar personalizaciones regionales requiere confirmación explícita',
          );

        const masterPrices = await transaction
          .select({
            currency: weeklyMenuPrices.currency,
            productSizeId: weeklyMenuPrices.productSizeId,
            unitPriceMinor: weeklyMenuPrices.unitPriceMinor,
          })
          .from(weeklyMenuPrices)
          .where(eq(weeklyMenuPrices.weeklyMenuId, master.id));
        const masterOfferings = await transaction
          .select({
            currency: weeklyMenuOfferings.currency,
            id: weeklyMenuOfferings.id,
            productVariantId: weeklyMenuOfferings.productVariantId,
            unitPriceMinor: weeklyMenuOfferings.unitPriceMinor,
          })
          .from(weeklyMenuOfferings)
          .where(eq(weeklyMenuOfferings.weeklyMenuId, master.id));
        const masterItems = await transaction
          .select({
            dishName: weeklyMenuItems.dishName,
            offeringId: weeklyMenuItems.offeringId,
            slot: weeklyMenuItems.slot,
          })
          .from(weeklyMenuItems)
          .where(
            inArray(
              weeklyMenuItems.offeringId,
              masterOfferings.map(({ id }) => id),
            ),
          );

        const results: MenuDistributionResult[] = [];

        for (const operatingSiteId of input.operatingSiteIds) {
          const [site] = await transaction
            .select({ id: operatingSites.id })
            .from(operatingSites)
            .where(and(eq(operatingSites.id, operatingSiteId), eq(operatingSites.active, true)))
            .limit(1);
          if (!site) throw new OperationsNotFoundError('Operating site not found');

          const [existing] = await transaction
            .select({ id: weeklyMenus.id, status: weeklyMenus.status })
            .from(weeklyMenus)
            .where(
              and(
                eq(weeklyMenus.salesCycleId, master.salesCycleId),
                eq(weeklyMenus.operatingSiteId, operatingSiteId),
              ),
            )
            .for('update')
            .limit(1);

          if (existing && input.mode === 'CREATE_MISSING') {
            results.push({
              operatingSiteId,
              outcome: 'SKIPPED_EXISTING',
              weeklyMenuId: existing.id,
            });
            continue;
          }

          // A published regional revision is what live orders reference, so it is never rewritten
          // in place: refreshing it would mutate the snapshot those orders were priced against.
          if (existing?.status === 'PUBLISHED') {
            results.push({
              operatingSiteId,
              outcome: 'SKIPPED_PUBLISHED',
              weeklyMenuId: existing.id,
            });
            continue;
          }

          const regionalId =
            existing?.id ??
            (
              await transaction
                .insert(weeklyMenus)
                .values({
                  operatingSiteId,
                  salesCycleId: master.salesCycleId,
                  sourceMenuId: master.id,
                  status: 'DRAFT',
                })
                .returning({ id: weeklyMenus.id })
            )[0]?.id;
          if (!regionalId) throw new Error('Regional menu creation did not return a row');

          const replacing = input.mode === 'REPLACE';
          const refreshed = await this.copyMenuContent(transaction, {
            items: masterItems,
            offerings: masterOfferings,
            prices: masterPrices,
            replacing,
            targetMenuId: regionalId,
          });

          results.push({
            operatingSiteId,
            outcome: existing ? (replacing ? 'REPLACED' : 'REFRESHED') : 'CREATED',
            preservedCustomizations: refreshed.preserved,
            weeklyMenuId: regionalId,
          });
        }

        const audit = new AuditService(new PostgresAuditSink(transaction));
        await audit.record({
          action: 'weekly_menu.distributed',
          actor: auditActor(context),
          after: {
            mode: input.mode,
            results: results.map((result) => ({
              operatingSiteId: result.operatingSiteId,
              outcome: result.outcome,
            })),
          },
          correlationId: context.correlationId,
          entityId: master.id,
          entityType: 'weekly_menu',
          requestId: context.requestId,
          source: context.source,
        });

        return results;
      })
      .catch(translateDatabaseConflict);
  }

  /** Copies master content onto a regional revision, leaving customised rows alone unless replacing. */
  private async copyMenuContent(
    transaction: DatabaseTransaction,
    input: {
      items: readonly { dishName: string; offeringId: string; slot: number }[];
      offerings: readonly {
        currency: string;
        id: string;
        productVariantId: string;
        unitPriceMinor: number | null;
      }[];
      prices: readonly {
        currency: string;
        productSizeId: string;
        unitPriceMinor: number;
      }[];
      replacing: boolean;
      targetMenuId: string;
    },
  ): Promise<{ preserved: number }> {
    let preserved = 0;

    const existingPrices = await transaction
      .select({
        customized: weeklyMenuPrices.customized,
        id: weeklyMenuPrices.id,
        productSizeId: weeklyMenuPrices.productSizeId,
      })
      .from(weeklyMenuPrices)
      .where(eq(weeklyMenuPrices.weeklyMenuId, input.targetMenuId));

    for (const price of input.prices) {
      const current = existingPrices.find((row) => row.productSizeId === price.productSizeId);
      if (current?.customized && !input.replacing) {
        preserved += 1;
        continue;
      }
      if (current) {
        await transaction
          .update(weeklyMenuPrices)
          .set({
            currency: price.currency,
            customized: false,
            unitPriceMinor: price.unitPriceMinor,
          })
          .where(eq(weeklyMenuPrices.id, current.id));
        continue;
      }
      await transaction.insert(weeklyMenuPrices).values({
        currency: price.currency,
        productSizeId: price.productSizeId,
        unitPriceMinor: price.unitPriceMinor,
        weeklyMenuId: input.targetMenuId,
      });
    }

    const existingOfferings = await transaction
      .select({
        customized: weeklyMenuOfferings.customized,
        id: weeklyMenuOfferings.id,
        productVariantId: weeklyMenuOfferings.productVariantId,
      })
      .from(weeklyMenuOfferings)
      .where(eq(weeklyMenuOfferings.weeklyMenuId, input.targetMenuId));

    for (const offering of input.offerings) {
      const current = existingOfferings.find(
        (row) => row.productVariantId === offering.productVariantId,
      );
      if (current?.customized && !input.replacing) {
        preserved += 1;
        continue;
      }

      const targetOfferingId =
        current?.id ??
        (
          await transaction
            .insert(weeklyMenuOfferings)
            .values({
              currency: offering.currency,
              productVariantId: offering.productVariantId,
              weeklyMenuId: input.targetMenuId,
              ...(offering.unitPriceMinor === null
                ? {}
                : { unitPriceMinor: offering.unitPriceMinor }),
            })
            .returning({ id: weeklyMenuOfferings.id })
        )[0]?.id;
      if (!targetOfferingId) throw new Error('Regional offering upsert did not return a row');

      if (current) {
        await transaction
          .update(weeklyMenuOfferings)
          .set({ customized: false, unitPriceMinor: offering.unitPriceMinor })
          .where(eq(weeklyMenuOfferings.id, current.id));
      }

      // Dishes are replaced as a unit: a partially refreshed composition is not a valid menu.
      await transaction
        .delete(weeklyMenuItems)
        .where(eq(weeklyMenuItems.offeringId, targetOfferingId));
      const dishes = input.items.filter((item) => item.offeringId === offering.id);
      if (dishes.length > 0) {
        await transaction.insert(weeklyMenuItems).values(
          dishes.map((dish) => ({
            dishName: dish.dishName,
            offeringId: targetOfferingId,
            slot: dish.slot,
          })),
        );
      }
    }

    return { preserved };
  }

  public async createOrder(input: OrderInput, context: OperationsContext) {
    return this.database
      .transaction((transaction) => this.createOrderInTransaction(transaction, input, context))
      .catch(translateDatabaseConflict);
  }

  public async updateOrder(
    orderId: string,
    input: OrderUpdateInput,
    allowCycleOverride: boolean,
    context: OperationsContext,
  ) {
    await this.database.transaction(async (transaction) => {
      const [current] = await transaction
        .select({
          closeAt: salesCycles.closeAt,
          customerId: orders.customerId,
          cycleStatus: salesCycles.status,
          deliveryAddress: orders.deliveryAddressSnapshot,
          deliveryAddressId: orders.deliveryAddressId,
          deliveryDate: orders.deliveryDate,
          deliveryLocationUrl: orders.deliveryLocationUrlSnapshot,
          menuId: orders.weeklyMenuId,
          notes: orders.notes,
          paymentExpectation: orders.paymentExpectation,
          status: orders.status,
          totalMinor: orders.totalMinor,
        })
        .from(orders)
        .innerJoin(salesCycles, eq(salesCycles.id, orders.salesCycleId))
        .where(eq(orders.id, orderId))
        .for('update')
        .limit(1);
      if (!current) throw new OperationsNotFoundError('Order not found');
      const cycleLocked = current.cycleStatus === 'CLOSED' || new Date() >= current.closeAt;
      if (cycleLocked && !allowCycleOverride) {
        throw new OperationsConflictError(
          'The sales cycle is closed; editing this order requires an authorized override',
        );
      }
      if (
        (input.items !== undefined || input.dietaryInstructions !== undefined) &&
        current.status !== 'DRAFT' &&
        current.status !== 'CONFIRMED'
      ) {
        throw new OperationsConflictError(
          'Order composition can only be edited while the order is draft or confirmed',
        );
      }

      const beforeSnapshot = await this.loadOrder(transaction, orderId);
      if (!beforeSnapshot) throw new Error('Order snapshot could not be loaded');
      const [latestRevision] = await transaction
        .select({ revision: orderRevisions.revision })
        .from(orderRevisions)
        .where(eq(orderRevisions.orderId, orderId))
        .orderBy(desc(orderRevisions.revision))
        .limit(1);
      await transaction.insert(orderRevisions).values({
        actorUserId: context.actorUserId,
        orderId,
        reason: input.reason,
        revision: (latestRevision?.revision ?? 0) + 1,
        snapshot: JSON.parse(JSON.stringify(beforeSnapshot)) as Record<string, unknown>,
      });

      const resolvedItems = input.items
        ? await this.resolveOrderItems(transaction, current.menuId, input.items)
        : null;
      const firstResolvedItem = resolvedItems?.[0];
      const resolvedTotal = resolvedItems
        ? calculateOrderTotal(resolvedItems.map(({ totalMinor }) => totalMinor))
        : undefined;
      if (resolvedItems && !firstResolvedItem) {
        throw new OperationsConflictError('An order requires at least one item');
      }

      let deliveryAddress = input.deliveryAddress ?? current.deliveryAddress;
      let deliveryLocationUrl =
        input.deliveryLocationUrl === undefined
          ? current.deliveryLocationUrl
          : input.deliveryLocationUrl;
      if (input.deliveryAddressId) {
        const [address] = await transaction
          .select({
            locationUrl: customerAddresses.locationUrl,
            writtenAddress: customerAddresses.writtenAddress,
          })
          .from(customerAddresses)
          .where(
            and(
              eq(customerAddresses.id, input.deliveryAddressId),
              eq(customerAddresses.customerId, current.customerId),
              eq(customerAddresses.active, true),
            ),
          )
          .limit(1);
        if (!address) throw new OperationsNotFoundError('Active customer address not found');
        deliveryAddress = address.writtenAddress;
        if (input.deliveryLocationUrl === undefined) deliveryLocationUrl = address.locationUrl;
      }

      const changes = {
        ...(firstResolvedItem && resolvedTotal !== undefined
          ? {
              currency: firstResolvedItem.currency,
              totalMinor: resolvedTotal,
            }
          : {}),
        deliveryAddressSnapshot: deliveryAddress,
        ...(input.deliveryAddressId !== undefined
          ? { deliveryAddressId: input.deliveryAddressId }
          : {}),
        ...(input.deliveryDate !== undefined ? { deliveryDate: input.deliveryDate } : {}),
        deliveryLocationUrlSnapshot: deliveryLocationUrl,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.paymentExpectation !== undefined
          ? { paymentExpectation: input.paymentExpectation }
          : {}),
        updatedAt: new Date(),
      };
      if (resolvedItems) {
        await transaction.delete(orderItems).where(eq(orderItems.orderId, orderId));
        await this.persistOrderItems(transaction, orderId, resolvedItems);
      }
      if (input.dietaryInstructions !== undefined) {
        await transaction
          .delete(orderDietaryInstructions)
          .where(eq(orderDietaryInstructions.orderId, orderId));
        if (input.dietaryInstructions.length > 0) {
          await transaction
            .insert(orderDietaryInstructions)
            .values(input.dietaryInstructions.map((instruction) => ({ instruction, orderId })));
        }
      }
      await transaction.update(orders).set(changes).where(eq(orders.id, orderId));

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'order.updated',
        actor: auditActor(context),
        after: {
          changedFields: Object.keys(input).filter((key) => key !== 'reason'),
          deliveryAddressId: input.deliveryAddressId ?? current.deliveryAddressId,
          totalMinor: resolvedTotal ?? current.totalMinor,
        },
        before: {
          deliveryAddressId: current.deliveryAddressId,
          deliveryDate: current.deliveryDate,
          paymentExpectation: current.paymentExpectation,
          totalMinor: current.totalMinor,
        },
        correlationId: context.correlationId,
        entityId: orderId,
        entityType: 'order',
        metadata: { cycleOverride: cycleLocked && allowCycleOverride, reason: input.reason },
        requestId: context.requestId,
        source: context.source,
      });
      await appendDomainEvent(transaction, {
        aggregateId: orderId,
        aggregateType: 'order',
        correlationId: context.correlationId,
        name: 'ORDER_UPDATED',
        payload: { orderId },
      });
    });
    return this.getOrder(orderId);
  }

  public async createPublicOrder(
    input: Omit<OrderInput, 'customerId' | 'operatingSiteId'> & {
      customer: CustomerInput;
      operatingSiteSlug: string;
    },
    context: OperationsContext,
  ) {
    return this.database
      .transaction(async (transaction) => {
        // A visitor picks the operation explicitly; it is never inferred from IP or domain (ADR-031).
        const [site] = await transaction
          .select({ id: operatingSites.id })
          .from(operatingSites)
          .where(
            and(eq(operatingSites.slug, input.operatingSiteSlug), eq(operatingSites.active, true)),
          )
          .limit(1);
        if (!site) throw new OperationsNotFoundError('La ciudad elegida no está disponible');

        const identityCandidates = [
          input.customer.email
            ? { type: 'email', value: normalizeCustomerIdentity('email', input.customer.email) }
            : null,
          input.customer.phone
            ? { type: 'phone', value: normalizeCustomerIdentity('phone', input.customer.phone) }
            : null,
          ...(input.customer.identities ?? []).map((identity) => ({
            type: identity.type.trim().toLowerCase(),
            value: normalizeCustomerIdentity(identity.type, identity.value),
          })),
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
          : await this.createCustomerInTransaction(
              transaction,
              { ...input.customer, operatingSiteId: site.id },
              context,
            );

        // A returning customer ordering in a new city gains a membership there without losing the
        // one it already had: the CRM identity stays single and global.
        if (existingCustomerId) {
          await transaction
            .insert(customerOperatingSites)
            .values({ customerId: existingCustomerId, operatingSiteId: site.id })
            .onConflictDoNothing();
        }

        return this.createOrderInTransaction(
          transaction,
          {
            ...input,
            customerId: customer.id,
            initialStatus: 'CONFIRMED',
            operatingSiteId: site.id,
          },
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

    let deliveryAddress = input.deliveryAddress;
    let deliveryLocationUrl = input.deliveryLocationUrl;
    let geographicZoneId: string | null = null;
    let operatingSiteId: string | null = null;
    if (input.deliveryAddressId) {
      const [address] = await transaction
        .select({
          geographicZoneId: customerAddresses.geographicZoneId,
          locationUrl: customerAddresses.locationUrl,
          operatingSiteId: geographicZones.operatingSiteId,
          writtenAddress: customerAddresses.writtenAddress,
        })
        .from(customerAddresses)
        .innerJoin(geographicZones, eq(geographicZones.id, customerAddresses.geographicZoneId))
        .where(
          and(
            eq(customerAddresses.id, input.deliveryAddressId),
            eq(customerAddresses.customerId, input.customerId),
            eq(customerAddresses.active, true),
          ),
        )
        .limit(1);
      if (!address) throw new OperationsNotFoundError('Active customer address not found');
      deliveryAddress = address.writtenAddress;
      deliveryLocationUrl = address.locationUrl ?? deliveryLocationUrl;
      // The operation is derived from the delivery zone; it is never chosen by the operator.
      geographicZoneId = address.geographicZoneId;
      operatingSiteId = address.operatingSiteId;
    }

    // Without a stored address the order still needs an operation, so the caller's active scope
    // supplies it. A global scope cannot create: mutations always require a concrete operation.
    operatingSiteId ??= input.operatingSiteId ?? null;
    if (!operatingSiteId)
      throw new OperationsConflictError(
        'Un pedido necesita una operación: elegí una ciudad o un domicilio con zona asignada',
      );

    const resolvedItems = await this.resolveOrderItems(transaction, input.menuId, input.items);
    const currency = resolvedItems[0]?.currency;
    if (!currency) throw new OperationsConflictError('An order requires at least one item');
    const initialStatus = input.initialStatus ?? 'DRAFT';
    const [createdOrder] = await transaction
      .insert(orders)
      .values({
        currency,
        customerId: input.customerId,
        deliveryAddressId: input.deliveryAddressId,
        deliveryAddressSnapshot: deliveryAddress,
        deliveryDate: input.deliveryDate,
        deliveryLocationUrlSnapshot: deliveryLocationUrl,
        geographicZoneId,
        notes: input.notes,
        operatingSiteId,
        paymentExpectation: input.paymentExpectation,
        publicNumber: await this.nextPublicNumber(transaction, operatingSiteId),
        salesCycleId: menu.salesCycleId,
        source: input.source,
        status: initialStatus,
        totalMinor: calculateOrderTotal(resolvedItems.map(({ totalMinor }) => totalMinor)),
        weeklyMenuId: input.menuId,
      })
      .returning({ id: orders.id });
    if (!createdOrder) throw new Error('Order creation did not return a row');

    await this.persistOrderItems(transaction, createdOrder.id, resolvedItems);
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

  private async resolveOrderItems(
    transaction: DatabaseTransaction,
    menuId: string,
    items: readonly {
      offeringId: string;
      quantityUnits: number;
      selectedDishNames?: readonly string[] | undefined;
    }[],
  ): Promise<ResolvedOrderItem[]> {
    if (items.length === 0)
      throw new OperationsConflictError('An order requires at least one item');
    const resolvedItems: ResolvedOrderItem[] = [];

    for (const item of items) {
      const [offering] = await transaction
        .select({
          familyName: productFamilies.displayName,
          id: weeklyMenuOfferings.id,
          mealsPerUnit: productVariants.mealsPerUnit,
          overrideCurrency: weeklyMenuOfferings.currency,
          // A per-variety amount is a deliberate exception; the menu's per-size list is the norm.
          overridePriceMinor: weeklyMenuOfferings.unitPriceMinor,
          productSizeId: productVariants.productSizeId,
          productVariantId: productVariants.id,
          sizeCurrency: weeklyMenuPrices.currency,
          sizePriceMinor: weeklyMenuPrices.unitPriceMinor,
          variantName: productVariants.displayName,
        })
        .from(weeklyMenuOfferings)
        .innerJoin(productVariants, eq(productVariants.id, weeklyMenuOfferings.productVariantId))
        .innerJoin(productFamilies, eq(productFamilies.id, productVariants.productFamilyId))
        .leftJoin(
          weeklyMenuPrices,
          and(
            eq(weeklyMenuPrices.weeklyMenuId, weeklyMenuOfferings.weeklyMenuId),
            eq(weeklyMenuPrices.productSizeId, productVariants.productSizeId),
          ),
        )
        .where(
          and(
            eq(weeklyMenuOfferings.id, item.offeringId),
            eq(weeklyMenuOfferings.weeklyMenuId, menuId),
            eq(weeklyMenuOfferings.active, true),
          ),
        )
        .limit(1);
      if (!offering) throw new OperationsNotFoundError('Published menu offering not found');

      const unitPriceMinor = offering.overridePriceMinor ?? offering.sizePriceMinor;
      if (unitPriceMinor === null)
        throw new OperationsConflictError(
          'The menu has no price for this size and the offering defines no override',
        );
      const currency =
        offering.overridePriceMinor === null ? offering.sizeCurrency : offering.overrideCurrency;

      const baseDishes = await transaction
        .select({ dishName: weeklyMenuItems.dishName })
        .from(weeklyMenuItems)
        .where(eq(weeklyMenuItems.offeringId, offering.id))
        .orderBy(asc(weeklyMenuItems.slot));
      // The composable universe is every dish published this week for the same size, matched by
      // size id rather than by the variant's display name.
      const sizeUniverse = await transaction
        .select({ dishName: weeklyMenuItems.dishName })
        .from(weeklyMenuItems)
        .innerJoin(weeklyMenuOfferings, eq(weeklyMenuOfferings.id, weeklyMenuItems.offeringId))
        .innerJoin(productVariants, eq(productVariants.id, weeklyMenuOfferings.productVariantId))
        .where(
          and(
            eq(weeklyMenuOfferings.weeklyMenuId, menuId),
            eq(productVariants.productSizeId, offering.productSizeId),
          ),
        );
      const composition = resolveOrderComposition({
        allowedDishes: new Set(sizeUniverse.map(({ dishName }) => dishName)),
        baseDishes: baseDishes.map(({ dishName }) => dishName),
        composableFamilyName: await this.composableFamilyName(transaction),
        familyName: offering.familyName,
        mealsPerUnit: offering.mealsPerUnit,
        ...(item.selectedDishNames ? { selectedDishes: item.selectedDishNames } : {}),
      });

      resolvedItems.push({
        currency: currency ?? 'ARS',
        dishSelections: composition.dishSelections,
        offeringId: offering.id,
        productNameSnapshot: composition.productNameSnapshot,
        productVariantId: offering.productVariantId,
        quantityUnits: item.quantityUnits,
        totalMinor: calculateLineTotal(item.quantityUnits, unitPriceMinor),
        unitPriceMinor,
        variantSnapshot: offering.variantName,
      });
    }

    const currency = resolvedItems[0]?.currency;
    if (!currency || resolvedItems.some((item) => item.currency !== currency)) {
      throw new OperationsConflictError('All order items must use the same currency');
    }
    return resolvedItems;
  }

  private async persistOrderItems(
    transaction: DatabaseTransaction,
    orderId: string,
    items: readonly ResolvedOrderItem[],
  ) {
    for (const item of items) {
      const [createdItem] = await transaction
        .insert(orderItems)
        .values({
          offeringId: item.offeringId,
          orderId,
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
  }

  public async listOrders(input: OrderListInput) {
    const cursor = input.cursor
      ? await this.database
          .select({ createdAt: orders.createdAt, id: orders.id })
          .from(orders)
          .where(eq(orders.id, input.cursor))
          .limit(1)
          .then(([row]) => row)
      : null;
    if (input.cursor && !cursor) throw new OperationsNotFoundError('Order cursor not found');

    const conditions = [
      // A concrete operation restricts the page; the global view leaves it unfiltered.
      ...(input.operatingSiteId ? [eq(orders.operatingSiteId, input.operatingSiteId)] : []),
      ...(input.status ? [eq(orders.status, input.status)] : []),
      ...(input.customerId ? [eq(orders.customerId, input.customerId)] : []),
      ...(input.cycleId ? [eq(orders.salesCycleId, input.cycleId)] : []),
      ...(input.from ? [gte(orders.createdAt, new Date(input.from))] : []),
      ...(input.to ? [lte(orders.createdAt, new Date(input.to))] : []),
      ...(input.zone ? [eq(customerAddresses.operationalZone, input.zone)] : []),
      ...(input.search
        ? [
            or(
              ilike(orders.publicNumber, `%${input.search}%`),
              ilike(customers.displayName, `%${input.search}%`),
            )!,
          ]
        : []),
      ...(cursor
        ? [
            or(
              lt(orders.createdAt, cursor.createdAt),
              and(eq(orders.createdAt, cursor.createdAt), lt(orders.id, cursor.id)),
            )!,
          ]
        : []),
    ];
    const orderRows = await this.database
      .select({ id: orders.id })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .leftJoin(customerAddresses, eq(customerAddresses.id, orders.deliveryAddressId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(input.limit + 1);
    const hasMore = orderRows.length > input.limit;
    const pageRows = hasMore ? orderRows.slice(0, input.limit) : orderRows;
    const loaded = await Promise.all(pageRows.map(({ id }) => this.loadOrder(this.database, id)));
    return {
      items: loaded.filter((row) => row !== null),
      nextCursor: hasMore ? (pageRows.at(-1)?.id ?? null) : null,
    };
  }

  public async exportOrdersCsv(
    input: Omit<OrderListInput, 'cursor' | 'limit'>,
    context: OperationsContext,
  ) {
    const exported: Awaited<ReturnType<PostgresOperationsService['getOrder']>>[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.listOrders({ ...input, cursor, limit: 100 });
      exported.push(...page.items);
      if (exported.length >= 5_000 && page.nextCursor) {
        throw new OperationsConflictError(
          'The export exceeds 5000 orders; narrow the filters before retrying',
        );
      }
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    await this.database.transaction(async (transaction) => {
      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'orders.exported',
        actor: auditActor(context),
        after: { count: exported.length, format: 'csv' },
        correlationId: context.correlationId,
        entityId: context.requestId,
        entityType: 'order_collection',
        metadata: {
          filters: Object.fromEntries(
            Object.entries(input).filter(
              (entry): entry is [string, string] => entry[1] !== undefined,
            ),
          ),
        },
        requestId: context.requestId,
        source: context.source,
      });
    });

    return buildOrdersCsv(
      exported.map((order) => ({
        createdAt: order.createdAt,
        currency: order.currency,
        customerDisplayName: order.customer.displayName,
        deliveryAddress: order.deliveryAddress,
        deliveryDate: order.deliveryDate,
        deliveryZone: order.deliveryZone,
        paymentExpectation: order.paymentExpectation,
        publicNumber: order.publicNumber,
        source: order.source,
        status: order.status,
        totalMinor: order.totalMinor,
      })),
    );
  }

  public async getOrder(orderId: string) {
    const order = await this.loadOrder(this.database, orderId);
    if (!order) throw new OperationsNotFoundError('Order not found');
    return order;
  }

  public async orderHistory(orderId: string) {
    const [order] = await this.database
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) throw new OperationsNotFoundError('Order not found');
    return this.database
      .select({
        actorUserId: orderStatusHistory.actorUserId,
        createdAt: orderStatusHistory.createdAt,
        fromStatus: orderStatusHistory.fromStatus,
        id: orderStatusHistory.id,
        reason: orderStatusHistory.reason,
        toStatus: orderStatusHistory.toStatus,
      })
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(asc(orderStatusHistory.createdAt));
  }

  public async orderRevisionHistory(orderId: string) {
    const [order] = await this.database
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) throw new OperationsNotFoundError('Order not found');
    return this.database
      .select({
        actorUserId: orderRevisions.actorUserId,
        createdAt: orderRevisions.createdAt,
        id: orderRevisions.id,
        reason: orderRevisions.reason,
        revision: orderRevisions.revision,
        snapshot: orderRevisions.snapshot,
      })
      .from(orderRevisions)
      .where(eq(orderRevisions.orderId, orderId))
      .orderBy(desc(orderRevisions.revision));
  }

  // Regional public number. The counter row is updated and returned in one statement so two
  // concurrent orders in the same operation cannot claim the same number; the exact format is
  // administrable data (the operation's prefix) and never a hardcoded condition (ADR-028).
  private async nextPublicNumber(
    transaction: DatabaseTransaction,
    operatingSiteId: string,
  ): Promise<string> {
    const [site] = await transaction
      .select({ orderPrefix: operatingSites.orderPrefix })
      .from(operatingSites)
      .where(eq(operatingSites.id, operatingSiteId))
      .limit(1);
    if (!site) throw new OperationsNotFoundError('Operating site not found');

    const [counter] = await transaction
      .insert(operatingSiteOrderCounters)
      .values({ lastOrderNumber: 1, operatingSiteId })
      .onConflictDoUpdate({
        set: {
          lastOrderNumber: sql`${operatingSiteOrderCounters.lastOrderNumber} + 1`,
          updatedAt: new Date(),
        },
        target: operatingSiteOrderCounters.operatingSiteId,
      })
      .returning({ lastOrderNumber: operatingSiteOrderCounters.lastOrderNumber });
    if (!counter) throw new Error('Order counter update did not return a row');

    return `${site.orderPrefix}-${String(counter.lastOrderNumber).padStart(5, '0')}`;
  }

  // The composable variety is found by kind, never by name. Its display name is only used as the
  // snapshot label for a composed unit (ADR-030).
  private async composableFamilyName(database: Database | DatabaseTransaction): Promise<string> {
    const [family] = await database
      .select({ displayName: productFamilies.displayName })
      .from(productFamilies)
      .where(and(eq(productFamilies.kind, 'COMPOSABLE'), eq(productFamilies.active, true)))
      .orderBy(asc(productFamilies.displayName))
      .limit(1);

    if (!family)
      throw new OperationsConflictError(
        'No hay una variedad componible activa configurada en el catálogo',
      );
    return family.displayName;
  }

  private async loadOrder(database: Database | DatabaseTransaction, orderId: string) {
    const [row] = await database
      .select({
        createdAt: orders.createdAt,
        currency: orders.currency,
        customerDisplayName: customers.displayName,
        customerId: customers.id,
        deliveryAddress: orders.deliveryAddressSnapshot,
        deliveryAddressId: orders.deliveryAddressId,
        deliveryDate: orders.deliveryDate,
        deliveryLocationUrl: orders.deliveryLocationUrlSnapshot,
        deliveryZone: customerAddresses.operationalZone,
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
      .leftJoin(customerAddresses, eq(customerAddresses.id, orders.deliveryAddressId))
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
    allowCycleOverride: boolean,
    context: OperationsContext,
  ) {
    await this.database.transaction(async (transaction) => {
      const [current] = await transaction
        .select({
          closeAt: salesCycles.closeAt,
          cycleStatus: salesCycles.status,
          status: orders.status,
        })
        .from(orders)
        .innerJoin(salesCycles, eq(salesCycles.id, orders.salesCycleId))
        .where(eq(orders.id, orderId))
        .limit(1);
      if (!current) throw new OperationsNotFoundError('Order not found');

      const fromStatus = current.status as OrderStatus;
      const cycleLocked = current.cycleStatus === 'CLOSED' || new Date() >= current.closeAt;
      assertOrderTransitionPolicy({
        allowCycleOverride,
        confirmedReversal,
        cycleLocked,
        from: fromStatus,
        reason,
        to: targetStatus,
      });

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
        metadata: { cycleOverride: cycleLocked && allowCycleOverride },
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

  // Production is bounded by the operation (ADR-028): a global scope consolidates every operation,
  // a concrete one cooks only its own demand.
  public async kitchenSummary(cycleId: string, operatingSiteId?: string | null) {
    const [cycle] = await this.database
      .select({ alias: salesCycles.alias, id: salesCycles.id })
      .from(salesCycles)
      .where(eq(salesCycles.id, cycleId))
      .limit(1);
    if (!cycle) throw new OperationsNotFoundError('Sales cycle not found');

    const lines = await this.database
      .select({
        // Derived from the catalog rather than compared against a variety name. A line whose variant
        // was since removed falls back to its own composition, which is still correct.
        composable: sql<boolean>`coalesce(${productFamilies.kind} = 'COMPOSABLE', false)`,
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
      .leftJoin(productVariants, eq(productVariants.id, orderItems.productVariantId))
      .leftJoin(productFamilies, eq(productFamilies.id, productVariants.productFamilyId))
      .where(
        and(
          eq(orders.salesCycleId, cycleId),
          ...(operatingSiteId ? [eq(orders.operatingSiteId, operatingSiteId)] : []),
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
