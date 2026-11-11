import { and, count, desc, eq, gte, inArray, lt, max, sql, sum } from 'drizzle-orm';

import type { Database } from '../index.js';
import { inboundEmailRejections, inboundEmailRuns, inboundEmails } from '../schema/index.js';

export type InboundEmailStatus =
  'approved' | 'discarded' | 'inquiry' | 'pending' | 'processing' | 'unreadable';

export interface InboundEmailInput {
  body: string;
  fromAddress: string;
  gmailMessageId: string;
  receivedAt: Date;
  subject: string;
}

/** Lo que hace falta para la lista: sin el cuerpo, que puede ser largo. */
const summaryColumns = {
  createdAt: inboundEmails.createdAt,
  fromAddress: inboundEmails.fromAddress,
  id: inboundEmails.id,
  parsed: inboundEmails.parsed,
  receivedAt: inboundEmails.receivedAt,
  status: inboundEmails.status,
  subject: inboundEmails.subject,
};

/** Lo que reporta el script de Gmail al terminar una corrida. */
export interface InboundEmailRunInput {
  durationMs: number;
  duplicates: number;
  error: string | null;
  failed: number;
  found: number;
  quietRuns: number;
  ranAt: Date;
  scriptVersion: string;
  sentNew: number;
}

export type InboundEmailRejectionReason = 'firma' | 'formato';

/** Cuántos días se guardan las corridas. */
const RUN_RETENTION_DAYS = 30;

export class InboundEmailConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'InboundEmailConflictError';
  }
}

/**
 * Los mails de pedidos que entran solos. Ver `inbound_emails`.
 *
 * Aprobar es reclamar y después resolver: `claim` pasa de pendiente a "en proceso" en una sola
 * sentencia, así que si dos personas aprueban el mismo mail a la vez sólo una lo consigue y la otra
 * recibe un aviso, en lugar de crear el pedido dos veces.
 */
export class PostgresInboundEmailService {
  public constructor(private readonly database: Database) {}

  /** Guarda un mail una sola vez por id de Gmail. Devuelve si era nuevo. */
  public async store(
    input: InboundEmailInput,
    parsed: unknown,
    status: InboundEmailStatus,
  ): Promise<{ id: string | null; stored: boolean }> {
    const [row] = await this.database
      .insert(inboundEmails)
      .values({ ...input, parsed: parsed, status })
      .onConflictDoNothing({ target: inboundEmails.gmailMessageId })
      .returning({ id: inboundEmails.id });
    return { id: row?.id ?? null, stored: Boolean(row) };
  }

