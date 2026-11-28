import { z } from 'zod';

import { UuidSchema } from './common.js';

/*
 * Tags personalizables (TAGS_Y_STOCK_CON_NOMBRE_PLAN.md, 2026-11-28): "Sin semillas" y los que
 * vengan, en clientes, pedidos o ambos, con color, ciudades y cómo salen en cada planilla.
 */

/** La paleta de las pills: cada color tiene su versión clara y oscura en la app. */
export const TAG_COLORS = [
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
  'red',
  'orange',
  'amber',
  'brown',
  'gray',
] as const;
export const TagColorSchema = z.enum(TAG_COLORS);

export const TagTargetSchema = z.enum(['CUSTOMER', 'ORDER', 'BOTH']);
/** En una planilla: no sale, al final del nombre del cliente, o en una columna con ☐. */
export const TagSheetModeSchema = z.enum(['OFF', 'NAME', 'CHECK']);

export const TagSchema = z.object({
  active: z.boolean(),
  appliesTo: TagTargetSchema,
  color: z.string(),
  deliverySheet: TagSheetModeSchema,
  id: UuidSchema,
  name: z.string(),
  ordersSheet: TagSheetModeSchema,
  productionSheet: TagSheetModeSchema,
  /** Vacío: vale en todas las ciudades. */
  siteIds: z.array(UuidSchema),
  sortOrder: z.number().int(),
});

export const TagListResponseSchema = z.object({ items: z.array(TagSchema) });

export const TagCreateRequestSchema = z.object({
  active: z.boolean().optional(),
  appliesTo: TagTargetSchema.default('BOTH'),
  color: TagColorSchema.default('green'),
  deliverySheet: TagSheetModeSchema.default('NAME'),
  name: z.string().trim().min(1).max(40),
  ordersSheet: TagSheetModeSchema.default('NAME'),
  productionSheet: TagSheetModeSchema.default('NAME'),
  siteIds: z.array(UuidSchema).max(50).default([]),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

export const TagUpdateRequestSchema = z.object({
  active: z.boolean().optional(),
  appliesTo: TagTargetSchema.optional(),
  color: TagColorSchema.optional(),
  deliverySheet: TagSheetModeSchema.optional(),
  name: z.string().trim().min(1).max(40).optional(),
  ordersSheet: TagSheetModeSchema.optional(),
  productionSheet: TagSheetModeSchema.optional(),
  siteIds: z.array(UuidSchema).max(50).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
});

/** Un tag puesto: en un pedido puede venir del cliente (`fromCustomer`). */
export const AppliedTagSchema = z.object({
  color: z.string(),
  deliverySheet: TagSheetModeSchema,
  fromCustomer: z.boolean(),
  id: UuidSchema,
  name: z.string(),
  ordersSheet: TagSheetModeSchema,
  productionSheet: TagSheetModeSchema,
});

export const SetTagsRequestSchema = z.object({ tagIds: z.array(UuidSchema).max(30) });
export const SetTagsResponseSchema = z.object({ tags: z.array(AppliedTagSchema) });

export type Tag = z.infer<typeof TagSchema>;
export type AppliedTag = z.infer<typeof AppliedTagSchema>;
export type TagCreateRequest = z.infer<typeof TagCreateRequestSchema>;
export type TagUpdateRequest = z.infer<typeof TagUpdateRequestSchema>;
