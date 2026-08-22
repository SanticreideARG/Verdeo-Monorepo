import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

export const AccessTokenKindSchema = z.enum(['repartidor_access', 'user_invite']);

export const AccessTokenIssueRequestSchema = z
  .object({
    boundUserId: UuidSchema.optional(),
    kind: AccessTokenKindSchema,
    label: z.string().trim().min(1).max(160),
    operatingSiteId: UuidSchema.optional(),
    roleId: UuidSchema.optional(),
    ttlHours: z
      .number()
      .int()
      .min(1)
      .max(24 * 30),
  })
  .refine((value) => value.kind !== 'repartidor_access' || Boolean(value.boundUserId), {
    message: 'Un token de repartidor necesita un usuario existente.',
    path: ['boundUserId'],
  })
  .refine((value) => value.kind !== 'user_invite' || Boolean(value.roleId), {
    message: 'Un token de invitación necesita un rol.',
    path: ['roleId'],
  });

export const AccessTokenIssuedResponseSchema = z.object({
  expiresAt: IsoDateTimeSchema,
  id: UuidSchema,
  // Returned once, at issue time only — never retrievable again (only the hash is stored).
  token: z.string(),
});

export const AccessTokenSummarySchema = z.object({
  boundUserDisplayName: z.string().nullable(),
  createdAt: IsoDateTimeSchema,
  createdByDisplayName: z.string().nullable(),
  expiresAt: IsoDateTimeSchema,
  id: UuidSchema,
  kind: AccessTokenKindSchema,
  label: z.string(),
  lastUsedAt: IsoDateTimeSchema.nullable(),
  operatingSiteName: z.string().nullable(),
  redeemedAt: IsoDateTimeSchema.nullable(),
  revokedAt: IsoDateTimeSchema.nullable(),
  roleKey: z.string().nullable(),
  useCount: z.number().int(),
});

export const AccessTokenListResponseSchema = z.object({
  items: z.array(AccessTokenSummarySchema),
});

export const AccessTokenRedeemRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  token: z.string().trim().min(10).max(200),
});

export type AccessTokenIssueRequest = z.infer<typeof AccessTokenIssueRequestSchema>;
export type AccessTokenRedeemRequest = z.infer<typeof AccessTokenRedeemRequestSchema>;