  public async list(statuses: readonly InboundEmailStatus[], limit: number) {
    const rows = await this.database
      .select(summaryColumns)
      .from(inboundEmails)
      .where(inArray(inboundEmails.status, [...statuses]))
      .orderBy(desc(inboundEmails.receivedAt))
      .limit(limit);
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
      receivedAt: row.receivedAt.toISOString(),
    }));
  }

  public async get(id: string) {
    const [row] = await this.database
      .select()
      .from(inboundEmails)
      .where(eq(inboundEmails.id, id))
      .limit(1);
    if (!row) return null;
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      receivedAt: row.receivedAt.toISOString(),
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    };
  }

  /** Pasa de pendiente a "en proceso". Falla si ya no estaba pendiente. */
  public async claim(id: string): Promise<void> {
    const [row] = await this.database
      .update(inboundEmails)
      .set({ status: 'processing' })
      .where(and(eq(inboundEmails.id, id), eq(inboundEmails.status, 'pending')))
      .returning({ id: inboundEmails.id });
    if (!row) {
      throw new InboundEmailConflictError('Este pedido ya lo revisó otra persona.');
    }
  }

  /** Vuelve a pendiente un mail reclamado cuyo pedido no se pudo crear. */
  public async release(id: string): Promise<void> {
    await this.database
      .update(inboundEmails)
      .set({ status: 'pending' })
      .where(and(eq(inboundEmails.id, id), eq(inboundEmails.status, 'processing')));
  }

  public async resolve(
    id: string,
    status: 'approved' | 'discarded',
    orderIds: readonly string[],
    actorUserId: string,
  ): Promise<void> {
    const [row] = await this.database
      .update(inboundEmails)
      .set({
        orderIds: [...orderIds],
        resolvedAt: new Date(),
        resolvedByUserId: actorUserId,
        status,
      })
      .where(
        and(
          eq(inboundEmails.id, id),
          inArray(
            inboundEmails.status,
            status === 'approved' ? ['processing'] : ['pending', 'inquiry', 'unreadable'],
          ),
        ),
      )
      .returning({ id: inboundEmails.id });
    if (!row) {
      throw new InboundEmailConflictError('Este pedido ya lo revisó otra persona.');
    }
  }

  /** Cuántos esperan y cuándo llegó el último: para el aviso y el estado del sistema. */
  public async overview() {
    const [pending] = await this.database
      .select({ total: count() })
      .from(inboundEmails)
      .where(eq(inboundEmails.status, 'pending'));
    const [last] = await this.database
      .select({ at: max(inboundEmails.createdAt) })
      .from(inboundEmails);
    return {
      lastReceivedAt: last?.at ? new Date(last.at).toISOString() : null,
      pending: Number(pending?.total ?? 0),
    };
  }

  /** Guarda una corrida del script y borra las de hace más de 30 días. */
  public async recordRun(input: InboundEmailRunInput): Promise<void> {
    await this.database.insert(inboundEmailRuns).values(input);
    await this.database
      .delete(inboundEmailRuns)
      .where(
        lt(inboundEmailRuns.ranAt, new Date(Date.now() - RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000)),
      );
  }

  /** Suma un rechazo: una fila por motivo, nunca una por intento. */
  public async recordRejection(reason: InboundEmailRejectionReason): Promise<void> {
    const now = new Date();
    await this.database
      .insert(inboundEmailRejections)
      .values({ count: 1, lastAt: now, reason })
      .onConflictDoUpdate({
        set: { count: sql`${inboundEmailRejections.count} + 1`, lastAt: now },
        target: inboundEmailRejections.reason,
      });
  }

  /**
   * El seguimiento del script para el estado del sistema: las últimas corridas, lo de las últimas
   * 24 horas, los rechazos y cuántos correos esperan revisión (pedidos, consultas y no reconocidos).
   */
  public async tracking() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [base, runs, day, rejections, review] = await Promise.all([
      this.overview(),
      this.database.select().from(inboundEmailRuns).orderBy(desc(inboundEmailRuns.ranAt)).limit(20),
      this.database
        .select({
          duplicates: sum(inboundEmailRuns.duplicates),
          failed: sum(inboundEmailRuns.failed),
          found: sum(inboundEmailRuns.found),
          reports: count(),
          sentNew: sum(inboundEmailRuns.sentNew),
        })
        .from(inboundEmailRuns)
        .where(gte(inboundEmailRuns.ranAt, since)),
      this.database.select().from(inboundEmailRejections),
      this.database
        .select({ total: count() })
        .from(inboundEmails)
        .where(inArray(inboundEmails.status, ['pending', 'inquiry', 'unreadable'])),
    ]);
    const totals = day[0];
    return {
      ...base,
      last24h: {
        duplicates: Number(totals?.duplicates ?? 0),
        failed: Number(totals?.failed ?? 0),
        found: Number(totals?.found ?? 0),
        reports: Number(totals?.reports ?? 0),
        sentNew: Number(totals?.sentNew ?? 0),
      },
      rejections: rejections.map((row) => ({
        count: row.count,
        lastAt: row.lastAt.toISOString(),
        reason: row.reason,
      })),
      runs: runs.map((run) => ({
        duplicates: run.duplicates,
        durationMs: run.durationMs,
        error: run.error,
        failed: run.failed,
        found: run.found,
        quietRuns: run.quietRuns,
        ranAt: run.ranAt.toISOString(),
        scriptVersion: run.scriptVersion,
        sentNew: run.sentNew,
      })),
      toReview: Number(review[0]?.total ?? 0),
    };
  }
}
