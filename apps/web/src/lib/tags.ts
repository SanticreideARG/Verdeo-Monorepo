import { useEffect, useState } from 'react';

import { apiRequest } from './api.js';

/*
 * Tags personalizables (TAGS_Y_STOCK_CON_NOMBRE_PLAN.md, 2026-11-28): "Sin semillas" y los que
 * vengan. Se definen en Ajustes → Tags y se ponen a clientes, a pedidos o a ambos.
 */

export type TagSheetMode = 'CHECK' | 'NAME' | 'OFF';
export type TagTarget = 'BOTH' | 'CUSTOMER' | 'ORDER';

export interface Tag {
  active: boolean;
  appliesTo: TagTarget;
  color: string;
  deliverySheet: TagSheetMode;
  id: string;
  name: string;
  ordersSheet: TagSheetMode;
  productionSheet: TagSheetMode;
  /** Vacío: vale en todas las ciudades. */
  siteIds: string[];
  sortOrder: number;
}

/** Un tag puesto; en un pedido puede venir del cliente. */
export interface AppliedTag {
  color: string;
  fromCustomer: boolean;
  id: string;
  name: string;
}

/** La paleta, con el nombre que se ve al elegir. Los tonos viven en styles.css (`.tag-pill`). */
export const TAG_COLOR_OPTIONS: readonly { label: string; value: string }[] = [
  { label: 'Verde', value: 'green' },
  { label: 'Verde agua', value: 'teal' },
  { label: 'Azul', value: 'blue' },
  { label: 'Violeta', value: 'violet' },
  { label: 'Rosa', value: 'pink' },
  { label: 'Rojo', value: 'red' },
  { label: 'Naranja', value: 'orange' },
  { label: 'Ámbar', value: 'amber' },
  { label: 'Marrón', value: 'brown' },
  { label: 'Gris', value: 'gray' },
];

export const TAG_TARGET_LABELS: Record<TagTarget, string> = {
  BOTH: 'Clientes y pedidos',
  CUSTOMER: 'Clientes',
  ORDER: 'Pedidos',
};

export const TAG_SHEET_MODE_LABELS: Record<TagSheetMode, string> = {
  CHECK: 'Columna con ☐',
  NAME: 'Al final del nombre',
  OFF: 'No sale',
};

/** Los tags que se pueden poner ahí: activos, del tipo y, en un pedido, de su ciudad. */
export function offerableTags(
  all: readonly Tag[],
  target: 'customer' | 'order',
  siteId: string | null = null,
): Tag[] {
  return all.filter(
    (tag) =>
      tag.active &&
      (tag.appliesTo === 'BOTH' || tag.appliesTo === (target === 'order' ? 'ORDER' : 'CUSTOMER')) &&
      (target === 'customer' ||
        tag.siteIds.length === 0 ||
        (siteId !== null && tag.siteIds.includes(siteId))),
  );
}

/** La lista de tags, una vez por pantalla. `reload` después de cambiarlos en Ajustes. */
export function useTags(enabled = true): { reload: () => void; tags: Tag[] } {
  const [tags, setTags] = useState<Tag[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void apiRequest('/api/v1/tags', { notify: false }).then(async (response) => {
      if (!response.ok || !active) return;
      setTags(((await response.json()) as { items: Tag[] }).items);
    });
    return () => {
      active = false;
    };
  }, [enabled, version]);
  return { reload: () => setVersion((value) => value + 1), tags };
}
