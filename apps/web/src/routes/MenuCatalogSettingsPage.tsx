import { useCallback, useEffect, useState } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

/** "Ajustes → Menú personalizado": a single standing switch for whether Intuitivo can be offered
 * at all. Turning it off doesn't touch any menu already created — "Configurar la semana" simply
 * stops letting an operator include it in a new week, and rejects the attempt server-side too if
 * it somehow reaches the API with the toggle off. */
export function MenuCatalogSettingsPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [intuitivoEnabled, setIntuitivoEnabled] = useState<boolean | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const canManage = profile?.permissions.includes('production.generate') ?? false;
  const canRead = canManage || (profile?.permissions.includes('production.read') ?? false);

  const load = useCallback(async () => {
    const response = await apiRequest('/api/v1/menu-catalog/settings');
    if (response.ok) {
      const body = (await response.json()) as { intuitivoEnabled: boolean };
      setIntuitivoEnabled(body.intuitivoEnabled);
    }
  }, []);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  async function toggle() {
    if (intuitivoEnabled === null) return;
    setSaving(true);
    setMessage('');
    const response = await apiRequest('/api/v1/menu-catalog/settings', {
      body: JSON.stringify({ intuitivoEnabled: !intuitivoEnabled }),
      method: 'PATCH',
    });
    setSaving(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const body = (await response.json()) as { intuitivoEnabled: boolean };
    setIntuitivoEnabled(body.intuitivoEnabled);
  }

  if (failed) return <DashboardFailed label="el menú personalizado" />;
  if (!profile) return <DashboardLoading />;

  if (!canRead) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Menú personalizado</h1>
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
          <h1 className="text-2xl font-semibold text-forest">Menú personalizado</h1>
        </header>

        <p className="mt-3 max-w-xl text-sm text-ink-muted">
          Controla si Intuitivo — la variedad donde el cliente elige cinco platos del universo
          publicado esa semana — puede ofrecerse. Es un interruptor único para todo el catálogo, no
          una elección semana a semana: cuando está apagado, &quot;Configurar la semana&quot; no
          deja incluirlo.
        </p>

        {message ? <p className="mt-4 text-sm text-red-600">{message}</p> : null}

        <div className="mt-6 flex items-center justify-between rounded-2xl border border-forest/10 bg-[var(--db-surface)] p-6">
          <div>
            <p className="font-semibold text-forest">Intuitivo</p>
            <p className="text-sm text-ink-muted">
              {intuitivoEnabled === null
                ? 'Cargando…'
                : intuitivoEnabled
                  ? 'Habilitado'
                  : 'Deshabilitado'}
            </p>
          </div>
          {canManage ? (
            <button
              className="button button-primary"
              disabled={intuitivoEnabled === null || saving}
              onClick={() => void toggle()}
              type="button"
            >
              {saving ? 'Guardando…' : intuitivoEnabled ? 'Deshabilitar' : 'Habilitar'}
            </button>
          ) : null}
        </div>
      </section>
    </DashboardShell>
  );
}
