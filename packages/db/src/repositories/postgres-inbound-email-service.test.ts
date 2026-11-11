import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { afterEach, describe, expect, it } from 'vitest';

import type { Database } from '../index.js';
import * as schema from '../schema/index.js';
import {
  InboundEmailConflictError,
  PostgresInboundEmailService,
} from './postgres-inbound-email-service.js';

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');
const USER = 'f0000000-0000-4000-8000-000000000001';

let close: (() => Promise<void>) | null = null;
afterEach(async () => {
  await close?.();
  close = null;
});

async function base() {
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
  await client.exec(`insert into users (id, display_name) values ('${USER}', 'Isabella')`);
  close = () => client.close();
  const db = drizzle(client, { schema }) as unknown as Database;
  return { client, service: new PostgresInboundEmailService(db) };
}

const mail = (id: string) => ({
  body: 'Celular: 1155550101\nDirección: Julián Álvarez 1010',
  fromAddress: 'web@verdeo.com.ar',
  gmailMessageId: id,
  receivedAt: new Date('2026-10-12T10:00:00Z'),
  subject: 'Pedido online Capital Federal',
});

describe('PostgresInboundEmailService', () => {
  // El script reintenta si la API no respondió: un reintento no puede duplicar el pedido.
  it('guarda cada mail una sola vez aunque llegue dos veces', async () => {
    const { service } = await base();

    const primero = await service.store(mail('m-1'), { rows: [] }, 'pending');
    const repetido = await service.store(mail('m-1'), { rows: [] }, 'pending');

    expect(primero.stored).toBe(true);
    expect(repetido).toEqual({ id: null, stored: false });
    expect(await service.list(['pending'], 10)).toHaveLength(1);
  });

  it('lista sin el cuerpo y trae el cuerpo al abrir uno', async () => {
    const { service } = await base();
    const { id } = await service.store(mail('m-1'), { rows: [] }, 'pending');

    const [resumen] = await service.list(['pending'], 10);
    expect(resumen).not.toHaveProperty('body');
    expect((await service.get(id ?? ''))?.body).toContain('Julián Álvarez');
  });

  // Dos personas aprobando el mismo mail a la vez: sólo una puede.
  it('sólo una persona puede reclamar un mail para aprobarlo', async () => {
    const { service } = await base();
    const { id } = await service.store(mail('m-1'), { rows: [] }, 'pending');

    await service.claim(id ?? '');
    await expect(service.claim(id ?? '')).rejects.toThrow(InboundEmailConflictError);
  });

  it('si el pedido no se pudo crear, el mail vuelve a quedar pendiente', async () => {
    const { service } = await base();
    const { id } = await service.store(mail('m-1'), { rows: [] }, 'pending');
    await service.claim(id ?? '');

    await service.release(id ?? '');

    expect((await service.get(id ?? ''))?.status).toBe('pending');
  });

  it('aprobar guarda los pedidos creados y quién lo hizo', async () => {
    const { service } = await base();
    const { id } = await service.store(mail('m-1'), { rows: [] }, 'pending');
    await service.claim(id ?? '');

    await service.resolve(id ?? '', 'approved', ['0a000000-0000-4000-8000-000000000001'], USER);

    const resuelto = await service.get(id ?? '');
    expect(resuelto).toMatchObject({
      orderIds: ['0a000000-0000-4000-8000-000000000001'],
      resolvedByUserId: USER,
      status: 'approved',
    });
  });

  it('descartar no necesita reclamarlo antes, pero no descarta uno ya aprobado', async () => {
    const { service } = await base();
    const { id } = await service.store(mail('m-1'), { rows: [] }, 'pending');
    await service.resolve(id ?? '', 'discarded', [], USER);
    expect((await service.get(id ?? ''))?.status).toBe('discarded');

    await expect(service.resolve(id ?? '', 'discarded', [], USER)).rejects.toThrow(
      InboundEmailConflictError,
    );
  });

  it('dice cuántos esperan y cuándo llegó el último', async () => {
    const { service } = await base();
    expect(await service.overview()).toEqual({ lastReceivedAt: null, pending: 0 });

    await service.store(mail('m-1'), { rows: [] }, 'pending');
    await service.store(mail('m-2'), { rows: [] }, 'inquiry');

    const resumen = await service.overview();
    expect(resumen.pending).toBe(1);
    expect(resumen.lastReceivedAt).not.toBeNull();
  });
});

describe('seguimiento del script de Gmail', () => {
  const run = (
    ranAt: string,
    extra: Partial<{ error: string; failed: number; sentNew: number }> = {},
  ) => ({
    duplicates: 1,
    durationMs: 1200,
    error: extra.error ?? null,
    failed: extra.failed ?? 0,
    found: 3,
    quietRuns: 0,
    ranAt: new Date(ranAt),
    scriptVersion: '2026-11-11',
    sentNew: extra.sentNew ?? 2,
  });

  it('guarda las corridas, suma las de 24 horas y borra las de más de 30 días', async () => {
    const { service } = await base();
    const now = Date.now();
    const ago = (ms: number) => new Date(now - ms).toISOString();
    await service.recordRun(run(ago(40 * 24 * 3600 * 1000)));
    await service.recordRun(run(ago(2 * 24 * 3600 * 1000)));
    await service.recordRun(run(ago(60 * 60 * 1000), { error: 'Verdeo respondió 500', failed: 1 }));
    await service.recordRun(run(ago(5 * 60 * 1000), { sentNew: 4 }));

    const tracking = await service.tracking();
    // La de hace 40 días se borró; quedan tres, la más nueva primero.
    expect(tracking.runs).toHaveLength(3);
    expect(tracking.runs[0]?.sentNew).toBe(4);
    expect(tracking.runs[1]?.error).toBe('Verdeo respondió 500');
    // En 24 horas: las dos últimas.
    expect(tracking.last24h).toEqual({
      duplicates: 2,
      failed: 1,
      found: 6,
      reports: 2,
      sentNew: 6,
    });
  });

  it('cuenta los rechazos por motivo en una sola fila', async () => {
    const { service } = await base();
    await service.recordRejection('firma');
    await service.recordRejection('firma');
    await service.recordRejection('formato');
    const tracking = await service.tracking();
    expect(tracking.rejections.map((r) => [r.reason, r.count]).sort()).toEqual([
      ['firma', 2],
      ['formato', 1],
    ]);
  });

  it('para revisar suma pedidos, consultas y no reconocidos', async () => {
    const { service } = await base();
    await service.store(mail('a'), { rows: [] }, 'pending');
    await service.store(mail('b'), { rows: [] }, 'inquiry');
    await service.store(mail('c'), { rows: [] }, 'unreadable');
    await service.store(mail('d'), { rows: [] }, 'discarded');
    const tracking = await service.tracking();
    expect(tracking.toReview).toBe(3);
    expect(tracking.pending).toBe(1);
    expect(tracking.runs).toEqual([]);
  });
});
