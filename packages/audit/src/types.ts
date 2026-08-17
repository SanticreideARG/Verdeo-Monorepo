export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface AuditActor {
  userId?: string;
  type: 'user' | 'system' | 'webhook';
}

export interface AuditEventInput {
  action: string;
  actor: AuditActor;
  after?: JsonValue;
  before?: JsonValue;
  correlationId: string;
  entityId: string;
  entityType: string;
  metadata?: Record<string, JsonValue>;
  requestId: string;
  source: string;
}

export interface AuditEvent extends AuditEventInput {
  id: string;
  occurredAt: Date;
}

export interface AuditSink {
  append(event: AuditEvent): Promise<void>;
}
