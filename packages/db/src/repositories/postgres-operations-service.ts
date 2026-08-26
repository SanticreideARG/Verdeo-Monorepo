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
  buildLabels,
  calculateLineTotal,
  calculateOrderTotal,
  resolveOrderComposition,
  type KitchenSourceLine,
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
  labelSettings,
  messageTemplates,
  operatingSiteOrderCounters,
  operatingSites,
  orderDietaryInstructions,
  orderItemSelections,
  orderItems,
  orderRevisions,
  menuCatalogSettings,
  orders,
  orderStatusHistory,
  productFamilies,
  productSizes,
  productVariants,
  productionActuals,
  productionSnapshots,
  salesCycles,
  surplusConfigs,
  surplusWriteoffs,
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
  restrictions?: readonly { reason: string; type: string }[] | undefined;
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
    description?: string | null | undefined;
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

interface SurplusRow {
  bajaMerma: number;
  disponible: number;
  excedenteEfectivo: number;
  demandaConfirmada: number;
  familyName: string;
  produccionPlanificada: number;
  produccionReal: number | null;
  variantName: string;
  vendidoOportunidad: number;
}

// A JSON tuple is a safe map key regardless of what characters a family or variant name contains,
// unlike a joined string that would need to guess a separator that never collides.
function surplusKey(familyName: string, variantName: string): string {
  return JSON.stringify([familyName, variantName]);
}

function parseSurplusKey(key: string): [string, string] {
  return JSON.parse(key) as [string, string];
}

