import { useCallback, useEffect, useState } from 'react';

import { apiRequest } from './api.js';
import type { SystemStatus } from './system.js';

/**
 * El estado de los servidores, pedido cuando se abre y refrescado mientras se mira.
 *
 * Sólo consulta si `enabled`: cada consulta hace un ping a la base y a Supabase, y no tiene por
 * qué correr para quien no puede ver el resultado ni con la ventana cerrada.
 */
export function useSystemStatus(enabled: boolean, refreshMs = 0) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const response = await apiRequest('/api/v1/system/status');
      if (response.ok) {
        setStatus((await response.json()) as SystemStatus);
        setFailed(false);
      } else {
        setFailed(true);
      }
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
    if (!enabled || refreshMs <= 0) return undefined;
    const timer = window.setInterval(() => void reload(), refreshMs);
    return () => window.clearInterval(timer);
  }, [enabled, refreshMs, reload]);

  return { failed, loading, reload, status };
}
