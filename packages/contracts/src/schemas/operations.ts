import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

const RequiredTextSchema = z.string().trim().min(1).max(200);
const OptionalTextSchema = z.string().trim().max(500).optional();
const ConfigurableKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z][a-zA-Z0-9_.-]*$/);

export const OrderStatusSchema = z.enum(['DRAFT', 'CONFIRMED', 'READY', 'DELIVERED', 'CANCELLED']);
export const OrderSourceSchema = z.enum([
  'web',
  'whatsapp',
  'instagram',
  'facebook',
  'email',
  'phone',
  'manual',
  'opportunity_sale',
  // Referral ("recomendación") — a distinct origin from opportunity_sale, which stays load-bearing
  // for surplus stock validation and the "vendido por oportunidad" report metric.
  'referral',
]);

export const CustomerIdentityCreateRequestSchema = z.object({
  primary: z.boolean().default(false),
  source: ConfigurableKeySchema.default('manual'),
  type: ConfigurableKeySchema,
  value: z.string().trim().min(1).max(320),
  verified: z.boolean().default(false),
});

export const CustomerIdentityUpdateRequestSchema = z
  .object({
    active: z.boolean().optional(),
    primary: z.boolean().optional(),
    value: z.string().trim().min(1).max(320).optional(),
    verified: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No hay cambios para aplicar.' });

const CustomerAddressFieldsSchema = z.object({
  accessNotes: z.string().trim().max(1_000).optional(),
  // Written locality: descriptive, and may name a town other than the operation itself.
  city: z.string().trim().max(120).optional(),
  geocodingStatus: ConfigurableKeySchema.default('NEEDS_LOCATION'),
  // Mandatory operational anchor (ADR-031).
  geographicZoneId: UuidSchema,
  label: RequiredTextSchema,
  latitude: z.number().min(-90).max(90).optional(),
  locationUrl: z.url().max(2_000).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  operationalZone: z.string().trim().max(120).optional(),
  primary: z.boolean().default(false),
  propertyType: z.string().trim().max(80).optional(),
  sector: z.string().trim().max(120).optional(),
  source: ConfigurableKeySchema.default('manual'),
  unit: z.string().trim().max(80).optional(),
  writtenAddress: z.string().trim().min(4).max(500),
});

export const CustomerAddressCreateRequestSchema = CustomerAddressFieldsSchema.refine(
  (value) =>
    (value.latitude === undefined && value.longitude === undefined) ||
    (value.latitude !== undefined && value.longitude !== undefined),
  { message: 'Latitud y longitud deben informarse juntas.' },
);

export const CustomerAddressUpdateRequestSchema = z
  .object({
    accessNotes: z.string().trim().max(1_000).nullable().optional(),
    active: z.boolean().optional(),
    city: z.string().trim().max(120).nullable().optional(),
    geocodingStatus: ConfigurableKeySchema.optional(),
    label: RequiredTextSchema.optional(),
    latitude: z.number().min(-90).max(90).nullable().optional(),
    locationUrl: z.url().max(2_000).nullable().optional(),
    longitude: z.number().min(-180).max(180).nullable().optional(),
    operationalZone: z.string().trim().max(120).nullable().optional(),
    primary: z.boolean().optional(),
    propertyType: z.string().trim().max(80).nullable().optional(),
    sector: z.string().trim().max(120).nullable().optional(),
    source: ConfigurableKeySchema.optional(),
    unit: z.string().trim().max(80).nullable().optional(),
    writtenAddress: z.string().trim().min(4).max(500).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No hay cambios para aplicar.' })
  .refine(
    (value) =>
      (value.latitude === undefined && value.longitude === undefined) ||
      (value.latitude !== undefined && value.longitude !== undefined),
    { message: 'Latitud y longitud deben informarse juntas.' },
  );

export const CustomerPreferenceCreateRequestSchema = z.object({
  category: ConfigurableKeySchema,
  source: ConfigurableKeySchema.default('manual'),
  value: z.string().trim().min(1).max(500),
});

export const CustomerPreferenceUpdateRequestSchema = z
  .object({
    active: z.boolean().optional(),
    category: ConfigurableKeySchema.optional(),
    value: z.string().trim().min(1).max(500).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No hay cambios para aplicar.' });

export const CustomerRestrictionCreateRequestSchema = z.object({
  reason: z.string().trim().min(3).max(1_000),
  type: ConfigurableKeySchema,
});

export const CustomerRestrictionUpdateRequestSchema = z.object({
  active: z.boolean(),
  reason: z.string().trim().min(3).max(1_000).optional(),
});

export const CustomerCreateRequestSchema = z.object({
  addresses: z.array(CustomerAddressCreateRequestSchema).max(20).default([]),
  displayName: RequiredTextSchema,
  email: z.email().max(320).optional(),
  firstName: z.string().trim().max(100).optional(),
  identities: z.array(CustomerIdentityCreateRequestSchema).max(20).default([]),
  internalNotes: z.string().trim().max(5_000).optional(),
  lastName: z.string().trim().max(100).optional(),
  phone: z
    .string()
    .trim()
    .min(6)
    .max(40)
    .refine((value) => value.replace(/\D/g, '').length >= 6, {
      message: 'El teléfono debe contener al menos seis dígitos.',
    })
    .optional(),
  // Dietary restrictions checked at intake time (e.g. "sin ajo"/"sin semillas") — the type is free
  // text like every other configurable key in this domain, never a hardcoded enum.
  restrictions: z.array(CustomerRestrictionCreateRequestSchema).max(20).default([]),
});

/** A normalized row received from the contact spreadsheet importer. */
export const CustomerImportRequestSchema = z.object({
  customers: z.array(CustomerCreateRequestSchema).min(1).max(500),
});

export const CustomerImportResponseSchema = z.object({
  imported: z.number().int().nonnegative(),
});

export const CustomerUpdateRequestSchema = z
  .object({
    displayName: RequiredTextSchema.optional(),
    firstName: z.string().trim().max(100).nullable().optional(),
    internalNotes: z.string().trim().max(5_000).nullable().optional(),
    lastName: z.string().trim().max(100).nullable().optional(),
    status: ConfigurableKeySchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No hay cambios para aplicar.' });

export const CustomerListQuerySchema = z.object({
  cursor: UuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().trim().max(200).optional(),
  status: ConfigurableKeySchema.optional(),
});

/** Same filters as the list, minus paging (an export walks every page) plus the column choice. */
export const CustomerExportQuerySchema = z.object({
  // Comma-separated column keys, validated against the server's catalog rather than here: the
  // catalog is what knows how to render each one, so it owns which keys are real.
  columns: z.string().trim().max(2_000).optional(),
  search: z.string().trim().max(200).optional(),
  status: ConfigurableKeySchema.optional(),
});

export const CustomerSummarySchema = z.object({
  createdAt: IsoDateTimeSchema,
  displayName: z.string(),
  email: z.string().nullable().optional(),
  id: UuidSchema,
  phone: z.string().nullable().optional(),
  whatsapp: z.string().nullable().optional(),
  status: z.string(),
});

export const CustomerListResponseSchema = z.object({
  items: z.array(CustomerSummarySchema),
  nextCursor: UuidSchema.nullable().default(null),
});

export const CustomerIdentitySchema = z.object({
  active: z.boolean(),
  createdAt: IsoDateTimeSchema,
  id: UuidSchema,
  primary: z.boolean(),
  source: z.string(),
  type: z.string(),
  value: z.string(),
  verified: z.boolean(),
});

export const CustomerAddressSchema = z.object({
  accessNotes: z.string().nullable(),
  active: z.boolean(),
  city: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  geocodingStatus: z.string(),
  geographicZoneId: UuidSchema,
  id: UuidSchema,
  label: z.string(),
  latitude: z.number().nullable(),
  locationUrl: z.string().nullable(),
  longitude: z.number().nullable(),
  operationalZone: z.string().nullable(),
  primary: z.boolean(),
  propertyType: z.string().nullable(),
  sector: z.string().nullable(),
  source: z.string(),
  unit: z.string().nullable(),
  writtenAddress: z.string(),
});

export const AddressGeocodingCreateRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const GeocodingCandidateSchema = z.object({
  city: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  formattedAddress: z.string(),
  id: UuidSchema,
  latitude: z.number().min(-90).max(90),
  locationUrl: z.string().nullable(),
  longitude: z.number().min(-180).max(180),
  sector: z.string().nullable(),
});

export const GeocodingRequestStatusSchema = z.enum([
  'PENDING',
  'CANDIDATES',
  'NO_MATCH',
  'FAILED',
  'CONFIRMED',
  'REJECTED',
  'SUPERSEDED',
]);

export const AddressGeocodingRequestSchema = z.object({
  candidates: z.array(GeocodingCandidateSchema),
  createdAt: IsoDateTimeSchema,
  errorCode: z.string().nullable(),
  id: UuidSchema,
  providerKey: z.string(),
  selectedCandidateId: UuidSchema.nullable(),
  status: GeocodingRequestStatusSchema,
  updatedAt: IsoDateTimeSchema,
});

export const AddressGeocodingConfirmRequestSchema = z
  .object({
    candidateId: UuidSchema.optional(),
    city: z.string().trim().max(120).nullable().optional(),
    latitude: z.number().min(-90).max(90).optional(),
    locationUrl: z.url().max(2_000).nullable().optional(),
    longitude: z.number().min(-180).max(180).optional(),
    operationalZone: z.string().trim().min(1).max(120).nullable().optional(),
    sector: z.string().trim().max(120).nullable().optional(),
  })
  .refine(
    (value) =>
      value.candidateId !== undefined ||
      (value.latitude !== undefined && value.longitude !== undefined),
    { message: 'Seleccioná un candidato o indicá coordenadas corregidas.' },
  )
  .refine(
    (value) =>
      (value.latitude === undefined && value.longitude === undefined) ||
      (value.latitude !== undefined && value.longitude !== undefined),
    { message: 'Latitud y longitud deben informarse juntas.' },
  );

export const AddressGeocodingRejectRequestSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const CustomerPreferenceSchema = z.object({
  active: z.boolean(),
  category: z.string(),
  createdAt: IsoDateTimeSchema,
  id: UuidSchema,
  source: z.string(),
  value: z.string(),
});

export const CustomerRestrictionSchema = z.object({
  active: z.boolean(),
  createdAt: IsoDateTimeSchema,
  id: UuidSchema,
  reason: z.string(),
  resolvedAt: IsoDateTimeSchema.nullable(),
  type: z.string(),
});

export const CustomerOrderSummarySchema = z.object({
  createdAt: IsoDateTimeSchema,
  currency: z.string(),
  deliveryDate: z.iso.date(),
  id: UuidSchema,
  publicNumber: z.string(),
  status: OrderStatusSchema,
  totalMinor: z.number().int(),
});

export const CustomerDetailSchema = CustomerSummarySchema.extend({
  addresses: z.array(CustomerAddressSchema).optional(),
  firstName: z.string().nullable(),
  identities: z.array(CustomerIdentitySchema).optional(),
  internalNotes: z.string().nullable().optional(),
  lastName: z.string().nullable(),
  orders: z.array(CustomerOrderSummarySchema),
  preferences: z.array(CustomerPreferenceSchema).optional(),
  restrictions: z.array(CustomerRestrictionSchema).optional(),
  updatedAt: IsoDateTimeSchema,
});

// "Mi cuenta" self-service: everything in CustomerDetailSchema is the customer's own data (their
// addresses, identities, dietary restrictions) except `internalNotes`, which is free-text staff
// annotation about the customer (gated behind customers.view_sensitive for staff) and was never
// meant for the subject to read.
export const CustomerSelfServiceSchema = CustomerDetailSchema.omit({ internalNotes: true });

// One price per size for the whole week. The variety never changes the price (ADR-030).
export const MenuSizePriceInputSchema = z.object({
  currency: z.string().trim().length(3).default('ARS'),
  mealsPerUnit: z.number().int().min(1).max(20).default(5),
  sizeName: z.string().trim().min(1).max(40),
  unitPriceMinor: z.number().int().nonnegative(),
});

// "Precios por ubicación": editing just the price for a size on one already-distributed menu — a
// narrower, lighter-weight sibling of MenuCreateRequestSchema (no offerings/dishes/dates involved).
export const MenuPricesUpdateRequestSchema = z.object({
  prices: z
    .array(
      z.object({
        sizeName: z.string().trim().min(1).max(40),
        unitPriceMinor: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(20),
});

export const MenuOfferingInputSchema = z.object({
  // A composable variety has no fixed five dishes; the customer picks from the published universe
  // (every dish published this week for the same size), so it submits none of its own.
  composable: z.boolean().default(false),
  // Free text shown to the customer on the public menu for this variety, this week only — nothing
  // carries over between weeks, same as prices.
  description: z.string().trim().max(500).nullable().optional(),
  dishes: z.array(RequiredTextSchema).max(5),
  familyName: RequiredTextSchema,
  // Deliberate per-variety exception; omitted means the size price applies.
  overridePriceMinor: z.number().int().nonnegative().optional(),
  sizeName: z.string().trim().min(1).max(40),
});

export const MenuCreateRequestSchema = z
  .object({
    alias: z.string().trim().min(1).max(80),
    closeAt: IsoDateTimeSchema,
    offerings: z.array(MenuOfferingInputSchema).min(1).max(100),
    openAt: IsoDateTimeSchema,
    partialKitchenCutoffAt: IsoDateTimeSchema,
    prices: z.array(MenuSizePriceInputSchema).min(1).max(20),
  })
  .refine(
    (value) =>
      new Date(value.openAt) < new Date(value.partialKitchenCutoffAt) &&
      new Date(value.partialKitchenCutoffAt) < new Date(value.closeAt),
    { message: 'Los horarios del ciclo deben estar en orden cronológico.' },
  )
  .refine(
    (value) => new Set(value.prices.map((price) => price.sizeName)).size === value.prices.length,
    { message: 'Cada tamaño puede tener un solo precio por semana.' },
  )
  .refine(
    (value) => {
      const priced = new Set(value.prices.map((price) => price.sizeName));
      return value.offerings.every((offering) => priced.has(offering.sizeName));
    },
    { message: 'Cada variedad debe usar un tamaño con precio definido.' },
  )
  .refine(
    (value) =>
      value.offerings.every((offering) =>
        offering.composable ? offering.dishes.length === 0 : offering.dishes.length === 5,
      ),
    {
      message:
        'Las variedades fijas necesitan exactamente cinco platos; el menú personalizado no define platos propios.',
    },
  )
  .refine((value) => value.offerings.filter((offering) => offering.composable).length <= 1, {
    message: 'Solo puede haber un menú personalizado (Intuitivo) por semana.',
  });

export const MenuOfferingSchema = z.object({
  composable: z.boolean(),
  currency: z.string(),
  description: z.string().nullable(),
  dishes: z.array(z.string()),
  familyName: z.string(),
  id: UuidSchema,
  mealsPerUnit: z.number().int(),
  priceOverridden: z.boolean(),
  sizeName: z.string(),
  unitPriceMinor: z.number().int(),
  variantName: z.string(),
});

export const WeeklyMenuSchema = z.object({
  cycle: z.object({
    alias: z.string(),
    closeAt: IsoDateTimeSchema,
    id: UuidSchema,
    openAt: IsoDateTimeSchema,
    partialKitchenCutoffAt: IsoDateTimeSchema,
    status: z.string(),
  }),
  id: UuidSchema,
  offerings: z.array(MenuOfferingSchema),
  // Null means the global master revision.
  operatingSiteId: UuidSchema.nullable(),
  operatingSiteName: z.string().nullable(),
  publishedAt: IsoDateTimeSchema.nullable(),
  revision: z.number().int().positive(),
  sourceMenuId: UuidSchema.nullable(),
  status: z.string(),
});

export const MenuListResponseSchema = z.object({ items: z.array(WeeklyMenuSchema) });

// Distribution materialises a regional revision per operation; it never merges global and regional
// at order time (ADR-028).
export const MenuDistributeRequestSchema = z
  .object({
    confirmedReplace: z.boolean().default(false),
    mode: z.enum(['CREATE_MISSING', 'UPDATE_UNCUSTOMIZED', 'REPLACE']),
    operatingSiteIds: z.array(UuidSchema).min(1).max(50),
  })
  .refine((value) => value.mode !== 'REPLACE' || value.confirmedReplace, {
    message: 'Reemplazar personalizaciones regionales requiere confirmación explícita.',
  });

export const MenuDistributionResponseSchema = z.object({
  results: z.array(
    z.object({
      operatingSiteId: UuidSchema,
      outcome: z.enum([
        'CREATED',
        'REFRESHED',
        'REPLACED',
        'SKIPPED_EXISTING',
        'SKIPPED_PUBLISHED',
      ]),
      preservedCustomizations: z.number().int().nonnegative().optional(),
      weeklyMenuId: UuidSchema,
    }),
  ),
});

export const IdParamSchema = z.object({ id: UuidSchema });
export const CustomerRelationParamSchema = z.object({
  customerId: UuidSchema,
  relationId: UuidSchema,
});
export const CustomerAddressParamSchema = z.object({
  addressId: UuidSchema,
  customerId: UuidSchema,
});
export const AddressGeocodingParamSchema = z.object({
  addressId: UuidSchema,
  customerId: UuidSchema,
  requestId: UuidSchema,
});
export const CycleIdParamSchema = z.object({ cycleId: UuidSchema });

export const OrderItemInputSchema = z.object({
  offeringId: UuidSchema,
  quantityUnits: z.number().int().min(1).max(1_000),
  selectedDishNames: z.array(RequiredTextSchema).length(5).optional(),
});

export const OrderCreateRequestSchema = z.object({
  customerId: UuidSchema,
  deliveryAddressId: UuidSchema.optional(),
  deliveryAddress: z.string().trim().min(4).max(500),
  deliveryLocationUrl: z.url().max(2_000).optional(),
  deliveryDate: z.iso.date(),
  dietaryInstructions: z.array(RequiredTextSchema).max(20).default([]),
  items: z.array(OrderItemInputSchema).min(1).max(50),
  menuId: UuidSchema,
  notes: OptionalTextSchema,
  paymentExpectation: z.string().trim().min(1).max(80),
  source: OrderSourceSchema.default('manual'),
});

export const PublicOrderCreateRequestSchema = OrderCreateRequestSchema.omit({
  customerId: true,
}).extend({
  customer: CustomerCreateRequestSchema,
  // The visitor chooses the operation explicitly (ADR-031).
  operatingSiteSlug: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});

export const PublicOperatingSiteListResponseSchema = z.object({
  items: z.array(
    z.object({
      displayName: z.string(),
      slug: z.string(),
    }),
  ),
});

export const OrderTransitionRequestSchema = z.object({
  confirmedReversal: z.boolean().default(false),
  reason: z.string().trim().min(1).max(500).optional(),
  status: OrderStatusSchema,
});

export const OrderUpdateRequestSchema = z
  .object({
    deliveryAddress: z.string().trim().min(4).max(500).optional(),
    deliveryAddressId: UuidSchema.nullable().optional(),
    deliveryDate: z.iso.date().optional(),
    deliveryLocationUrl: z.url().max(2_000).nullable().optional(),
    dietaryInstructions: z.array(RequiredTextSchema).max(20).optional(),
    items: z.array(OrderItemInputSchema).min(1).max(50).optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    paymentExpectation: z.string().trim().min(1).max(80).optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .refine((value) => Object.keys(value).some((key) => key !== 'reason'), {
    message: 'No hay cambios para aplicar.',
  });

export const OrderSchema = z.object({
  createdAt: IsoDateTimeSchema,
  currency: z.string(),
  customer: z.object({ displayName: z.string(), id: UuidSchema }),
  deliveryAddress: z.string(),
  deliveryAddressId: UuidSchema.nullable(),
  deliveryDate: z.iso.date(),
  deliveryLocationUrl: z.string().nullable(),
  deliveryZone: z.string().nullable(),
  dietaryInstructions: z.array(z.string()),
  id: UuidSchema,
  items: z.array(
    z.object({
      dishSelections: z.array(z.string()),
      id: UuidSchema,
      productName: z.string(),
      quantityUnits: z.number().int(),
      totalMinor: z.number().int(),
      unitPriceMinor: z.number().int(),
      variantName: z.string(),
    }),
  ),
  menuId: UuidSchema,
  notes: z.string().nullable(),
  paymentExpectation: z.string(),
  publicNumber: z.string(),
  source: OrderSourceSchema,
  status: OrderStatusSchema,
  totalMinor: z.number().int(),
  updatedAt: IsoDateTimeSchema,
});

export const PublicOrderTrackRequestSchema = z.object({
  contact: z.string().trim().min(3).max(200),
  publicNumber: z.string().trim().min(1).max(40),
});

export const PublicOrderTrackResponseSchema = z.object({
  currency: z.string(),
  deliveryAddress: z.string(),
  deliveryDate: z.iso.date(),
  history: z.array(z.object({ at: IsoDateTimeSchema, status: OrderStatusSchema })),
  items: z.array(
    z.object({
      productName: z.string(),
      quantityUnits: z.number().int(),
      variantName: z.string(),
    }),
  ),
  notes: z.string().nullable(),
  publicNumber: z.string(),
  status: OrderStatusSchema,
  totalMinor: z.number().int(),
});

export const OrderListResponseSchema = z.object({ items: z.array(OrderSchema) });

export const OrderListQuerySchema = z
  .object({
    cursor: UuidSchema.optional(),
    customerId: UuidSchema.optional(),
    cycleId: UuidSchema.optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    search: z.string().trim().max(100).optional(),
    status: OrderStatusSchema.optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    zone: z.string().trim().max(120).optional(),
  })
  .refine((value) => !value.from || !value.to || new Date(value.from) <= new Date(value.to), {
    message: 'El rango de fechas no es válido.',
  });

export const OrderPageResponseSchema = z.object({
  items: z.array(OrderSchema),
  nextCursor: UuidSchema.nullable(),
});

export const OrderRevisionSchema = z.object({
  actorUserId: UuidSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  id: UuidSchema,
  reason: z.string(),
  revision: z.number().int().positive(),
  snapshot: OrderSchema,
});

export const OrderRevisionListResponseSchema = z.object({ items: z.array(OrderRevisionSchema) });

export const OrderStatusHistoryEntrySchema = z.object({
  actorUserId: UuidSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  fromStatus: OrderStatusSchema.nullable(),
  id: UuidSchema,
  reason: z.string().nullable(),
  toStatus: OrderStatusSchema,
});

export const OrderStatusHistoryResponseSchema = z.object({
  items: z.array(OrderStatusHistoryEntrySchema),
});

export const MessageTemplateUpsertRequestSchema = z.object({
  actionKey: ConfigurableKeySchema.nullable().optional(),
  active: z.boolean().default(true),
  body: z.string().trim().min(1).max(5_000),
  channel: ConfigurableKeySchema.default('whatsapp'),
  displayName: RequiredTextSchema,
  key: ConfigurableKeySchema,
  scopeReferenceId: z.string().trim().max(200).nullable().optional(),
  scopeType: ConfigurableKeySchema.default('global'),
  variables: z.array(ConfigurableKeySchema).max(50).default([]),
});

export const MessageTemplateSchema = MessageTemplateUpsertRequestSchema.extend({
  createdAt: IsoDateTimeSchema,
  id: UuidSchema,
  updatedAt: IsoDateTimeSchema,
});

export const MessageTemplateListResponseSchema = z.object({
  items: z.array(MessageTemplateSchema),
});

export const KitchenSummaryResponseSchema = z.object({
  base: z.array(
    z.object({
      exceptions: z.array(
        z.object({
          customerDisplayName: z.string(),
          dietaryInstructions: z.array(z.string()),
          orderPublicNumber: z.string(),
          quantityUnits: z.number().int(),
        }),
      ),
      familyName: z.string(),
      quantityUnits: z.number().int(),
      variantName: z.string(),
    }),
  ),
  custom: z.array(
    z.object({
      customerDisplayName: z.string(),
      dietaryInstructions: z.array(z.string()),
      dishSelections: z.array(z.string()),
      familyName: z.string(),
      orderPublicNumber: z.string(),
      quantityUnits: z.number().int(),
      sequence: z.number().int(),
      variantName: z.string(),
    }),
  ),
  cycle: z.object({ alias: z.string(), id: UuidSchema }),
  generatedAt: IsoDateTimeSchema,
  totalUnits: z.number().int(),
});

// One entry per physical unit (a line's quantityUnits expands into that many identical entries),
// never one entry per order line — that's the "una etiqueta por unidad física" decision.
// customerDisplayName is set only for composable (Intuitivo) units; a fixed variety's label never
// carries a name, per the "solo nombre + variedad/tamaño" decision.
export const LabelSchema = z.object({
  customerDisplayName: z.string().nullable(),
  familyName: z.string(),
  orderPublicNumber: z.string(),
  variantName: z.string(),
});

export const LabelListResponseSchema = z.object({ items: z.array(LabelSchema) });

export const LabelSettingsSchema = z.object({
  backgroundImageUrl: z.string().nullable(),
  id: UuidSchema.nullable(),
  labelsPerPage: z.number().int().min(4).max(12),
  updatedAt: IsoDateTimeSchema.nullable(),
  updatedByUserId: UuidSchema.nullable(),
});

export const LabelSettingsUpdateRequestSchema = z.object({
  backgroundImageUrl: z.string().url().nullable().optional(),
  labelsPerPage: z.number().int().min(4).max(12),
});

export const ProductionActualEntrySchema = z.object({
  familyName: z.string().trim().min(1).max(120),
  quantityUnits: z.number().int().nonnegative(),
  variantName: z.string().trim().min(1).max(40),
});

export const ProductionActualSchema = z.object({
  familyName: z.string(),
  quantityUnits: z.number().int(),
  reportedAt: IsoDateTimeSchema,
  reportedByUserId: UuidSchema.nullable(),
  variantName: z.string(),
});

export const ProductionReportRequestSchema = z.object({
  entries: z.array(ProductionActualEntrySchema).min(1).max(200),
});

export const ProductionActualListResponseSchema = z.object({
  items: z.array(ProductionActualSchema),
});

export const ProductionSnapshotKindSchema = z.enum(['partial', 'final']);

export const ProductionSnapshotRequestSchema = z.object({
  kind: ProductionSnapshotKindSchema,
});

const ProductionDeltaLineSchema = z.object({
  deltaUnits: z.number().int(),
  familyName: z.string(),
  quantityUnits: z.number().int(),
  variantName: z.string(),
});

export const ProductionSnapshotSchema = z.object({
  generatedAt: IsoDateTimeSchema,
  generatedByUserId: UuidSchema.nullable(),
  id: UuidSchema,
  kind: ProductionSnapshotKindSchema,
  payload: z.object({
    actuals: z.array(ProductionActualSchema),
    base: KitchenSummaryResponseSchema.shape.base,
    custom: KitchenSummaryResponseSchema.shape.custom,
    cycle: KitchenSummaryResponseSchema.shape.cycle,
    delta: z.array(ProductionDeltaLineSchema).nullable(),
    totalUnits: z.number().int(),
  }),
  salesCycleId: UuidSchema,
});

export const ProductionSnapshotListResponseSchema = z.object({
  items: z.array(ProductionSnapshotSchema),
});

export const SurplusItemSchema = z.object({
  bajaMerma: z.number().int(),
  demandaConfirmada: z.number().int(),
  disponible: z.number().int(),
  excedenteEfectivo: z.number().int(),
  familyName: z.string(),
  produccionPlanificada: z.number().int(),
  produccionReal: z.number().int().nullable(),
  variantName: z.string(),
  vendidoOportunidad: z.number().int(),
});

export const SurplusReportResponseSchema = z.object({
  coefficientPercent: z.number(),
  cycle: z.object({ alias: z.string(), id: UuidSchema }),
  generatedAt: IsoDateTimeSchema,
  items: z.array(SurplusItemSchema),
});

export const SurplusConfigSchema = z.object({
  // A postgres numeric column round-trips as a string; coerced here so the API always answers with
  // a number regardless of whether the value came straight from the DB row or was computed in JS.
  coefficientPercent: z.coerce.number(),
});

export const SurplusConfigUpdateRequestSchema = z.object({
  coefficientPercent: z.number().min(0).max(100),
});

export const MenuCatalogSettingsSchema = z.object({
  intuitivoEnabled: z.boolean(),
  operatingSiteId: UuidSchema,
  operatingSiteName: z.string(),
});

export const MenuCatalogSettingsListResponseSchema = z.object({
  items: z.array(MenuCatalogSettingsSchema),
});

export const MenuCatalogSettingsUpdateRequestSchema = z.object({
  intuitivoEnabled: z.boolean(),
});

export const SurplusWriteoffEntrySchema = z.object({
  familyName: z.string().trim().min(1).max(120),
  quantityUnits: z.number().int().positive(),
  reason: z.string().trim().min(1).max(300),
  variantName: z.string().trim().min(1).max(40),
});

export const SurplusWriteoffRequestSchema = z.object({
  entries: z.array(SurplusWriteoffEntrySchema).min(1).max(200),
});

export type CustomerCreateRequest = z.infer<typeof CustomerCreateRequestSchema>;
export type CustomerImportRequest = z.infer<typeof CustomerImportRequestSchema>;
export type CustomerUpdateRequest = z.infer<typeof CustomerUpdateRequestSchema>;
export type CustomerIdentityCreateRequest = z.infer<typeof CustomerIdentityCreateRequestSchema>;
export type CustomerIdentityUpdateRequest = z.infer<typeof CustomerIdentityUpdateRequestSchema>;
export type CustomerAddressCreateRequest = z.infer<typeof CustomerAddressCreateRequestSchema>;
export type CustomerAddressUpdateRequest = z.infer<typeof CustomerAddressUpdateRequestSchema>;
export type AddressGeocodingCreateRequest = z.infer<typeof AddressGeocodingCreateRequestSchema>;
export type AddressGeocodingConfirmRequest = z.infer<typeof AddressGeocodingConfirmRequestSchema>;
export type AddressGeocodingRejectRequest = z.infer<typeof AddressGeocodingRejectRequestSchema>;
export type CustomerPreferenceCreateRequest = z.infer<typeof CustomerPreferenceCreateRequestSchema>;
export type CustomerPreferenceUpdateRequest = z.infer<typeof CustomerPreferenceUpdateRequestSchema>;
export type CustomerRestrictionCreateRequest = z.infer<
  typeof CustomerRestrictionCreateRequestSchema
>;
export type CustomerRestrictionUpdateRequest = z.infer<
  typeof CustomerRestrictionUpdateRequestSchema
>;
export type CustomerListQuery = z.infer<typeof CustomerListQuerySchema>;
export type CustomerSummary = z.infer<typeof CustomerSummarySchema>;
export type MessageTemplateUpsertRequest = z.infer<typeof MessageTemplateUpsertRequestSchema>;
export type MenuCreateRequest = z.infer<typeof MenuCreateRequestSchema>;
export type MenuDistributeRequest = z.infer<typeof MenuDistributeRequestSchema>;
export type MenuPricesUpdateRequest = z.infer<typeof MenuPricesUpdateRequestSchema>;
export type WeeklyMenu = z.infer<typeof WeeklyMenuSchema>;
export type OrderCreateRequest = z.infer<typeof OrderCreateRequestSchema>;
export type PublicOrderCreateRequest = z.infer<typeof PublicOrderCreateRequestSchema>;
export type PublicOrderTrackRequest = z.infer<typeof PublicOrderTrackRequestSchema>;
export type PublicOrderTrackResponse = z.infer<typeof PublicOrderTrackResponseSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type OrderTransitionRequest = z.infer<typeof OrderTransitionRequestSchema>;
export type OrderUpdateRequest = z.infer<typeof OrderUpdateRequestSchema>;
export type OrderListQuery = z.infer<typeof OrderListQuerySchema>;
export type KitchenSummaryResponse = z.infer<typeof KitchenSummaryResponseSchema>;
export type Label = z.infer<typeof LabelSchema>;
export type LabelListResponse = z.infer<typeof LabelListResponseSchema>;
export type LabelSettings = z.infer<typeof LabelSettingsSchema>;
export type LabelSettingsUpdateRequest = z.infer<typeof LabelSettingsUpdateRequestSchema>;
export type ProductionReportRequest = z.infer<typeof ProductionReportRequestSchema>;
export type ProductionSnapshotRequest = z.infer<typeof ProductionSnapshotRequestSchema>;
export type SurplusConfigUpdateRequest = z.infer<typeof SurplusConfigUpdateRequestSchema>;
export type SurplusWriteoffRequest = z.infer<typeof SurplusWriteoffRequestSchema>;
