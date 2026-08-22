import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from './index.js';
import { PostgresChatService } from './repositories/postgres-chat-service.js';
import * as schema from './schema/index.js';

/**
 * The link policy is unit-tested in @verdeo/chat. This exercises it end to end against a real
 * engine, where the parts that can only break in SQL live: pair normalisation, the unique index
 * that stops a duplicate thread, unread counting, and the retention purge.
 */

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

const SUPERADMIN = '10000000-0000-4000-8000-000000000001';
const OPERADOR = '10000000-0000-4000-8000-000000000002';
const REPARTIDOR = '10000000-0000-4000-8000-000000000003';
const ISABELLA = '20000000-0000-4000-8000-000000000001';
const TAMARA = '20000000-0000-4000-8000-000000000002';
const CHOFER = '20000000-0000-4000-8000-000000000003';
const CHOFER_DOS = '20000000-0000-4000-8000-000000000004';

const seed = `
  insert into permissions (id, key, group_name, description)
  values ('30000000-0000-4000-8000-000000000001', 'chat.use', 'chat', 'Usar chat');

  insert into roles (id, key, name) values
    ('${SUPERADMIN}', 'superadmin', 'Superadmin'),
    ('${OPERADOR}', 'operador', 'Operador'),
    ('${REPARTIDOR}', 'repartidor', 'Repartidor');

  insert into role_permissions (role_id, permission_id) values
    ('${SUPERADMIN}', '30000000-0000-4000-8000-000000000001'),
    ('${OPERADOR}', '30000000-0000-4000-8000-000000000001'),
    ('${REPARTIDOR}', '30000000-0000-4000-8000-000000000001');

  insert into users (id, display_name, status) values
    ('${ISABELLA}', 'Isabella', 'active'),
    ('${TAMARA}', 'Tamara', 'active'),
    ('${CHOFER}', 'Chofer Uno', 'active'),
    ('${CHOFER_DOS}', 'Chofer Dos', 'active');

  insert into user_roles (user_id, role_id) values
    ('${ISABELLA}', '${SUPERADMIN}'),
    ('${TAMARA}', '${OPERADOR}'),
    ('${CHOFER}', '${REPARTIDOR}'),
    ('${CHOFER_DOS}', '${REPARTIDOR}');
`;

function context(actorUserId: string) {
  return { actorUserId, correlationId: 'test', requestId: 'test', source: 'test' };
}

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function seededService(): Promise<{ client: PGlite; service: PostgresChatService }> {
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
  await client.exec(seed);
  close = () => client.close();

  const db = drizzle(client, { schema }) as unknown as Database;
  const service = new PostgresChatService(db);
  // Drivers reach operators and superadmins; operators reach each other; drivers do not.
  await service.setRoleLink(
    { active: true, roleAId: SUPERADMIN, roleBId: OPERADOR },
    context(ISABELLA),
  );
  await service.setRoleLink(
    { active: true, roleAId: SUPERADMIN, roleBId: REPARTIDOR },
    context(ISABELLA),
  );
  await service.setRoleLink(
    { active: true, roleAId: OPERADOR, roleBId: REPARTIDOR },
    context(ISABELLA),
  );
  return { client, service };
}

