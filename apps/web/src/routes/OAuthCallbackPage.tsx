import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { completeOAuthCallback, type OAuthFlow } from '../lib/oauth.js';

function callbackErrorMessage(error: unknown, flow: OAuthFlow): string {
  if (error instanceof Error && error.message === 'ACCOUNT_NOT_PROVISIONED') {
    return flow === 'cliente'
      ? 'No pudimos verificar tu cuenta de Google. Intentá nuevamente.'
      : 'Tu cuenta de Google es válida, pero todavía no tiene acceso asignado en Verdeo.';
  }

  return 'No pudimos completar el acceso con Google. Intentá nuevamente.';
}

export function OAuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [callback] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const flow: OAuthFlow = params.get('flow') === 'cliente' ? 'cliente' : 'colaborador';
    return { code: params.get('code'), flow, providerError: params.get('error') };
  });

  useEffect(() => {
    if (callback.providerError || !callback.code) {
      window.history.replaceState({}, '', '/auth/callback');
      setError('Google canceló o no pudo completar la autenticación.');
      return;
    }

    let active = true;
    void completeOAuthCallback(callback.code, callback.flow)
      .then(async () => {
        if (active)
          await navigate(callback.flow === 'cliente' ? '/mi-cuenta' : '/app', { replace: true });
      })
      .catch((callbackError: unknown) => {
        if (active) setError(callbackErrorMessage(callbackError, callback.flow));
      });

    return () => {
      active = false;
    };
  }, [callback, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-5 py-12">
      <section className="w-full max-w-md rounded-3xl border border-forest/10 bg-white p-8 text-center shadow-sm">
        <Link className="brand justify-center" to="/" aria-label="Verdeo, inicio">
          <img className="brand-icon" src="/brand/verdeo-icon.png" alt="" width="36" height="36" />
          verdeo<span>.</span>
        </Link>

        {error ? (
          <>
            <p className="eyebrow mt-10">Acceso no completado</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-forest">
              No pudimos iniciar sesión.
            </h1>
            <p className="mt-4 leading-7 text-ink-muted" role="alert">
              {error}
            </p>
            <Link
              className="button button-primary button-large mt-8 w-full"
              to={callback.flow === 'cliente' ? '/mi-cuenta' : '/login'}
            >
              Volver al acceso
            </Link>
          </>
        ) : (
          <>
            <div
              className="mx-auto mt-10 h-10 w-10 animate-spin rounded-full border-4 border-forest/15 border-t-forest"
              aria-hidden="true"
            />
            <h1 className="mt-6 text-2xl font-semibold tracking-tight text-forest">
              Verificando tu cuenta…
            </h1>
            <p className="mt-3 text-sm leading-6 text-ink-muted">
              Estamos vinculando tu identidad con el acceso interno de Verdeo.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
