import { useEffect, useState } from 'react';

import { apiRequest } from './api.js';

/**
 * Qué campos pide el formulario de pedidos en esta ciudad.
 *
 * Hoy es uno solo: si se preguntan indicaciones alimentarias. Se consulta a la ruta pública porque
 * la usa también el formulario público, que no tiene sesión, y porque leer la pantalla de Ajustes
 * pide `production.read`, que quien toma pedidos no necesariamente tiene.
 *
 * Arranca en `false` y no en "todavía no sé": el campo aparece cuando la respuesta dice que sí, en
 * vez de aparecer y desaparecer un instante después. Si la consulta falla queda en `false`, que es
 * el ajuste por defecto: ante la duda, no pedir un dato de más.
 */
export function useOrderFormSettings(site: { siteId?: string | null; slug?: string | null }): {
  dietaryInstructionsEnabled: boolean;
} {
  const [dietaryInstructionsEnabled, setEnabled] = useState(false);
  const siteId = site.siteId ?? '';
  const slug = site.slug ?? '';

  useEffect(() => {
    if (!siteId && !slug) return;
    let active = true;
    const params = new URLSearchParams(siteId ? { siteId } : { site: slug });
    void apiRequest(`/api/v1/public/order-form-settings?${params.toString()}`)
      .then(async (response) => {
        if (!active || !response.ok) return;
        const body = (await response.json()) as { dietaryInstructionsEnabled: boolean };
        if (active) setEnabled(body.dietaryInstructionsEnabled);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [siteId, slug]);

  return { dietaryInstructionsEnabled };
}
