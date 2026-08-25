import { apiRequest } from './api.js';
import { getSupabaseClient } from './supabase.js';

export type OAuthFlow = 'colaborador' | 'cliente';

const EXCHANGE_PATH_BY_FLOW: Record<OAuthFlow, string> = {
  cliente: '/api/v1/public/auth/oauth/exchange',
  colaborador: '/api/v1/auth/oauth/exchange',
};

let pendingCallback: { code: string; promise: Promise<void> } | undefined;

// Same Supabase project, same `/auth/callback` redirect for both audiences — `flow` rides along
// as a query param Supabase appends its own `code=` onto, so the callback page can tell which
// exchange endpoint to call without a second callback route.
export async function startGoogleOAuth(flow: OAuthFlow): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.auth.signInWithOAuth({
    options: { redirectTo: `${window.location.origin}/auth/callback?flow=${flow}` },
    provider: 'google',
  });

  if (error) throw error;
}

export function completeOAuthCallback(code: string, flow: OAuthFlow): Promise<void> {
  if (pendingCallback?.code === code) return pendingCallback.promise;

  const promise = (async () => {
    window.history.replaceState({}, '', '/auth/callback');
    const client = getSupabaseClient();
    const { data, error } = await client.auth.exchangeCodeForSession(code);

    if (error || !data.session?.access_token) {
      throw new Error('SUPABASE_CALLBACK_FAILED');
    }

    try {
      const response = await apiRequest(EXCHANGE_PATH_BY_FLOW[flow], {
        body: JSON.stringify({ accessToken: data.session.access_token }),
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error(
          response.status === 401 ? 'ACCOUNT_NOT_PROVISIONED' : 'OAUTH_EXCHANGE_FAILED',
        );
      }
    } finally {
      await client.auth.signOut({ scope: 'local' });
    }
  })();

  pendingCallback = { code, promise };
  return promise;
}
