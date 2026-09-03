import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest, storedOperatingSiteId } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface CalendarEvent {
  day: string;
  done: boolean;
  id: string;
  kind: 'cycle_close' | 'kitchen_cutoff' | 'reminder';
  notes: string | null;
  operatingSiteName: string | null;
  scope: 'derived' | 'general' | 'personal';
  title: string;
}

/** FormData.get returns string | File | null; only a string is ever meaningful here. */
function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Parsed as UTC so a day never shifts by timezone on the way to a label. */
function dayLabel(day: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
    weekday: 'long',
  }).format(new Date(`${day}T00:00:00Z`));
}

const KIND_LABEL: Record<CalendarEvent['kind'], string> = {
  cycle_close: 'Cierre de período',
  kitchen_cutoff: 'Parcial de cocina',
  reminder: 'Recordatorio',
};

/**
 * "Calendario": reminders people write, alongside the dates the operation already has.
 *
 * Deliberately an agenda rather than a month grid. What matters operationally is what is coming
 * and in what order — a grid spends most of its area on empty days and makes a week with three
 * things in it look the same as a week with none.
 */
export function CalendarPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [weeks, setWeeks] = useState(4);

  const canUse = profile?.permissions.includes('calendar.use') ?? false;

  const load = useCallback(async () => {
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + weeks * 7);
    const params = new URLSearchParams({ from: isoDay(from), to: isoDay(to) });
    const site = storedOperatingSiteId();
    if (site) params.set('operatingSiteId', site);

    const response = await apiRequest(`/api/v1/calendar?${params.toString()}`);
    if (!response.ok) throw new Error(await errorMessage(response));
    setEvents(((await response.json()) as { items: CalendarEvent[] }).items);
    setLoading(false);
  }, [weeks]);

  useEffect(() => {
    if (!profile) return;
    if (!profile.permissions.includes('calendar.use')) {
      setLoading(false);
      return;
    }
    void load().catch((error: unknown) => {
      setLoading(false);
      setMessage(error instanceof Error ? error.message : 'No pudimos cargar el calendario.');
    });
  }, [load, profile]);

  async function createReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = formText(form, 'title');
    const remindOn = formText(form, 'remindOn');
    if (!title || !remindOn) {
      setMessage('Poné un título y una fecha.');
      return;
    }
    const scope = form.get('scope') === 'general' ? 'general' : 'personal';

    const response = await apiRequest('/api/v1/calendar/reminders', {
      body: JSON.stringify({
        notes: formText(form, 'notes') || undefined,
        // A general reminder belongs to the city in scope; a personal one to nobody but its author.
        ...(scope === 'general' && storedOperatingSiteId()
          ? { operatingSiteId: storedOperatingSiteId() }
          : {}),
        remindOn,
        scope,
        title,
      }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    event.currentTarget.reset();
    showToast('Recordatorio agendado.');
    await load();
  }

  async function toggleDone(reminder: CalendarEvent) {
    const response = await apiRequest(`/api/v1/calendar/reminders/${reminder.id}`, {
      body: JSON.stringify({ done: !reminder.done }),
      method: 'PATCH',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    await load();
  }

  async function remove(reminder: CalendarEvent) {
    if (!window.confirm(`¿Borrar "${reminder.title}"?`)) return;
    const response = await apiRequest(`/api/v1/calendar/reminders/${reminder.id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    showToast('Recordatorio borrado.');
    await load();
  }

  if (failed) return <DashboardFailed label="el calendario" />;
  if (!profile) return <DashboardLoading />;

  if (!canUse) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Calendario</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para verlo.</p>
        </section>
      </DashboardShell>
    );
  }

  // Grouped by day so the agenda reads as days rather than a flat list of dates repeated.
  const byDay = new Map<string, CalendarEvent[]>();
  for (const item of events) {
    const bucket = byDay.get(item.day);
    if (bucket) bucket.push(item);
    else byDay.set(item.day, [item]);
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="dashboard-kicker">General</p>
            <h1 className="text-2xl font-semibold text-forest">Calendario</h1>
            <p className="mt-2 max-w-2xl text-sm text-ink-muted">
              Los cierres de período y los parciales de cocina salen solos de las semanas cargadas.
              Lo demás lo anotás vos.
            </p>
          </div>
          <label className="field">
            Ver
            <select onChange={(e) => setWeeks(Number(e.target.value))} value={weeks}>
              <option value={2}>Próximas 2 semanas</option>
              <option value={4}>Próximo mes</option>
              <option value={12}>Próximos 3 meses</option>
            </select>
          </label>
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="alert">
            {message}
          </p>
        ) : null}

        <form className="operation-card mt-6" onSubmit={(event) => void createReminder(event)}>
          <div className="form-grid">
            <label className="field field-wide">
              Recordatorio
              <input name="title" placeholder="Ej. llamar al proveedor de bandejas" required />
            </label>
            <label className="field">
              Fecha
              <input name="remindOn" required type="date" />
            </label>
            <label className="field">
              Para quién
              <select defaultValue="personal" name="scope">
                <option value="personal">Sólo para mí</option>
                <option value="general">Para el equipo</option>
              </select>
            </label>
            <label className="field field-wide">
              Detalle (opcional)
              <input name="notes" />
            </label>
          </div>
          <button className="button button-primary mt-4" type="submit">
            Agendar
          </button>
        </form>

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : byDay.size === 0 ? (
          <p className="mt-6 empty-state">No hay nada agendado en este período.</p>
        ) : (
          <div className="calendar-agenda mt-6">
            {[...byDay.entries()].map(([day, items]) => (
              <section key={day}>
                <h2 className="calendar-day">{dayLabel(day)}</h2>
                <ul>
                  {items.map((item) => (
                    <li className={`calendar-event is-${item.kind}`} key={item.id}>
                      <div>
                        <p className={item.done ? 'calendar-event-done' : undefined}>
                          {item.title}
                        </p>
                        <small>
                          {KIND_LABEL[item.kind]}
                          {item.scope === 'personal' ? ' · sólo vos' : ''}
                          {item.operatingSiteName ? ` · ${item.operatingSiteName}` : ''}
                          {item.notes ? ` · ${item.notes}` : ''}
                        </small>
                      </div>
                      {/* Derived dates belong to their sales cycle, so they carry no actions. */}
                      {item.kind === 'reminder' ? (
                        <div className="calendar-event-actions">
                          <button onClick={() => void toggleDone(item)} type="button">
                            {item.done ? 'Reabrir' : 'Hecho'}
                          </button>
                          <button onClick={() => void remove(item)} type="button">
                            Borrar
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
