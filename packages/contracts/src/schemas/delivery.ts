import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

export const DeliveryStopStatusSchema = z.enum([
  'pending',
  'en_route',
  'at_address',
  'delivered',
  'skipped',
]);

export const DeliveryRouteStatusSchema = z.enum(['draft', 'published', 'completed']);

export const DeliveryTriggerActionSchema = z.enum(['ON_MY_WAY', 'AT_ADDRESS', 'DELIVERED_THANKS']);

export const DeliveryRouteCreateRequestSchema = z.object({
  deliveryDate: z.iso.date(),
  label: z.string().trim().max(120).optional(),
  operatingSiteId: UuidSchema,
});

export const DeliveryStopSchema = z.object({
  assignedUserDisplayName: z.string().nullable(),
  assignedUserId: UuidSchema.nullable(),
  customerDisplayName: z.string(),
  deliveredAt: IsoDateTimeSchema.nullable(),
  deliveryAddress: z.string(),
  id: UuidSchema,
  orderId: UuidSchema,
  paymentExpectation: z.string(),
  publicNumber: z.string(),
  sequence: z.number().int(),
  status: DeliveryStopStatusSchema,
  totalMinor: z.number().int(),
});

export const DeliveryRouteDetailSchema = z.object({
  createdByUserId: UuidSchema.nullable(),
  deliveryDate: z.iso.date(),
  id: UuidSchema,
  label: z.string().nullable(),
  operatingSiteId: UuidSchema,
  publishedAt: IsoDateTimeSchema.nullable(),
  status: DeliveryRouteStatusSchema,
  stops: z.array(DeliveryStopSchema),
});

export const DeliveryRouteSummarySchema = z.object({
  deliveryDate: z.iso.date(),
  id: UuidSchema,
  label: z.string().nullable(),
  operatingSiteId: UuidSchema,
  publishedAt: IsoDateTimeSchema.nullable(),
  status: DeliveryRouteStatusSchema,
  stopCount: z.number().int(),
});

export const DeliveryRouteListResponseSchema = z.object({
  items: z.array(DeliveryRouteSummarySchema),
});

export const DeliveryStopAssignRequestSchema = z.object({
  assignedUserId: UuidSchema.nullable(),
});

export const DeliveryStopReorderRequestSchema = z.object({
  stopIds: z.array(UuidSchema).min(1),
});

export const DeliveryStopStatusUpdateRequestSchema = z.object({
  status: DeliveryStopStatusSchema,
});

export const DeliveryTriggerRequestSchema = z.object({
  action: DeliveryTriggerActionSchema,
});

export const DeliveryTriggerResponseSchema = z.object({
  reason: z.string().optional(),
  sent: z.boolean(),
});

export const DeliveryMyStopSchema = z.object({
  customerFirstName: z.string(),
  deliveryAddress: z.string(),
  deliveryLocationUrl: z.string().nullable(),
  id: UuidSchema,
  paymentExpectation: z.string(),
  publicNumber: z.string(),
  routeId: UuidSchema,
  sequence: z.number().int(),
  status: DeliveryStopStatusSchema,
  totalMinor: z.number().int(),
});

export const DeliveryMyStopListResponseSchema = z.object({
  items: z.array(DeliveryMyStopSchema),
});

export type DeliveryRouteCreateRequest = z.infer<typeof DeliveryRouteCreateRequestSchema>;
export type DeliveryStopAssignRequest = z.infer<typeof DeliveryStopAssignRequestSchema>;
export type DeliveryStopReorderRequest = z.infer<typeof DeliveryStopReorderRequestSchema>;
export type DeliveryStopStatusUpdateRequest = z.infer<typeof DeliveryStopStatusUpdateRequestSchema>;
export type DeliveryTriggerRequest = z.infer<typeof DeliveryTriggerRequestSchema>;
