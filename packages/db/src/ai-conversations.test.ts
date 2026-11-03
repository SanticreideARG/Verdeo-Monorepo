import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import { PostgresAIConversationService } from './repositories/postgres-ai-conversation-service.js';
import type { Database } from './index.js';
import * as schema from './schema/index.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const ANA = 'a0000000-0000-4000-8000-000000000001';
const BETO = 'a0000000-0000-4000-8000-000000000002';

let close: (() => Promise<void>) | null = null;

afterEach(async () => {
  await close?.();
  close = null;
});

async function service(): Promise<PostgresAIConversationService> {
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
  await client.exec(`insert into users (id, display_name) values
    ('${ANA}', 'Ana'), ('${BETO}', 'Beto');`);
  close = () => client.close();
  return new PostgresAIConversationService(drizzle(client, { schema }) as unknown as Database);
}

const exchange = {
  footnote: 'Consulta directa · Noviembre 1',
  message: '¿Cuánto hay que rendir?',
  reply: '$ 412.000.',
  title: '¿Cuánto hay que rendir?',
  userId: ANA,
};

describe('el historial con Hera', () => {
  it('guarda las vueltas en orden y sigue la misma conversación', async () => {
    const conversations = await service();
    const id = await conversations.append(exchange);
    expect(id).toBeTruthy();
    await conversations.append({
      ...exchange,
      conversationId: id ?? undefined,
      message: 'Texto pegado completo',
      pasted: 'Texto pegado',
      reply: 'Respuesta dos',
    });

    const detail = await conversations.get(ANA, id ?? '');
    expect(detail?.turns.map((turn) => [turn.role, turn.content])).toEqual([
      ['user', '¿Cuánto hay que rendir?'],
      ['assistant', '$ 412.000.'],
      ['user', 'Texto pegado completo'],
      ['assistant', 'Respuesta dos'],
    ]);
    expect(detail?.turns[2]?.pasted).toBe('Texto pegado');
    expect(detail?.turns[1]?.footnote).toBe('Consulta directa · Noviembre 1');
    expect(await conversations.list(ANA)).toHaveLength(1);
  });

  it('cada persona ve, sigue y borra sólo las suyas', async () => {
    const conversations = await service();
    const id = (await conversations.append(exchange)) ?? '';

    expect(await conversations.list(BETO)).toEqual([]);
    expect(await conversations.get(BETO, id)).toBeNull();
    expect(
      await conversations.append({ ...exchange, conversationId: id, userId: BETO }),
    ).toBeNull();
    expect(await conversations.remove(BETO, id)).toBe(false);
    expect((await conversations.get(ANA, id))?.turns).toHaveLength(2);

    expect(await conversations.remove(ANA, id)).toBe(true);
    expect(await conversations.get(ANA, id)).toBeNull();
  });
});
