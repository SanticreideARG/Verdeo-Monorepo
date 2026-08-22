const configuredApiUrl = import.meta.env.VITE_API_URL as string | undefined;
const apiUrl = configuredApiUrl?.replace(/\/$/, '') ?? '';

export function apiRequest(path: string, init?: RequestInit): Promise<Response> {
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  return fetch(`${apiUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body && !isFormData ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
}
