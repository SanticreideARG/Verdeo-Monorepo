import { useSyncExternalStore } from 'react';

import { getToasts, subscribeToToasts } from '../lib/toast.js';

/** Mounted once in DashboardShell — floating confirmation toasts for "it worked" across every
 * screen (clientes, pedidos, menús, ...), each clearing itself after a few seconds. See
 * lib/toast.ts's showToast(). */
export function ToastHost() {
  const toasts = useSyncExternalStore(subscribeToToasts, getToasts, () => []);
  if (toasts.length === 0) return null;

  return (
    <div aria-live="polite" className="toast-host" role="status">
      {toasts.map((toast) => (
        <div className={`toast toast-${toast.tone}`} key={toast.id}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
