import { showToast, toastsShown } from './toast.js';

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

/**
 * Every request is counted so the shell can show a non-blocking progress bar instead of replacing
 * the screen with a loader. Screens keep their previous content while new data is on its way.
 */
let inFlight = 0;
const activityListeners = new Set<() => void>();

function notifyActivity(): void {
  for (const listener of activityListeners) listener();
}

export function subscribeToRequestActivity(listener: () => void): () => void {
  activityListeners.add(listener);
  return () => activityListeners.delete(listener);
}

export function requestsInFlight(): number {
  return inFlight;
}

const CHANGING_METHODS = new Set(['DELETE', 'PATCH', 'POST', 'PUT']);

/**
 * Rutas que cambian algo y aun así no llevan aviso.
 *
 * No es una excepción decorativa: el latido de presencia y el guardado de apariencia o del tablero
 * se disparan por intervalo o a cada clic, y un aviso por cada uno taparía la pantalla con carteles
 * que nadie pidió. El ingreso y la salida no lo llevan porque la pantalla siguiente ya es el aviso.
 */
const SILENT_PATHS = [
  /^\/api\/v1\/auth\/(login|logout)$/,
  /^\/api\/v1\/chat\/presence\/heartbeat$/,
  /^\/api\/v1\/me\/appearance$/,
  /^\/api\/v1\/dashboard\/layout$/,
  /^\/api\/v1\/public\/auth\//,
];

const DEFAULT_NOTICES: Record<string, string> = {
  DELETE: 'Eliminado.',
  PATCH: 'Cambios guardados.',
  POST: 'Guardado.',
  PUT: 'Cambios guardados.',
};

/**
 * El aviso llega tarde a propósito.
 *
 * Cuando una pantalla tiene algo mejor que decir —"Cliente creado", "Pedido confirmado"— lo dice
 * ella, y ese texto siempre gana. Este es el respaldo para las pantallas que no dicen nada: espera
 * un momento y, si en el medio apareció cualquier aviso, se calla.
 */
const FALLBACK_DELAY_MS = 900;

function scheduleChangeNotice(method: string): void {
  const message = DEFAULT_NOTICES[method];
  if (!message) return;
  const before = toastsShown();
  window.setTimeout(() => {
    if (toastsShown() === before) showToast(message);
  }, FALLBACK_DELAY_MS);
}

export interface ApiRequestInit extends RequestInit {
  /** `false` para no avisar nada; un texto para reemplazar el genérico. */
  notify?: string | false;
}

export async function apiRequest(path: string, init?: ApiRequestInit): Promise<Response> {
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const operatingSiteId = storedOperatingSiteId();
  const method = (init?.method ?? 'GET').toUpperCase();

  inFlight += 1;
  notifyActivity();
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body && !isFormData ? { 'content-type': 'application/json' } : {}),
        ...(operatingSiteId ? { [SITE_SCOPE_HEADER]: operatingSiteId } : {}),
        ...init?.headers,
      },
    });

    // Sólo cuando salió bien: un fallo va al mensaje de error de la pantalla, que se queda puesto
    // mientras la persona corrige, en vez de irse solo a los tres segundos.
    if (
      response.ok &&
      CHANGING_METHODS.has(method) &&
      init?.notify !== false &&
      !SILENT_PATHS.some((pattern) => pattern.test(path.split('?')[0] ?? path))
    ) {
      if (typeof init?.notify === 'string') showToast(init.notify);
      else scheduleChangeNotice(method);
    }

    return response;
  } finally {
    inFlight -= 1;
    notifyActivity();
  }
}
