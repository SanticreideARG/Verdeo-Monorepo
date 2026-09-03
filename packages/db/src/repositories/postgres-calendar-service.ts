import { AuditService } from '@verdeo/audit';
import { and, asc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';

import type { Database } from '../index.js';
import { calendarReminders, operatingSites, salesCycles } from '../schema/index.js';
import { PostgresAuditSink } from './postgres-audit-sink.js';

export interface CalendarContext {
  actorUserId?: string | undefined;
  correlationId: string;
  requestId: string;
  source: string;
}

export class CalendarNotFoundError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CalendarNotFoundError';
  }
}

export interface CalendarEvent {
  /** What produced it — a reminder someone wrote, or a date the operation already has. */
  kind: 'cycle_close' | 'kitchen_cutoff' | 'reminder';
  day: string;
  done: boolean;
  id: string;
  notes: string | null;
  operatingSiteName: string | null;
  /** Only a reminder can be deleted; derived dates belong to their sales cycle. */
  scope: 'derived' | 'general' | 'personal';
  title: string;
}

export interface ReminderInput {
  notes?: string | undefined;
  operatingSiteId?: string | null | undefined;
  remindOn: string;
  scope: 'general' | 'personal';
  title: string;
}

/**
 * The shared calendar: reminders people write, plus the dates the operation already has.
 *
 * Period closes and kitchen cutoffs are derived at read time rather than copied into rows. They
 * already exist on the sales cycle, and duplicating them would create a second copy that drifts
 * the moment someone edits the week — the same "no second source of truth" rule the menu and
 * geography systems follow.
 */
export class PostgresCalendarService {
  public constructor(private readonly database: Database) {}

  /**
   * Everything visible to one person in a date range.
   *
   * A personal reminder is only ever returned to its author. A general one is returned to everyone
   * who can see the calendar, narrowed to the city in scope when there is one.
   */
  public async listEvents(input: {
    from: string;
    operatingSiteId?: string | null | undefined;
    to: string;
    viewerUserId: string;
  }): Promise<CalendarEvent[]> {
    const reminders = await this.database
      .select({
        createdByUserId: calendarReminders.createdByUserId,
        doneAt: calendarReminders.doneAt,
        id: calendarReminders.id,
        notes: calendarReminders.notes,
        operatingSiteId: calendarReminders.operatingSiteId,
        operatingSiteName: operatingSites.displayName,
        remindOn: calendarReminders.remindOn,
        scope: calendarReminders.scope,
        title: calendarReminders.title,
      })
      .from(calendarReminders)
      .leftJoin(operatingSites, eq(operatingSites.id, calendarReminders.operatingSiteId))
      .where(
        and(
          gte(calendarReminders.remindOn, input.from),
          lte(calendarReminders.remindOn, input.to),
          // Someone else's personal reminder is never returned, whatever permissions the viewer has.
          or(
            eq(calendarReminders.scope, 'general'),
            eq(calendarReminders.createdByUserId, input.viewerUserId),
          ),
          ...(input.operatingSiteId
            ? [
                or(
                  isNull(calendarReminders.operatingSiteId),
                  eq(calendarReminders.operatingSiteId, input.operatingSiteId),
                ),
              ]
            : []),
        ),
      )
      .orderBy(asc(calendarReminders.remindOn));

    const cycles = await this.database
      .select({
        alias: salesCycles.alias,
        closeAt: salesCycles.closeAt,
        id: salesCycles.id,
        partialKitchenCutoffAt: salesCycles.partialKitchenCutoffAt,
      })
      .from(salesCycles)
      .where(
        and(
          gte(sql`${salesCycles.closeAt}::date`, input.from),
          lte(sql`${salesCycles.closeAt}::date`, input.to),
        ),
      );

    const events: CalendarEvent[] = reminders.map((row) => ({
      day: row.remindOn,
      done: row.doneAt !== null,
      id: row.id,
      kind: 'reminder',
      notes: row.notes,
      operatingSiteName: row.operatingSiteName,
      scope: row.scope === 'personal' ? 'personal' : 'general',
      title: row.title,
    }));

    for (const cycle of cycles) {
      events.push({
        day: toDay(cycle.closeAt),
        done: false,
        id: `cycle-close-${cycle.id}`,
        kind: 'cycle_close',
        notes: null,
        operatingSiteName: null,
        scope: 'derived',
        title: `Cierra ${cycle.alias}`,
      });
      const cutoff = toDay(cycle.partialKitchenCutoffAt);
      if (cutoff >= input.from && cutoff <= input.to) {
        events.push({
          day: cutoff,
          done: false,
          id: `cutoff-${cycle.id}`,
          kind: 'kitchen_cutoff',
          notes: null,
          operatingSiteName: null,
          scope: 'derived',
          title: `Parcial de cocina · ${cycle.alias}`,
        });
      }
    }

    return events.sort((a, b) => a.day.localeCompare(b.day));
  }

