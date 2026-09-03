import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { apiRequest } from '../lib/api.js';

/** "Tokens de usuarios temporales" — su propia entrada, separada de `/login` (colaboradores) y de
 * `/mi-cuenta` (clientes). Cubre dos casos que ya existían mezclados en el login general:
 * `repartidor_access` (un link que un admin le manda a un repartidor) y `user_invite` (invitar a
 * un colaborador nuevo sin pasar por Google). Casi siempre se llega acá por un link directo, no
 * navegando — separarlo de `/login` evita que alguien confunda "tengo un token" con "inicio de
 * sesión normal". */
export function AccessTokenLoginPage() {
  const navigate = useNavigate();
  const [accessToken, setAccessToken] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await apiRequest('/api/v1/auth/token-login', {
        body: JSON.stringify({
          displayName: displayName.trim() ? displayName.trim() : undefined,
          token: accessToken.trim(),
        }),
        method: 'POST',
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? 'No pudimos validar el token.');
        return;
      }

      // A repartidor's token used to land on the full dashboard, which is neither useful to them
      // nor what they were given the token for. Where they belong is decided by what they can
      // actually do — someone who can execute deliveries but cannot read orders has exactly one
      // screen, so send them straight to it.
      const permissions: string[] = await apiRequest('/api/v1/me')
        .then(async (meResponse) =>
          meResponse.ok
            ? (((await meResponse.json()) as { permissions?: string[] }).permissions ?? [])
            : [],
        )
        // Routing is a nicety; a failed lookup falls back to the dashboard rather than blocking.
        .catch(() => []);
      const deliveryOnly =
        permissions.includes('delivery.execute') && !permissions.includes('orders.read');

      await navigate(deliveryOnly ? '/delivery' : '/app', { replace: true });
    } catch {
      setError('No pudimos conectarnos con Verdeo. Revisá la conexión e intentá nuevamente.');
    } finally {
      setSubmitting(false);
    }
  }

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
          <p className="eyebrow mt-16">Acceso con token</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-forest sm:text-5xl">
            Entrá con el link que te mandaron.
          </h1>
          <p className="mt-4 leading-7 text-ink-muted">
            Para repartidores con un enlace de acceso, o para colaboradores nuevos invitados sin
            cuenta de Google todavía.
          </p>

          <form className="mt-10 space-y-5" onSubmit={(event) => void submit(event)}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-forest">Token de acceso</span>
              <input
                className="min-h-12 w-full rounded-2xl border border-forest/20 bg-white px-4 text-base outline-none transition focus:border-forest focus:ring-4 focus:ring-forest/10"
                onChange={(event) => setAccessToken(event.target.value)}
                placeholder="vrd_…"
                required
                value={accessToken}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-forest">
                Tu nombre (solo si es una invitación nueva)
              </span>
              <input
                className="min-h-12 w-full rounded-2xl border border-forest/20 bg-white px-4 text-base outline-none transition focus:border-forest focus:ring-4 focus:ring-forest/10"
                onChange={(event) => setDisplayName(event.target.value)}
                value={displayName}
              />
            </label>
            {error ? (
              <p
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                role="alert"
              >
                {error}
              </p>
            ) : null}
            <button
              className="button button-primary button-large w-full disabled:cursor-wait disabled:opacity-60"
              disabled={submitting}
              type="submit"
            >
              {submitting ? 'Validando…' : 'Acceder'}
            </button>
          </form>

          <Link
            className="mt-6 inline-block text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted underline underline-offset-4"
            to="/login"
          >
            Volver al acceso de colaboradores
          </Link>
        </div>
      </section>

      <aside className="relative hidden overflow-hidden bg-forest p-14 text-white lg:flex lg:flex-col lg:justify-end">
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-lime opacity-90" />
        <div className="absolute right-28 top-40 h-52 w-52 rounded-full border-[42px] border-white/10" />
        <div className="relative max-w-xl">
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-lime">Verdeo SCA</p>
          <p className="mt-5 text-4xl font-medium leading-tight tracking-[-0.035em]">
            Una sola operación para clientes, pedidos, producción y reparto.
          </p>
        </div>
      </aside>
    </main>
  );
}
