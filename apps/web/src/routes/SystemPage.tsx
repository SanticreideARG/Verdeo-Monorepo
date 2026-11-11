import { useEffect, useMemo, useState } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { ProbeGauge } from '../components/SystemStatusButton.js';
import { SettingsTabs } from '../components/SettingsTabs.js';
import { apiRequest } from '../lib/api.js';
import {
  formatBytes,
  groupTables,
  INBOUND_SILENCE_MINUTES,
  inboundAdvice,
  inboundTone,
  inboundToneLabel,
  overallTone,
  toneLabel,
  type InboundTracking,
  type SystemTable,
} from '../lib/system.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';
import { useSystemStatus } from '../lib/useSystemStatus.js';

function moment(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'medium' }).format(
    new Date(value),
  );
}

const REJECTION_LABELS: Record<string, string> = {
  firma: 'firma que no coincide',
  formato: 'formato inesperado',
};

/** "hace 12 min", "hace 3 h": la hora sola no dice si es de recién o de ayer. */
function ago(value: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 60) return `hace ${String(minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `hace ${String(hours)} h`;
  return `hace ${String(Math.round(hours / 24))} días`;
}

/**
 * El seguimiento del script de Gmail (2026-11-11).
 *
 * Antes sólo se veía la hora del último mail aceptado, y un script apagado, uno con el secreto
 * cambiado y una semana sin pedidos se veían igual. El script reporta cada corrida con novedades y,
 * sin ellas, cada 30 minutos.
 */
function InboundSection({ tracking }: { tracking: InboundTracking }) {
  const tone = inboundTone(tracking);
  const advice = inboundAdvice(tone, tracking);
  const last = tracking.runs[0];
  return (
    <>
      <div className="system-section-head">
        <h2 className="system-section">Correo entrante (Gmail)</h2>
        <span className={`system-pill system-pill-${tone}`}>{inboundToneLabel(tone)}</span>
      </div>
      {advice ? <p className="system-advice">{advice}</p> : null}
      <dl className="system-stats">
        <div>
          <dt>Última corrida</dt>
          <dd>{last ? `${moment(last.ranAt)} · ${ago(last.ranAt)}` : '—'}</dd>
        </div>
        <div>
          <dt>Último mail recibido</dt>
          <dd>
            {tracking.lastReceivedAt
              ? `${moment(tracking.lastReceivedAt)} · ${ago(tracking.lastReceivedAt)}`
              : '—'}
          </dd>
        </div>
        <div>
          <dt>Para revisar</dt>
          <dd>{tracking.toReview}</dd>
        </div>
        <div>
          <dt>Nuevos (24 h)</dt>
          <dd>{tracking.last24h.sentNew}</dd>
        </div>
        <div>
          <dt>Repetidos (24 h)</dt>
          <dd>{tracking.last24h.duplicates}</dd>
        </div>
        <div>
          <dt>Fallados (24 h)</dt>
          <dd>{tracking.last24h.failed}</dd>
        </div>
      </dl>
      <p className="system-modal-meta">
        {last ? `Versión del script: ${last.scriptVersion}. ` : ''}
        Corre cada 5 minutos; sin novedades reporta cada 30. &quot;Sin señal&quot; aparece si pasan{' '}
        {INBOUND_SILENCE_MINUTES} minutos sin reporte. Repetidos son mails que Verdeo ya tenía: cada
        corrida vuelve a mirar los últimos minutos por las dudas.
        {tracking.rejections.length > 0
          ? ` Rechazos: ${tracking.rejections
              .map(
                (rejection) =>
                  `${String(rejection.count)} por ${REJECTION_LABELS[rejection.reason] ?? rejection.reason} (el último ${moment(rejection.lastAt)})`,
              )
              .join('; ')}.`
          : ''}
      </p>
      {tracking.runs.length > 0 ? (
        <div className="system-runs-wrap">
          <table className="system-runs">
            <thead>
              <tr>
                <th>Corrida</th>
                <th>Encontrados</th>
                <th>Nuevos</th>
                <th>Repetidos</th>
                <th>Fallados</th>
                <th>Duración</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {tracking.runs.map((run) => (
                <tr className={run.error || run.failed > 0 ? 'is-bad' : ''} key={run.ranAt}>
                  <td>
                    {moment(run.ranAt)}
                    {run.quietRuns > 0 ? <small> (+{run.quietRuns} sin novedades)</small> : null}
                  </td>
                  <td>{run.found}</td>
                  <td>{run.sentNew}</td>
                  <td>{run.duplicates}</td>
                  <td>{run.failed}</td>
                  <td>{(run.durationMs / 1000).toFixed(1)} s</td>
                  <td>{run.error ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

/**
 * "Estado del sistema": cómo andan los servidores, el mapa de las tablas de la base y los errores
 * que el servidor devolvió.
 *
 * La latencia de la aplicación es de **la instancia que contestó**, no de toda la plataforma: un
 * servicio sin estado levanta varias y cada una cuenta lo suyo. Los errores sí se guardan en la
 * base, así que ahí no importa qué instancia los vio.
 */
export function SystemPage() {
  const { failed: profileFailed, logout, profile } = useDashboardProfile();
  const canRead = profile?.permissions.includes('audit.read') ?? false;
  const { failed, loading, reload, status } = useSystemStatus(canRead, 30_000);
  const [tables, setTables] = useState<SystemTable[]>([]);
  const [tablesFailed, setTablesFailed] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) return;
    void apiRequest('/api/v1/system/tables').then(async (response) => {
      if (response.ok) {
        setTables(((await response.json()) as { items: SystemTable[] }).items);
      } else {
        setTablesFailed(true);
      }
    });
  }, [canRead]);

  const groups = useMemo(() => groupTables(tables), [tables]);
  /** Quién apunta a la tabla elegida: las relaciones se leen mejor en las dos direcciones. */
  const referencedBy = useMemo(
    () =>
      selected ? tables.filter((t) => t.references.includes(selected)).map((t) => t.table) : [],
    [selected, tables],
  );
  const selectedTable = tables.find((table) => table.table === selected) ?? null;

  if (profileFailed) return <DashboardFailed label="el estado del sistema" />;
  if (!profile) return <DashboardLoading />;

  if (!canRead) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Estado del sistema</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver esto.</p>
        </section>
      </DashboardShell>
    );
  }

  const tone = failed ? 'mal' : status ? overallTone(status.probes) : 'sin-dato';

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <SettingsTabs permissions={profile.permissions} />
        <header className="system-header">
          <div>
            <p className="dashboard-kicker">Panel de control</p>
            <h1 className="text-2xl font-semibold text-forest">Estado del sistema</h1>
          </div>
          <div className="system-header-tools">
            <span className={`system-pill system-pill-${tone}`}>{toneLabel(tone)}</span>
            <button
              className="button"
              disabled={loading}
              onClick={() => void reload()}
              type="button"
            >
              {loading ? 'Midiendo…' : 'Volver a medir'}
            </button>
          </div>
        </header>

        {failed ? (
          <p className="mt-4 text-sm text-ink-muted">
            No se pudo consultar el estado. El servidor no está contestando.
          </p>
        ) : null}

        {status ? (
          <>
            <h2 className="system-section">Servidores y bases de datos</h2>
            <ul className="system-probes system-probes-wide">
              {status.probes.map((probe) => (
                <ProbeGauge key={probe.key} probe={probe} />
              ))}
            </ul>
            <p className="system-modal-meta">
              Medido el {moment(status.generatedAt)} · se actualiza solo cada 30 segundos.
            </p>

            <h2 className="system-section">Servidor de la aplicación</h2>
            <dl className="system-stats">
              <div>
                <dt>Versión</dt>
                <dd>{status.api.version}</dd>
              </div>
              <div>
                <dt>Instancia encendida</dt>
                <dd>{moment(status.api.startedAt)}</dd>
              </div>
              <div>
                <dt>Típica (mediana)</dt>
                <dd>
                  {status.api.latency.p50 === null ? '—' : `${String(status.api.latency.p50)} ms`}
                </dd>
              </div>
              <div>
                <dt>Casos lentos (p95)</dt>
                <dd>
                  {status.api.latency.p95 === null ? '—' : `${String(status.api.latency.p95)} ms`}
                </dd>
              </div>
              <div>
                <dt>Peor</dt>
                <dd>
                  {status.api.latency.max === null ? '—' : `${String(status.api.latency.max)} ms`}
                </dd>
              </div>
              <div>
                <dt>Peticiones medidas</dt>
                <dd>{status.api.latency.count}</dd>
              </div>
            </dl>
            <p className="system-modal-meta">
              Son las de la instancia que contestó esta consulta, no las de toda la plataforma.
            </p>

            <h2 className="system-section">Historial paralelo (Supabase)</h2>
            <p className="system-modal-meta">
              {status.mirror.ok
                ? status.mirror.lastMirroredAt
                  ? `Última copia de auditoría: ${moment(status.mirror.lastMirroredAt)}. Se sincroniza una vez por día.`
                  : 'La tabla está vacía: todavía no se copió nada. Se llena en la próxima corrida diaria.'
                : `No se pudo leer la copia: ${status.mirror.detail}. Falta crear la tabla audit_mirror en Supabase.`}
            </p>

            {status.inbound ? (
              <InboundSection tracking={status.inbound} />
            ) : (
              <>
                <h2 className="system-section">Correo entrante (Gmail)</h2>
                <p className="system-modal-meta">Sin configurar.</p>
              </>
            )}
          </>
        ) : failed ? null : (
          <p className="mt-4 text-ink-muted">Midiendo…</p>
        )}

        <h2 className="system-section">Mapa de tablas</h2>
        {tablesFailed ? (
          <p className="text-sm text-ink-muted">No se pudo leer el esquema de la base.</p>
        ) : tables.length === 0 ? (
          <p className="text-sm text-ink-muted">Cargando…</p>
        ) : (
          <>
            <p className="system-modal-meta">
              {tables.length} tablas, {formatBytes(tables.reduce((s, t) => s + t.sizeBytes, 0))} en
              total. Tocá una para ver con quién se relaciona. Las filas son estimadas.
            </p>
            {selectedTable ? (
              <div className="system-relations">
                <strong>{selectedTable.table}</strong>
                <span>
                  Apunta a:{' '}
                  {selectedTable.references.length > 0
                    ? selectedTable.references.join(', ')
                    : 'nada'}
                </span>
                <span>
                  Es usada por: {referencedBy.length > 0 ? referencedBy.join(', ') : 'nadie'}
                </span>
              </div>
            ) : null}
            <div className="system-map">
              {groups.map((group) => (
                <section className="system-group" key={group.label}>
                  <h3>{group.label}</h3>
                  <ul>
                    {group.tables.map((table) => {
                      const related =
                        selected !== null &&
                        (table.table === selected ||
                          selectedTable?.references.includes(table.table) ||
                          referencedBy.includes(table.table));
                      return (
                        <li key={table.table}>
                          <button
                            aria-pressed={selected === table.table}
                            className={`system-table${related ? ' is-related' : ''}${
                              selected !== null && !related ? ' is-dim' : ''
                            }`}
                            onClick={() =>
                              setSelected((current) =>
                                current === table.table ? null : table.table,
                              )
                            }
                            type="button"
                          >
                            <span>{table.table}</span>
                            <small>
                              ~{table.rows.toLocaleString('es-AR')} filas ·{' '}
                              {formatBytes(table.sizeBytes)}
                            </small>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </>
        )}

        {status ? (
          <>
            <h2 className="system-section">Errores del servidor</h2>
            <p className="system-modal-meta">
              {status.errors.last24h} en las últimas 24 horas. Se guardan 30 días. El número de
              solicitud sirve para buscar el detalle en los logs de Vercel.
            </p>
            {status.errors.recent.length === 0 ? (
              <p className="text-sm text-ink-muted">Sin errores registrados.</p>
            ) : (
              <ul className="system-errors">
                {status.errors.recent.map((error) => (
                  <li key={error.id}>
                    <div className="system-error-head">
                      <strong>
                        {error.method} {error.path}
                      </strong>
                      <span>{error.status}</span>
                    </div>
                    <p>{error.message}</p>
                    <small>
                      {moment(error.occurredAt)} · {error.errorName} · solicitud {error.requestId}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </section>
    </DashboardShell>
  );
}
