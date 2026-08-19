import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

const RequiredTextSchema = z.string().trim().min(1).max(200);
const OptionalTextSchema = z.string().trim().max(500).optional();

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
]);

export const CustomerCreateRequestSchema = z.object({
  displayName: RequiredTextSchema,
  email: z.email().max(320).optional(),
  firstName: z.string().trim().max(100).optional(),
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
});

export const CustomerSummarySchema = z.object({
  createdAt: IsoDateTimeSchema,
  displayName: z.string(),
  email: z.string().nullable().optional(),
  id: UuidSchema,
  phone: z.string().nullable().optional(),
  status: z.string(),
});

export const CustomerListResponseSchema = z.object({ items: z.array(CustomerSummarySchema) });

export const MenuOfferingInputSchema = z.object({
  currency: z.string().trim().length(3).default('ARS'),
  dishes: z.array(RequiredTextSchema).length(5),
  familyName: RequiredTextSchema,
  mealsPerUnit: z.number().int().min(1).max(20).default(5),
  unitPriceMinor: z.number().int().nonnegative(),
  variantName: z.string().trim().min(1).max(40),
});

export const MenuCreateRequestSchema = z
  .object({
    alias: z.string().trim().min(1).max(80),
    closeAt: IsoDateTimeSchema,
    offerings: z.array(MenuOfferingInputSchema).min(1).max(100),
    openAt: IsoDateTimeSchema,
    partialKitchenCutoffAt: IsoDateTimeSchema,
  })
  .refine(
    (value) =>
      new Date(value.openAt) < new Date(value.partialKitchenCutoffAt) &&
      new Date(value.partialKitchenCutoffAt) < new Date(value.closeAt),
    { message: 'Los horarios del ciclo deben estar en orden cronológico.' },
  );

export const MenuOfferingSchema = z.object({
  currency: z.string(),
  dishes: z.array(z.string()),
  familyName: z.string(),
  id: UuidSchema,
  mealsPerUnit: z.number().int(),
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
  publishedAt: IsoDateTimeSchema.nullable(),
  revision: z.number().int().positive(),
  status: z.string(),
});

export const MenuListResponseSchema = z.object({ items: z.array(WeeklyMenuSchema) });

export const IdParamSchema = z.object({ id: UuidSchema });
export const CycleIdParamSchema = z.object({ cycleId: UuidSchema });

export const OrderItemInputSchema = z.object({
  offeringId: UuidSchema,
  quantityUnits: z.number().int().min(1).max(1_000),
  selectedDishNames: z.array(RequiredTextSchema).length(5).optional(),
});

export const OrderCreateRequestSchema = z.object({
  customerId: UuidSchema,
  deliveryAddress: z.string().trim().min(4).max(500),
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
});

export const OrderTransitionRequestSchema = z.object({
  confirmedReversal: z.boolean().default(false),
  reason: z.string().trim().min(1).max(500).optional(),
  status: OrderStatusSchema,
});

export const OrderSchema = z.object({
  createdAt: IsoDateTimeSchema,
  currency: z.string(),
  customer: z.object({ displayName: z.string(), id: UuidSchema }),
  deliveryAddress: z.string(),
  deliveryDate: z.iso.date(),
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

export const OrderListResponseSchema = z.object({ items: z.array(OrderSchema) });

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

export type CustomerCreateRequest = z.infer<typeof CustomerCreateRequestSchema>;
export type CustomerSummary = z.infer<typeof CustomerSummarySchema>;
export type MenuCreateRequest = z.infer<typeof MenuCreateRequestSchema>;
export type WeeklyMenu = z.infer<typeof WeeklyMenuSchema>;
export type OrderCreateRequest = z.infer<typeof OrderCreateRequestSchema>;
export type PublicOrderCreateRequest = z.infer<typeof PublicOrderCreateRequestSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type OrderTransitionRequest = z.infer<typeof OrderTransitionRequestSchema>;
export type KitchenSummaryResponse = z.infer<typeof KitchenSummaryResponseSchema>;
