import { apiRequest } from './api.js';
import { getSupabaseClient } from './supabase.js';

let pendingCallback: { code: string; promise: Promise<void> } | undefined;

export async function startGoogleOAuth(): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.auth.signInWithOAuth({
    options: { redirectTo: `${window.location.origin}/auth/callback` },
    provider: 'google',
  });

  if (error) throw error;
}

export function completeOAuthCallback(code: string): Promise<void> {
  if (pendingCallback?.code === code) return pendingCallback.promise;

  const promise = (async () => {
    window.history.replaceState({}, '', '/auth/callback');
    const client = getSupabaseClient();
    const { data, error } = await client.auth.exchangeCodeForSession(code);

    if (error || !data.session?.access_token) {
      throw new Error('SUPABASE_CALLBACK_FAILED');
    }

    try {
      const response = await apiRequest('/api/v1/auth/oauth/exchange', {
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