// A 'final' snapshot carries the delta against the 'partial' one taken earlier in the same cycle
// (Martes 20:00 vs Miércoles 19:00). Compared by (family, variant) so a variety that only appeared
// in one of the two snapshots still shows up, with the missing side treated as zero.
function computeProductionDelta(
  previousBase: readonly { familyName: string; quantityUnits: number; variantName: string }[],
  currentBase: readonly { familyName: string; quantityUnits: number; variantName: string }[],
): { deltaUnits: number; familyName: string; quantityUnits: number; variantName: string }[] {
  const previousMap = new Map(
    previousBase.map((line) => [surplusKey(line.familyName, line.variantName), line.quantityUnits]),
  );
  const currentMap = new Map(
    currentBase.map((line) => [surplusKey(line.familyName, line.variantName), line.quantityUnits]),
  );
  const keys = new Set([...previousMap.keys(), ...currentMap.keys()]);
  return [...keys]
    .map((key) => {
      const [familyName, variantName] = parseSurplusKey(key);
      const before = previousMap.get(key) ?? 0;
      const after = currentMap.get(key) ?? 0;
      return { deltaUnits: after - before, familyName, quantityUnits: after, variantName };
    })
    .sort(
      (a, b) =>
        a.familyName.localeCompare(b.familyName) || a.variantName.localeCompare(b.variantName),
    );
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
          geographicZoneId: customerAddresses.geographicZoneId,
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

    if (input.restrictions && input.restrictions.length > 0) {
      await transaction.insert(customerRestrictions).values(
        input.restrictions.map((restriction) => ({
          createdByUserId: context.actorUserId,
          customerId: created.id,
          reason: restriction.reason,
          type: restriction.type,
        })),
      );
    }

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
        description: weeklyMenuOfferings.description,
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

  // Shared by createMenu (a brand-new menu row) and updateMenu (an existing one, offerings/prices
  // wiped and rewritten wholesale — same "resubmit everything" pattern used elsewhere this session
  // for label settings and survey questions, since a partial-field update of a nested list invites
  // more bugs than it saves). `offerings` must already carry the Intuitivo name coercion.
  private async writeMenuPricesAndOfferings(
    transaction: DatabaseTransaction,
    menuId: string,
    offerings: MenuInput['offerings'],
    prices: MenuInput['prices'],
  ): Promise<void> {
    // Sizes and their prices are established first: an offering only names the size it belongs to.
    const sizeIdsByName = new Map<string, string>();
    for (const [index, price] of prices.entries()) {
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
        weeklyMenuId: menuId,
      });
    }

    for (const offering of offerings) {
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
        prices.find((price) => price.sizeName === offering.sizeName)?.mealsPerUnit ?? 5;
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
          description: offering.description ?? null,
          productVariantId: variant.id,
          weeklyMenuId: menuId,
          ...(offering.overridePriceMinor === undefined
            ? {}
            : { unitPriceMinor: offering.overridePriceMinor }),
        })
        .returning({ id: weeklyMenuOfferings.id });
      if (!createdOffering) throw new Error('Menu offering creation did not return a row');

      // A composable offering submits no dishes of its own (its universe is every dish
      // published this week for the same size), so there's nothing to insert for it.
      if (offering.dishes.length > 0) {
        await transaction.insert(weeklyMenuItems).values(
          offering.dishes.map((dishName, index) => ({
            dishName,
            offeringId: createdOffering.id,
            slot: index + 1,
          })),
        );
      }
    }
  }

  // The Intuitivo-name coercion is identical in both callers, so it lives once here rather than
  // duplicated between createMenu and updateMenu.
  private coerceComposableNames(offerings: MenuInput['offerings']): MenuInput['offerings'] {
    return offerings.map((offering) =>
      offering.composable ? { ...offering, familyName: 'Intuitivo' } : offering,
    );
  }

  public async createMenu(input: MenuInput, context: OperationsContext) {
    return this.database
      .transaction(async (transaction) => {
        // Whether Intuitivo can be offered is decided per operating site at distribution time
        // (see distributeMenu), not here — the master menu is global and never belongs to one
        // operation (WEEKLY_MENU_AND_PRODUCTION.md), so there is no single site to check yet.
        // The composable offering's identity is the system's to set, not the operator's to type —
        // "Ningún branch del motor identifica la variedad componible por su nombre" already holds
        // for the engine (it matches by product_families.kind), but the display name still reached
        // the catalog verbatim from whatever the weekly form typed. Coercing it here keeps every
        // week's composable family under the one name customers and staff both expect.
        const offerings = this.coerceComposableNames(input.offerings);

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

        await this.writeMenuPricesAndOfferings(transaction, menu.id, offerings, input.prices);

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

  // "Los menús se deben poder modificar. Pueden haber errores de carga." — offerings/items/prices
  // are wiped and rewritten wholesale for this one menu id (master or regional; editing a regional
  // row never touches its master or siblings). Safe to do even after publish or after orders exist
  // against it: order_items.offeringId is `onDelete: 'set null'` and every order already carries
  // its own name/price snapshot at order time, so deleting an offering row here never corrupts an
  // existing order — the same snapshot-over-live-reference design used everywhere else.
  public async updateMenu(menuId: string, input: MenuInput, context: OperationsContext) {
    return this.database
      .transaction(async (transaction) => {
        const [existing] = await transaction
          .select({ salesCycleId: weeklyMenus.salesCycleId })
          .from(weeklyMenus)
          .where(eq(weeklyMenus.id, menuId))
          .limit(1);
        if (!existing) throw new OperationsNotFoundError('Weekly menu not found');

        await transaction
          .update(salesCycles)
          .set({
            alias: input.alias,
            closeAt: new Date(input.closeAt),
            openAt: new Date(input.openAt),
            partialKitchenCutoffAt: new Date(input.partialKitchenCutoffAt),
          })
          .where(eq(salesCycles.id, existing.salesCycleId));

        await transaction
          .delete(weeklyMenuOfferings)
          .where(eq(weeklyMenuOfferings.weeklyMenuId, menuId));
        await transaction.delete(weeklyMenuPrices).where(eq(weeklyMenuPrices.weeklyMenuId, menuId));

        const offerings = this.coerceComposableNames(input.offerings);
        await this.writeMenuPricesAndOfferings(transaction, menuId, offerings, input.prices);

        const audit = new AuditService(new PostgresAuditSink(transaction));
        await audit.record({
          action: 'weekly_menu.updated',
          actor: auditActor(context),
          after: { offeringCount: offerings.length },
          correlationId: context.correlationId,
          entityId: menuId,
          entityType: 'weekly_menu',
          requestId: context.requestId,
          source: context.source,
        });

        return menuId;
      })
      .then(async (updatedMenuId) => {
        const menu = (await this.listMenus()).find(({ id }) => id === updatedMenuId);
        if (!menu) throw new Error('Updated menu could not be reloaded');
        return menu;
      })
      .catch(translateDatabaseConflict);
  }

  // "Precios por ubicación": editing just the price for a size on one already-distributed menu,
  // without resubmitting its whole offering list the way updateMenu requires. Marks each touched
  // row `customized` — the same flag copyMenuContent already respects (a later non-REPLACE
  // distribution from master never overwrites a price an operator edited here).
  public async updateMenuPrices(
    menuId: string,
    prices: readonly { sizeName: string; unitPriceMinor: number }[],
    context: OperationsContext,
  ) {
    return this.database
      .transaction(async (transaction) => {
        const [menu] = await transaction
          .select({ id: weeklyMenus.id })
          .from(weeklyMenus)
          .where(eq(weeklyMenus.id, menuId))
          .limit(1);
        if (!menu) throw new OperationsNotFoundError('Weekly menu not found');

        const before: Record<string, number> = {};
        const after: Record<string, number> = {};
        for (const price of prices) {
          const [size] = await transaction
            .select({ id: productSizes.id })
            .from(productSizes)
            .where(eq(productSizes.code, catalogCode(price.sizeName)))
            .limit(1);
          if (!size) throw new OperationsConflictError(`El tamaño "${price.sizeName}" no existe`);

          const [existing] = await transaction
            .select({ id: weeklyMenuPrices.id, unitPriceMinor: weeklyMenuPrices.unitPriceMinor })
            .from(weeklyMenuPrices)
            .where(
              and(
                eq(weeklyMenuPrices.weeklyMenuId, menuId),
                eq(weeklyMenuPrices.productSizeId, size.id),
              ),
            )
            .limit(1);

          if (existing) {
            before[price.sizeName] = existing.unitPriceMinor;
            await transaction
              .update(weeklyMenuPrices)
              .set({ customized: true, unitPriceMinor: price.unitPriceMinor })
              .where(eq(weeklyMenuPrices.id, existing.id));
          } else {
            await transaction.insert(weeklyMenuPrices).values({
              customized: true,
              productSizeId: size.id,
              unitPriceMinor: price.unitPriceMinor,
              weeklyMenuId: menuId,
            });
          }
          after[price.sizeName] = price.unitPriceMinor;
        }

        const audit = new AuditService(new PostgresAuditSink(transaction));
        await audit.record({
          action: 'weekly_menu.prices_updated',
          actor: auditActor(context),
          after,
          before,
          correlationId: context.correlationId,
          entityId: menuId,
          entityType: 'weekly_menu',
          requestId: context.requestId,
          source: context.source,
        });

        return menuId;
      })
      .then(async (updatedMenuId) => {
        const menu = (await this.listMenus()).find(({ id }) => id === updatedMenuId);
        if (!menu) throw new Error('Updated menu could not be reloaded');
        return menu;
      })
      .catch(translateDatabaseConflict);
  }

  // "Debemos permitir borrar los menús sin pedidos cargados." Orders.weeklyMenuId is already
  // `onDelete: 'restrict'` at the database level, so a menu with orders against it can't actually
  // be deleted regardless — this check exists to give that a clear message instead of a raw
  // foreign-key error. Deleting a master cascades its own offerings/prices, never a regional
  // distributed copy (those are independent rows, deleted the same way one at a time).
  public async deleteMenu(menuId: string, context: OperationsContext): Promise<void> {
    await this.database
      .transaction(async (transaction) => {
        const [menu] = await transaction
          .select({ id: weeklyMenus.id })
          .from(weeklyMenus)
          .where(eq(weeklyMenus.id, menuId))
          .limit(1);
        if (!menu) throw new OperationsNotFoundError('Weekly menu not found');

        const [orderCountRow] = await transaction
          .select({ count: sql<number>`count(*)` })
          .from(orders)
          .where(eq(orders.weeklyMenuId, menuId));
        if (Number(orderCountRow?.count ?? 0) > 0) {
          throw new OperationsConflictError(
            'Este menú ya tiene pedidos cargados — no se puede eliminar.',
          );
        }

        await transaction.delete(weeklyMenus).where(eq(weeklyMenus.id, menuId));

        const audit = new AuditService(new PostgresAuditSink(transaction));
        await audit.record({
          action: 'weekly_menu.deleted',
          actor: auditActor(context),
          correlationId: context.correlationId,
          entityId: menuId,
          entityType: 'weekly_menu',
          requestId: context.requestId,
          source: context.source,
        });
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
        const masterOfferingsWithKind = await transaction
          .select({
            composable: sql<boolean>`${productFamilies.kind} = 'COMPOSABLE'`,
            currency: weeklyMenuOfferings.currency,
            description: weeklyMenuOfferings.description,
            id: weeklyMenuOfferings.id,
            productVariantId: weeklyMenuOfferings.productVariantId,
            unitPriceMinor: weeklyMenuOfferings.unitPriceMinor,
          })
          .from(weeklyMenuOfferings)
          .innerJoin(productVariants, eq(productVariants.id, weeklyMenuOfferings.productVariantId))
          .innerJoin(productFamilies, eq(productFamilies.id, productVariants.productFamilyId))
          .where(eq(weeklyMenuOfferings.weeklyMenuId, master.id));
        const masterOfferings = masterOfferingsWithKind.map((row) => ({
          currency: row.currency,
          description: row.description,
          id: row.id,
          productVariantId: row.productVariantId,
          unitPriceMinor: row.unitPriceMinor,
        }));
        const composableOfferingIds = new Set(
          masterOfferingsWithKind.filter((row) => row.composable).map((row) => row.id),
        );
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

          // Intuitivo availability is per site: a city with it switched off in Ajustes never gets
          // the composable offering copied in, regardless of what the master week includes.
          const siteAllowsIntuitivo =
            composableOfferingIds.size === 0 ||
            (await this.isIntuitivoEnabledForSite(transaction, operatingSiteId));
          const siteOfferings = siteAllowsIntuitivo
            ? masterOfferings
            : masterOfferings.filter((offering) => !composableOfferingIds.has(offering.id));
          const siteItems = siteAllowsIntuitivo
            ? masterItems
            : masterItems.filter((item) => !composableOfferingIds.has(item.offeringId));

          const replacing = input.mode === 'REPLACE';
          const refreshed = await this.copyMenuContent(transaction, {
            items: siteItems,
            offerings: siteOfferings,
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
        description: string | null;
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
              description: offering.description,
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
          .set({
            customized: false,
            description: offering.description,
            unitPriceMinor: offering.unitPriceMinor,
          })
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
    if (input.source === 'opportunity_sale') {
      await this.assertOpportunitySaleAvailability(transaction, menu.salesCycleId, resolvedItems);
    }
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
    // The composable variety is the same for every line, so it is resolved once instead of per item.
    const composableFamilyName = await this.composableFamilyName(transaction);

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
        composableFamilyName,
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
    const loaded = await this.loadOrders(
      this.database,
      pageRows.map(({ id }) => id),
    );
    return {
      items: loaded,
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

  // Public "seguimiento" (CMS_AND_PUBLIC_WEB.md's "obtener seguimiento por token/enlace"): a
  // visitor proves they placed the order by supplying the same contact they checked out with,
  // not by knowing the publicNumber alone — publicNumber is sequential and guessable, so pairing
  // it with a contact match is what keeps this from being an enumeration hole. Returns null (never
  // throws) on any mismatch so a wrong guess looks identical to a nonexistent order.
  public async trackPublicOrder(publicNumber: string, contact: string) {
    const [row] = await this.database
      .select({ customerId: orders.customerId, id: orders.id })
      .from(orders)
      .where(eq(orders.publicNumber, publicNumber.trim().toUpperCase()))
      .limit(1);
    if (!row) return null;

    // The contact might be an email or a phone number and normalization for the wrong shape
    // throws (e.g. "not enough digits" for an email passed as a phone) rather than returning
    // null, so each candidate is normalized independently and a bad shape just drops that
    // candidate instead of failing the whole lookup.
    const normalizedEmail = normalizeCustomerIdentity('email', contact);
    let normalizedPhone: string | null;
    try {
      normalizedPhone = normalizeCustomerIdentity('phone', contact);
    } catch {
      normalizedPhone = null;
    }
    const [identity] = await this.database
      .select({ id: customerIdentities.id })
      .from(customerIdentities)
      .where(
        and(
          eq(customerIdentities.customerId, row.customerId),
          eq(customerIdentities.active, true),
          or(
            eq(customerIdentities.valueNormalized, normalizedEmail),
            ...(normalizedPhone ? [eq(customerIdentities.valueNormalized, normalizedPhone)] : []),
          ),
        ),
      )
      .limit(1);
    if (!identity) return null;

    const order = await this.loadOrder(this.database, row.id);
    if (!order) return null;

    const history = await this.database
      .select({ createdAt: orderStatusHistory.createdAt, toStatus: orderStatusHistory.toStatus })
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, row.id))
      .orderBy(asc(orderStatusHistory.createdAt));

    return { history, order };
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

  /**
   * Loads a whole page of orders in four queries regardless of page size. Fetching one order at a
   * time cost 4N round trips, which on a serverless function holding a single connection to a
   * database in another region made the listing the slowest screen in the product.
   *
   * The result keeps the caller's id order, because that is the pagination order.
   */
  private async loadOrders(database: Database | DatabaseTransaction, orderIds: readonly string[]) {
    if (orderIds.length === 0) return [];

    const rows = await database
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
      .where(inArray(orders.id, [...orderIds]));
    if (rows.length === 0) return [];

    const presentIds = rows.map(({ id }) => id);
    const itemRows = await database
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        productName: orderItems.productNameSnapshot,
        quantityUnits: orderItems.quantityUnits,
        totalMinor: orderItems.totalMinor,
        unitPriceMinor: orderItems.unitPriceMinor,
        variantName: orderItems.variantSnapshot,
      })
      .from(orderItems)
      .where(inArray(orderItems.orderId, presentIds));
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
      .select({
        instruction: orderDietaryInstructions.instruction,
        orderId: orderDietaryInstructions.orderId,
      })
      .from(orderDietaryInstructions)
      .where(inArray(orderDietaryInstructions.orderId, presentIds));

    const dishesByItem = new Map<string, string[]>();
    for (const selection of selections) {
      const bucket = dishesByItem.get(selection.orderItemId);
      if (bucket) bucket.push(selection.dishName);
      else dishesByItem.set(selection.orderItemId, [selection.dishName]);
    }
    const itemsByOrder = new Map<string, typeof itemRows>();
    for (const item of itemRows) {
      const bucket = itemsByOrder.get(item.orderId);
      if (bucket) bucket.push(item);
      else itemsByOrder.set(item.orderId, [item]);
    }
    const instructionsByOrder = new Map<string, string[]>();
    for (const entry of instructions) {
      const bucket = instructionsByOrder.get(entry.orderId);
      if (bucket) bucket.push(entry.instruction);
      else instructionsByOrder.set(entry.orderId, [entry.instruction]);
    }

    const byId = new Map(
      rows.map((row) => [
        row.id,
        {
          ...row,
          customer: { displayName: row.customerDisplayName, id: row.customerId },
          dietaryInstructions: instructionsByOrder.get(row.id) ?? [],
          // orderId is the grouping key, not part of the item DTO.
          items: (itemsByOrder.get(row.id) ?? []).map((item) => ({
            dishSelections: dishesByItem.get(item.id) ?? [],
            id: item.id,
            productName: item.productName,
            quantityUnits: item.quantityUnits,
            totalMinor: item.totalMinor,
            unitPriceMinor: item.unitPriceMinor,
            variantName: item.variantName,
          })),
        },
      ]),
    );

    return orderIds.map((id) => byId.get(id)).filter((row) => row !== undefined);
  }

  private async loadOrder(database: Database | DatabaseTransaction, orderId: string) {
    const [order] = await this.loadOrders(database, [orderId]);
    return order ?? null;
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

  // Shared by kitchenSummary (aggregated by variety) and the label generator (expanded one entry
  // per physical unit) — same source lines, two different shapes built from them. `orderId` narrows
  // to a single order for the per-order "reimprimir etiquetas" flow; `cycleId`/`operatingSiteId`
  // narrow to a whole production run, same bounding as ADR-028.
  private async loadKitchenLines(
    filter: { cycleId: string; operatingSiteId?: string | null | undefined } | { orderId: string },
  ): Promise<readonly KitchenSourceLine[]> {
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
        'orderId' in filter
          ? eq(orders.id, filter.orderId)
          : and(
              eq(orders.salesCycleId, filter.cycleId),
              ...(filter.operatingSiteId
                ? [eq(orders.operatingSiteId, filter.operatingSiteId)]
                : []),
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

    return lines.map((line) => ({
      ...line,
      dietaryInstructions: instructions
        .filter((instruction) => instruction.orderId === line.orderId)
        .map((instruction) => instruction.instruction),
      dishSelections: selections
        .filter((selection) => selection.orderItemId === line.orderItemId)
        .map((selection) => selection.dishName),
    }));
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

    const lines = await this.loadKitchenLines({ cycleId, operatingSiteId });
    return { ...buildKitchenSummary(lines), cycle, generatedAt: new Date() };
  }

  // --- Kitchen labels: one entry per physical unit, one per order/cycle print run ----------------

  public async cycleLabels(cycleId: string, operatingSiteId?: string | null) {
    const [cycle] = await this.database
      .select({ id: salesCycles.id })
      .from(salesCycles)
      .where(eq(salesCycles.id, cycleId))
      .limit(1);
    if (!cycle) throw new OperationsNotFoundError('Sales cycle not found');
    return buildLabels(await this.loadKitchenLines({ cycleId, operatingSiteId }));
  }

  public async orderLabels(orderId: string) {
    const order = await this.loadOrder(this.database, orderId);
    if (!order) throw new OperationsNotFoundError('Order not found');
    return buildLabels(await this.loadKitchenLines({ orderId }));
  }

  public async getLabelSettings() {
    const [config] = await this.database
      .select()
      .from(labelSettings)
      .orderBy(desc(labelSettings.updatedAt))
      .limit(1);
    return (
      config ?? {
        backgroundImageUrl: null,
        id: null,
        labelsPerPage: 8,
        updatedAt: null,
        updatedByUserId: null,
      }
    );
  }

  public async setLabelSettings(
    input: { backgroundImageUrl?: string | null | undefined; labelsPerPage: number },
    context: OperationsContext,
  ) {
    return this.database
      .transaction(async (transaction) => {
        const [existing] = await transaction
          .select()
          .from(labelSettings)
          .orderBy(desc(labelSettings.updatedAt))
          .limit(1);
        const values = {
          backgroundImageUrl:
            input.backgroundImageUrl === undefined
              ? (existing?.backgroundImageUrl ?? null)
              : input.backgroundImageUrl,
          labelsPerPage: input.labelsPerPage,
          updatedByUserId: context.actorUserId ?? null,
        };
        let row: typeof labelSettings.$inferSelect | undefined;
        if (existing) {
          [row] = await transaction
            .update(labelSettings)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(labelSettings.id, existing.id))
            .returning();
        } else {
          [row] = await transaction.insert(labelSettings).values(values).returning();
        }
        if (!row) throw new Error('Label settings upsert did not return a row');

        const audit = new AuditService(new PostgresAuditSink(transaction));
        await audit.record({
          action: 'label_settings.updated',
          actor: auditActor(context),
          after: { backgroundImageUrl: row.backgroundImageUrl, labelsPerPage: row.labelsPerPage },
          ...(existing
            ? {
                before: {
                  backgroundImageUrl: existing.backgroundImageUrl,
                  labelsPerPage: existing.labelsPerPage,
                },
              }
            : {}),
          correlationId: context.correlationId,
          entityId: row.id,
          entityType: 'label_settings',
          requestId: context.requestId,
          source: context.source,
        });
        return row;
      })
      .catch(translateDatabaseConflict);
  }

  // --- Production: "informar producción real" and snapshots -------------------------------------

  private async listProductionActualsRows(
    database: Database | DatabaseTransaction,
    cycleId: string,
  ) {
    return database
      .select({
        familyName: productionActuals.familyName,
        quantityUnits: productionActuals.quantityUnits,
        reportedAt: productionActuals.reportedAt,
        reportedByUserId: productionActuals.reportedByUserId,
        variantName: productionActuals.variantName,
      })
      .from(productionActuals)
      .where(eq(productionActuals.salesCycleId, cycleId))
      .orderBy(asc(productionActuals.familyName), asc(productionActuals.variantName));
  }

  public async listProductionActuals(cycleId: string) {
    return this.listProductionActualsRows(this.database, cycleId);
  }

  // Kitchen reports one (family, variant) count at a time or in a batch; either way the current
  // count is what matters, not a history of corrections, so each entry upserts rather than appends.
  public async reportProduction(
    cycleId: string,
    entries: readonly { familyName: string; quantityUnits: number; variantName: string }[],
    context: OperationsContext,
  ) {
    if (entries.length === 0)
      throw new OperationsConflictError('Informá al menos una cantidad producida.');
    return this.database
      .transaction(async (transaction) => {
        const [cycle] = await transaction
          .select({ id: salesCycles.id })
          .from(salesCycles)
          .where(eq(salesCycles.id, cycleId))
          .limit(1);
        if (!cycle) throw new OperationsNotFoundError('Sales cycle not found');

        const reportedAt = new Date();
        for (const entry of entries) {
          await transaction
            .insert(productionActuals)
            .values({
              familyName: entry.familyName,
              quantityUnits: entry.quantityUnits,
              reportedAt,
              reportedByUserId: context.actorUserId ?? null,
              salesCycleId: cycleId,
              variantName: entry.variantName,
            })
            .onConflictDoUpdate({
              set: {
                quantityUnits: entry.quantityUnits,
                reportedAt,
                reportedByUserId: context.actorUserId ?? null,
                updatedAt: reportedAt,
              },
              target: [
                productionActuals.salesCycleId,
                productionActuals.familyName,
                productionActuals.variantName,
              ],
            });
        }

        const audit = new AuditService(new PostgresAuditSink(transaction));
        await audit.record({
          action: 'production.reported',
          actor: auditActor(context),
          after: { entries: [...entries] },
          correlationId: context.correlationId,
          entityId: cycleId,
          entityType: 'sales_cycle',
          requestId: context.requestId,
          source: context.source,
        });

        return this.listProductionActualsRows(transaction, cycleId);
      })
      .catch(translateDatabaseConflict);
  }

  public async listProductionSnapshots(cycleId: string) {
    return this.database
      .select()
      .from(productionSnapshots)
      .where(eq(productionSnapshots.salesCycleId, cycleId))
      .orderBy(asc(productionSnapshots.kind));
  }

  // Regenerating a snapshot overwrites the row for that (cycle, kind): the payload is a cache of a
  // computed view (kitchen summary + actuals so far), never a second source of truth for the orders
  // and actuals it summarizes, which stay independently queryable regardless of whether a snapshot
  // was ever taken.
  public async generateProductionSnapshot(
    cycleId: string,
    kind: 'final' | 'partial',
    operatingSiteId: string | null | undefined,
    context: OperationsContext,
  ) {
    const summary = await this.kitchenSummary(cycleId, operatingSiteId);
    const actuals = await this.listProductionActuals(cycleId);

    let delta: ReturnType<typeof computeProductionDelta> | null = null;
    if (kind === 'final') {
      const [partial] = await this.database
        .select({ payload: productionSnapshots.payload })
        .from(productionSnapshots)
        .where(
          and(
            eq(productionSnapshots.salesCycleId, cycleId),
            eq(productionSnapshots.kind, 'partial'),
          ),
        )
        .limit(1);
      if (partial) {
        const previousBase = (
          partial.payload as {
            base?: { familyName: string; quantityUnits: number; variantName: string }[];
          }
        ).base;
        if (previousBase) delta = computeProductionDelta(previousBase, summary.base);
      }
    }

    const payload = {
      actuals,
      base: summary.base,
      custom: summary.custom,
      cycle: summary.cycle,
      delta,
      totalUnits: summary.totalUnits,
    };

    return this.database
      .transaction(async (transaction) => {
        const [row] = await transaction
          .insert(productionSnapshots)
          .values({
            generatedByUserId: context.actorUserId ?? null,
            kind,
            payload,
            salesCycleId: cycleId,
          })
          .onConflictDoUpdate({
            set: {
              generatedAt: new Date(),
              generatedByUserId: context.actorUserId ?? null,
              payload,
            },
            target: [productionSnapshots.salesCycleId, productionSnapshots.kind],
          })
          .returning();
        if (!row) throw new Error('Snapshot upsert did not return a row');

        const audit = new AuditService(new PostgresAuditSink(transaction));
        await audit.record({
          action: 'production.snapshot_generated',
          actor: auditActor(context),
          after: { kind, totalUnits: summary.totalUnits },
          correlationId: context.correlationId,
          entityId: row.id,
          entityType: 'production_snapshot',
          requestId: context.requestId,
          source: context.source,
        });
        return row;
      })
      .catch(translateDatabaseConflict);
  }

  // --- Excedente: coefficient, tracking, write-offs, and opportunity-sale stock ------------------

  private async surplusCoefficientPercent(database: Database | DatabaseTransaction) {
    const [config] = await database
      .select({ coefficientPercent: surplusConfigs.coefficientPercent })
      .from(surplusConfigs)
      .orderBy(desc(surplusConfigs.updatedAt))
      .limit(1);
    return config ? Number(config.coefficientPercent) : 0;
  }

  public async getSurplusConfig() {
    const [config] = await this.database
      .select()
      .from(surplusConfigs)
      .orderBy(desc(surplusConfigs.updatedAt))
      .limit(1);
    return config ?? { coefficientPercent: '0', id: null, updatedAt: null, updatedByUserId: null };
  }

  public async setSurplusConfig(coefficientPercent: number, context: OperationsContext) {
    return this.database
      .transaction(async (transaction) => {
        const [existing] = await transaction
          .select()
          .from(surplusConfigs)
          .orderBy(desc(surplusConfigs.updatedAt))
          .limit(1);
        const value = coefficientPercent.toFixed(2);
        let row: typeof surplusConfigs.$inferSelect | undefined;
        if (existing) {
          [row] = await transaction
            .update(surplusConfigs)
            .set({
              coefficientPercent: value,
              updatedAt: new Date(),
              updatedByUserId: context.actorUserId ?? null,
            })
            .where(eq(surplusConfigs.id, existing.id))
            .returning();
        } else {
          [row] = await transaction
            .insert(surplusConfigs)
            .values({ coefficientPercent: value, updatedByUserId: context.actorUserId ?? null })
            .returning();
        }
        if (!row) throw new Error('Surplus config upsert did not return a row');

        const audit = new AuditService(new PostgresAuditSink(transaction));
        await audit.record({
          action: 'surplus.config_updated',
          actor: auditActor(context),
          after: { coefficientPercent: row.coefficientPercent },
          ...(existing ? { before: { coefficientPercent: existing.coefficientPercent } } : {}),
          correlationId: context.correlationId,
          entityId: row.id,
          entityType: 'surplus_config',
          requestId: context.requestId,
          source: context.source,
        });
        return row;
      })
      .catch(translateDatabaseConflict);
  }

  /** One row per active operating site, its own latest Intuitivo toggle (default enabled when no
   * row exists yet for that site). For the settings screen, not the distribution path — that path
   * calls `isIntuitivoEnabledForSite` directly instead of listing everything. */
  public async listMenuCatalogSettings() {
    const sites = await this.database
      .select({ displayName: operatingSites.displayName, id: operatingSites.id })
      .from(operatingSites)
      .where(eq(operatingSites.active, true))
      .orderBy(asc(operatingSites.displayName));

    const rows = await this.database
      .select({
        intuitivoEnabled: menuCatalogSettings.intuitivoEnabled,
        operatingSiteId: menuCatalogSettings.operatingSiteId,
        updatedAt: menuCatalogSettings.updatedAt,
      })
      .from(menuCatalogSettings)
      .orderBy(desc(menuCatalogSettings.updatedAt));
    const latestBySite = new Map<string, boolean>();
    for (const row of rows) {
      if (row.operatingSiteId && !latestBySite.has(row.operatingSiteId))
        latestBySite.set(row.operatingSiteId, row.intuitivoEnabled);
    }

    return sites.map((site) => ({
      intuitivoEnabled: latestBySite.get(site.id) ?? true,
      operatingSiteId: site.id,
      operatingSiteName: site.displayName,
    }));
  }

  private async isIntuitivoEnabledForSite(
    database: Database | DatabaseTransaction,
    operatingSiteId: string,
  ): Promise<boolean> {
    const [row] = await database
      .select({ intuitivoEnabled: menuCatalogSettings.intuitivoEnabled })
      .from(menuCatalogSettings)
      .where(eq(menuCatalogSettings.operatingSiteId, operatingSiteId))
      .orderBy(desc(menuCatalogSettings.updatedAt))
      .limit(1);
    return row?.intuitivoEnabled ?? true;
  }

  public async setIntuitivoEnabled(
    operatingSiteId: string,
    intuitivoEnabled: boolean,
    context: OperationsContext,
  ) {
    return this.database.transaction(async (transaction) => {
      const [site] = await transaction
        .select({ id: operatingSites.id })
        .from(operatingSites)
        .where(eq(operatingSites.id, operatingSiteId))
        .limit(1);
      if (!site) throw new OperationsNotFoundError('Operating site not found');

      const [existing] = await transaction
        .select()
        .from(menuCatalogSettings)
        .where(eq(menuCatalogSettings.operatingSiteId, operatingSiteId))
        .orderBy(desc(menuCatalogSettings.updatedAt))
        .limit(1);

      let row: typeof menuCatalogSettings.$inferSelect | undefined;
      if (existing) {
        [row] = await transaction
          .update(menuCatalogSettings)
          .set({
            intuitivoEnabled,
            updatedAt: new Date(),
            updatedByUserId: context.actorUserId ?? null,
          })
          .where(eq(menuCatalogSettings.id, existing.id))
          .returning();
      } else {
        [row] = await transaction
          .insert(menuCatalogSettings)
          .values({
            intuitivoEnabled,
            operatingSiteId,
            updatedByUserId: context.actorUserId ?? null,
          })
          .returning();
      }
      if (!row) throw new Error('Menu catalog settings upsert did not return a row');

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'menu_catalog.intuitivo_toggled',
        actor: auditActor(context),
        after: { intuitivoEnabled: row.intuitivoEnabled },
        ...(existing ? { before: { intuitivoEnabled: existing.intuitivoEnabled } } : {}),
        correlationId: context.correlationId,
        entityId: row.id,
        entityType: 'menu_catalog_settings',
        metadata: { operatingSiteId },
        requestId: context.requestId,
        source: context.source,
      });
      return row;
    });
  }

  // Demanda confirmada excludes opportunity sales (they consume excedente, they do not create
  // demand). Producción planificada is a display-only suggestion (demand × (1 + coefficient)); what
  // kitchen actually makes is `producción real`, reported separately. Excedente efectivo is what's
  // left after confirmed demand is covered; disponible subtracts what has already been sold as an
  // opportunity sale or written off, so it never double-counts.
  private async surplusRows(
    database: Database | DatabaseTransaction,
    cycleId: string,
  ): Promise<Map<string, SurplusRow>> {
    const coefficientPercent = await this.surplusCoefficientPercent(database);

    const lines = await database
      .select({
        familyName: orderItems.productNameSnapshot,
        quantityUnits: orderItems.quantityUnits,
        source: orders.source,
        variantName: orderItems.variantSnapshot,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orders.salesCycleId, cycleId),
          inArray(orders.status, ['CONFIRMED', 'READY', 'DELIVERED']),
        ),
      );
    const actuals = await this.listProductionActualsRows(database, cycleId);
    const writeoffs = await database
      .select({
        familyName: surplusWriteoffs.familyName,
        quantityUnits: surplusWriteoffs.quantityUnits,
        variantName: surplusWriteoffs.variantName,
      })
      .from(surplusWriteoffs)
      .where(eq(surplusWriteoffs.salesCycleId, cycleId));

    const rows = new Map<string, SurplusRow>();
    const ensure = (familyName: string, variantName: string) => {
      const key = surplusKey(familyName, variantName);
      let row = rows.get(key);
      if (!row) {
        row = {
          bajaMerma: 0,
          demandaConfirmada: 0,
          disponible: 0,
          excedenteEfectivo: 0,
          familyName,
          produccionPlanificada: 0,
          produccionReal: null,
          variantName,
          vendidoOportunidad: 0,
        };
        rows.set(key, row);
      }
      return row;
    };

    for (const line of lines) {
      const row = ensure(line.familyName, line.variantName);
      if (line.source === 'opportunity_sale') row.vendidoOportunidad += line.quantityUnits;
      else row.demandaConfirmada += line.quantityUnits;
    }
    for (const actual of actuals) {
      const row = ensure(actual.familyName, actual.variantName);
      row.produccionReal = (row.produccionReal ?? 0) + actual.quantityUnits;
    }
    for (const writeoff of writeoffs) {
      const row = ensure(writeoff.familyName, writeoff.variantName);
      row.bajaMerma += writeoff.quantityUnits;
    }

    for (const row of rows.values()) {
      row.produccionPlanificada = Math.ceil(row.demandaConfirmada * (1 + coefficientPercent / 100));
      const real = row.produccionReal ?? 0;
      row.excedenteEfectivo = Math.max(0, real - row.demandaConfirmada);
      row.disponible = Math.max(0, row.excedenteEfectivo - row.vendidoOportunidad - row.bajaMerma);
    }
    return rows;
  }

  public async surplusReport(cycleId: string) {
    const [cycle] = await this.database
      .select({ alias: salesCycles.alias, id: salesCycles.id })
      .from(salesCycles)
      .where(eq(salesCycles.id, cycleId))
      .limit(1);
    if (!cycle) throw new OperationsNotFoundError('Sales cycle not found');
    const coefficientPercent = await this.surplusCoefficientPercent(this.database);
    const rows = await this.surplusRows(this.database, cycleId);
    return {
      coefficientPercent,
      cycle,
      generatedAt: new Date(),
      items: [...rows.values()].sort(
        (a, b) =>
          a.familyName.localeCompare(b.familyName) || a.variantName.localeCompare(b.variantName),
      ),
    };
  }

  // Called from order creation when `source === 'opportunity_sale'`: the same computation the
  // surplus report shows, so the operator cannot sell more than the report says is available.
  private async assertOpportunitySaleAvailability(
    transaction: DatabaseTransaction,
    cycleId: string,
    items: readonly ResolvedOrderItem[],
  ) {
    const requested = new Map<string, number>();
    for (const item of items) {
      const key = surplusKey(item.productNameSnapshot, item.variantSnapshot);
      requested.set(key, (requested.get(key) ?? 0) + item.quantityUnits);
    }
    const rows = await this.surplusRows(transaction, cycleId);
    for (const [key, quantity] of requested) {
      const [familyName, variantName] = parseSurplusKey(key);
      const available = rows.get(key)?.disponible ?? 0;
      if (quantity > available) {
        throw new OperationsConflictError(
          `No hay excedente disponible de ${familyName} ${variantName} para una venta de ` +
            `oportunidad (disponible: ${available}, pedido: ${quantity}).`,
        );
      }
    }
  }

  // "Dar de baja remanente": excedente that will not sell, removed from what future opportunity
  // sales can draw from. Never carried to the next cycle — nothing here reads across `salesCycleId`.
  public async writeOffSurplus(
    cycleId: string,
    entries: readonly {
      familyName: string;
      quantityUnits: number;
      reason: string;
      variantName: string;
    }[],
    context: OperationsContext,
  ) {
    if (entries.length === 0) throw new OperationsConflictError('Informá al menos una baja.');
    return this.database
      .transaction(async (transaction) => {
        const [cycle] = await transaction
          .select({ id: salesCycles.id })
          .from(salesCycles)
          .where(eq(salesCycles.id, cycleId))
          .limit(1);
        if (!cycle) throw new OperationsNotFoundError('Sales cycle not found');

        const rows = await this.surplusRows(transaction, cycleId);
        for (const entry of entries) {
          const key = surplusKey(entry.familyName, entry.variantName);
          const row = rows.get(key);
          const available = row?.disponible ?? 0;
          if (entry.quantityUnits > available) {
            throw new OperationsConflictError(
              `No hay suficiente excedente disponible de ${entry.familyName} ${entry.variantName} ` +
                `(disponible: ${available}).`,
            );
          }
          // Reflected locally so a second entry for the same pair in this call cannot double-spend it.
          if (row) row.disponible -= entry.quantityUnits;
        }

        await transaction.insert(surplusWriteoffs).values(
          entries.map((entry) => ({
            actorUserId: context.actorUserId ?? null,
            familyName: entry.familyName,
            quantityUnits: entry.quantityUnits,
            reason: entry.reason,
            salesCycleId: cycleId,
            variantName: entry.variantName,
          })),
        );

        const audit = new AuditService(new PostgresAuditSink(transaction));
        await audit.record({
          action: 'surplus.written_off',
          actor: auditActor(context),
          after: { entries: [...entries] },
          correlationId: context.correlationId,
          entityId: cycleId,
          entityType: 'sales_cycle',
          requestId: context.requestId,
          source: context.source,
        });

        const refreshed = await this.surplusRows(transaction, cycleId);
        return [...refreshed.values()].sort(
          (a, b) =>
            a.familyName.localeCompare(b.familyName) || a.variantName.localeCompare(b.variantName),
        );
      })
      .catch(translateDatabaseConflict);
  }

  // "Estadísticas": decision-making rollups over orders. A cancelled order was never real demand,
  // so it's excluded everywhere here — the same posture the rest of the app takes (e.g. it's
  // filtered out of "Tomar y confirmar pedidos"'s in-motion list). Grouped by sales cycle rather
  // than by the individual weeklyMenu row, since a cycle's regional distributions are separate
  // weeklyMenu rows sharing one alias — "por semana" is the meaningful decision-making unit, not
  // "por copia regional del menú".
  public async getStatsOverview(filters: {
    from?: string | undefined;
    operatingSiteId?: string | undefined;
    to?: string | undefined;
  }) {
    const scope = and(
      ne(orders.status, 'CANCELLED'),
      filters.from ? gte(orders.deliveryDate, filters.from) : undefined,
      filters.to ? lte(orders.deliveryDate, filters.to) : undefined,
      filters.operatingSiteId ? eq(orders.operatingSiteId, filters.operatingSiteId) : undefined,
    );

    const [globalTotals] = await this.database
      .select({
        orderCount: sql<number>`count(*)`,
        revenueMinor: sql<number>`coalesce(sum(${orders.totalMinor}), 0)`,
      })
      .from(orders)
      .where(scope);

    const statusBreakdown = await this.database
      .select({ count: sql<number>`count(*)`, status: orders.status })
      .from(orders)
      .where(scope)
      .groupBy(orders.status);

    const byZone = await this.database
      .select({
        operatingSiteId: orders.operatingSiteId,
        operatingSiteName: operatingSites.displayName,
        orderCount: sql<number>`count(*)`,
        revenueMinor: sql<number>`coalesce(sum(${orders.totalMinor}), 0)`,
      })
      .from(orders)
      .innerJoin(operatingSites, eq(operatingSites.id, orders.operatingSiteId))
      .where(scope)
      .groupBy(orders.operatingSiteId, operatingSites.displayName)
      .orderBy(desc(sql`sum(${orders.totalMinor})`));

    const byCycle = await this.database
      .select({
        cycleAlias: salesCycles.alias,
        orderCount: sql<number>`count(*)`,
        revenueMinor: sql<number>`coalesce(sum(${orders.totalMinor}), 0)`,
        salesCycleId: orders.salesCycleId,
      })
      .from(orders)
      .innerJoin(salesCycles, eq(salesCycles.id, orders.salesCycleId))
      .where(scope)
      .groupBy(orders.salesCycleId, salesCycles.alias)
      .orderBy(desc(sql`sum(${orders.totalMinor})`));

    const bySize = await this.database
      .select({
        revenueMinor: sql<number>`coalesce(sum(${orderItems.totalMinor}), 0)`,
        sizeName: orderItems.variantSnapshot,
        units: sql<number>`coalesce(sum(${orderItems.quantityUnits}), 0)`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(scope)
      .groupBy(orderItems.variantSnapshot)
      .orderBy(desc(sql`sum(${orderItems.totalMinor})`));

    const orderCount = Number(globalTotals?.orderCount ?? 0);
    const revenueMinor = Number(globalTotals?.revenueMinor ?? 0);

    return {
      byCycle: byCycle.map((row) => ({
        ...row,
        orderCount: Number(row.orderCount),
        revenueMinor: Number(row.revenueMinor),
      })),
      bySize: bySize.map((row) => ({
        ...row,
        revenueMinor: Number(row.revenueMinor),
        units: Number(row.units),
      })),
      byZone: byZone.map((row) => ({
        ...row,
        orderCount: Number(row.orderCount),
        revenueMinor: Number(row.revenueMinor),
      })),
      global: {
        averageOrderValueMinor: orderCount > 0 ? Math.round(revenueMinor / orderCount) : 0,
        currency: 'ARS',
        orderCount,
        revenueMinor,
        statusBreakdown: statusBreakdown.map((row) => ({ ...row, count: Number(row.count) })),
      },
    };
  }
}
