import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

/** Las publicaciones del tablero (DASHBOARD_FEED_PLAN.md, "Comunicaciones"). */
export const FeedTagSchema = z.enum(['aviso', 'cambio', 'novedad']);

export const FeedPostSchema = z.object({
  acknowledgedCount: z.number().int(),
  authorDisplayName: z.string().nullable(),
  authorUserId: UuidSchema.nullable(),
  body: z.string(),
  createdAt: IsoDateTimeSchema,
  editedAt: IsoDateTimeSchema.nullable(),
  id: UuidSchema,
  myAcknowledgedAt: IsoDateTimeSchema.nullable(),
  myReadAt: IsoDateTimeSchema.nullable(),
  needsAcknowledgement: z.boolean(),
  operatingSiteId: UuidSchema.nullable(),
  operatingSiteName: z.string().nullable(),
  pinnedUntil: IsoDateTimeSchema.nullable(),
  reactedByMe: z.boolean().default(false),
  reactionCount: z.number().int().default(0),
  readCount: z.number().int(),
  replyCount: z.number().int().default(0),
  tag: FeedTagSchema,
});

export const FeedPostListResponseSchema = z.object({
  items: z.array(FeedPostSchema),
  unreadCount: z.number().int(),
});

export const FeedPostCreateRequestSchema = z.object({
  body: z.string().trim().min(1, 'Escribí algo para publicar.').max(4000),
  // Null o ausente: para todas las ciudades.
  operatingSiteId: UuidSchema.nullable().optional(),
  pinnedUntil: IsoDateTimeSchema.nullable().optional(),
  tag: FeedTagSchema,
});

export const FeedPostUpdateRequestSchema = z
  .object({
    body: z.string().trim().min(1).max(4000).optional(),
    tag: FeedTagSchema.optional(),
  })
  .refine((value) => value.body !== undefined || value.tag !== undefined, {
    message: 'No hay nada para cambiar.',
  });

export const FeedPostPinRequestSchema = z.object({
  pinnedUntil: IsoDateTimeSchema.nullable(),
});

export const FeedPostReadRequestSchema = z.object({
  acknowledge: z.boolean().default(false),
});

export const FeedPostReadersResponseSchema = z.object({
  pending: z.array(z.object({ displayName: z.string(), userId: UuidSchema })),
  reads: z.array(
    z.object({
      acknowledgedAt: IsoDateTimeSchema.nullable(),
      displayName: z.string(),
      readAt: IsoDateTimeSchema,
      userId: UuidSchema,
    }),
  ),
});

export const FeedReplySchema = z.object({
  authorDisplayName: z.string().nullable(),
  authorUserId: UuidSchema.nullable(),
  body: z.string(),
  createdAt: IsoDateTimeSchema,
  id: UuidSchema,
});

export const FeedReplyListResponseSchema = z.object({ items: z.array(FeedReplySchema) });

export const FeedReplyCreateRequestSchema = z.object({
  body: z.string().trim().min(1, 'Escribí la respuesta.').max(1000),
});

export const FeedReactionRequestSchema = z.object({ on: z.boolean() });

/** Las tarjetas que alguien escondió (hecho o pospuesto), por clave. */
export const FeedHiddenCardsResponseSchema = z.object({ keys: z.array(z.string()) });

export const FeedCardStateRequestSchema = z.object({
  cardKey: z.string().min(1).max(200),
  // Null: volver a mostrarla.
  hiddenUntil: IsoDateTimeSchema.nullable(),
});

export const FeedUnreadResponseSchema = z.object({ count: z.number().int() });

export type FeedPost = z.infer<typeof FeedPostSchema>;
export type FeedTag = z.infer<typeof FeedTagSchema>;
