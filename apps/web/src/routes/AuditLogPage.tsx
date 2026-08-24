import { useCallback, useEffect, useState } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface AuditEvent {
  action: string;
  actorDisplayName: string | null;
  actorType: 'user' | 'system' | 'webhook';
  actorUserId: string | null;
  after: unknown;
  before: unknown;
  correlationId: string;
  entityId: string;
  entityType: string;
  id: string;
  metadata: unknown;
  occurredAt: string;
  requestId: string;
  source: string;
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'medium' }).format(
    new Date(value),
  );
}

function actorLabel(event: AuditEvent): string {
  if (event.actorDisplayName) return event.actorDisplayName;
  if (event.actorType === 'system') return 'Sistema';
  if (event.actorType === 'webhook') return 'Webhook';
  return 'Usuario eliminado';
}

/** "Auditoría": lee lo que cada servicio ya escribe en cada mutación relevante desde Fase 1 — no
 * captura nada nuevo, solo lo hace visible. Los filtros son los mismos índices que ya tiene la
 * tabla (entidad, actor, acción, fecha), y la paginación es por cursor de fecha para no perder ni
 * repetir filas mientras siguen entrando eventos nuevos. */
export function AuditLogPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [entityIdFilter, setEntityIdFilter] = useState('');
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const canRead = profile?.permissions.includes('audit.read') ?? false;

  const buildQuery = useCallback(
    (before?: string) => {
      const params = new URLSearchParams();
      if (entityTypeFilter) params.set('entityType', entityTypeFilter);
      if (actionFilter) params.set('action', actionFilter);
      if (entityIdFilter.trim()) params.set('entityId', entityIdFilter.trim());
      if (before) params.set('before', before);
      return params.toString();
    },
    [actionFilter, entityIdFilter, entityTypeFilter],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const response = await apiRequest(`/api/v1/audit?${buildQuery()}`);
    if (response.ok) {
      const body = (await response.json()) as { items: AuditEvent[]; nextBefore: string | null };
      setEvents(body.items);
      setNextBefore(body.nextBefore);
    }
    setLoading(false);
  }, [buildQuery]);

  const loadMore = useCallback(async () => {
    if (!nextBefore) return;
    setLoadingMore(true);
    const response = await apiRequest(`/api/v1/audit?${buildQuery(nextBefore)}`);
    if (response.ok) {
      const body = (await response.json()) as { items: AuditEvent[]; nextBefore: string | null };
      setEvents((current) => [...current, ...body.items]);
      setNextBefore(body.nextBefore);
    }
    setLoadingMore(false);
  }, [buildQuery, nextBefore]);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    void apiRequest('/api/v1/audit/facets').then(async (response) => {
      if (response.ok) {
        const body = (await response.json()) as { actions: string[]; entityTypes: string[] };
        setEntityTypes(body.entityTypes);
        setActions(body.actions);
      }
    });
  }, [canRead]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  if (failed) return <DashboardFailed label="la auditoría" />;
  if (!profile) return <DashboardLoading />;

  if (!canRead) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Auditoría</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver esto.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Administración</p>
          <h1 className="text-2xl font-semibold text-forest">Auditoría</h1>
        </header>

        <form
          className="mt-6 grid gap-3 rounded-2xl border border-forest/10 bg-[var(--db-surface)] p-4 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            void load();
          }}
        >
          <label className="field">
            Entidad
            <select
              onChange={(event) => setEntityTypeFilter(event.target.value)}
              value={entityTypeFilter}
            >
              <option value="">Todas</option>
              {entityTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Acción
            <select onChange={(event) => setActionFilter(event.target.value)} value={actionFilter}>
              <option value="">Todas</option>
              {actions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            ID de entidad
            <input
              onChange={(event) => setEntityIdFilter(event.target.value)}
              placeholder="UUID o número"
              value={entityIdFilter}
            />
          </label>
          <button className="button button-primary self-end" type="submit">
            Filtrar
          </button>
        </form>

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : events.length === 0 ? (
          <p className="mt-6 text-ink-muted">No hay eventos para estos filtros.</p>
        ) : (
          <>
            <ul className="mt-6 grid gap-2">
              {events.map((event) => (
                <li
                  className="rounded-xl border border-forest/10 bg-[var(--db-surface)] p-4"
                  key={event.id}
                >
                  <button
                    className="flex w-full items-center justify-between gap-3 text-left"
                    onClick={() =>
                      setExpandedId((current) => (current === event.id ? null : event.id))
                    }
                    type="button"
                  >
                    <div>
                      <p className="font-semibold text-forest">{event.action}</p>
                      <p className="text-xs text-ink-muted">
                        {actorLabel(event)} · {event.entityType} {event.entityId} ·{' '}
                        {timeLabel(event.occurredAt)}
                      </p>
                    </div>
                    <span className="status-chip">{expandedId === event.id ? '−' : '+'}</span>
                  </button>
                  {expandedId === event.id ? (
                    <div className="mt-3 grid gap-3 border-t border-forest/10 pt-3 text-xs sm:grid-cols-2">
                      <div>
                        <p className="font-semibold text-ink-muted">Antes</p>
                        <pre className="mt-1 overflow-x-auto rounded-lg bg-forest/5 p-2">
                          {JSON.stringify(event.before, null, 2) ?? '—'}
                        </pre>
                      </div>
                      <div>
                        <p className="font-semibold text-ink-muted">Después</p>
                        <pre className="mt-1 overflow-x-auto rounded-lg bg-forest/5 p-2">
                          {JSON.stringify(event.after, null, 2) ?? '—'}
                        </pre>
                      </div>
                      {event.metadata ? (
                        <div className="sm:col-span-2">
                          <p className="font-semibold text-ink-muted">Metadata</p>
                          <pre className="mt-1 overflow-x-auto rounded-lg bg-forest/5 p-2">
                            {JSON.stringify(event.metadata, null, 2)}
                          </pre>
                        </div>
                      ) : null}
                      <p className="text-ink-muted sm:col-span-2">
                        request {event.requestId} · correlación {event.correlationId} · origen{' '}
                        {event.source}
                      </p>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            {nextBefore ? (
              <button
                className="button button-secondary mt-4"
                disabled={loadingMore}
                onClick={() => void loadMore()}
                type="button"
              >
                {loadingMore ? 'Cargando…' : 'Cargar más'}
              </button>
            ) : null}
          </>
        )}
      </section>
    </DashboardShell>
  );
}
