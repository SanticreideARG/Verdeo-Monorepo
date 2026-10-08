import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { SettingsTabs } from '../components/SettingsTabs.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface Settings {
  autoAccept: boolean;
  cityContext: string | null;
  confidenceThresholdPercent: number;
  radiusKm: number;
  useAi: boolean;
}

interface Metrics {
  ai: {
    averageLatencyMs: number | null;
    calls: number;
    failed: number;
    inputTokens: number;
    outputTokens: number;
  };
  days: number;
  requests: { confirmed: number; failed: number; noMatch: number; pending: number; total: number };
}

const percent = (part: number, total: number) =>
  total === 0 ? '—' : `${String(Math.round((part / total) * 100))} %`;

/**
 * "Direcciones": cómo se ubican las direcciones de los pedidos en la ciudad elegida arriba.
 *
 * Cada ciudad tiene sus ajustes porque lo que es "dentro de la ciudad" y cuánta seguridad se le
 * pide a un resultado dependen del lugar. Las métricas están acá para ajustar el umbral con datos
 * —cuántas ubicaciones salieron bien, cuántas no encontraron nada, qué gastó la IA— y no a ojo.
 */
export function AddressSettingsPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const canRead = profile?.permissions.includes('sites.read') ?? false;
  const canManage = profile?.permissions.includes('sites.manage') ?? false;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [days, setDays] = useState(30);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [settingsResponse, metricsResponse] = await Promise.all([
      apiRequest('/api/v1/geocoding/settings', { notify: false }),
      apiRequest(`/api/v1/geocoding/metrics?days=${String(days)}`, { notify: false }),
    ]);
    if (settingsResponse.ok) {
      setSettings((await settingsResponse.json()) as Settings);
      setMessage('');
    } else {
      setSettings(null);
      setMessage(await errorMessage(settingsResponse));
    }
    setMetrics(metricsResponse.ok ? ((await metricsResponse.json()) as Metrics) : null);
  }, [days]);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    const response = await apiRequest('/api/v1/geocoding/settings', {
      body: JSON.stringify({
        ...settings,
        cityContext: settings.cityContext?.trim() ? settings.cityContext.trim() : null,
      }),
      method: 'PUT',
      notify: false,
    });
    setSaving(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setSettings((await response.json()) as Settings);
    setMessage('');
    showToast('Ajustes guardados.');
  }

  if (failed) return <DashboardFailed label="los ajustes de direcciones" />;
  if (!profile) return <DashboardLoading />;

  if (!canRead) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Direcciones</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver esto.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <SettingsTabs permissions={profile.permissions} />
        <header>
          <p className="dashboard-kicker">Panel de control</p>
          <h1 className="text-2xl font-semibold text-forest">Direcciones</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Cómo se ubican las direcciones de los pedidos en la ciudad elegida arriba.
          </p>
        </header>

        {message ? <p className="mt-4 text-sm text-ink-muted">{message}</p> : null}

        {settings ? (
          <form className="settings-form mt-6 grid gap-4" onSubmit={(event) => void save(event)}>
            <label className="field flex items-center gap-3">
              <input
                checked={settings.useAi}
                disabled={!canManage}
                onChange={(event) => setSettings({ ...settings, useAi: event.target.checked })}
                type="checkbox"
              />
              <span>
                Ordenar el texto con IA antes de buscarlo
                <small className="block text-ink-muted">
                  Separa calle, número, piso y barrio, y arma la búsqueda. Si se apaga, o si no hay
                  proveedor de IA, se busca el texto tal cual. La IA nunca decide las coordenadas.
                </small>
              </span>
            </label>

            <label className="field flex items-center gap-3">
              <input
                checked={settings.autoAccept}
                disabled={!canManage}
                onChange={(event) => setSettings({ ...settings, autoAccept: event.target.checked })}
                type="checkbox"
              />
              <span>
                Aceptar sola una ubicación segura
                <small className="block text-ink-muted">
                  Apagado: todas quedan para revisar a mano desde el pedido.
                </small>
              </span>
            </label>

            <label className="field">
              Seguridad mínima para aceptar sola ({settings.confidenceThresholdPercent} %)
              <input
                disabled={!canManage || !settings.autoAccept}
                max={100}
                min={50}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    confidenceThresholdPercent: Number(event.target.value),
                  })
                }
                type="range"
                value={settings.confidenceThresholdPercent}
              />
              <small className="text-ink-muted">
                Más alto, menos errores pero más pedidos para revisar a mano.
              </small>
            </label>

            <label className="field">
              Radio máximo desde el origen de la ciudad (km)
              <input
                disabled={!canManage || !settings.autoAccept}
                max={500}
                min={1}
                onChange={(event) =>
                  setSettings({ ...settings, radiusKm: Number(event.target.value) })
                }
                type="number"
                value={settings.radiusKm}
              />
              <small className="text-ink-muted">
                Un punto más lejos que esto nunca se acepta solo, por más seguro que parezca. Hace
                falta que la ciudad tenga cargado su punto de origen.
              </small>
            </label>

            <label className="field">
              Referencia de la ciudad
              <input
                disabled={!canManage}
                maxLength={120}
                onChange={(event) => setSettings({ ...settings, cityContext: event.target.value })}
                placeholder="Cipolletti, Río Negro, Argentina"
                value={settings.cityContext ?? ''}
              />
              <small className="text-ink-muted">
                Orienta la búsqueda cuando la dirección no dice la ciudad.
              </small>
            </label>

            {canManage ? (
              <div className="form-actions">
                <button className="button button-primary" disabled={saving} type="submit">
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                Sólo lectura: no podés cambiar estos ajustes.
              </p>
            )}
          </form>
        ) : null}

        <h2 className="system-section">Cómo viene funcionando</h2>
        <label className="field mt-2 max-w-xs">
          Período
          <select onChange={(event) => setDays(Number(event.target.value))} value={days}>
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
        </label>
        {metrics ? (
          <dl className="system-stats">
            <div>
              <dt>Ubicaciones pedidas</dt>
              <dd>{metrics.requests.total}</dd>
            </div>
            <div>
              <dt>Confirmadas</dt>
              <dd>
                {metrics.requests.confirmed} (
                {percent(metrics.requests.confirmed, metrics.requests.total)})
              </dd>
            </div>
            <div>
              <dt>Esperando revisión</dt>
              <dd>{metrics.requests.pending}</dd>
            </div>
            <div>
              <dt>No encontradas</dt>
              <dd>{metrics.requests.noMatch}</dd>
            </div>
            <div>
              <dt>Con error del buscador</dt>
              <dd>{metrics.requests.failed}</dd>
            </div>
            <div>
              <dt>Llamadas a la IA</dt>
              <dd>
                {metrics.ai.calls}
                {metrics.ai.failed > 0 ? ` (${String(metrics.ai.failed)} fallaron)` : ''}
              </dd>
            </div>
            <div>
              <dt>Tokens de IA (entrada / salida)</dt>
              <dd>
                {metrics.ai.inputTokens.toLocaleString('es-AR')} /{' '}
                {metrics.ai.outputTokens.toLocaleString('es-AR')}
              </dd>
            </div>
            <div>
              <dt>Demora media de la IA</dt>
              <dd>
                {metrics.ai.averageLatencyMs === null
                  ? '—'
                  : `${String(metrics.ai.averageLatencyMs)} ms`}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">Sin datos para mostrar.</p>
        )}
        <p className="system-modal-meta">
          Las llamadas a la IA son de todo el sistema. Las ubicaciones, de la ciudad elegida.
        </p>
      </section>
    </DashboardShell>
  );
}
