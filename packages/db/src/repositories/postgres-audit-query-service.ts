import { and, desc, eq, ilike, lt } from 'drizzle-orm';

import type { Database } from '../index.js';
import { auditEvents, users } from '../schema/index.js';

export interface AuditEventQuery {
  action?: string | undefined;
  actorUserId?: string | undefined;
  before?: string | undefined;
  entityId?: string | undefined;
  entityType?: string | undefined;
  limit: number;
}

/**
 * Read side of the audit trail every service in this codebase already writes to via
 * `AuditService`/`PostgresAuditSink` — nothing new is captured here, this only makes the existing
 * `audit_events` rows visible. Filters mirror the table's own indexes
 * (entityType+entityId, actorUserId, occurredAt, correlationId) rather than inventing new ones.
 *
 * Pagination is a `before` timestamp cursor (strictly-older-than), not offset: an admin paging
 * through history while new events keep landing would see rows shift or repeat under offset
 * pagination; a timestamp cursor never does, since new rows are always newer than it.
 */
export class PostgresAuditQueryService {
  public constructor(private readonly database: Database) {}

  public async listEvents(query: AuditEventQuery) {
    const conditions = [
      ...(query.entityType ? [eq(auditEvents.entityType, query.entityType)] : []),
      ...(query.entityId ? [eq(auditEvents.entityId, query.entityId)] : []),
      ...(query.actorUserId ? [eq(auditEvents.actorUserId, query.actorUserId)] : []),
      ...(query.action ? [ilike(auditEvents.action, `%${query.action}%`)] : []),
      ...(query.before ? [lt(auditEvents.occurredAt, new Date(query.before))] : []),
    ];

    const rows = await this.database
      .select({
        action: auditEvents.action,
        actorDisplayName: users.displayName,
        actorType: auditEvents.actorType,
        actorUserId: auditEvents.actorUserId,
        after: auditEvents.after,
        before: auditEvents.before,
        correlationId: auditEvents.correlationId,
        entityId: auditEvents.entityId,
        entityType: auditEvents.entityType,
        id: auditEvents.id,
        metadata: auditEvents.metadata,
        occurredAt: auditEvents.occurredAt,
        requestId: auditEvents.requestId,
        source: auditEvents.source,
      })
      .from(auditEvents)
      .leftJoin(users, eq(users.id, auditEvents.actorUserId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditEvents.occurredAt))
      .limit(query.limit + 1);

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items,
      nextBefore: hasMore ? items[items.length - 1]!.occurredAt.toISOString() : null,
    };
  }

  /** Distinct entityType/action values seen so far, to populate filter dropdowns without a
   * hardcoded catalog — every service names its own actions and entity types freely. */
  public async listFacets() {
    const [entityTypes, actions] = await Promise.all([
      this.database.selectDistinct({ entityType: auditEvents.entityType }).from(auditEvents),
      this.database.selectDistinct({ action: auditEvents.action }).from(auditEvents),
    ]);
    return {
      actions: actions.map((row) => row.action).sort(),
      entityTypes: entityTypes.map((row) => row.entityType).sort(),
    };
  }
}
