export interface DomainEvent<TPayload = unknown> {
  aggregateId: string;
  aggregateType: string;
  correlationId: string;
  id: string;
  name: string;
  occurredAt: Date;
  payload: TPayload;
  version: number;
}

export interface EventPublisher {
  publish<TPayload>(event: DomainEvent<TPayload>): Promise<void>;
}
