import { randomUUID } from 'node:crypto';

import type { AuditEvent, AuditEventInput, AuditSink } from './types.js';

export class AuditService {
  public constructor(private readonly sink: AuditSink) {}

  public async record(input: AuditEventInput): Promise<AuditEvent> {
    const event: AuditEvent = {
      ...input,
      id: randomUUID(),
      occurredAt: new Date(),
    };

    await this.sink.append(event);
    return event;
  }
}
