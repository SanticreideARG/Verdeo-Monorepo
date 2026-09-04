import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';

const INPUT_CLASS =
  'min-h-12 w-full rounded-2xl border border-forest/10 bg-white px-4 text-base outline-none transition focus:border-forest focus:ring-4 focus:ring-forest/10';

/**
 * "Olvidé mi contraseña", las dos mitades en una sola pantalla.
 *
 * Sin `token` en la URL pide la dirección; con `token` pide la contraseña nueva. Son dos momentos
 * del mismo trámite separados por un correo, y partirlos en dos rutas obligaría a alguien que
 * vuelve del correo a entender por qué está en otra página.
 */
export function PasswordResetPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function requestLink(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await apiRequest('/api/v1/public/auth/password/request', {
        body: JSON.stringify({ email }),
        method: 'POST',
      });
      if (!response.ok) {
        setError(await errorMessage(response));
        return;
      }
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    // Se compara acá y no en el servidor: la repetición existe para atajar un tipeo, y el servidor
    // no tiene nada que hacer con la segunda copia.
    if (password !== repeat) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const response = await apiRequest('/api/v1/public/auth/password/confirm', {
        body: JSON.stringify({ password, token }),
        method: 'POST',
      });
      if (!response.ok) {
        setError(await errorMessage(response));
        return;
      }
      void navigate('/login', { replace: true });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-16">
      <Link className="brand" to="/" aria-label="Verdeo, inicio">
        <span className="text-sm font-bold uppercase tracking-[0.16em] text-forest">
          Verdeo SCA
        </span>
      </Link>

      <h1 className="mt-10 text-3xl font-medium tracking-[-0.03em]">
        {token ? 'Elegí una contraseña nueva' : 'Recuperar tu cuenta'}
      </h1>

      {token ? (
        <form className="mt-8 space-y-5" onSubmit={(event) => void confirm(event)}>
          <p className="leading-7 text-ink-muted">
            Al guardar se cierran las demás sesiones abiertas de tu cuenta.
          </p>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-forest">
              Contraseña nueva (mínimo 12 caracteres)
            </span>
            <input
              autoComplete="new-password"
              className={INPUT_CLASS}
              minLength={12}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-forest">Repetila</span>
            <input
              autoComplete="new-password"
              className={INPUT_CLASS}
              minLength={12}
              onChange={(event) => setRepeat(event.target.value)}
              required
              type="password"
              value={repeat}
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
            {submitting ? 'Guardando…' : 'Guardar y entrar'}
          </button>
        </form>
      ) : sent ? (
        <>
          {/* El mismo texto exista o no la cuenta: contestar distinto delataría quién trabaja acá. */}
          <p className="mt-6 leading-7 text-ink-muted">
            Si la dirección tiene una cuenta, te enviamos un enlace para recuperarla. Vence en 30
            minutos y sirve una sola vez.
          </p>
          <Link className="button button-secondary button-large mt-8 w-full" to="/login">
            Volver a ingresar
          </Link>
        </>
      ) : (
        <form className="mt-8 space-y-5" onSubmit={(event) => void requestLink(event)}>
          <p className="leading-7 text-ink-muted">
            Te mandamos un enlace para elegir una contraseña nueva.
          </p>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-forest">Email</span>
            <input
              autoComplete="username"
              className={INPUT_CLASS}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
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
            {submitting ? 'Enviando…' : 'Enviarme el enlace'}
          </button>
          <Link
            className="inline-block text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted underline underline-offset-4"
            to="/login"
          >
            Volver a ingresar
          </Link>
        </form>
      )}
    </main>
  );
}
