import { useEffect, useState, type FormEvent } from 'react';

import { DashboardShell, type DashboardProfile } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

/** "Mi perfil": the account menu every user gets, regardless of role — editing your own name
 * needs only a session, not a permission. Avatar upload is a placeholder until Vercel Blob is
 * configured; the field and the fallback rendering already exist end to end (DashboardShell,
 * `/api/v1/me`), so wiring the upload later is the only piece left. */
export function ProfilePage() {
  const { failed, logout, profile: loadedProfile } = useDashboardProfile();
  const [profile, setProfile] = useState<DashboardProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loadedProfile) {
      setProfile(loadedProfile);
      setDisplayName(loadedProfile.user.displayName);
    }
  }, [loadedProfile]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;
    const trimmed = displayName.trim();
    if (!trimmed) {
      setMessage('El nombre no puede estar vacío.');
      return;
    }
    setSaving(true);
    setMessage('');
    const response = await apiRequest('/api/v1/me', {
      body: JSON.stringify({ displayName: trimmed }),
      method: 'PATCH',
    });
    setSaving(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const user = (await response.json()) as DashboardProfile['user'];
    setProfile((current) => (current ? { ...current, user } : current));
    setMessage('Perfil actualizado.');
  }

  if (failed) return <DashboardFailed label="tu perfil" />;
  if (!profile) return <DashboardLoading />;

  const initial = profile.user.displayName.trim().slice(0, 1).toLocaleUpperCase('es-AR') || 'V';

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Cuenta</p>
          <h1 className="text-2xl font-semibold text-forest">Mi perfil</h1>
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        <div className="operation-card mt-6 max-w-xl">
          <div className="flex items-center gap-4">
            <div className="profile-avatar" aria-hidden="true">
              {profile.user.avatarUrl ? <img alt="" src={profile.user.avatarUrl} /> : initial}
            </div>
            <div>
              <button
                className="button button-secondary"
                disabled
                title="Requiere configurar Vercel Blob"
                type="button"
              >
                Subir foto
              </button>
              <p className="mt-1 text-xs text-ink-muted">
                Próximamente: todavía falta configurar el almacenamiento de archivos.
              </p>
            </div>
          </div>

          <form className="mt-6 grid gap-4" onSubmit={(event) => void save(event)}>
            <label className="field">
              Nombre a mostrar
              <input
                maxLength={120}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
            </label>
            <label className="field">
              Email
              <input disabled value={profile.user.email ?? 'Sin verificar'} />
            </label>
            <button
              className="button button-primary justify-self-start"
              disabled={saving}
              type="submit"
            >
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </form>
        </div>
      </section>
    </DashboardShell>
  );
}
