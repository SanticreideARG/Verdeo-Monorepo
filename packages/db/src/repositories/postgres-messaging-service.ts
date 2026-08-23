import { randomUUID } from 'node:crypto';

import { and, desc, eq } from 'drizzle-orm';

import { AuditService } from '@verdeo/audit';
import { normalizeCustomerIdentity } from '@verdeo/customers';

import type { Database } from '../index.js';
import {
  customerIdentities,
  customers,
  messagingAccounts,
  messagingConversations,
  messagingMessages,
  messagingWebhookEvents,
} from '../schema/index.js';
import { PostgresAuditSink } from './postgres-audit-sink.js';

export interface MessagingContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

export class MessagingNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'MessagingNotFoundError';
  }
}

export class MessagingProviderError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'MessagingProviderError';
  }
}

export interface WhatsAppSender {
  sendText(input: {
    accessToken: string;
    body: string;
    phoneNumberId: string;
    to: string;
  }): Promise<{ externalId: string }>;
}

export interface MessagingAccountInput {
  accessToken?: string | null | undefined;
  active?: boolean | undefined;
  displayPhoneNumber?: string | null | undefined;
  label: string;
  operatingSiteId?: string | null | undefined;
  phoneNumberId: string;
  wabaId?: string | null | undefined;
}

/**
 * The customer-side channel (MESSAGING_WHATSAPP.md), deliberately separate from `@verdeo/chat`
 * (staff-to-staff, already built and parked). This is the V1 "realistic scope" skeleton: account
 * roster, inbound webhook routing, an outbound send that goes through the same
 * `MessagingService` path the UI does (never a direct call to Meta from the frontend), and a plain
 * inbox listing. AI drafting/extraction, delivery triggers and automated event messages
 * (also listed in that doc's V1 scope) are not built here — they need the inbox itself proven out
 * first, same reasoning as CMS's "SEO básico"/"edición asistida por IA" being deferred past V1.
 */
// Never echo the token back, not even to a superadmin screen — same "shown once" posture as
// access tokens elsewhere in this codebase.
function redactAccount<T extends { accessToken: string | null }>(
  account: T,
): Omit<T, 'accessToken'> & { hasAccessToken: boolean } {
  const hasAccessToken = Boolean(account.accessToken);
  const result: Record<string, unknown> = { ...account, hasAccessToken };
  delete result.accessToken;
  return result as Omit<T, 'accessToken'> & { hasAccessToken: boolean };
}

export class PostgresMessagingService {
  public constructor(
    private readonly database: Database,
    private readonly provider: WhatsAppSender & {
      verifyChallenge(
        mode: string | null,
        token: string | null,
        challenge: string | null,
      ): string | null;
      verifySignature(rawBody: string, signatureHeader: string | null): boolean;
    },
  ) {}

  public verifyChallenge(mode: string | null, token: string | null, challenge: string | null) {
    return this.provider.verifyChallenge(mode, token, challenge);
  }

  public verifySignature(rawBody: string, signatureHeader: string | null) {
    return this.provider.verifySignature(rawBody, signatureHeader);
  }

  public async listAccounts() {
    return this.database
      .select({
        active: messagingAccounts.active,
        createdAt: messagingAccounts.createdAt,
        displayPhoneNumber: messagingAccounts.displayPhoneNumber,
        hasAccessToken: messagingAccounts.accessToken,
        id: messagingAccounts.id,
        label: messagingAccounts.label,
        operatingSiteId: messagingAccounts.operatingSiteId,
        phoneNumberId: messagingAccounts.phoneNumberId,
        provider: messagingAccounts.provider,
        wabaId: messagingAccounts.wabaId,
      })
      .from(messagingAccounts)
      .orderBy(messagingAccounts.label)
      .then((rows) =>
        // Never echo the token back, not even to a superadmin screen — same "shown once" posture
        // as access tokens elsewhere in this codebase.
        rows.map(({ hasAccessToken, ...row }) => ({
          ...row,
          hasAccessToken: Boolean(hasAccessToken),
        })),
      );
  }

