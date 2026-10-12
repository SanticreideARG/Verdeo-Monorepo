import { and, count, desc, eq, inArray, max } from 'drizzle-orm';

import type { Database } from '../index.js';
import { inboundEmails } from '../schema/index.js';

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
}
