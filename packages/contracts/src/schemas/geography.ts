import { z } from 'zod';

import { UuidSchema } from './common.js';

const SlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const ContactSchema = z.string().trim().min(1).max(320);

export const OrderPrefixSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{1,8}$/);

const OperatingSiteFieldsSchema = z.object({
  active: z.boolean(),
  coverImageUrl: z.url().max(2_000).optional(),
  displayName: z.string().trim().min(2).max(120),
  orderPrefix: OrderPrefixSchema,
  publicEmail: z.email().max(320).optional(),
  publicPhone: ContactSchema.optional(),
  publicWhatsapp: ContactSchema.optional(),
  slug: SlugSchema,
  sortOrder: z.number().int().min(0),
  timezone: z.string().trim().min(1).max(100),
});

export const OperatingSiteCreateRequestSchema = OperatingSiteFieldsSchema.extend({
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
  timezone: z.string().trim().min(1).max(100).default('America/Argentina/Buenos_Aires'),
});

export const OperatingSiteUpdateRequestSchema = OperatingSiteFieldsSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: 'No hay cambios para aplicar.' },
);

const GeographicZoneFieldsSchema = z.object({
  active: z.boolean(),
  coverageDescription: z.string().trim().max(1_000).optional(),
  coverImageUrl: z.url().max(2_000).optional(),
  displayName: z.string().trim().min(2).max(120),
  operatingSiteId: UuidSchema,
  publicPhoneOverride: ContactSchema.optional(),
  publicWhatsappOverride: ContactSchema.optional(),
  slug: SlugSchema,
  sortOrder: z.number().int().min(0),
});

export const GeographicZoneCreateRequestSchema = GeographicZoneFieldsSchema.extend({
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export const GeographicZoneUpdateRequestSchema = GeographicZoneFieldsSchema.omit({
  operatingSiteId: true,
})
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'No hay cambios para aplicar.',
  });

export const OperatingScopeSelectionSchema = z.object({
  operatingSiteId: UuidSchema,
});

export type OperatingSiteCreateRequest = z.infer<typeof OperatingSiteCreateRequestSchema>;
export type OperatingSiteUpdateRequest = z.infer<typeof OperatingSiteUpdateRequestSchema>;
export type GeographicZoneCreateRequest = z.infer<typeof GeographicZoneCreateRequestSchema>;
export type GeographicZoneUpdateRequest = z.infer<typeof GeographicZoneUpdateRequestSchema>;
