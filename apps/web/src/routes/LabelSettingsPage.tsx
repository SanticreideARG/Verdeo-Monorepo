import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { SettingsTabs } from '../components/SettingsTabs.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage, type LabelSettings } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

const LABELS_PER_PAGE_OPTIONS = [4, 5, 6, 7, 8, 9, 10, 11, 12];

/** Ajustes → Etiquetas: one global row (not per-zona, unlike Intuitivo), editable by
 * superusuarios/operadores — how many labels print per page and the optional background image
 * every label carries. Sent to `PATCH /api/v1/label-settings`; the background image is uploaded
 * separately (same content-type/size checked upload as CMS media) and referenced by URL. */
export function LabelSettingsPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [settings, setSettings] = useState<LabelSettings | null>(null);
  const [labelsPerPage, setLabelsPerPage] = useState(8);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canRead = profile?.permissions.includes('production.read') ?? false;
  const canWrite = profile?.permissions.includes('production.generate') ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    const response = await apiRequest('/api/v1/label-settings');
    if (response.ok) {
      const body = (await response.json()) as LabelSettings;
      setSettings(body);
      setLabelsPerPage(body.labelsPerPage);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (canRead) void load();
    else setLoading(false);
  }, [canRead, load]);

  async function save(backgroundImageUrl?: string | null) {
    setMessage('');
    const response = await apiRequest('/api/v1/label-settings', {
      body: JSON.stringify({
        ...(backgroundImageUrl !== undefined ? { backgroundImageUrl } : {}),
        labelsPerPage,
      }),
      method: 'PATCH',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setSettings((await response.json()) as LabelSettings);
    setMessage('Configuración guardada.');
  }

  async function uploadBackground(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMessage('');
    const response = await apiRequest('/api/v1/label-settings/background', {
      body: file,
      headers: { 'content-type': file.type },
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const { url } = (await response.json()) as { url: string };
    await save(url);
  }

  async function removeBackground() {
    await save(null);
  }

  if (failed) return <DashboardFailed label="los ajustes de etiquetas" />;
  if (!profile) return <DashboardLoading />;

  if (!canRead) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Etiquetas</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver esto.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <SettingsTabs permissions={profile.permissions} />
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Ajustes</p>
          <h1 className="text-2xl font-semibold text-forest">Etiquetas</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Formato de las etiquetas de cocina: cuántas salen por hoja y el fondo que llevan
            impreso. Es una configuración única para toda la operación, no por zona.
          </p>
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : (
          <div className="operation-card mt-6 grid gap-5 max-w-md">
            <label className="field">
              Etiquetas por hoja
              <select
                disabled={!canWrite}
                onChange={(event) => setLabelsPerPage(Number(event.target.value))}
                value={labelsPerPage}
              >
                {LABELS_PER_PAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            {canWrite ? (
              <button
                className="button button-primary justify-self-start"
                onClick={() => void save()}
              >
                Guardar
              </button>
            ) : null}

            <div>
              <p className="text-sm font-semibold text-forest">Fondo de etiqueta</p>
              {settings?.backgroundImageUrl ? (
                <img
                  alt="Fondo actual de la etiqueta"
                  className="mt-2 h-32 w-32 rounded-lg border border-forest/15 object-cover"
                  src={settings.backgroundImageUrl}
                />
              ) : (
                <p className="mt-2 text-sm text-ink-muted">
                  Sin fondo configurado (etiqueta lisa).
                </p>
              )}
              {canWrite ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    accept="image/jpeg,image/png"
                    className="sr-only"
                    onChange={(event) => void uploadBackground(event)}
                    ref={fileInputRef}
                    type="file"
                  />
                  <button
                    className="button button-secondary"
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    Subir fondo (PNG o JPG)
                  </button>
                  {settings?.backgroundImageUrl ? (
                    <button
                      className="button button-secondary"
                      onClick={() => void removeBackground()}
                      type="button"
                    >
                      Quitar fondo
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