  public async createAccount(input: MessagingAccountInput, context: MessagingContext) {
    return this.database.transaction(async (transaction) => {
      const [created] = await transaction
        .insert(messagingAccounts)
        .values({
          accessToken: input.accessToken ?? null,
          active: input.active ?? true,
          displayPhoneNumber: input.displayPhoneNumber ?? null,
          label: input.label,
          operatingSiteId: input.operatingSiteId ?? null,
          phoneNumberId: input.phoneNumberId,
          wabaId: input.wabaId ?? null,
        })
        .returning();
      if (!created) throw new Error('Account creation did not return a row');

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'messaging.account_created',
        actor: context.actorUserId
          ? { type: 'user', userId: context.actorUserId }
          : { type: 'system' },
        after: { label: input.label, phoneNumberId: input.phoneNumberId },
        correlationId: context.correlationId,
        entityId: created.id,
        entityType: 'messaging_account',
        requestId: context.requestId,
        source: context.source,
      });

      return redactAccount(created);
    });
  }

  public async updateAccount(
    id: string,
    input: Partial<MessagingAccountInput>,
    context: MessagingContext,
  ) {
    return this.database.transaction(async (transaction) => {
      const [current] = await transaction
        .select({ id: messagingAccounts.id })
        .from(messagingAccounts)
        .where(eq(messagingAccounts.id, id))
        .limit(1);
      if (!current) throw new MessagingNotFoundError('Messaging account not found');

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.label !== undefined) patch.label = input.label;
      if (input.active !== undefined) patch.active = input.active;
      if (input.accessToken !== undefined) patch.accessToken = input.accessToken;
      if (input.displayPhoneNumber !== undefined)
        patch.displayPhoneNumber = input.displayPhoneNumber;
      if (input.operatingSiteId !== undefined) patch.operatingSiteId = input.operatingSiteId;
      if (input.wabaId !== undefined) patch.wabaId = input.wabaId;

      const [updated] = await transaction
        .update(messagingAccounts)
        .set(patch)
        .where(eq(messagingAccounts.id, id))
        .returning();
      if (!updated) throw new Error('Account update did not return a row');

      const audit = new AuditService(new PostgresAuditSink(transaction));
      await audit.record({
        action: 'messaging.account_updated',
        actor: context.actorUserId
          ? { type: 'user', userId: context.actorUserId }
          : { type: 'system' },
        after: { active: updated.active, label: updated.label },
        correlationId: context.correlationId,
        entityId: id,
        entityType: 'messaging_account',
        requestId: context.requestId,
        source: context.source,
      });

      return redactAccount(updated);
    });
  }

  public async listConversations() {
    return this.database
      .select({
        customerDisplayName: customers.displayName,
        customerId: messagingConversations.customerId,
        id: messagingConversations.id,
        lastMessageAt: messagingConversations.lastMessageAt,
        messagingAccountLabel: messagingAccounts.label,
        status: messagingConversations.status,
      })
      .from(messagingConversations)
      .innerJoin(
        messagingAccounts,
        eq(messagingAccounts.id, messagingConversations.messagingAccountId),
      )
      .leftJoin(customers, eq(customers.id, messagingConversations.customerId))
      .orderBy(desc(messagingConversations.lastMessageAt))
      .limit(200);
  }

  public async getConversationMessages(conversationId: string) {
    const [conversation] = await this.database
      .select({ id: messagingConversations.id })
      .from(messagingConversations)
      .where(eq(messagingConversations.id, conversationId))
      .limit(1);
    if (!conversation) throw new MessagingNotFoundError('Conversation not found');

    return this.database
      .select({
        body: messagingMessages.body,
        createdAt: messagingMessages.createdAt,
        direction: messagingMessages.direction,
        id: messagingMessages.id,
        status: messagingMessages.status,
      })
      .from(messagingMessages)
      .where(eq(messagingMessages.conversationId, conversationId))
      .orderBy(messagingMessages.createdAt);
  }

  public async sendMessage(conversationId: string, body: string, context: MessagingContext) {
    return this.database.transaction(async (transaction) => {
      const [conversation] = await transaction
        .select({
          accessToken: messagingAccounts.accessToken,
          id: messagingConversations.id,
          identityValue: customerIdentities.valueNormalized,
          phoneNumberId: messagingAccounts.phoneNumberId,
        })
        .from(messagingConversations)
        .innerJoin(
          messagingAccounts,
          eq(messagingAccounts.id, messagingConversations.messagingAccountId),
        )
        .innerJoin(
          customerIdentities,
          eq(customerIdentities.id, messagingConversations.customerIdentityId),
        )
        .where(eq(messagingConversations.id, conversationId))
        .limit(1);
      if (!conversation) throw new MessagingNotFoundError('Conversation not found');
      if (!conversation.accessToken)
        throw new MessagingProviderError(
          'La cuenta de WhatsApp de esta conversación todavía no tiene un token configurado.',
        );

      let externalId: string;
      try {
        const result = await this.provider.sendText({
          accessToken: conversation.accessToken,
          body,
          phoneNumberId: conversation.phoneNumberId,
          to: conversation.identityValue,
        });
        externalId = result.externalId;
      } catch (error) {
        throw new MessagingProviderError(
          error instanceof Error ? error.message : 'No se pudo enviar el mensaje.',
        );
      }

      const [message] = await transaction
        .insert(messagingMessages)
        .values({
          body,
          conversationId,
          direction: 'outbound',
          externalId,
          senderUserId: context.actorUserId ?? null,
          status: 'sent',
        })
        .returning();

      await transaction
        .update(messagingConversations)
        .set({
          handledByUserId: context.actorUserId ?? null,
          lastHandledByUserId: context.actorUserId ?? null,
          lastMessageAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(messagingConversations.id, conversationId));

      return message;
    });
  }

  /**
   * Routing order matches MESSAGING_WHATSAPP.md's "Routing" section: idempotency first, then
   * resolve account → identity (create an incomplete customer if new) → conversation → persist.
   * Delivery-status callbacks (Meta's `statuses[]` array) update the matching outbound message's
   * status by externalId and never create a conversation.
   */
  public async handleInboundEvent(payload: Record<string, unknown>) {
    // Meta's outer webhook envelope has no delivery-level id of its own; the inner message/status
    // id is what's actually idempotent, so it doubles as the dedup key. A payload this parser
    // doesn't recognize (media, reactions, …) still gets logged, under a fresh random id so two
    // unrecognized payloads never collide with each other.
    const parsed = parseInboundWhatsAppEvent(payload);
    const externalId = parsed?.externalMessageId ?? randomUUID();

    return this.database.transaction(async (transaction) => {
      const [existing] = await transaction
        .select({ id: messagingWebhookEvents.id })
        .from(messagingWebhookEvents)
        .where(eq(messagingWebhookEvents.externalId, externalId))
        .limit(1);
      if (existing) return { deduped: true };

      await transaction.insert(messagingWebhookEvents).values({ externalId, payload });

      if (!parsed) return { deduped: false, routed: false };

      const [account] = await transaction
        .select({ id: messagingAccounts.id })
        .from(messagingAccounts)
        .where(eq(messagingAccounts.phoneNumberId, parsed.phoneNumberId))
        .limit(1);
      if (!account) return { deduped: false, routed: false };

      if (parsed.kind === 'status') {
        await transaction
          .update(messagingMessages)
          .set({ status: parsed.status })
          .where(eq(messagingMessages.externalId, parsed.externalMessageId));
        return { deduped: false, routed: true };
      }

      const normalizedFrom = normalizeCustomerIdentity('phone', parsed.from);
      let [identity] = await transaction
        .select({ customerId: customerIdentities.customerId, id: customerIdentities.id })
        .from(customerIdentities)
        .where(
          and(
            eq(customerIdentities.type, 'whatsapp'),
            eq(customerIdentities.valueNormalized, normalizedFrom),
            eq(customerIdentities.active, true),
          ),
        )
        .limit(1);

      if (!identity) {
        const [customer] = await transaction
          .insert(customers)
          .values({ displayName: parsed.contactName ?? normalizedFrom })
          .returning({ id: customers.id });
        if (!customer) throw new Error('Customer creation did not return a row');
        const [created] = await transaction
          .insert(customerIdentities)
          .values({
            customerId: customer.id,
            primary: true,
            source: 'whatsapp',
            type: 'whatsapp',
            valueDisplay: parsed.from,
            valueNormalized: normalizedFrom,
            verified: true,
          })
          .returning({ customerId: customerIdentities.customerId, id: customerIdentities.id });
        identity = created;
      }
      if (!identity) throw new Error('Identity resolution failed');

      let [conversation] = await transaction
        .select({ id: messagingConversations.id })
        .from(messagingConversations)
        .where(
          and(
            eq(messagingConversations.messagingAccountId, account.id),
            eq(messagingConversations.customerIdentityId, identity.id),
            eq(messagingConversations.status, 'open'),
          ),
        )
        .limit(1);

      if (!conversation) {
        const [created] = await transaction
          .insert(messagingConversations)
          .values({
            customerId: identity.customerId,
            customerIdentityId: identity.id,
            messagingAccountId: account.id,
          })
          .returning({ id: messagingConversations.id });
        conversation = created;
      }
      if (!conversation) throw new Error('Conversation resolution failed');

      await transaction.insert(messagingMessages).values({
        body: parsed.body,
        conversationId: conversation.id,
        direction: 'inbound',
        externalId: parsed.externalMessageId,
        status: 'received',
      });
      await transaction
        .update(messagingConversations)
        .set({ lastMessageAt: new Date(), updatedAt: new Date() })
        .where(eq(messagingConversations.id, conversation.id));

      return { deduped: false, routed: true };
    });
  }
}

