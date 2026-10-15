import { useEffect, useState } from 'react';

import { apiRequest } from './api.js';

/**
 * Cuántas publicaciones del tablero no vio quien está en la sesión: el punto del menú.
 *
 * Una sola cuenta para toda la pestaña —el menú, la barra del teléfono y el feed la leen de acá— y
 * una sola consulta cada minuto y medio, sólo con la pestaña a la vista. El feed la refresca al
 * marcar vistas, para que el punto se apague en el momento.
 *
 * Si la persona lo pidió (y el navegador lo permite), una novedad que llega con la pestaña de
 * fondo avisa con una notificación del navegador. Nada de correo ni WhatsApp: es comunicación
 * interna.
 */
const POLL_MS = 90_000;
const NOTIFY_KEY = 'verdeo.tablero.avisos';

let count = 0;
let known = false;
let timer: number | null = null;
let users = 0;
const listeners = new Set<(value: number) => void>();

function publish(next: number) {
  const grew = known && next > count;
  count = next;
  known = true;
  for (const listener of listeners) listener(next);
  if (grew && document.hidden && browserNoticesEnabled()) {
    try {
      new Notification('Verdeo', {
        body:
          next === 1
            ? 'Hay una novedad en el tablero.'
            : `Hay ${String(next)} novedades en el tablero.`,
        icon: '/brand/verdeo-icon-128.webp',
        tag: 'verdeo-tablero',
      });
    } catch {
      // Algunos navegadores sólo notifican desde un service worker: sin aviso, el punto alcanza.
    }
  }
}

export async function refreshFeedUnread(): Promise<void> {
  const response = await apiRequest('/api/v1/feed/unread', { notify: false }).catch(() => null);
  if (!response?.ok) return;
  const body = (await response.json().catch(() => null)) as { count: number } | null;
  if (body) publish(body.count);
}

function tick() {
  if (!document.hidden) void refreshFeedUnread();
}

export function useFeedUnread(enabled: boolean): number {
  const [value, setValue] = useState(count);
  useEffect(() => {
    if (!enabled) return;
    listeners.add(setValue);
    users += 1;
    if (users === 1) {
      void refreshFeedUnread();
      timer = window.setInterval(tick, POLL_MS);
      document.addEventListener('visibilitychange', tick);
    }
    return () => {
      listeners.delete(setValue);
      users -= 1;
      if (users === 0) {
        if (timer !== null) window.clearInterval(timer);
        timer = null;
        document.removeEventListener('visibilitychange', tick);
      }
    };
  }, [enabled]);
  return enabled ? value : 0;
}

export function browserNoticesSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function browserNoticesEnabled(): boolean {
  if (!browserNoticesSupported() || Notification.permission !== 'granted') return false;
  try {
    return window.localStorage.getItem(NOTIFY_KEY) === 'on';
  } catch {
    return false;
  }
}

/** Prender o apagar los avisos del navegador. Prenderlos pide permiso la primera vez. */
export async function setBrowserNotices(on: boolean): Promise<boolean> {
  if (!browserNoticesSupported()) return false;
  if (on && Notification.permission !== 'granted') {
    const answer = await Notification.requestPermission();
    if (answer !== 'granted') return false;
  }
  try {
    window.localStorage.setItem(NOTIFY_KEY, on ? 'on' : 'off');
  } catch {
    return false;
  }
  return on;
}