describe('chat link administration', () => {
  it('stores a role pair normalised whichever way it is submitted', async () => {
    const { service } = await seededService();

    // Submitting the reverse of an existing pair must update it, not create a second row.
    await service.setRoleLink(
      { active: false, roleAId: REPARTIDOR, roleBId: OPERADOR },
      context(ISABELLA),
    );
    const links = await service.listLinks();

    const operatorDriver = links.roleLinks.filter(
      (link) =>
        [link.roleAId, link.roleBId].includes(OPERADOR) &&
        [link.roleAId, link.roleBId].includes(REPARTIDOR),
    );
    expect(operatorDriver).toHaveLength(1);
    expect(operatorDriver[0]?.active).toBe(false);
  });

  it('lists contacts through the role matrix and hides unlinked colleagues', async () => {
    const { service } = await seededService();

    const forDriver = await service.listContacts(CHOFER);

    expect(forDriver.map((person) => person.displayName)).toEqual(['Isabella', 'Tamara']);
  });

  it('lets an individual deny override the role matrix', async () => {
    const { service } = await seededService();

    await service.setUserLink(
      { effect: 'deny', reason: 'Conflicto', userAId: CHOFER, userBId: TAMARA },
      context(ISABELLA),
    );
    const forDriver = await service.listContacts(CHOFER);

    expect(forDriver.map((person) => person.displayName)).toEqual(['Isabella']);
  });

  it('lets an individual allow connect two people the matrix keeps apart', async () => {
    const { service } = await seededService();

    expect(await service.listContacts(CHOFER)).not.toContainEqual(
      expect.objectContaining({ id: CHOFER_DOS }),
    );

    await service.setUserLink(
      { effect: 'allow', userAId: CHOFER_DOS, userBId: CHOFER },
      context(ISABELLA),
    );

    expect(await service.listContacts(CHOFER)).toContainEqual(
      expect.objectContaining({ displayName: 'Chofer Dos' }),
    );
  });

  it('refuses to open a conversation the policy does not allow', async () => {
    const { service } = await seededService();

    await expect(service.openDirectConversation(CHOFER_DOS, context(CHOFER))).rejects.toThrow(
      /No tenés habilitada/,
    );
  });
});

describe('chat conversations', () => {
  it('converges on a single thread when both people open it', async () => {
    const { service } = await seededService();

    const fromDriver = await service.openDirectConversation(TAMARA, context(CHOFER));
    const fromOperator = await service.openDirectConversation(CHOFER, context(TAMARA));

    // The normalised pair key is what prevents two threads for the same two people.
    expect(fromOperator.id).toBe(fromDriver.id);
  });

  it('hides a conversation from someone who is not a participant', async () => {
    const { service } = await seededService();
    const conversation = await service.openDirectConversation(TAMARA, context(CHOFER));

    // Told it does not exist, rather than that it exists and is forbidden.
    await expect(service.listMessages(conversation.id, CHOFER_DOS, { limit: 50 })).rejects.toThrow(
      /no existe/,
    );
    await expect(service.sendMessage(conversation.id, 'hola', context(CHOFER_DOS))).rejects.toThrow(
      /no existe/,
    );
  });

  it('counts unread messages for the recipient only', async () => {
    const { service } = await seededService();
    const conversation = await service.openDirectConversation(TAMARA, context(CHOFER));

    await service.sendMessage(conversation.id, 'Llegué al depósito', context(CHOFER));
    await service.sendMessage(conversation.id, '¿Cargo ya?', context(CHOFER));

    const forOperator = await service.listConversations(TAMARA);
    const forDriver = await service.listConversations(CHOFER);

    expect(forOperator[0]?.unreadCount).toBe(2);
    // Your own messages are never unread for you.
    expect(forDriver[0]?.unreadCount).toBe(0);
  });

  it('clears the unread count once the conversation is read', async () => {
    const { service } = await seededService();
    const conversation = await service.openDirectConversation(TAMARA, context(CHOFER));
    await service.sendMessage(conversation.id, 'Llegué', context(CHOFER));

    await service.markRead(conversation.id, TAMARA);

    expect((await service.listConversations(TAMARA))[0]?.unreadCount).toBe(0);
  });

  it('names the other participant without exposing anything else about them', async () => {
    const { service } = await seededService();
    const conversation = await service.openDirectConversation(TAMARA, context(CHOFER));
    await service.sendMessage(conversation.id, 'Hola', context(CHOFER));

    const [thread] = await service.listConversations(TAMARA);

    expect(thread?.participants).toEqual([{ displayName: 'Chofer Uno', id: CHOFER }]);
  });

  it('returns the transcript oldest first and only what is newer after an anchor', async () => {
    const { service } = await seededService();
    const conversation = await service.openDirectConversation(TAMARA, context(CHOFER));
    const first = await service.sendMessage(conversation.id, 'uno', context(CHOFER));
    await service.sendMessage(conversation.id, 'dos', context(CHOFER));

    const transcript = await service.listMessages(conversation.id, TAMARA, { limit: 50 });
    expect(transcript.map((message) => message.body)).toEqual(['uno', 'dos']);

    // What the polling client asks for.
    const since = await service.listMessages(conversation.id, TAMARA, {
      after: first.id,
      limit: 50,
    });
    expect(since.map((message) => message.body)).toEqual(['dos']);
  });
});

