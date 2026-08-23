import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PostgresMessagingService } from './repositories/postgres-messaging-service.js';
import type { Database } from './index.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function migratedDatabase(): Promise<{
  client: PGlite;
  close: () => Promise<void>;
  db: Database;
}> {
  const client = new PGlite();
  await client.waitReady;

  for (const file of readdirSync(migrationsFolder)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    for (const statement of readFileSync(join(migrationsFolder, file), 'utf8')
      .split('--> statement-breakpoint')
      .map((part) => part.trim())
      .filter((part) => part.length > 0 && !/^(--[^\n]*\n?)*$/.test(part))) {
      await client.exec(statement);
    }
  }

  return {
    client,
    close: () => client.close(),
    db: drizzle(client, { schema }) as unknown as Database,
  };
}

const CONTEXT = { correlationId: 'test', requestId: 'test', source: 'test' };

type SendText = (input: {
  accessToken: string;
  body: string;
  phoneNumberId: string;
  to: string;
}) => Promise<{ externalId: string }>;

function stubProvider(overrides: Partial<{ sendText: SendText }> = {}) {
  return {
    sendText:
      overrides.sendText ?? vi.fn<SendText>(() => Promise.resolve({ externalId: 'wamid.OUT1' })),
    verifyChallenge: vi.fn(() => 'echo'),
    verifySignature: vi.fn(() => true),
  };
}

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function seededService(
  provider = stubProvider(),
): Promise<{ db: Database; service: PostgresMessagingService }> {
  const { close: closeDatabase, db } = await migratedDatabase();
  close = closeDatabase;
  return { db, service: new PostgresMessagingService(db, provider) };
}

const INBOUND_TEXT_EVENT = {
  entry: [
    {
      changes: [
        {
          value: {
            contacts: [{ profile: { name: 'María Pérez' } }],
            messages: [{ from: '5492995551234', id: 'wamid.IN1', text: { body: 'Hola!' } }],
            metadata: { phone_number_id: 'PNID1' },
          },
        },
      ],
    },
  ],
};

const STATUS_EVENT = {
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: 'PNID1' },
            statuses: [{ id: 'wamid.OUT1', status: 'delivered' }],
          },
        },
      ],
    },
  ],
};

describe('messaging accounts', () => {
  it('creates an account and never returns its raw access token', async () => {
    const { service } = await seededService();

    const account = await service.createAccount(
      { accessToken: 'secret-token', label: 'Verdeo Neuquén', phoneNumberId: 'PNID1' },
      CONTEXT,
    );

    expect(account).toMatchObject({ hasAccessToken: true, label: 'Verdeo Neuquén' });
    expect(JSON.stringify(account)).not.toContain('secret-token');
  });

  it('lists accounts without leaking tokens', async () => {
    const { service } = await seededService();
    await service.createAccount({ label: 'A', phoneNumberId: 'PNID1' }, CONTEXT);

    const items = await service.listAccounts();

    expect(JSON.stringify(items)).not.toContain('accessToken');
  });

  it('toggles active state', async () => {
    const { service } = await seededService();
    const account = await service.createAccount({ label: 'A', phoneNumberId: 'PNID1' }, CONTEXT);

    const updated = await service.updateAccount(account.id, { active: false }, CONTEXT);

    expect(updated.active).toBe(false);
  });
});

