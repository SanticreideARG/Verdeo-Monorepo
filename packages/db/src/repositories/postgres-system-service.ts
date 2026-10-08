import { desc, gt, sql } from 'drizzle-orm';

import type { Database } from '../index.js';
import { auditEvents, serverErrors } from '../schema/index.js';

/** El driver de producción devuelve un arreglo y el de pruebas un objeto con `rows`. */
function rowsOf<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : (result as { rows: T[] }).rows) as T[];
}

export interface ServerErrorInput {
  errorName: string;
  message: string;
  method: string;
  path: string;
  requestId: string;
  status: number;
}

export interface TableInfo {
  /** Tablas a las que apunta con una clave foránea. */
  references: string[];
  /** Filas aproximadas: es la estimación del planificador, no un `count(*)` de cada tabla. */
  rows: number;
  sizeBytes: number;
  table: string;
}

/**
 * Lo que el panel de estado necesita de la base y no es negocio: errores del servidor, el mapa de
 * tablas y los eventos de auditoría que faltan copiar a la base paralela.
 */
export class PostgresSystemService {
  public constructor(private readonly database: Database) {}

  /** Guarda un error y se desprende de los más viejos, para que la tabla no crezca sin techo. */
  public async recordError(input: ServerErrorInput): Promise<void> {
    await this.database.insert(serverErrors).values({
      ...input,
      message: input.message.slice(0, 500),
      path: input.path.slice(0, 300),
    });
    await this.database.execute(
      sql`delete from server_errors where occurred_at < now() - interval '30 days'`,
    );
  }

  public async listErrors(limit: number) {
    const rows = await this.database
      .select()
      .from(serverErrors)
      .orderBy(desc(serverErrors.occurredAt))
      .limit(limit);
    return rows.map((row) => ({ ...row, occurredAt: row.occurredAt.toISOString() }));
  }

  public async countErrorsSince(since: Date): Promise<number> {
    const [row] = await this.database
      .select({ total: sql<number>`count(*)::int` })
      .from(serverErrors)
      .where(gt(serverErrors.occurredAt, since));
    return row?.total ?? 0;
  }

  /**
   * Las tablas del esquema público con su tamaño, sus filas aproximadas y a qué otras apuntan.
   *
   * Filas por estimación (`pg_class.reltuples`) y no `count(*)`: contar cada tabla en cada apertura
   * del panel sería una carga que el panel no justifica. Una tabla recién creada o sin analizar da
   * -1, que se muestra como 0.
   */
  public async tableMap(): Promise<TableInfo[]> {
    const tables = rowsOf<{
      bytes: string | number;
      rows: string | number;
      table_name: string;
    }>(
      await this.database.execute(sql`
      select c.relname as table_name,
             coalesce(pg_total_relation_size(c.oid), 0) as bytes,
             greatest(c.reltuples, 0)::bigint as rows
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
       order by c.relname
    `),
    );
    const edges = rowsOf<{ from_table: string; to_table: string }>(
      await this.database.execute(sql`
      select src.relname as from_table, dst.relname as to_table
        from pg_constraint k
        join pg_class src on src.oid = k.conrelid
        join pg_class dst on dst.oid = k.confrelid
        join pg_namespace n on n.oid = src.relnamespace
       where k.contype = 'f' and n.nspname = 'public'
    `),
    );
    const referencesByTable = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (edge.from_table === edge.to_table) continue;
      const set = referencesByTable.get(edge.from_table) ?? new Set<string>();
      set.add(edge.to_table);
      referencesByTable.set(edge.from_table, set);
    }
    return tables.map((row) => ({
      references: [...(referencesByTable.get(row.table_name) ?? [])].sort(),
      rows: Number(row.rows),
      sizeBytes: Number(row.bytes),
      table: row.table_name,
    }));
  }

  /** Eventos de auditoría posteriores a una fecha, del más viejo al más nuevo. */
  public async auditEventsAfter(since: Date | null, limit: number) {
    const rows = await this.database
      .select({
        action: auditEvents.action,
        actorType: auditEvents.actorType,
        actorUserId: auditEvents.actorUserId,
        correlationId: auditEvents.correlationId,
        entityId: auditEvents.entityId,
        entityType: auditEvents.entityType,
        id: auditEvents.id,
        occurredAt: auditEvents.occurredAt,
        requestId: auditEvents.requestId,
        source: auditEvents.source,
      })
      .from(auditEvents)
      .where(since ? gt(auditEvents.occurredAt, since) : undefined)
      .orderBy(auditEvents.occurredAt)
      .limit(limit);
    return rows;
  }
}
