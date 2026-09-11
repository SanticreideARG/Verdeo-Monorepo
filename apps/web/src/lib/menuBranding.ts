import { useEffect, useState } from 'react';

import { apiRequest } from './api.js';

export interface MenuBranding {
  caption?: string;
  iconUrl?: string;
}

/**
 * El logo y la bajada de cada menú, tal como los muestra la landing.
 *
 * Se leen de la sección "Menús de la semana" de la página publicada, y no de un catálogo aparte: es
 * la misma fuente que la landing, así que el formulario de pedido y el asistente no pueden mostrar
 * un logo distinto del que la persona acaba de ver en la portada. Y la bajada de ahí —"Sin harinas,
 * sin cereales. Con lácteos."— se lee mucho mejor que la descripción del catálogo, que viene en
 * mayúsculas.
 *
 * Una sola petición por visita, compartida por todo el que la pida: se guarda la promesa y no el
 * resultado, así el formulario y el asistente abiertos a la vez no disparan dos pedidos.
 */
let brandingRequest: Promise<Map<string, MenuBranding>> | null = null;

/**
 * La clave con la que se cruzan los dos nombres.
 *
 * El nombre lo escribe una persona en el CMS y otra en el catálogo: se compara sin caja y con los
 * espacios colapsados, para que "Menú  Real" y "menú real" sean el mismo menú.
 */
export function brandingKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function loadMenuBranding(): Promise<Map<string, MenuBranding>> {
  brandingRequest ??= apiRequest('/api/v1/public/pages/home')
    .then(async (response) => {
      const byName = new Map<string, MenuBranding>();
      if (!response.ok) return byName;
      const body = (await response.json()) as {
        sections?: { families?: { caption?: string; familyName?: string; iconUrl?: string }[] }[];
      };
      for (const section of body.sections ?? []) {
        for (const family of section.families ?? []) {
          if (!family.familyName) continue;
          byName.set(brandingKey(family.familyName), {
            ...(family.caption ? { caption: family.caption } : {}),
            ...(family.iconUrl ? { iconUrl: family.iconUrl } : {}),
          });
        }
      }
      return byName;
    })
    // Sin logos todo sigue funcionando: son un agregado, no una condición para pedir.
    .catch(() => new Map<string, MenuBranding>());
  return brandingRequest;
}

/** Los logos y bajadas, como estado de React. Vacío hasta que llegan. */
export function useMenuBranding(): Map<string, MenuBranding> {
  const [branding, setBranding] = useState<Map<string, MenuBranding>>(new Map());

  useEffect(() => {
    let active = true;
    void loadMenuBranding().then((loaded) => {
      if (active) setBranding(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  return branding;
}
