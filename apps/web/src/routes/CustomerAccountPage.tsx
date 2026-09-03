import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { apiRequest } from '../lib/api.js';
import { errorMessage, formatMoney, orderStatusLabel } from '../lib/operations.js';
import { startGoogleOAuth } from '../lib/oauth.js';
import { isSupabaseOAuthConfigured } from '../lib/supabase.js';

interface CustomerAddress {
  geographicZoneId: string;
  id: string;
  label: string;
  locationUrl: string | null;
  writtenAddress: string;
}

interface CustomerProfile {
  addresses?: CustomerAddress[];
  displayName: string;
}

interface OrderSummary {
  deliveryDate: string;
  id: string;
  publicNumber: string;
  status: string;
  totalMinor: number;
  currency: string;
}

interface OperatingSite {
  displayName: string;
  slug: string;
}

interface Zone {
  displayName: string;
  id: string;
}

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

/** "Mi cuenta" — la cuenta de cliente es opcional: pedir sigue funcionando como invitado
 * (`/pedido`), esto es solo para quien quiere guardar direcciones y ver su historial. Login propio
 * (Google, vía Supabase), sin compartir código con el acceso de colaboradores — ver
 * `resolveOrProvisionCustomer` del lado del servidor. */
export function CustomerAccountPage() {
  const [checking, setChecking] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [message, setMessage] = useState('');
  const [oauthSubmitting, setOAuthSubmitting] = useState(false);
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const oauthAvailable = isSupabaseOAuthConfigured();

  const [addingAddress, setAddingAddress] = useState(false);
  const [sites, setSites] = useState<OperatingSite[]>([]);
  const [selectedSiteSlug, setSelectedSiteSlug] = useState('');
  const [zones, setZones] = useState<Zone[]>([]);

  const load = useCallback(async () => {
    setChecking(true);
    const [customerResponse, ordersResponse] = await Promise.all([
      apiRequest('/api/v1/me/customer'),
      apiRequest('/api/v1/me/orders'),
    ]);
    if (customerResponse.status === 401) {
      setLoggedIn(false);
      setChecking(false);
      return;
    }
    if (customerResponse.status === 403) {
      setLoggedIn(true);
      setMessage('Esta cuenta no es una cuenta de cliente.');
      setChecking(false);
      return;
    }
    if (customerResponse.ok) {
      setProfile((await customerResponse.json()) as CustomerProfile);
      setLoggedIn(true);
    }
    if (ordersResponse.ok) {
      setOrders(((await ordersResponse.json()) as { items: OrderSummary[] }).items);
    }
    setChecking(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!addingAddress) return;
    void apiRequest('/api/v1/public/operating-sites').then(async (response) => {
      if (response.ok) {
        setSites(((await response.json()) as { items: OperatingSite[] }).items);
      }
    });
  }, [addingAddress]);

  useEffect(() => {
    if (!selectedSiteSlug) {
      setZones([]);
      return;
    }
    void apiRequest(`/api/v1/public/operating-sites/${selectedSiteSlug}/zones`).then(
      async (response) => {
        if (response.ok) {
          setZones(((await response.json()) as { items: Zone[] }).items);
        }
      },
    );
  }, [selectedSiteSlug]);

  async function continueWithGoogle() {
    setMessage('');
    setOAuthSubmitting(true);
    try {
      await startGoogleOAuth('cliente');
    } catch {
      setMessage('No pudimos iniciar el acceso con Google. Intentá nuevamente.');
      setOAuthSubmitting(false);
    }
  }

  // The sign-in link arrives as ?token=… on this page; consuming it opens the session and the
  // parameter is stripped so a refresh or a shared URL cannot replay it.
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) return;
    let active = true;
    void apiRequest('/api/v1/public/auth/email/consume', {
      body: JSON.stringify({ token }),
      method: 'POST',
    })
      .then(async (response) => {
        window.history.replaceState({}, '', '/mi-cuenta');
        if (!active) return;
        if (!response.ok) {
          setMessage(await errorMessage(response));
          return;
        }
        setLoggedIn(true);
        await load();
      })
      .catch(() => {
        if (active) setMessage('No pudimos validar el enlace. Pedí uno nuevo.');
      });
    return () => {
      active = false;
    };
  }, [load]);

  async function requestEmailLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = formText(new FormData(event.currentTarget), 'email').trim();
    if (!email) {
      setMessage('Ingresá tu correo.');
      return;
    }
    setEmailSubmitting(true);
    setMessage('');
    try {
      const response = await apiRequest('/api/v1/public/auth/email/request', {
        body: JSON.stringify({ email }),
        method: 'POST',
      });
      if (!response.ok) {
        setMessage(await errorMessage(response));
        return;
      }
      // The API answers the same whether the address is known or not, so the screen does too.
      setLinkSent(true);
    } finally {
      setEmailSubmitting(false);
    }
  }

  async function logout() {
    await apiRequest('/api/v1/auth/logout', { method: 'POST' });
    setLoggedIn(false);
    setProfile(null);
    setOrders([]);
  }

  async function addAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const geographicZoneId = formText(form, 'geographicZoneId');
    const writtenAddress = formText(form, 'writtenAddress').trim();
    const label = formText(form, 'label').trim();
    if (!geographicZoneId || !writtenAddress || !label) {
      setMessage('Completá zona, dirección y una etiqueta (ej. "Casa").');
      return;
    }
    setMessage('');
    const locationUrl = formText(form, 'locationUrl').trim();
    const response = await apiRequest('/api/v1/me/addresses', {
      body: JSON.stringify({
        geographicZoneId,
        label,
        ...(locationUrl ? { locationUrl } : {}),
        writtenAddress,
      }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setAddingAddress(false);
    setSelectedSiteSlug('');
    await load();
  }

  if (checking) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cream">
        <p className="text-ink-muted">Cargando…</p>
      </main>
    );
  }

  if (!loggedIn) {
    return (
      <main className="grid min-h-screen bg-cream lg:grid-cols-[0.85fr_1.15fr]">
        <section className="flex items-center px-5 py-10 sm:px-10 lg:px-16">
          <div className="mx-auto w-full max-w-md">
            <Link className="brand" to="/" aria-label="Verdeo, inicio">
              <img
                className="brand-icon"
                src="/brand/verdeo-icon.png"
                alt=""
                width="36"
                height="36"
              />
              verdeo<span>.</span>
            </Link>
            <p className="eyebrow mt-16">Mi cuenta</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-forest sm:text-5xl">
              Guardá tus direcciones y tu historial.
            </h1>
            <p className="mt-4 leading-7 text-ink-muted">
              No hace falta cuenta para pedir — podés seguir pidiendo como invitado. Esto es para
              quien quiere guardar direcciones y ver pedidos anteriores más rápido.
            </p>

            {linkSent ? (
              <div className="mt-10 rounded-2xl border border-forest/15 bg-white/70 p-5">
                <p className="font-semibold text-forest">Revisá tu correo</p>
                <p className="mt-1 text-sm leading-6 text-ink-muted">
                  Si el correo es válido, te enviamos un enlace para entrar. Vence en 15 minutos y
                  sirve una sola vez.
                </p>
                <button
                  className="mt-3 text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted underline underline-offset-4"
                  onClick={() => setLinkSent(false)}
                  type="button"
                >
                  Usar otro correo
                </button>
              </div>
            ) : (
              <form className="mt-10" onSubmit={(event) => void requestEmailLink(event)}>
                <label className="field">
                  Tu correo
                  <input
                    autoComplete="email"
                    name="email"
                    placeholder="vos@ejemplo.com"
                    required
                    type="email"
                  />
                </label>
                <button
                  className="button button-primary button-large mt-3 w-full disabled:cursor-wait disabled:opacity-60"
                  disabled={emailSubmitting}
                  type="submit"
                >
                  {emailSubmitting ? 'Enviando…' : 'Enviarme un enlace para entrar'}
                </button>
                <p className="mt-2 text-xs leading-5 text-ink-muted">
                  Sin contraseña: te mandamos un enlace y entrás con un toque.
                </p>
              </form>
            )}

            {oauthAvailable ? (
              <button
                className="button button-secondary button-large mt-4 w-full disabled:cursor-wait disabled:opacity-60"
                disabled={oauthSubmitting}
                onClick={() => void continueWithGoogle()}
                type="button"
              >
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-sm font-bold text-blue-600 shadow-sm"
                  aria-hidden="true"
                >
                  G
                </span>
                {oauthSubmitting ? 'Conectando con Google…' : 'Continuar con Google'}
              </button>
            ) : null}

            {message ? (
              <p
                className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                role="alert"
              >
                {message}
              </p>
            ) : null}

            <Link
              className="mt-8 inline-block text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted underline underline-offset-4"
              to="/pedido"
            >
              Pedir como invitado
            </Link>
          </div>
        </section>

        <aside className="relative hidden overflow-hidden bg-forest p-14 text-white lg:flex lg:flex-col lg:justify-end">
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-lime opacity-90" />
          <div className="relative max-w-xl">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-lime">Verdeo SCA</p>
            <p className="mt-5 text-4xl font-medium leading-tight tracking-[-0.035em]">
              Tus direcciones y tus pedidos, siempre a mano.
            </p>
          </div>
        </aside>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-5 py-5 sm:px-8">
        <Link className="brand" to="/">
          <img className="brand-icon" src="/brand/verdeo-icon.png" alt="" width="36" height="36" />
          verdeo<span>.</span>
        </Link>
        <button className="button button-secondary" onClick={() => void logout()} type="button">
          Cerrar sesión
        </button>
      </header>

      <main className="mx-auto w-full max-w-4xl px-5 pb-16 pt-6 sm:px-8">
        <p className="eyebrow">Mi cuenta</p>
        <h1 className="mt-2 text-3xl font-semibold text-forest">
          Hola{profile ? `, ${profile.displayName}` : ''}
        </h1>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">
              Direcciones guardadas
            </h2>
            <button
              className="button button-secondary"
              onClick={() => setAddingAddress((current) => !current)}
              type="button"
            >
              {addingAddress ? 'Cancelar' : 'Agregar dirección'}
            </button>
          </div>

          {addingAddress ? (
            <form
              className="operation-card mt-4 grid gap-4"
              onSubmit={(event) => void addAddress(event)}
            >
              <div className="form-grid">
                <label className="field">
                  Ciudad
                  <select
                    onChange={(event) => setSelectedSiteSlug(event.target.value)}
                    value={selectedSiteSlug}
                  >
                    <option value="">Elegir</option>
                    {sites.map((site) => (
                      <option key={site.slug} value={site.slug}>
                        {site.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Zona
                  <select disabled={zones.length === 0} name="geographicZoneId">
                    <option value="">Elegir</option>
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Etiqueta
                  <input name="label" placeholder="Casa, trabajo…" required />
                </label>
                <label className="field field-wide">
                  Dirección
                  <input name="writtenAddress" required />
                </label>
                <div className="field field-wide">
                  <label htmlFor="locationUrl">Compartir tu ubicación exacta (opcional)</label>
                  <input
                    id="locationUrl"
                    name="locationUrl"
                    placeholder="Pegá acá el enlace de Google Maps"
                    type="url"
                  />
                  <p className="mt-1 text-xs leading-5 text-ink-muted">
                    Abrí Maps, mantené presionado sobre tu casa, tocá Compartir y pegá el enlace
                    acá. Con eso el repartidor llega directo al punto en vez de buscar la altura.{' '}
                    <a
                      className="underline"
                      href="https://www.google.com/maps"
                      rel="noreferrer"
                      target="_blank"
                    >
                      Abrir Google Maps
                    </a>
                  </p>
                </div>
              </div>
              <button className="button button-primary justify-self-start" type="submit">
                Guardar dirección
              </button>
            </form>
          ) : null}

          <div className="mt-4 grid gap-2">
            {(profile?.addresses ?? []).map((address) => (
              <div className="operation-card" key={address.id}>
                <p className="font-semibold text-forest">{address.label}</p>
                <p className="text-sm text-ink-muted">{address.writtenAddress}</p>
              </div>
            ))}
            {(profile?.addresses ?? []).length === 0 ? (
              <p className="empty-state">Todavía no guardaste ninguna dirección.</p>
            ) : null}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">
            Historial de pedidos
          </h2>
          <div className="mt-4 grid gap-2">
            {orders.map((order) => (
              <div className="operation-card" key={order.id}>
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-forest">{order.publicNumber}</strong>
                  <span className="status-chip">{orderStatusLabel(order.status)}</span>
                </div>
                <p className="mt-1 text-sm text-ink-muted">
                  {new Intl.DateTimeFormat('es-AR').format(new Date(order.deliveryDate))} ·{' '}
                  {formatMoney(order.totalMinor, order.currency)}
                </p>
              </div>
            ))}
            {orders.length === 0 ? (
              <p className="empty-state">Todavía no hiciste ningún pedido.</p>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
