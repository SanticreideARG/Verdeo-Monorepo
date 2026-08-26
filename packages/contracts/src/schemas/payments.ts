import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

export const PaymentStatusSchema = z.enum(['PENDING', 'TO_SETTLE', 'PAID']);

export const PaymentSchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string(),
  customerDisplayName: z.string(),
  expectedMethod: z.string(),
  id: UuidSchema,
  orderId: UuidSchema,
  publicNumber: z.string(),
  status: PaymentStatusSchema,
});

export const PaymentListResponseSchema = z.object({ items: z.array(PaymentSchema) });

export const CashCollectionRequestSchema = z.object({
  amountMinor: z.number().int().positive(),
  method: z.string().trim().min(1).max(40),
});

export const CashCollectionSchema = z.object({
  amountMinor: z.number().int(),
  collectedAt: IsoDateTimeSchema,
  collectedByUserId: UuidSchema,
  id: UuidSchema,
  method: z.string(),
  orderId: UuidSchema,
  publicNumber: z.string().optional(),
});

export const CashCollectionListResponseSchema = z.object({
  items: z.array(CashCollectionSchema),
});

export const CashSettlementRequestSchema = z.object({
  receivedByUserId: UuidSchema,
});

export const PaymentsDashboardSchema = z.object({
  cashByRepartidor: z.array(
    z.object({
      amountMinor: z.number().int(),
      collectedByUserId: UuidSchema,
      collectorDisplayName: z.string(),
    }),
  ),
  paidTotalMinor: z.number().int(),
  pendingTotalMinor: z.number().int(),
  toSettleTotalMinor: z.number().int(),
});

// The admin-editable catalog behind "Método" pickers. isCash decides settlement routing when a
// collection is recorded under this code (see PostgresPaymentsService.recordCollection).
export const PaymentMethodSchema = z.object({
  active: z.boolean(),
  code: z.string(),
  displayName: z.string(),
  id: UuidSchema,
  isCash: z.boolean(),
  sortOrder: z.number().int(),
});

export const PaymentMethodListResponseSchema = z.object({
  items: z.array(PaymentMethodSchema),
});

// Wholesale replace: any existing code not present in the payload is deleted, matching the
// "Precios por ubicación" MenuPricesUpdateRequestSchema pattern for small admin-edited lists.
export const PaymentMethodsUpdateRequestSchema = z.object({
  methods: z
    .array(
      z.object({
        active: z.boolean().default(true),
        code: z.string().trim().min(1).max(40),
        displayName: z.string().trim().min(1).max(60),
        isCash: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(20),
});

export type CashCollectionRequest = z.infer<typeof CashCollectionRequestSchema>;
export type CashSettlementRequest = z.infer<typeof CashSettlementRequestSchema>;
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
export type PaymentMethodsUpdateRequest = z.infer<typeof PaymentMethodsUpdateRequestSchema>;
