import { useCallback, useEffect, useState } from 'react';

import { apiRequest } from '../lib/api.js';
import { showToast } from '../lib/toast.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { formatMoment } from '../lib/dates.js';
import { errorMessage } from '../lib/operations.js';
import { OrderImportDialog, type InboundEmailDetail } from './OrderImportDialog.js';

interface InboundSummary {
  customerName: string | null;
  fromAddress: string;
  id: string;
  itemsSummary: string;
  receivedAt: string;
  siteName?: string | null;
  status: 'approved' | 'discarded' | 'inquiry' | 'pending' | 'processing' | 'unreadable';
  subject: string;
}

const KIND_LABELS: Partial<Record<InboundSummary['status'], string>> = {
  inquiry: 'Consulta',
  pending: 'Pedido',
  unreadable: 'No reconocido',
};

/**
 * Los pedidos que llegaron solos por correo y esperan que alguien los revise.
 *
 * El script de Gmail los manda a medida que llegan; acá se ven, se abren y se aprueban o descartan.
 * La revisión (cliente, variedad, duplicados) se hace al abrir cada uno y no al recibirlo, con el
 * correo original al lado. No aparece si no hay nada esperando.
 */
const EXPANDED_KEY = 'verdeo-correos-abierto';

function readExpanded(): boolean {
  try {
    return window.localStorage.getItem(EXPANDED_KEY) !== '0';
  } catch {
    return true;
  }
}

export function InboundEmailsPanel({
  canConfirm,
  canUseHera = false,
  onChanged,
}: {
  canConfirm: boolean;
  canUseHera?: boolean;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<InboundSummary[]>([]);
  const [detail, setDetail] = useState<InboundEmailDetail | null>(null);
  const [autoApprove, setAutoApprove] = useState(false);
  const [removing, setRemoving] = useState<InboundSummary | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  // Plegable (2026-11-06): abierta no había forma de cerrarla y ocupaba la pantalla de Pedidos.
  // Arranca abierta (es trabajo pendiente) y recuerda en este navegador si se la plegó.
  const [expanded, setExpanded] = useState(readExpanded);

  function toggleExpanded() {
    setExpanded((current) => {
      try {
        window.localStorage.setItem(EXPANDED_KEY, current ? '0' : '1');
      } catch {
        // Sin almacenamiento, vale hasta recargar.
      }
      return !current;
    });
  }

  const load = useCallback(async () => {
    const response = await apiRequest('/api/v1/inbound-emails', { notify: false });
    if (response.ok) setItems(((await response.json()) as { items: InboundSummary[] }).items);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(id: string, approve = false) {
    setOpening(id);
    setMessage('');
    const response = await apiRequest(`/api/v1/inbound-emails/${id}`, { notify: false });
    setOpening(null);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setAutoApprove(approve);
    setDetail((await response.json()) as InboundEmailDetail);
  }

  /*
   * Borrar el correo de la lista (2026-11-05): queda como descartado, no crea ningún pedido. Para
   * los repetidos, las pruebas y los que ya se cargaron a mano.
   */
  async function remove(item: InboundSummary) {
    const response = await apiRequest(`/api/v1/inbound-emails/${item.id}/discard`, {
      method: 'POST',
      notify: false,
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    showToast('Correo borrado de la lista.');
    await load();
    onChanged();
  }

  /*
   * El mismo pedido llegado dos veces: mismo cliente y mismo contenido, en la misma semana (el
   * período corriente). Se marca el que llegó después; aprobarlo igual lo frena la revisión, que
   * compara contra los pedidos del período.
   */
  const key = (item: InboundSummary) =>
    `${(item.customerName ?? item.fromAddress).trim().toLocaleLowerCase('es-AR')}|${item.itemsSummary}`;
  const repeatOf = new Map<string, InboundSummary>();
  const byTime = [...items].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  for (const [index, item] of byTime.entries()) {
    const earlier = byTime
      .slice(0, index)
      .find(
        (other) =>
          key(other) === key(item) &&
          Math.abs(Date.parse(item.receivedAt) - Date.parse(other.receivedAt)) <
            7 * 24 * 60 * 60 * 1000,
      );
    if (earlier) repeatOf.set(item.id, earlier);
  }

  if (items.length === 0 && !detail) return null;

  return (
    <section className={`inbound-panel${expanded ? ' is-open' : ''}`}>
      <h2>
        <button
          aria-expanded={expanded}
          className="inbound-panel-toggle"
          onClick={toggleExpanded}
          type="button"
        >
          Pedidos por correo para revisar <span className="status-chip">{items.length}</span>
          <span aria-hidden="true" className="inbound-panel-caret">
            ▸
          </span>
        </button>
      </h2>
      {message ? <p className="text-sm text-ink-muted">{message}</p> : null}
      {expanded ? (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.customerName ?? item.fromAddress}</strong>
                {/* Tipo, ciudad y repetido en un solo renglón: en el teléfono eran tres. */}
                <span className="inbound-tags">
                  <span className="inbound-kind">{KIND_LABELS[item.status] ?? item.status}</span>
                  {/* La ciudad del asunto: con una ciudad elegida arriba sólo salen las de esa. */}
                  <span className="inbound-kind">{item.siteName ?? 'Sin ciudad'}</span>
                  {repeatOf.get(item.id) ? (
                    <span className="inbound-kind is-repeat">
                      Repetido del de las {formatMoment(repeatOf.get(item.id)?.receivedAt ?? '')}
                    </span>
                  ) : null}
                </span>
                <small>
                  {formatMoment(item.receivedAt)} · {item.itemsSummary}
                </small>
              </div>
              <div className="inbound-actions">
                <button
                  className="button button-secondary"
                  disabled={opening !== null}
                  onClick={() => void open(item.id)}
                  type="button"
                >
                  {opening === item.id ? 'Abriendo…' : 'Revisar'}
                </button>
                {item.status === 'pending' && !repeatOf.get(item.id) ? (
                  <button
                    className="button button-primary"
                    disabled={opening !== null}
                    onClick={() => void open(item.id, true)}
                    title="Se aprueba solo si no hay nada que revisar; si falta algo, se abre."
                    type="button"
                  >
                    Aprobar
                  </button>
                ) : null}
                <button
                  className="button button-secondary is-danger"
                  disabled={opening !== null}
                  onClick={() => setRemoving(item)}
                  type="button"
                >
                  Borrar
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {detail ? (
        <OrderImportDialog
          autoApprove={autoApprove}
          canConfirm={canConfirm}
          canUseHera={canUseHera}
          inbound={detail}
          onClose={() => setDetail(null)}
          onImported={() => {
            void load();
            onChanged();
          }}
        />
      ) : null}
      {removing ? (
        <ConfirmDialog
          confirmLabel="Borrar"
          detail={`${removing.customerName ?? removing.fromAddress} · ${removing.itemsSummary}. Sale de la lista y no crea ningún pedido. El correo sigue en Gmail.`}
          onCancel={() => setRemoving(null)}
          onConfirm={async () => {
            const target = removing;
            setRemoving(null);
            await remove(target);
          }}
          tone="destructivo"
          title="¿Borrar este correo de la lista?"
        />
      ) : null}
    </section>
  );
}
