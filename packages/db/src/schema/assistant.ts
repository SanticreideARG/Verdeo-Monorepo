import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { users } from './auth.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

/**
 * El asistente de la landing: un árbol de opciones, no un chat.
 *
 * Se guarda como un documento con revisiones, igual que una página del CMS (`pages` +
 * `page_revisions`), y por las mismas dos razones: se puede editar sin publicar, y si alguien deja
 * el árbol inconsistente se vuelve a la revisión anterior. La alternativa —una fila por opción con
 * `parent_id`— es más ortodoxa y peor acá: cada guardado serían N escrituras, no habría revisiones,
 * y editar un árbol fila por fila es incómodo justamente en la pantalla donde se arma.
 *
 * `key` existe para que pueda haber más de un asistente el día que haga falta —uno en la landing,
 * otro en la página de una ciudad— sin migrar nada. Hoy hay uno solo: `landing`.
 */
export const assistantFlows = pgTable('assistant_flows', {
  id: uuid('id').defaultRandom().primaryKey(),
  key: text('key').notNull().unique(),
  greeting: text('greeting').notNull(),
  // Sin clave foránea a las revisiones: esa tabla ya referencia a ésta, y un segundo vínculo en la
  // otra dirección volvería el par circular sin ganar nada. Mismo criterio que `pages`.
  publishedRevisionId: uuid('published_revision_id'),
  ...timestamps,
});

export const assistantFlowRevisions = pgTable(
  'assistant_flow_revisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    flowId: uuid('flow_id')
      .notNull()
      .references(() => assistantFlows.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    greeting: text('greeting').notNull(),
    options: jsonb('options').$type<unknown[]>().notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('assistant_flow_revisions_unique').on(table.flowId, table.revision)],
);

/**
 * Cuántas veces se tocó cada opción. Agregado, anónimo, sin sesión.
 *
 * Las conversaciones no se guardan —quedan en el navegador y ahí mueren—, pero saber *qué se
 * pregunta* no exige guardarlas: alcanza con un contador por opción. A las dos semanas dice si
 * nadie toca "modalidad de entrega" o si todos preguntan precios, y eso es información sobre qué le
 * falta a la landing, no sobre quién la visitó.
 *
 * Se cuenta por `optionKey` y no por identificador de fila: una opción borrada y vuelta a crear con
 * la misma clave es, para esta pregunta, la misma opción.
 */
export const assistantOptionHits = pgTable(
  'assistant_option_hits',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    flowKey: text('flow_key').notNull(),
    optionKey: text('option_key').notNull(),
    hits: integer('hits').default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('assistant_option_hits_unique').on(table.flowKey, table.optionKey)],
);
