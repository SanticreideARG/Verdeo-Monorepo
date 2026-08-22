const configuredApiUrl = import.meta.env.VITE_API_URL as string | undefined;
const apiUrl = configuredApiUrl?.replace(/\/$/, '') ?? '';

const SITE_SCOPE_HEADER = 'x-verdeo-site';
const SCOPE_STORAGE_KEY = 'verdeo-operating-site';

// The stored preference is a convenience only. The API resolves membership from the session and
// answers 403 for an operation the user cannot reach, so a stale value never widens access.
export function storedOperatingSiteId(): string | null {
  return window.localStorage.getItem(SCOPE_STORAGE_KEY);
}

export function storeOperatingSiteId(operatingSiteId: string | null): void {
  if (operatingSiteId) window.localStorage.setItem(SCOPE_STORAGE_KEY, operatingSiteId);
  else window.localStorage.removeItem(SCOPE_STORAGE_KEY);
}

export function apiRequest(path: string, init?: RequestInit): Promise<Response> {
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const operatingSiteId = storedOperatingSiteId();

  return fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body && !isFormData ? { 'content-type': 'application/json' } : {}),
      ...(operatingSiteId ? { [SITE_SCOPE_HEADER]: operatingSiteId } : {}),
      ...init?.headers,
    },
  });
}
