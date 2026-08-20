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
    displayName: z.string().min(1),
    id: UuidSchema,
  }),
});

export type MeResponse = z.infer<typeof MeResponseSchema>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type OAuthExchangeRequest = z.infer<typeof OAuthExchangeRequestSchema>;