describe('inbound webhook routing', () => {
  it('creates a new customer, identity and conversation on first contact', async () => {
    const { service } = await seededService();
    await service.createAccount({ label: 'A', phoneNumberId: 'PNID1' }, CONTEXT);

    const result = await service.handleInboundEvent(INBOUND_TEXT_EVENT);

    expect(result).toEqual({ deduped: false, routed: true });
    const conversations = await service.listConversations();
    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({ customerDisplayName: 'María Pérez' });
    const messages = await service.getConversationMessages(conversations[0]!.id);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ body: 'Hola!', direction: 'inbound' });
  });

  it('routes a second message from the same number into the same open conversation', async () => {
    const { service } = await seededService();
    await service.createAccount({ label: 'A', phoneNumberId: 'PNID1' }, CONTEXT);
    await service.handleInboundEvent(INBOUND_TEXT_EVENT);

    await service.handleInboundEvent({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ from: '5492995551234', id: 'wamid.IN2', text: { body: 'De nuevo' } }],
                metadata: { phone_number_id: 'PNID1' },
              },
            },
          ],
        },
      ],
    });

    const conversations = await service.listConversations();
    expect(conversations).toHaveLength(1);
    const messages = await service.getConversationMessages(conversations[0]!.id);
    expect(messages).toHaveLength(2);
  });

  it('is idempotent on a retried delivery of the same message id', async () => {
    const { service } = await seededService();
    await service.createAccount({ label: 'A', phoneNumberId: 'PNID1' }, CONTEXT);
    await service.handleInboundEvent(INBOUND_TEXT_EVENT);

    const result = await service.handleInboundEvent(INBOUND_TEXT_EVENT);

    expect(result).toEqual({ deduped: true });
    const conversations = await service.listConversations();
    const messages = await service.getConversationMessages(conversations[0]!.id);
    expect(messages).toHaveLength(1);
  });

  it('drops events for an unknown phone_number_id without throwing', async () => {
    const { service } = await seededService();

    const result = await service.handleInboundEvent(INBOUND_TEXT_EVENT);

    expect(result).toEqual({ deduped: false, routed: false });
    expect(await service.listConversations()).toHaveLength(0);
  });

  it('updates an outbound message status from a delivery-status event', async () => {
    const { service } = await seededService();
    await service.createAccount(
      { accessToken: 'tok', label: 'A', phoneNumberId: 'PNID1' },
      CONTEXT,
    );
    await service.handleInboundEvent(INBOUND_TEXT_EVENT);
    const conversation = (await service.listConversations())[0]!;
    await service.sendMessage(conversation.id, 'Hola, ¿en qué te ayudamos?', CONTEXT);

    await service.handleInboundEvent(STATUS_EVENT);

    const messages = await service.getConversationMessages(conversation.id);
    const outbound = messages.find((m) => m.direction === 'outbound');
    expect(outbound?.status).toBe('delivered');
  });
});

describe('sending', () => {
  it('sends through the provider and persists the outbound message', async () => {
    const sendText = vi.fn<SendText>(() => Promise.resolve({ externalId: 'wamid.OUT1' }));
    const { service } = await seededService(stubProvider({ sendText }));
    await service.createAccount(
      { accessToken: 'tok', label: 'A', phoneNumberId: 'PNID1' },
      CONTEXT,
    );
    await service.handleInboundEvent(INBOUND_TEXT_EVENT);
    const conversation = (await service.listConversations())[0]!;

    const message = await service.sendMessage(conversation.id, 'Hola!', CONTEXT);

    expect(sendText).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'tok', body: 'Hola!', to: '5492995551234' }),
    );
    expect(message).toMatchObject({ direction: 'outbound', externalId: 'wamid.OUT1' });
  });

  it('refuses to send when the account has no access token', async () => {
    const { service } = await seededService();
    await service.createAccount({ label: 'A', phoneNumberId: 'PNID1' }, CONTEXT);
    await service.handleInboundEvent(INBOUND_TEXT_EVENT);
    const conversation = (await service.listConversations())[0]!;

    await expect(service.sendMessage(conversation.id, 'Hola!', CONTEXT)).rejects.toThrow(/token/);
  });

  it('rejects sending to an unknown conversation', async () => {
    const { service } = await seededService();

    await expect(
      service.sendMessage('00000000-0000-4000-8000-000000000000', 'Hola!', CONTEXT),
    ).rejects.toThrow(/not found/i);
  });
});
