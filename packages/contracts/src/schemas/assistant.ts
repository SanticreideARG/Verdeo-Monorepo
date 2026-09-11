import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

/**
 * Qué hace una opción cuando alguien la toca.
 *
 * Cuatro comportamientos cubren todo lo que el asistente sabe hacer, y ninguno de los cuatro es
 * "escribir texto libre": esto es un árbol de opciones, no un chat, y prometer lo segundo sería
 * peor que no tenerlo.
 *
 * - `responder`: contesta con un texto y, opcionalmente, un bloque de datos reales.
 * - `preguntar`: abre otro juego de opciones.
 * - `llevar`: navega a una página del sitio.
 * - `salir`: abre WhatsApp con un mensaje ya escrito. Es la salida cuando ninguna opción alcanza,
 *   y sin ella el visitante queda golpeando contra un menú que no contesta lo que necesita.
 */
export const AssistantBehaviourSchema = z.enum(['responder', 'preguntar', 'llevar', 'salir']);

/**
 * Los datos reales que una respuesta puede mostrar debajo del texto.
 *
 * Es la mitad que evita que las respuestas mientan. Un texto que dice "los menús son Keto, Real y
 * Vegetariano" queda escrito y seis semanas después no es cierto; el texto escrito dice el sentido
 * y el bloque dice el dato, que sale de la misma fuente que la web pública.
 */
export const AssistantBlockSchema = z.enum(['MENU_SEMANA', 'PRECIOS', 'ZONAS', 'MEDIOS_DE_PAGO']);

const AssistantOptionBaseSchema = z.object({
  /*
   * Estable y elegida por quien configura: es la que cuenta los toques. Renombrar la etiqueta no
   * pierde el historial; cambiar la clave, sí — y eso es lo correcto, porque una opción con otra
   * clave es otra pregunta.
   */
  key: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z][a-z0-9-]*$/, 'Usá minúsculas, números y guiones.'),
  behaviour: AssistantBehaviourSchema,
  block: AssistantBlockSchema.optional(),
  /** Adónde lleva, dentro del sitio. Sólo rutas propias: el asistente no manda a ningún lado más. */
  href: z
    .string()
    .trim()
    .max(200)
    .regex(/^\/[a-zA-Z0-9/_-]*$/, 'Tiene que ser una ruta del sitio, como /pedido.')
    .optional(),
  label: z.string().trim().min(1).max(80),
  /*
   * Si hay que saber la ciudad antes de contestar.
   *
   * Tres de las cuatro respuestas dependen de ella: el precio depende del tamaño y de la ciudad
   * (ADR-030 y ADR-031), las zonas obviamente, y el menú se distribuye por ciudad. Contestar sin
   * preguntarla sería contestar cualquier cosa.
   */
  needsCity: z.boolean().default(false),
  reply: z.string().trim().max(1_000).optional(),
  /** El mensaje con el que se abre WhatsApp, ya escrito, para que la persona sólo tenga que enviar. */
  whatsappMessage: z.string().trim().max(300).optional(),
  /*
   * A qué número escribir. Se configura acá y no se lee del bloque de contacto de la landing porque
   * son dos decisiones distintas: el número que se publica en la página puede no ser el mismo al
   * que conviene derivar una consulta del asistente.
   *
   * Sin número, WhatsApp abre igual y la persona elige el contacto. Es peor, y es mejor que no
   * ofrecer la salida.
   */
  whatsappNumber: z
    .string()
    .trim()
    .max(40)
    .regex(/^[0-9+\s()-]*$/, 'Sólo números y separadores.')
    .optional(),
});

/**
 * Dos niveles y no más.
 *
 * No es una limitación técnica: es la profundidad a partir de la cual un árbol de opciones deja de
 * ser más rápido que leer la página. Si algún día hace falta un tercero, la conversación previa es
 * si esa rama no debería ser una página.
 */
export const AssistantChildOptionSchema = AssistantOptionBaseSchema;

export const AssistantOptionSchema = AssistantOptionBaseSchema.extend({
  options: z.array(AssistantChildOptionSchema).max(8).default([]),
});

export const AssistantFlowSchema = z.object({
  /** Lo primero que dice el asistente al abrirse. */
  greeting: z.string().trim().min(1).max(300),
  options: z.array(AssistantOptionSchema).max(8),
});

/** Lo que ve un visitante: el árbol publicado y nada más. Sin revisiones, sin quién lo editó. */
export const AssistantPublicSchema = AssistantFlowSchema;

export const AssistantFlowDetailSchema = AssistantFlowSchema.extend({
  id: UuidSchema,
  key: z.string(),
  /** Null mientras nunca se publicó: se está editando un borrador que nadie vio todavía. */
  publishedAt: IsoDateTimeSchema.nullable(),
  revision: z.number().int(),
  /** Si el borrador difiere de lo publicado, que es lo que la pantalla necesita para avisar. */
  unpublishedChanges: z.boolean(),
});

export const AssistantFlowUpdateRequestSchema = AssistantFlowSchema;

/** Un toque en una opción. Sin sesión, sin identificador: sólo cuál fue. */
export const AssistantHitRequestSchema = z.object({
  optionKey: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z][a-z0-9-]*$/),
});

export const AssistantStatsResponseSchema = z.object({
  items: z.array(z.object({ hits: z.number().int(), optionKey: z.string() })),
});

export type AssistantBehaviour = z.infer<typeof AssistantBehaviourSchema>;
export type AssistantBlock = z.infer<typeof AssistantBlockSchema>;
export type AssistantFlow = z.infer<typeof AssistantFlowSchema>;
export type AssistantOption = z.infer<typeof AssistantOptionSchema>;
export type AssistantFlowUpdateRequest = z.infer<typeof AssistantFlowUpdateRequestSchema>;
