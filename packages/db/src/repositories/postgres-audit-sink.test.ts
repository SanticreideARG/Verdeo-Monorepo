import { describe, expect, it, vi } from 'vitest';

import type { AuditEvent } from '@verdeo/audit';

import type { Database } from '../index.js';
import { auditEvents } from '../schema/index.js';
import { PostgresAuditSink } from './postgres-audit-sink.js';

describe('PostgresAuditSink', () => {
  it('maps an immutable audit event into the database writer supplied by the caller', async () => {
    const values = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn(() => ({ values }));
    const writer = { insert } as unknown as Pick<Database, 'insert'>;
    const sink = new PostgresAuditSink(writer);
    const event: AuditEvent = {
      action: 'session.revoked',
      actor: { type: 'user', userId: '55276601-ec66-4f63-9f2f-edf73904ede0' },
      correlationId: 'correlation-id',
      entityId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
      entityType: 'session',
      id: '97ecbe34-a5a2-49d7-ac45-9a816f2bc47c',
      occurredAt: new Date('2026-08-17T12:00:00.000Z'),
      requestId: 'request-id',
      source: 'api',
    };

    await sink.append(event);

    expect(insert).toHaveBeenCalledWith(auditEvents);
    expect(values).toHaveBeenCalledWith({
      action: event.action,
      actorType: event.actor.type,
      actorUserId: event.actor.userId,
      after: undefined,
      before: undefined,
      correlationId: event.correlationId,
      entityId: event.entityId,
      entityType: event.entityType,
      id: event.id,
      metadata: undefined,
      occurredAt: event.occurredAt,
      requestId: event.requestId,
      source: event.source,
    });
  });
});
