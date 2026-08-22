import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

export const LoginRequestSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(12).max(256),
});

export const LoginResponseSchema = z.object({
  expiresAt: IsoDateTimeSchema,
  sessionId: UuidSchema,
});

export const OAuthExchangeRequestSchema = z.object({
  accessToken: z.string().min(20).max(16_384),
});

export const MeResponseSchema = z.object({
  permissions: z.array(z.string()).readonly(),
  session: z.object({
    expiresAt: IsoDateTimeSchema,
    id: UuidSchema,
  }),
  user: z.object({
    // Null until the (separate, not-yet-built) avatar upload flow sets it; the UI falls back to
    // an initial-letter badge.
    avatarUrl: z.string().nullable(),
    displayName: z.string().min(1),
    // Null for a user with no password/email identity (e.g. OAuth-only, pre-verification).
    email: z.string().nullable(),
    id: UuidSchema,
  }),
});

export const ProfileUpdateRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
});

export type MeResponse = z.infer<typeof MeResponseSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type OAuthExchangeRequest = z.infer<typeof OAuthExchangeRequestSchema>;
export type ProfileUpdateRequest = z.infer<typeof ProfileUpdateRequestSchema>;
