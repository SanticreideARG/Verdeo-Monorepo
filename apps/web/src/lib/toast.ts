// A minimal pub/sub store — same shape as requestsInFlight/subscribeToRequestActivity in api.ts —
// so any page can fire a confirmation without being wrapped in a React context provider. ToastHost
// (mounted once in DashboardShell) is the only subscriber that actually renders anything.
export interface ToastItem {
  id: number;
  message: string;
  tone: 'error' | 'success';
}

let toasts: readonly ToastItem[] = [];
let nextId = 1;
let shown = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeToToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToasts(): readonly ToastItem[] {
  return toasts;
}

const DEFAULT_DURATION_MS = 3200;

/** Fire-and-forget confirmation toast — floats briefly (a few seconds) and clears itself, no
 * action needed from the caller. Meant for "it worked" (cliente creado, pedido registrado, menú
 * guardado); a failure should still go through each page's own persistent inline error message,
 * since that one may need to stay up while the operator fixes something. */
export function showToast(message: string, tone: ToastItem['tone'] = 'success'): void {
  shown += 1;
  const id = nextId++;
  toasts = [...toasts, { id, message, tone }];
  notify();
  window.setTimeout(() => {
    toasts = toasts.filter((toast) => toast.id !== id);
    notify();
  }, DEFAULT_DURATION_MS);
}

/**
 * Cuántos avisos se mostraron. Lo lee el aviso automático de `apiRequest` para no duplicar: si la
 * pantalla ya dijo lo suyo —con su propio texto, que siempre es mejor que uno genérico— el
 * automático se calla.
 */
export function toastsShown(): number {
  return shown;
}
