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

export const CustomerLoginRequestSchema = z.object({
  email: z.string().trim().email().max(320),
});

/**
 * Deliberately says nothing about whether the address exists or was rate limited: an endpoint that
 * answered differently would be a way to discover who has an account.
 */
export const CustomerLoginRequestResponseSchema = z.object({
  message: z.string(),
});

export const CustomerLoginConsumeRequestSchema = z.object({
  token: z.string().trim().min(20).max(200),
});

/**
 * A dashboard layout is an ordered list of widget keys. The server does not know what the keys
 * mean — the frontend catalogue owns that — so this only constrains their shape.
 */
export const DashboardLayoutSchema = z.object({
  widgets: z.array(z.string().trim().min(1).max(60)).max(24),
});

/**
 * Aspecto de la app para una persona.
 *
 * Los valores no se validan contra una lista cerrada a propósito: qué temas y qué fuentes existen
 * es del catálogo del frontend, y encerrarlo acá obligaría a desplegar la API para agregar un tema.
 * Lo único que se acota es el largo, que es lo que protege a la base. Un valor que el frontend no
 * conoce cae al de por defecto al renderizar.
 */
const AppearanceValueSchema = z.string().trim().min(1).max(40).nullable();

export const AppearanceSchema = z.object({
  fontKey: AppearanceValueSchema,
  textScale: AppearanceValueSchema,
  theme: AppearanceValueSchema,
});

/** Parcial: mandar sólo la fuente no debe borrar el tema elegido antes. */
export const AppearanceUpdateRequestSchema = z
  .object({
    fontKey: AppearanceValueSchema.optional(),
    textScale: AppearanceValueSchema.optional(),
    theme: AppearanceValueSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'No hay nada que cambiar.',
  });

export type Appearance = z.infer<typeof AppearanceSchema>;

/**
 * Recuperación de contraseña del personal.
 *
 * El mínimo de 12 es el mismo que exige `LoginRequestSchema`. No es un detalle cosmético: una
 * contraseña más corta se guardaría bien y después no podría usarse para entrar, que es exactamente
 * la cuenta imposible de depurar que este flujo existe para evitar.
 */
const StaffPasswordSchema = z.string().min(12).max(256);

export const PasswordResetRequestSchema = z.object({
  email: z.string().trim().email().max(320),
});

/**
 * Igual que el enlace mágico de clientes: no dice si la dirección existe ni si se limitó por
 * frecuencia. Un endpoint que contestara distinto sería una forma de averiguar quién trabaja acá.
 */
export const PasswordResetRequestResponseSchema = z.object({
  message: z.string(),
});

export const PasswordResetConfirmRequestSchema = z.object({
  password: StaffPasswordSchema,
  token: z.string().min(20).max(200),
});

export const PasswordChangeRequestSchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: StaffPasswordSchema,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'La contraseña nueva tiene que ser distinta de la actual.',
    path: ['newPassword'],
  });

export type PasswordChangeRequest = z.infer<typeof PasswordChangeRequestSchema>;
export type PasswordResetConfirmRequest = z.infer<typeof PasswordResetConfirmRequestSchema>;
