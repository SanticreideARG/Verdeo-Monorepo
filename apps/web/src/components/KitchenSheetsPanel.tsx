import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';

interface SheetOrder {
  customerName: string;
  lines: string[];
  orderId: string;
  publicNumber: string;
}

interface KitchenSheets {
  changes: {
    added: SheetOrder[];
    changed: (SheetOrder & { before: string[] })[];
    removed: (SheetOrder & { cancelledToStock: boolean; status: string | null })[];
    since: { actorName: string | null; createdAt: string; id: string };
  } | null;
  items: {
    actorName: string | null;
    createdAt: string;
    format: string;
    id: string;
    orderCount: number;
  }[];
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('es-AR', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    weekday: 'short',
  });

const FORMAT_LABELS: Record<string, string> = {
  pdf: 'impresa',
  whatsapp: 'copiada',
  xlsx: 'descargada',
};

/**
 * Lo que cambió desde la última planilla que fue a cocina (2026-10-28).
 *
 * Incidente: un pedido se canceló después de que la planilla ya se había mandado. La planilla
 * nueva ya no lo traía y nada avisaba que se había cocinado. Acá se ve, contra la última que
 * salió: pedidos nuevos, pedidos que ya no están (un cancelado que no pasó al stock se marca para
 * revisar) y pedidos que cambiaron. Y cada planilla se puede volver a bajar tal como salió.
 */
export function KitchenSheetsPanel({
  cycleId,
  refreshKey,
}: {
  cycleId: string;
  refreshKey: number;
}) {
  const [sheets, setSheets] = useState<KitchenSheets | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    void apiRequest(`/api/v1/production/${cycleId}/sheets`, { notify: false }).then(
      async (response) => {
        if (active && response.ok) setSheets((await response.json()) as KitchenSheets);
      },
    );
    return () => {
      active = false;
    };
  }, [cycleId, refreshKey]);

  async function download(sheetId: string, createdAt: string) {
    setMessage('');
    const response = await apiRequest(`/api/v1/production/sheets/${sheetId}/export`);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = `produccion-enviada-${createdAt.slice(0, 16).replace(/[:T]/g, '-')}.xlsx`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  if (!sheets || sheets.items.length === 0) return null;
  const changes = sheets.changes;
  /*
   * Los cancelados no se muestran (2026-10-31): no se cocinan, y verlos en rojo acá hacía pensar
   * que sí. Lo cocinado de un cancelado se resuelve al cancelar ("¿ya estaba cocinado?") o después
   * con "Enviar a stock" desde el pedido.
   */
  const removed = changes?.removed.filter((order) => order.status !== 'CANCELLED') ?? [];
  const total = changes ? changes.added.length + removed.length + changes.changed.length : 0;

  return (
    <section
      className={`operation-card kitchen-sheets mt-4${total > 0 ? ' has-changes' : ''}`}
      aria-label="Planillas enviadas a cocina"
    >
      {changes ? (
        <p className="text-sm">
          <strong>Última planilla:</strong> {when(changes.since.createdAt)}
          {changes.since.actorName ? ` (${changes.since.actorName})` : ''}.{' '}
          {total === 0 ? (
            'Sin cambios desde entonces.'
          ) : (
            <strong>
              Desde entonces cambiaron {String(total)} {total === 1 ? 'pedido' : 'pedidos'}: avisale
              a cocina.
            </strong>
          )}
        </p>
      ) : null}
      {changes && total > 0 ? (
        <ul className="kitchen-sheet-changes">
          {removed.map((order) => (
            <li key={order.orderId}>
              <span className="status-chip">{order.status ? 'Salió' : 'Borrado'}</span>{' '}
              <Link to={`/app/pedidos/${order.orderId}`}>{order.customerName}</Link> ·{' '}
              {order.lines.join(' / ')}
            </li>
          ))}
          {changes.added.map((order) => (
            <li key={order.orderId}>
              <span className="status-chip">Nuevo</span>{' '}
              <Link to={`/app/pedidos/${order.orderId}`}>{order.customerName}</Link> ·{' '}
              {order.lines.join(' / ')}
            </li>
          ))}
          {changes.changed.map((order) => (
            <li key={order.orderId}>
              <span className="status-chip">Cambió</span>{' '}
              <Link to={`/app/pedidos/${order.orderId}`}>{order.customerName}</Link> · antes{' '}
              {order.before.join(' / ')} · ahora {order.lines.join(' / ')}
            </li>
          ))}
        </ul>
      ) : null}
      {message ? (
        <p className="screen-notice mt-2" role="alert">
          {message}
        </p>
      ) : null}
      <details className="mt-2">
        <summary className="text-sm">Planillas enviadas ({String(sheets.items.length)})</summary>
        <ul className="kitchen-sheet-history">
          {sheets.items.map((item) => (
            <li key={item.id}>
              {when(item.createdAt)} · {FORMAT_LABELS[item.format] ?? item.format}
              {item.actorName ? ` por ${item.actorName}` : ''} · {String(item.orderCount)}{' '}
              {item.orderCount === 1 ? 'pedido' : 'pedidos'} ·{' '}
              <button
                className="link-button"
                onClick={() => void download(item.id, item.createdAt)}
                type="button"
              >
                Bajarla tal como salió
              </button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
