import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DashboardShell, type DashboardProfile } from '../components/DashboardShell.js';
import { apiRequest } from '../lib/api.js';

export interface OperatingSite {
  active: boolean;
  coverImageUrl: string | null;
  createdAt: string;
  displayName: string;
  id: string;
  orderPrefix: string;
  publicEmail: string | null;
  publicPhone: string | null;
  publicWhatsapp: string | null;
  slug: string;
  sortOrder: number;
  timezone: string;
  updatedAt: string;
  zoneCount: number;
}

export interface GeographicZone {
  active: boolean;
  coverImageUrl: string | null;
  coverageDescription: string | null;
  createdAt: string;
  displayName: string;
  id: string;
  operatingSiteId: string;
  publicPhoneOverride: string | null;
  publicWhatsappOverride: string | null;
  slug: string;
  sortOrder: number;
  updatedAt: string;
}

interface ApiError {
  error?: { message?: string };
}

const emptySiteDraft = {
  displayName: '',
  orderPrefix: '',
  slug: '',
  timezone: 'America/Argentina/Buenos_Aires',
};

const emptyZoneDraft = {
  coverageDescription: '',
  displayName: '',
  slug: '',
};

async function readError(response: Response, fallback: string): Promise<string> {
  const body = (await response.json().catch(() => null)) as ApiError | null;
  return body?.error?.message ?? fallback;
}