  public async createReminder(input: ReminderInput, context: CalendarContext) {
    const actorUserId = context.actorUserId;
    if (!actorUserId) throw new CalendarNotFoundError('Se requiere un usuario autenticado.');

    const [created] = await this.database
      .insert(calendarReminders)
      .values({
        createdByUserId: actorUserId,
        notes: input.notes ?? null,
        // A personal reminder is never tied to a city: it belongs to a person, not an operation.
        operatingSiteId: input.scope === 'personal' ? null : (input.operatingSiteId ?? null),
        remindOn: input.remindOn,
        scope: input.scope,
        title: input.title,
      })
      .returning();
    if (!created) throw new Error('Reminder creation did not return a row');

    const audit = new AuditService(new PostgresAuditSink(this.database));
    await audit.record({
      action: 'calendar.reminder_created',
      actor: { type: 'user', userId: actorUserId },
      after: { remindOn: input.remindOn, scope: input.scope },
      correlationId: context.correlationId,
      entityId: created.id,
      entityType: 'calendar_reminder',
      requestId: context.requestId,
      source: context.source,
    });

    return created;
  }

  /** Toggles done. Only the author may act on a personal one; anyone may tick a general one. */
  public async setReminderDone(reminderId: string, done: boolean, context: CalendarContext) {
    const actorUserId = context.actorUserId;
    if (!actorUserId) throw new CalendarNotFoundError('Se requiere un usuario autenticado.');

    const [existing] = await this.database
      .select({
        createdByUserId: calendarReminders.createdByUserId,
        scope: calendarReminders.scope,
      })
      .from(calendarReminders)
      .where(eq(calendarReminders.id, reminderId))
      .limit(1);
    if (!existing) throw new CalendarNotFoundError('No encontramos ese recordatorio.');
    if (existing.scope === 'personal' && existing.createdByUserId !== actorUserId) {
      throw new CalendarNotFoundError('No encontramos ese recordatorio.');
    }

    await this.database
      .update(calendarReminders)
      .set({ doneAt: done ? new Date() : null, updatedAt: new Date() })
      .where(eq(calendarReminders.id, reminderId));
  }

  /** Deleting is the author's alone, for both scopes: they wrote it, they retire it. */
  public async deleteReminder(reminderId: string, context: CalendarContext) {
    const actorUserId = context.actorUserId;
    if (!actorUserId) throw new CalendarNotFoundError('Se requiere un usuario autenticado.');

    const [existing] = await this.database
      .select({ createdByUserId: calendarReminders.createdByUserId })
      .from(calendarReminders)
      .where(eq(calendarReminders.id, reminderId))
      .limit(1);
    // Reported as not-found rather than forbidden: whether someone else's reminder exists is not
    // information this endpoint should confirm.
    if (!existing || existing.createdByUserId !== actorUserId) {
      throw new CalendarNotFoundError('No encontramos ese recordatorio.');
    }

    await this.database.delete(calendarReminders).where(eq(calendarReminders.id, reminderId));

    const audit = new AuditService(new PostgresAuditSink(this.database));
    await audit.record({
      action: 'calendar.reminder_deleted',
      actor: { type: 'user', userId: actorUserId },
      correlationId: context.correlationId,
      entityId: reminderId,
      entityType: 'calendar_reminder',
      requestId: context.requestId,
      source: context.source,
    });
  }
}

/** Cycle dates are timestamps; the calendar works in days. */
function toDay(value: Date | string): string {
  return (value instanceof Date ? value.toISOString() : new Date(value).toISOString()).slice(0, 10);
}
