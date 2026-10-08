import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from '../index.js';
import * as schema from '../schema/index.js';
import { PostgresSystemService } from './postgres-system-service.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});

async function base(): Promise<{ client: PGlite; db: Database }> {
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
  close = () => client.close();
  return { client, db: drizzle(client, { schema }) as unknown as Database };
}

const error = (path: string) => ({
  errorName: 'Error',
  message: 'boom',
  method: 'GET',
  path,
  requestId: 'req-1',
  status: 500,
});

describe('PostgresSystemService', () => {
  it('guarda los errores y los lista del más nuevo al más viejo', async () => {
    const { db } = await base();
    const service = new PostgresSystemService(db);
    await service.recordError(error('/api/v1/a'));
    await new Promise((resolve) => setTimeout(resolve, 5));
    await service.recordError(error('/api/v1/b'));

    const items = await service.listErrors(10);

    expect(items.map((item) => item.path)).toEqual(['/api/v1/b', '/api/v1/a']);
    expect(await service.countErrorsSince(new Date(Date.now() - 60_000))).toBe(2);
  });

  it('recorta el mensaje para que un error enorme no llene la tabla', async () => {
    const { db } = await base();
    const service = new PostgresSystemService(db);
    await service.recordError({ ...error('/x'), message: 'a'.repeat(2_000) });

    expect((await service.listErrors(1))[0]?.message).toHaveLength(500);
  });

  it('describe las tablas con sus relaciones', async () => {
    const { db } = await base();
    const mapa = await new PostgresSystemService(db).tableMap();

    const pedidos = mapa.find((tabla) => tabla.table === 'orders');
    expect(pedidos?.references).toContain('customers');
    expect(mapa.some((tabla) => tabla.table === 'server_errors')).toBe(true);
  });

  it('lista los eventos de auditoría posteriores a una fecha, del más viejo al más nuevo', async () => {
    const { client, db } = await base();
    for (const [id, fecha] of [
      ['a0000000-0000-4000-8000-000000000001', '2026-10-01T10:00:00Z'],
      ['a0000000-0000-4000-8000-000000000002', '2026-10-02T10:00:00Z'],
    ] as const) {
      await client.exec(
        `insert into audit_events (id, actor_type, action, entity_type, entity_id, request_id, correlation_id, source, occurred_at)
         values ('${id}', 'system', 'x.y', 'order', 'e1', 'r', 'c', 'api', '${fecha}')`,
      );
    }
    const service = new PostgresSystemService(db);

    expect((await service.auditEventsAfter(null, 10)).map((e) => e.id)).toEqual([
      'a0000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000002',
    ]);
    expect(
      (await service.auditEventsAfter(new Date('2026-10-01T12:00:00Z'), 10)).map((e) => e.id),
    ).toEqual(['a0000000-0000-4000-8000-000000000002']);
  });
});
