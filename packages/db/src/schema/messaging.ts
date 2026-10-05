import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './auth.js';
import { operatingSites } from './geography.js';
import { customerIdentities, customers } from './operations.js';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
};

/**
 * Fase 5 skeleton (MESSAGING_WHATSAPP.md). This is the *customer* channel — deliberately separate
 * from `staff_conversations`/`staff_messages` (INTERNAL_MESSAGING.md), which is staff-to-staff and
 * already built. Naming stays generic ("Message", not "WhatsAppMessage") per that doc's "Futuro"
 * note, since Instagram/Messenger/Email adapters are meant to slot in later without a rename.
 *
 * `accessToken` lives here rather than in env because "múltiples números/cuentas" (V1 scope) means
 * each account authenticates independently against Meta's Graph API — there is no single global
 * token to put in env, the account roster itself is administrable data (same reasoning as
 * `operatingSites`). What IS env-level is the Meta App's webhook secret (`WHATSAPP_APP_SECRET`) and
 * verify token (`WHATSAPP_WEBHOOK_VERIFY_TOKEN`), which sign/gate the one shared webhook — see
 * `apps/api/src/integrations/whatsapp-provider.ts`.
 */
export const messagingAccounts = pgTable('messaging_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  provider: text('provider').default('whatsapp').notNull(),
  label: text('label').notNull(),
  // Meta's routing key: inbound webhook events carry this, never a raw phone number.
  phoneNumberId: text('phone_number_id').notNull().unique(),
  wabaId: text('waba_id'),
  displayPhoneNumber: text('display_phone_number'),
  accessToken: text('access_token'),
  operatingSiteId: uuid('operating_site_id').references(() => operatingSites.id, {
    onDelete: 'set null',
  }),
  active: boolean('active').default(true).notNull(),
  ...timestamps,
});

export const messagingConversations = pgTable(
  'messaging_conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    messagingAccountId: uuid('messaging_account_id')
      .notNull()
      .references(() => messagingAccounts.id, { onDelete: 'restrict' }),
    // Inbound account vs operational zone are not the same thing (MESSAGING_WHATSAPP.md
    // "Cuenta vs zona") — a WhatsApp number can receive from anywhere; the zone is resolved from
    // the customer's known address/site once there is one, and stays null until then.
    operatingSiteId: uuid('operating_site_id').references(() => operatingSites.id, {
      onDelete: 'set null',
    }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    customerIdentityId: uuid('customer_identity_id')
      .notNull()
      .references(() => customerIdentities.id, { onDelete: 'restrict' }),
    status: text('status').default('open').notNull(),
    handledByUserId: uuid('handled_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    lastHandledByUserId: uuid('last_handled_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => [
    index('messaging_conversations_account_idx').on(table.messagingAccountId, table.lastMessageAt),
    index('messaging_conversations_customer_idx').on(table.customerId),
    index('messaging_conversations_identity_idx').on(table.customerIdentityId),
  ],
);

export const messagingMessages = pgTable(
  'messaging_messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => messagingConversations.id, { onDelete: 'cascade' }),
    direction: text('direction').notNull(),
    kind: text('kind').default('text').notNull(),
    body: text('body'),
    status: text('status').default('sent').notNull(),
    // Meta's message id for inbound dedup and outbound delivery-status correlation. Nullable: an
    // outbound send that fails before Meta assigns one still gets a row (status 'failed').
    externalId: text('external_id'),
    senderUserId: uuid('sender_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('messaging_messages_conversation_idx').on(table.conversationId, table.createdAt),
    index('messaging_messages_external_idx').on(table.externalId),
  ],
);

// Every inbound webhook call is persisted verbatim before any processing (routing step 2:
// "persistir evento raw/idempotencia"), keyed by Meta's own message id so a retried delivery is a
// no-op rather than a duplicate conversation/message.
export const messagingWebhookEvents = pgTable(
  'messaging_webhook_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    externalId: text('external_id').notNull().unique(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('messaging_webhook_events_created_idx').on(table.createdAt)],
);

/**
 * Lo que se avisó a mano, por fuera de la API de Meta.
 *
 * Mandar por la Cloud API cuesta por conversación y la operación no lo va a pagar, así que el aviso
 * de la semana se manda abriendo el chat con `wa.me` y pegando el texto. Eso funciona, pero no deja
 * rastro en ninguna parte: a la segunda vuelta nadie sabe a quién ya le avisó, y con cien clientes
 * eso significa avisar dos veces a unos y a otros ninguna.
 *
 * Esta tabla es ese rastro. No es la cola: la cola se deriva de los pedidos del período, y acá se
 * anota únicamente lo que efectivamente se hizo —se mandó, o se decidió saltearlo y por qué—. Una
 * fila sin registro es una fila pendiente, sin necesidad de crear nada por adelantado.
 *
 * Se guarda el `body` tal como salió, y no sólo la plantilla: la plantilla se edita y el texto que
 * se le mandó a alguien en marzo tiene que seguir siendo el que se le mandó.
 */
export const manualNotices = pgTable(
  'manual_notices',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'cascade' }),
    /* `set null` y no `cascade`: si el pedido se borra, el hecho de haberle escrito al cliente
       sigue siendo cierto y sigue sirviendo para no escribirle de nuevo. */
    orderId: uuid('order_id'),
    operatingSiteId: uuid('operating_site_id').references(() => operatingSites.id, {
      onDelete: 'set null',
    }),
    templateKey: text('template_key'),
    channel: text('channel').default('whatsapp').notNull(),
    body: text('body').notNull(),
    /** El número al que se abrió el chat, por si después se corrige el del cliente. */
    phone: text('phone'),
    /** `sent` o `skipped`. No hay `pending`: lo pendiente es no tener fila. */
    status: text('status').default('sent').notNull(),
    note: text('note'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    index('manual_notices_order_idx').on(table.orderId, table.templateKey),
    index('manual_notices_customer_idx').on(table.customerId, table.createdAt),
  ],
);