export function GeographySettingsPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<DashboardProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [sites, setSites] = useState<OperatingSite[]>([]);
  const [zones, setZones] = useState<GeographicZone[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [siteDraft, setSiteDraft] = useState(emptySiteDraft);
  const [zoneDraft, setZoneDraft] = useState(emptyZoneDraft);

  const canManageSites = profile?.permissions.includes('sites.manage') ?? false;
  const canManageZones = profile?.permissions.includes('zones.manage') ?? false;

  useEffect(() => {
    let active = true;
    void apiRequest('/api/v1/me')
      .then(async (response) => {
        if (response.status === 401) {
          await navigate('/login', { replace: true });
          return;
        }
        if (!response.ok) throw new Error('Could not load session');
        const body = (await response.json()) as DashboardProfile;
        if (active) setProfile(body);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  const loadSites = useCallback(async () => {
    const response = await apiRequest('/api/v1/operating-sites');
    if (!response.ok) {
      setMessage(await readError(response, 'No pudimos cargar las operaciones.'));
      return;
    }
    const body = (await response.json()) as { items: OperatingSite[] };
    setSites(body.items);
    setSelectedSiteId((current) => current ?? body.items[0]?.id ?? null);
  }, []);

  useEffect(() => {
    if (!profile?.permissions.includes('sites.read')) return;
    void loadSites();
  }, [loadSites, profile?.permissions]);

  useEffect(() => {
    if (!selectedSiteId) {
      setZones([]);
      return;
    }
    let active = true;
    void apiRequest(`/api/v1/operating-sites/${selectedSiteId}/zones`)
      .then(async (response) => {
        if (!response.ok) throw new Error('zones');
        const body = (await response.json()) as { items: GeographicZone[] };
        if (active) setZones(body.items);
      })
      .catch(() => {
        if (active) setZones([]);
      });
    return () => {
      active = false;
    };
  }, [selectedSiteId]);

  const selectedSite = useMemo(
    () => sites.find((site) => site.id === selectedSiteId) ?? null,
    [selectedSiteId, sites],
  );

  async function logout() {
    await apiRequest('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    await navigate('/login', { replace: true });
  }

  async function createSite() {
    if (!siteDraft.displayName.trim() || !siteDraft.slug.trim() || !siteDraft.orderPrefix.trim()) {
      setMessage('Completá nombre, identificador y prefijo de pedidos.');
      return;
    }
    setBusy(true);
    setMessage(null);
    const response = await apiRequest('/api/v1/operating-sites', {
      body: JSON.stringify({
        displayName: siteDraft.displayName.trim(),
        orderPrefix: siteDraft.orderPrefix.trim().toUpperCase(),
        slug: siteDraft.slug.trim(),
        timezone: siteDraft.timezone.trim(),
      }),
      method: 'POST',
    });
    setBusy(false);
    if (!response.ok) {
      setMessage(await readError(response, 'No pudimos crear la operación.'));
      return;
    }
    const created = (await response.json()) as OperatingSite;
    setSiteDraft(emptySiteDraft);
    setSelectedSiteId(created.id);
    setMessage(`Operación "${created.displayName}" creada.`);
    await loadSites();
  }

  async function toggleSiteActive(site: OperatingSite) {
    setBusy(true);
    setMessage(null);
    const response = await apiRequest(`/api/v1/operating-sites/${site.id}`, {
      body: JSON.stringify({ active: !site.active }),
      method: 'PATCH',
    });
    setBusy(false);
    if (!response.ok) {
      setMessage(await readError(response, 'No pudimos actualizar la operación.'));
      return;
    }
    setMessage(
      site.active
        ? `"${site.displayName}" quedó inactiva. Sus datos históricos se conservan.`
        : `"${site.displayName}" quedó activa.`,
    );
    await loadSites();
  }

  async function createZone() {
    if (!selectedSiteId) return;
    if (!zoneDraft.displayName.trim() || !zoneDraft.slug.trim()) {
      setMessage('Completá nombre e identificador de la zona.');
      return;
    }
    setBusy(true);
    setMessage(null);
    const response = await apiRequest(`/api/v1/operating-sites/${selectedSiteId}/zones`, {
      body: JSON.stringify({
        ...(zoneDraft.coverageDescription.trim()
          ? { coverageDescription: zoneDraft.coverageDescription.trim() }
          : {}),
        displayName: zoneDraft.displayName.trim(),
        slug: zoneDraft.slug.trim(),
      }),
      method: 'POST',
    });
    setBusy(false);
    if (!response.ok) {
      setMessage(await readError(response, 'No pudimos crear la zona.'));
      return;
    }
    const created = (await response.json()) as GeographicZone;
    setZones((current) => [...current, created]);
    setZoneDraft(emptyZoneDraft);
    setMessage(`Zona "${created.displayName}" creada.`);
    await loadSites();
  }

  async function toggleZoneActive(zone: GeographicZone) {
    setBusy(true);
    setMessage(null);
    const response = await apiRequest(`/api/v1/zones/${zone.id}`, {
      body: JSON.stringify({ active: !zone.active }),
      method: 'PATCH',
    });
    setBusy(false);
    if (!response.ok) {
      setMessage(await readError(response, 'No pudimos actualizar la zona.'));
      return;
    }
    const updated = (await response.json()) as GeographicZone;
    setZones((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setMessage(`Zona "${updated.displayName}" ${updated.active ? 'activada' : 'desactivada'}.`);
  }

  if (failed) {
    return (
      <main className="grid min-h-screen place-items-center bg-cream px-5 text-center">
        <div>
          <p className="eyebrow">Verdeo SCA</p>
          <h1 className="mt-4 text-3xl font-semibold text-forest">
            No pudimos cargar los ajustes.
          </h1>
          <button className="button button-primary mt-7" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="dashboard-loading" aria-live="polite">
        <img src="/brand/verdeo-icon.png" alt="" width="54" height="54" />
        <p>Cargando tu espacio…</p>
      </main>
    );
  }

  if (!profile.permissions.includes('sites.read')) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Zonas geográficas</h1>
          <p className="mt-3 text-ink-muted">
            Tu usuario no tiene permiso para ver la configuración de operaciones y zonas.
          </p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Ajustes</p>
          <h1 className="text-2xl font-semibold text-forest">Zonas geográficas</h1>
          <p className="mt-2 max-w-3xl text-ink-muted">
            Una operación es el límite de pedidos, cocina y reparto. Cada operación cubre un área
            que puede incluir localidades vecinas, organizadas como zonas. Las operaciones y zonas
            se desactivan; nunca se eliminan, para conservar el historial.
          </p>
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div>
            <h2 className="text-lg font-semibold text-forest">Operaciones</h2>
            <ul className="mt-4 space-y-2">
              {sites.map((site) => (
                <li key={site.id}>
                  <div
                    className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                      site.id === selectedSiteId
                        ? 'border-forest bg-forest/5'
                        : 'border-[var(--db-border)] bg-[var(--db-surface)]'
                    }`}
                  >
                    <button
                      className="flex-1 text-left"
                      onClick={() => setSelectedSiteId(site.id)}
                      type="button"
                    >
                      <strong className="block text-forest">{site.displayName}</strong>
                      <small className="text-ink-muted">
                        {site.orderPrefix} · {site.zoneCount}{' '}
                        {site.zoneCount === 1 ? 'zona' : 'zonas'} ·{' '}
                        {site.active ? 'activa' : 'inactiva'}
                      </small>
                    </button>
                    {canManageSites ? (
                      <button
                        className="button button-secondary"
                        disabled={busy}
                        onClick={() => void toggleSiteActive(site)}
                        type="button"
                      >
                        {site.active ? 'Desactivar' : 'Activar'}
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
              {sites.length === 0 ? (
                <li className="rounded-xl border border-dashed border-forest/20 px-4 py-6 text-center text-ink-muted">
                  Todavía no hay operaciones configuradas.
                </li>
              ) : null}
            </ul>

            {canManageSites ? (
              <form
                className="mt-6 space-y-3 rounded-xl border border-[var(--db-border)] bg-[var(--db-surface)] p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void createSite();
                }}
              >
                <h3 className="font-semibold text-forest">Nueva operación</h3>
                <label className="block text-sm">
                  Nombre
                  <input
                    className="mt-1 w-full rounded-lg border border-forest/20 px-3 py-2"
                    onChange={(event) =>
                      setSiteDraft((current) => ({ ...current, displayName: event.target.value }))
                    }
                    value={siteDraft.displayName}
                  />
                </label>
                <label className="block text-sm">
                  Identificador (slug)
                  <input
                    className="mt-1 w-full rounded-lg border border-forest/20 px-3 py-2"
                    onChange={(event) =>
                      setSiteDraft((current) => ({ ...current, slug: event.target.value }))
                    }
                    placeholder="neuquen"
                    value={siteDraft.slug}
                  />
                </label>
                <label className="block text-sm">
                  Prefijo de pedidos
                  <input
                    className="mt-1 w-full rounded-lg border border-forest/20 px-3 py-2"
                    onChange={(event) =>
                      setSiteDraft((current) => ({ ...current, orderPrefix: event.target.value }))
                    }
                    placeholder="NQN"
                    value={siteDraft.orderPrefix}
                  />
                </label>
                <label className="block text-sm">
                  Zona horaria
                  <input
                    className="mt-1 w-full rounded-lg border border-forest/20 px-3 py-2"
                    onChange={(event) =>
                      setSiteDraft((current) => ({ ...current, timezone: event.target.value }))
                    }
                    value={siteDraft.timezone}
                  />
                </label>
                <p className="text-xs text-ink-muted">
                  El prefijo queda fijo una vez que la operación emitió pedidos.
                </p>
                <button className="button button-primary" disabled={busy} type="submit">
                  Crear operación
                </button>
              </form>
            ) : null}
          </div>

          <div>
            <h2 className="text-lg font-semibold text-forest">
              {selectedSite ? `Zonas de ${selectedSite.displayName}` : 'Zonas'}
            </h2>

            {!selectedSite ? (
              <p className="mt-4 text-ink-muted">Elegí una operación para ver sus zonas.</p>
            ) : (
              <>
                <ul className="mt-4 space-y-2">
                  {zones.map((zone) => (
                    <li
                      className="flex items-center justify-between gap-3 rounded-xl border border-[var(--db-border)] bg-[var(--db-surface)] px-4 py-3"
                      key={zone.id}
                    >
                      <div>
                        <strong className="block text-forest">{zone.displayName}</strong>
                        <small className="text-ink-muted">
                          {zone.slug} · {zone.active ? 'activa' : 'inactiva'}
                        </small>
                        {zone.coverageDescription ? (
                          <p className="mt-1 text-sm text-ink-muted">{zone.coverageDescription}</p>
                        ) : null}
                      </div>
                      {canManageZones ? (
                        <button
                          className="button button-secondary"
                          disabled={busy}
                          onClick={() => void toggleZoneActive(zone)}
                          type="button"
                        >
                          {zone.active ? 'Desactivar' : 'Activar'}
                        </button>
                      ) : null}
                    </li>
                  ))}
                  {zones.length === 0 ? (
                    <li className="rounded-xl border border-dashed border-forest/20 px-4 py-6 text-center text-ink-muted">
                      Esta operación todavía no tiene zonas.
                    </li>
                  ) : null}
                </ul>

                {canManageZones ? (
                  <form
                    className="mt-6 space-y-3 rounded-xl border border-[var(--db-border)] bg-[var(--db-surface)] p-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void createZone();
                    }}
                  >
                    <h3 className="font-semibold text-forest">Nueva zona</h3>
                    <label className="block text-sm">
                      Nombre
                      <input
                        className="mt-1 w-full rounded-lg border border-forest/20 px-3 py-2"
                        onChange={(event) =>
                          setZoneDraft((current) => ({
                            ...current,
                            displayName: event.target.value,
                          }))
                        }
                        value={zoneDraft.displayName}
                      />
                    </label>
                    <label className="block text-sm">
                      Identificador (slug)
                      <input
                        className="mt-1 w-full rounded-lg border border-forest/20 px-3 py-2"
                        onChange={(event) =>
                          setZoneDraft((current) => ({ ...current, slug: event.target.value }))
                        }
                        placeholder="centro"
                        value={zoneDraft.slug}
                      />
                    </label>
                    <label className="block text-sm">
                      Cobertura
                      <textarea
                        className="mt-1 w-full rounded-lg border border-forest/20 px-3 py-2"
                        onChange={(event) =>
                          setZoneDraft((current) => ({
                            ...current,
                            coverageDescription: event.target.value,
                          }))
                        }
                        placeholder="Localidades y barrios que cubre esta zona."
                        rows={3}
                        value={zoneDraft.coverageDescription}
                      />
                    </label>
                    <button className="button button-primary" disabled={busy} type="submit">
                      Crear zona
                    </button>
                  </form>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}
