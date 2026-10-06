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
  /*
   * Sobre qué zona se arma la hoja de ruta.
   *
   * Opcional: sin esto se toma la ciudad entera, que es lo que hacía siempre. Con esto, una ciudad
   * con varias zonas puede repartirse en varias hojas —una por zona, que es como sale el
   * repartidor— en vez de una sola con todas las paradas mezcladas.
   */
  geographicZoneId: UuidSchema.optional(),
  label: z.string().trim().max(120).optional(),
  operatingSiteId: UuidSchema,
});

export const DeliveryStopSchema = z.object({
  assignedUserDisplayName: z.string().nullable(),
  assignedUserId: UuidSchema.nullable(),
  customerDisplayName: z.string(),
  deliveredAt: IsoDateTimeSchema.nullable(),
  deliveryAddress: z.string(),
  // Coordenadas del domicilio: con esto la lista que se le pasa al repartidor lleva un enlace de
  // mapa aunque nadie haya compartido una ubicación por chat.
  /*
   * Qué hay que entregar acá, ya escrito: "Menú Keto 400", "Intuitivo 250 · Ana".
   *
   * Lo arma el servidor y no cada pantalla, porque la misma línea va a la vista, al mensaje de
   * WhatsApp, a la planilla y a la app del repartidor: cuatro formas distintas de decir lo mismo
   * es cómo se termina entregando la vianda equivocada.
   */
  detail: z.string(),
  deliveryLatitude: z.number().nullable(),
  deliveryLocationUrl: z.string().nullable(),
  /*
   * Cuándo recibe este cliente, tal como lo cargó la operación en su ficha.
   *
   * Es texto libre —"después de las 18", "de 12 a 14"— y por eso no la usa el optimizador, que
   * ordena por distancia. Sirve para quien arma la hoja: ve la restricción mientras acomoda las
   * paradas, en vez de enterarse cuando el repartidor golpea una puerta cerrada.
   */
  deliveryWindow: z.string().nullable(),
  deliveryLongitude: z.number().nullable(),
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

export const DeliveryStopReorderRequestSchema = z.object({
  stopIds: z.array(UuidSchema).min(1),
});

export const DeliveryTriggerRequestSchema = z.object({
  action: DeliveryTriggerActionSchema,
});

export const DeliveryTriggerResponseSchema = z.object({
  reason: z.string().optional(),
  sent: z.boolean(),
});

export type DeliveryRouteCreateRequest = z.infer<typeof DeliveryRouteCreateRequestSchema>;
export type DeliveryStopReorderRequest = z.infer<typeof DeliveryStopReorderRequestSchema>;
export type DeliveryTriggerRequest = z.infer<typeof DeliveryTriggerRequestSchema>;

export const DeliveryStopFailedRequestSchema = z.object({
  cancellationReasonId: UuidSchema,
});

/**
 * La hoja que abre el enlace del repartidor.
 *
 * Lo mínimo para entregar: nombre de pila, dónde, cómo entrar, en qué horario recibe, qué dejar y
 * qué cobrar. Sin apellido, sin teléfono, sin historial — lo que no está en este esquema no sale
 * del servidor, y eso es deliberado: el enlace se manda por WhatsApp y puede terminar en cualquier
 * lado.
 */
export const DeliverySheetStopSchema = z.object({
  accessNotes: z.string().nullable(),
  collectedMinor: z.number().int(),
  customerFirstName: z.string(),
  deliveryAddress: z.string(),
  deliveryLatitude: z.number().nullable(),
  deliveryLocationUrl: z.string().nullable(),
  deliveryLongitude: z.number().nullable(),
  deliveryNote: z.string().nullable(),
  /** Cuándo recibe: "después de las 18", "de 9 a 13". Texto libre, lo lee una persona. */
  deliveryWindow: z.string().nullable(),
  detail: z.string(),
  id: UuidSchema,
  paymentExpectation: z.string(),
  prepaid: z.boolean(),
  publicNumber: z.string(),
  sequence: z.number().int(),
  status: z.string(),
  totalMinor: z.number().int(),
});

export const DeliveryRouteSheetSchema = z.object({
  collectedMinor: z.number().int(),
  deliveredCount: z.number().int(),
  deliveryDate: z.string(),
  label: z.string().nullable(),
  originLatitude: z.number().nullable(),
  originLongitude: z.number().nullable(),
  /** Lo que todavía hay que cobrar en la calle. */
  pendingCollectionMinor: z.number().int(),
  /** La lista cerrada de por qué una entrega puede fallar; la misma que usa el panel. */
  failureReasons: z.array(z.object({ displayName: z.string(), id: UuidSchema })),
  siteName: z.string(),
  stopCount: z.number().int(),
  stops: z.array(DeliverySheetStopSchema),
});

export const DeliveryRouteProgressSchema = z.object({
  collectedMinor: z.number().int(),
  deliveredCount: z.number().int(),
  pendingCollectionMinor: z.number().int(),
  stopCount: z.number().int(),
});

export const DeliveryRouteLinkRequestSchema = z.object({
  /** Cuánto vive el enlace. Por defecto un día: una ruta es de un día. */
  ttlHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 14)
    .optional(),
});

export const DeliveryRouteLinkResponseSchema = z.object({
  expiresAt: IsoDateTimeSchema,
  url: z.string(),
});

export const DeliverySheetConfirmRequestSchema = z.object({
  /** Si además de entregar, cobró. */
  collected: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

export const DeliverySheetTriggerRequestSchema = z.object({
  action: z.enum(['ON_MY_WAY', 'AT_ADDRESS', 'DELIVERED_THANKS']),
});
