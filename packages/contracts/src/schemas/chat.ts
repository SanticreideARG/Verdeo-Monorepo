import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

/** Staff-to-staff messaging. Separate from the customer channel in `operations.ts` (ADR-032). */

export const ChatLinkEffectSchema = z.enum(['allow', 'deny']);

export const ChatRoleLinkRequestSchema = z.object({
  active: z.boolean(),
  roleAId: UuidSchema,
  roleBId: UuidSchema,
});

export const ChatUserLinkRequestSchema = z
  .object({
    effect: ChatLinkEffectSchema,
    reason: z.string().trim().max(500).optional(),
    userAId: UuidSchema,
    userBId: UuidSchema,
  })
  .refine((value) => value.userAId !== value.userBId, {
    message: 'Una excepción necesita dos personas distintas.',
  });

export const ChatLinksResponseSchema = z.object({
  roleLinks: z.array(
    z.object({
      active: z.boolean(),
      id: UuidSchema,
      roleAId: UuidSchema,
      roleBId: UuidSchema,
    }),
  ),
  roles: z.array(z.object({ id: UuidSchema, key: z.string(), name: z.string() })),
  userLinks: z.array(
    z.object({
      createdAt: IsoDateTimeSchema,
      effect: ChatLinkEffectSchema,
      id: UuidSchema,
      reason: z.string().nullable(),
      userADisplayName: z.string(),
      userAId: UuidSchema,
      userBDisplayName: z.string(),
      userBId: UuidSchema,
    }),
  ),
});

/** A contact carries a name and nothing else: it must not become a softer user directory. */
export const ChatContactListResponseSchema = z.object({
  items: z.array(z.object({ displayName: z.string(), id: UuidSchema })),
});

export const ChatConversationOpenRequestSchema = z.object({ userId: UuidSchema });

export const ChatConversationListResponseSchema = z.object({
  items: z.array(
    z.object({
      id: UuidSchema,
      kind: z.string(),
      lastMessageAt: IsoDateTimeSchema.nullable(),
      participants: z.array(z.object({ displayName: z.string(), id: UuidSchema })),
      title: z.string().nullable(),
      unreadCount: z.number().int().nonnegative(),
    }),
  ),
});

/** Plain coordinates the sender chose. A customer's stored address goes through a reference
 * instead, so the recipient's own permission applies rather than a raw pair of numbers (ADR-032). */
export const ChatLocationSchema = z.object({
  label: z.string().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

/** A pointer, never a copy. The viewer resolves it through the existing order/customer endpoint
 * with their own permissions when they render it. */
export const ChatReferenceSchema = z.object({
  resourceId: UuidSchema,
  resourceType: z.enum(['customer', 'order']),
});

export const ChatMessageSchema = z.object({
  authorDisplayName: z.string().nullable(),
  authorUserId: UuidSchema.nullable(),
  // Null when the message was deleted: the gap stays visible without its content or attachment.
  body: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  deletedAt: IsoDateTimeSchema.nullable(),
  editedAt: IsoDateTimeSchema.nullable(),
  id: UuidSchema,
  kind: z.string(),
  location: ChatLocationSchema.nullable(),
  reference: ChatReferenceSchema.nullable(),
});

export const ChatMessageListResponseSchema = z.object({ items: z.array(ChatMessageSchema) });

export const ChatMessageQuerySchema = z.object({
  /** Everything newer than this message: what the polling client asks for. */
  after: UuidSchema.optional(),
  before: UuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const ChatMessageCreateRequestSchema = z.object({
  body: z.string().trim().min(1).max(4_000),
});

export const ChatLocationCreateRequestSchema = z.object({
  label: z.string().trim().max(200).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const ChatReferenceCreateRequestSchema = z.object({
  resourceId: UuidSchema,
  resourceType: z.enum(['customer', 'order']),
});

export const ChatConversationParamSchema = z.object({ conversationId: UuidSchema });

export const ChatPurgeResponseSchema = z.object({
  cutoff: IsoDateTimeSchema,
  removed: z.number().int().nonnegative(),
});

export type ChatRoleLinkRequest = z.infer<typeof ChatRoleLinkRequestSchema>;
export type ChatUserLinkRequest = z.infer<typeof ChatUserLinkRequestSchema>;
export type ChatMessageQuery = z.infer<typeof ChatMessageQuerySchema>;
export type ChatLocationCreateRequest = z.infer<typeof ChatLocationCreateRequestSchema>;
export type ChatReferenceCreateRequest = z.infer<typeof ChatReferenceCreateRequestSchema>;

/** Presence: a heartbeat plus an optional declared status (ADR-032). */
export const ChatHeartbeatRequestSchema = z.object({
  // Omitted on a plain beat, so a heartbeat never silently resets what the person declared.
  status: z.string().trim().min(1).max(40).optional(),
});

export const ChatPresenceEntrySchema = z.object({
  connected: z.boolean(),
  status: z.string(),
  statusMessage: z.string().nullable(),
  userId: UuidSchema,
});

export const ChatPresenceListResponseSchema = z.object({
  items: z.array(ChatPresenceEntrySchema),
});

export const ChatPresenceStatusListResponseSchema = z.object({
  items: z.array(z.object({ displayName: z.string(), key: z.string(), reachable: z.boolean() })),
});