describe('chat retention', () => {
  it('removes messages past the window and keeps the conversation', async () => {
    const { client, service } = await seededService();
    const conversation = await service.openDirectConversation(TAMARA, context(CHOFER));
    await service.sendMessage(conversation.id, 'viejo', context(CHOFER));
    await service.sendMessage(conversation.id, 'nuevo', context(CHOFER));
    await client.exec(
      `update staff_messages set created_at = now() - interval '31 days' where body = 'viejo'`,
    );

    const result = await service.purgeExpiredMessages(30, context(ISABELLA));

    expect(result.removed).toBe(1);
    const remaining = await service.listMessages(conversation.id, TAMARA, { limit: 50 });
    expect(remaining.map((message) => message.body)).toEqual(['nuevo']);
    // Losing the conversation would erase the fact that it happened.
    expect(await service.listConversations(TAMARA)).toHaveLength(1);
  });

  it('is safe to run twice', async () => {
    const { client, service } = await seededService();
    const conversation = await service.openDirectConversation(TAMARA, context(CHOFER));
    await service.sendMessage(conversation.id, 'viejo', context(CHOFER));
    await client.exec(`update staff_messages set created_at = now() - interval '31 days'`);

    expect((await service.purgeExpiredMessages(30, context(ISABELLA))).removed).toBe(1);
    expect((await service.purgeExpiredMessages(30, context(ISABELLA))).removed).toBe(0);
  });
});

describe('chat presence', () => {
  it('offers the seeded statuses as data', async () => {
    const { service } = await seededService();

    const statuses = await service.listPresenceStatuses();

    expect(statuses.map((status) => status.key)).toEqual(['available', 'away', 'busy']);
  });

  it('refuses a status that is not in the catalog', async () => {
    const { service } = await seededService();

    await expect(service.heartbeat(CHOFER, 'inventado')).rejects.toThrow(/no está disponible/);
  });

  it('keeps a declared status across a plain heartbeat', async () => {
    const { service } = await seededService();

    await service.heartbeat(CHOFER, 'busy');
    const afterPlainBeat = await service.heartbeat(CHOFER, undefined);

    // A beat says "I am here", not "reset what I chose".
    expect(afterPlainBeat.status).toBe('busy');
  });

  it('reports a colleague offline once the heartbeat goes stale', async () => {
    const { client, service } = await seededService();
    await service.heartbeat(CHOFER, 'busy');

    await client.exec(`update staff_presence set last_seen_at = now() - interval '10 minutes'`);
    const seenByOperator = await service.listPresence(TAMARA);

    const driver = seenByOperator.find((entry) => entry.userId === CHOFER);
    // Someone who declared busy and then closed the tab must not read as busy forever.
    expect(driver).toMatchObject({ connected: false, status: 'offline' });
  });

  it('shows presence only for colleagues the policy connects', async () => {
    const { service } = await seededService();
    await service.heartbeat(CHOFER_DOS, 'available');

    const seenByDriver = await service.listPresence(CHOFER);

    // The other driver is unreachable, so their presence is not observable either.
    expect(seenByDriver.map((entry) => entry.userId)).not.toContain(CHOFER_DOS);
    expect(seenByDriver.map((entry) => entry.userId)).toEqual(
      expect.arrayContaining([CHOFER, ISABELLA, TAMARA]),
    );
  });

  it('reports a colleague who never connected as offline rather than omitting them', async () => {
    const { service } = await seededService();

    const seenByDriver = await service.listPresence(CHOFER);

    expect(seenByDriver.find((entry) => entry.userId === TAMARA)).toMatchObject({
      connected: false,
      status: 'offline',
    });
  });
});
