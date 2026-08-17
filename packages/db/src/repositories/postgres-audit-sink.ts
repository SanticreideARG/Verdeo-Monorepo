import type { AuditEvent, AuditSink } from '@verdeo/audit';

import type { Database } from '../index.js';
import { auditEvents } from '../schema/index.js';

export class PostgresAuditSink implements AuditSink {
  public constructor(private readonly database: Pick<Database, 'insert'>) {}

  public async append(event: AuditEvent): Promise<void> {
    await this.database.insert(auditEvents).values({
      action: event.action,
      actorType: event.actor.type,
      actorUserId: event.actor.userId,
      after: event.after,
      before: event.before,
      correlationId: event.correlationId,
      entityId: event.entityId,
      entityType: event.entityType,
      id: event.id,
      metadata: event.metadata,
      occurredAt: event.occurredAt,
      requestId: event.requestId,
      source: event.source,
    });
  }
}
