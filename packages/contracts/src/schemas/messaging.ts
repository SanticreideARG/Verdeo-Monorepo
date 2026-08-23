import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

export const MessagingAccountSchema = z.object({
  active: z.boolean(),
  createdAt: IsoDateTimeSchema,
  displayPhoneNumber: z.string().nullable(),
  hasAccessToken: z.boolean(),
  id: UuidSchema,
  label: z.string(),
  operatingSiteId: UuidSchema.nullable(),
  phoneNumberId: z.string(),
  provider: z.string(),
  wabaId: z.string().nullable(),
});

export const MessagingAccountListResponseSchema = z.object({
  items: z.array(MessagingAccountSchema),
});

export const MessagingAccountCreateRequestSchema = z.object({
  accessToken: z.string().trim().min(1).max(2_000).optional(),
  displayPhoneNumber: z.string().trim().max(40).optional(),
  label: z.string().trim().min(1).max(120),
  operatingSiteId: UuidSchema.optional(),
  phoneNumberId: z.string().trim().min(1).max(60),
  wabaId: z.string().trim().max(60).optional(),
});

export const MessagingAccountUpdateRequestSchema = z
  .object({
    accessToken: z.string().trim().min(1).max(2_000).nullable().optional(),
    active: z.boolean().optional(),
    displayPhoneNumber: z.string().trim().max(40).nullable().optional(),
    label: z.string().trim().min(1).max(120).optional(),
    operatingSiteId: UuidSchema.nullable().optional(),
    wabaId: z.string().trim().max(60).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No hay cambios para aplicar.' });

export const MessagingConversationSchema = z.object({
  customerDisplayName: z.string().nullable(),
  customerId: UuidSchema.nullable(),
  id: UuidSchema,
  lastMessageAt: IsoDateTimeSchema,
  messagingAccountLabel: z.string(),
  status: z.string(),
});

export const MessagingConversationListResponseSchema = z.object({
  items: z.array(MessagingConversationSchema),
});

export const MessagingMessageSchema = z.object({
  body: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  direction: z.enum(['inbound', 'outbound']),
  id: UuidSchema,
  status: z.string(),
});

export const MessagingMessageListResponseSchema = z.object({
  items: z.array(MessagingMessageSchema),
});

export const MessagingSendRequestSchema = z.object({
  body: z.string().trim().min(1).max(4_096),
});

export type MessagingAccountCreateRequest = z.infer<typeof MessagingAccountCreateRequestSchema>;
export type MessagingAccountUpdateRequest = z.infer<typeof MessagingAccountUpdateRequestSchema>;
export type MessagingSendRequest = z.infer<typeof MessagingSendRequestSchema>;