interface InboundTextEvent {
  body: string;
  contactName: string | null;
  externalMessageId: string;
  from: string;
  kind: 'text';
  phoneNumberId: string;
}

interface InboundStatusEvent {
  externalMessageId: string;
  kind: 'status';
  phoneNumberId: string;
  status: string;
}

/** Meta's webhook payload is deeply nested and mostly optional; this reads only the V1 "text
 * message" and "delivery status" shapes and returns null for anything else (media, reactions,
 * interactive replies, …) rather than guessing — those arrive as future adapter work. */
function parseInboundWhatsAppEvent(
  payload: Record<string, unknown>,
): InboundTextEvent | InboundStatusEvent | null {
  const entry = asArray(payload.entry)[0] as Record<string, unknown> | undefined;
  const change = asArray(entry?.changes)[0] as Record<string, unknown> | undefined;
  const value = change?.value as Record<string, unknown> | undefined;
  const metadata = value?.metadata as Record<string, unknown> | undefined;
  const phoneNumberId =
    typeof metadata?.phone_number_id === 'string' ? metadata.phone_number_id : null;
  if (!phoneNumberId) return null;

  const message = asArray(value?.messages)[0] as Record<string, unknown> | undefined;
  if (message) {
    const id = typeof message.id === 'string' ? message.id : null;
    const from = typeof message.from === 'string' ? message.from : null;
    const text = message.text as Record<string, unknown> | undefined;
    const body = typeof text?.body === 'string' ? text.body : null;
    if (!id || !from || !body) return null;
    const contacts = asArray(value?.contacts)[0] as Record<string, unknown> | undefined;
    const profile = contacts?.profile as Record<string, unknown> | undefined;
    const contactName = typeof profile?.name === 'string' ? profile.name : null;
    return { body, contactName, externalMessageId: id, from, kind: 'text', phoneNumberId };
  }

  const status = asArray(value?.statuses)[0] as Record<string, unknown> | undefined;
  if (status) {
    const id = typeof status.id === 'string' ? status.id : null;
    const statusValue = typeof status.status === 'string' ? status.status : null;
    if (!id || !statusValue) return null;
    return { externalMessageId: id, kind: 'status', phoneNumberId, status: statusValue };
  }

  return null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
