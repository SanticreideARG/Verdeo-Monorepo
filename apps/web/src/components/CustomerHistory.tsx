import { useEffect, useState } from 'react';

import { apiRequest } from '../lib/api.js';

interface HistoryItem {
  action: string;
  actorDisplayName: string | null;
  occurredAt: string;
}

const LABELS: Readonly<Record<string, string>> = {
  'customer.address_added': 'Se agregó un domicilio',
  'customer.address_created_from_order': 'Se guardó un domicilio desde un pedido',
  'customer.address_geocoding_candidates_created': 'Se buscó un domicilio en el mapa',
  'customer.address_geocoding_confirmed': 'Se confirmó la ubicación de un domicilio',
  'customer.address_geocoding_failed': 'Falló la búsqueda de un domicilio en el mapa',
  'customer.address_geocoding_no_match': 'No se encontró un domicilio en el mapa',
  'customer.address_geocoding_rejected': 'Se rechazó la ubicación encontrada',
  'customer.address_geocoding_requested': 'Se pidió ubicar un domicilio',
  'customer.address_relocated': 'Se volvió a ubicar un domicilio',
  'customer.address_relocated_from_order': 'Se corrigió un domicilio desde un pedido',
  'customer.address_updated': 'Se cambió un domicilio',
  'customer.archived': 'Se archivó el cliente',
  'customer.created': 'Se dio de alta el cliente',
  'customer.identity_added': 'Se agregó un contacto',
  'customer.identity_updated': 'Se cambió un contacto',
  'customer.moved_site': 'Cambió de ciudad',
  'customer.preference_added': 'Se agregó una preferencia',
  'customer.preference_updated': 'Se cambió una preferencia',
  'customer.restriction_added': 'Se agregó una restricción',
  'customer.restriction_updated': 'Se cambió una restricción',
  'customer.updated': 'Se cambiaron sus datos',
};

/** Qué le pasó a la ficha, sacado de la auditoría. Se pide recién al abrir la pestaña. */
export function CustomerHistory({ customerId }: { customerId: string }) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    setItems(null);
    setFailed(false);
    void apiRequest(`/api/v1/customers/${customerId}/history`, { notify: false }).then(
      async (response) => {
        if (!current) return;
        if (!response.ok) {
          setFailed(true);
          return;
        }
        const body = (await response.json()) as { items: HistoryItem[] };
        if (current) setItems(body.items);
      },
    );
    return () => {
      current = false;
    };
  }, [customerId]);

  if (failed) return <p>No pudimos cargar el historial.</p>;
  if (!items) return <p>Cargando historial…</p>;
  if (items.length === 0) return <p>Todavía no hay cambios registrados.</p>;

  const date = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  return (
    <ul className="crm-history">
      {items.map((item, index) => (
        <li key={`${item.occurredAt}-${String(index)}`}>
          <span>{LABELS[item.action] ?? 'Cambio registrado'}</span>
          <small>
            {date.format(new Date(item.occurredAt))}
            {item.actorDisplayName ? ` · ${item.actorDisplayName}` : ''}
          </small>
        </li>
      ))}
    </ul>
  );
}
