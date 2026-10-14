import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { weekdayName } from '../components/DeliveryDayPicker.js';
import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { SettingsTabs } from '../components/SettingsTabs.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface Settings {
  defaultWeekday: number | null;
  weekdays: number[];
}

// De lunes a domingo, que es como se piensa la semana de reparto.
const WEEK = [1, 2, 3, 4, 5, 6, 0];

/**
 * "Reparto": los días de la semana en que reparte la ciudad elegida arriba, y cuál es el de siempre.
 *
 * Con días marcados, cada pedido elige uno (en la carga, la edición y el importador), y el servidor
 * sólo acepta esos. Sin ninguno, se reparte el día del cierre del período, como siempre fue. Las
 * fechas salen del período: cada día marcado da su primera fecha desde el cierre.
 */
export function DeliverySettingsPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const canRead = profile?.permissions.includes('sites.read') ?? false;
  const canManage = profile?.permissions.includes('sites.manage') ?? false;
  const [settings, setSettings] = useState<Settings | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const response = await apiRequest('/api/v1/delivery/settings', { notify: false });
    if (response.ok) {
      setSettings((await response.json()) as Settings);
      setMessage('');
    } else {
      setSettings(null);
      setMessage(await errorMessage(response));
    }
  }, []);

  useEffect(() => {
    if (canRead) void load();
  }, [canRead, load]);

  function toggle(day: number) {
    if (!settings) return;
    const weekdays = settings.weekdays.includes(day)
      ? settings.weekdays.filter((value) => value !== day)
      : [...settings.weekdays, day];
    const defaultWeekday =
      settings.defaultWeekday !== null && weekdays.includes(settings.defaultWeekday)
        ? settings.defaultWeekday
        : (weekdays[0] ?? null);
    setSettings({ defaultWeekday, weekdays });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    const response = await apiRequest('/api/v1/delivery/settings', {
      body: JSON.stringify(settings),
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
    showToast('Días de reparto guardados.');
  }

  if (failed) return <DashboardFailed label="los días de reparto" />;
  if (!profile) return <DashboardLoading />;

  if (!canRead) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Reparto</h1>
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
          <h1 className="text-2xl font-semibold text-forest">Reparto</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Los días de la semana en que reparte la ciudad elegida arriba. Cada pedido elige uno de
            estos días; sin ninguno marcado, se reparte el día del cierre del período.
          </p>
        </header>

        {message ? <p className="mt-4 text-sm text-ink-muted">{message}</p> : null}

        {settings ? (
          <form className="settings-form mt-6 grid gap-5" onSubmit={(event) => void save(event)}>
            <fieldset className="delivery-days">
              <legend>Días de reparto</legend>
              <div className="delivery-days-options">
                {WEEK.map((day) => (
                  <button
                    aria-pressed={settings.weekdays.includes(day)}
                    className={settings.weekdays.includes(day) ? 'is-selected' : ''}
                    disabled={!canManage}
                    key={day}
                    onClick={() => toggle(day)}
                    type="button"
                  >
                    <strong>{weekdayName(day)}</strong>
                  </button>
                ))}
              </div>
            </fieldset>

            {settings.weekdays.length > 1 ? (
              <fieldset className="delivery-days">
                <legend>El de siempre</legend>
                <p className="text-sm text-ink-muted">
                  El que viene elegido en cada pedido nuevo y en el importador.
                </p>
                <div className="delivery-days-options" role="radiogroup">
                  {WEEK.filter((day) => settings.weekdays.includes(day)).map((day) => (
                    <button
                      aria-checked={settings.defaultWeekday === day}
                      className={settings.defaultWeekday === day ? 'is-selected' : ''}
                      disabled={!canManage}
                      key={day}
                      onClick={() => setSettings({ ...settings, defaultWeekday: day })}
                      role="radio"
                      type="button"
                    >
                      <strong>{weekdayName(day)}</strong>
                    </button>
                  ))}
                </div>
              </fieldset>
            ) : null}

            {canManage ? (
              <div>
                <button className="button button-primary" disabled={saving} type="submit">
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            ) : null}
          </form>
        ) : null}
      </section>
    </DashboardShell>
  );
}
