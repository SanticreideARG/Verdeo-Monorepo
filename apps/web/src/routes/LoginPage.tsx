import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { apiRequest } from '../lib/api.js';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await apiRequest('/api/v1/auth/login', {
        body: JSON.stringify({ email, password }),
        method: 'POST',
      });

      if (!response.ok) {
        setError(
          response.status === 401
            ? 'El email o la contraseña no son válidos.'
            : 'No pudimos iniciar sesión. Intentá nuevamente.',
        );
        return;
      }

      await navigate('/app', { replace: true });
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
          <p className="eyebrow mt-16">Acceso al equipo</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-forest sm:text-5xl">
            Entrá a tu espacio de trabajo.
          </h1>
          <p className="mt-4 leading-7 text-ink-muted">
            Usá la cuenta que te asignó un administrador de Verdeo.
          </p>

          <form className="mt-10 space-y-5" onSubmit={(event) => void submit(event)}>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-forest">Email</span>
              <input
                autoComplete="username"
                className="min-h-12 w-full rounded-2xl border border-forest/20 bg-white px-4 text-base outline-none transition focus:border-forest focus:ring-4 focus:ring-forest/10"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-forest">Contraseña</span>
              <input
                autoComplete="current-password"
                className="min-h-12 w-full rounded-2xl border border-forest/20 bg-white px-4 text-base outline-none transition focus:border-forest focus:ring-4 focus:ring-forest/10"
                minLength={12}
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
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
              {submitting ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>
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
