import { useCallback, useEffect, useState } from 'react';

import { apiRequest } from '../lib/api.js';
import { formatMoment } from '../lib/dates.js';
import { errorMessage } from '../lib/operations.js';
import { OrderImportDialog, type InboundEmailDetail } from './OrderImportDialog.js';

interface InboundSummary {
  customerName: string | null;
  fromAddress: string;
  id: string;
  itemsSummary: string;
  receivedAt: string;
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
export function InboundEmailsPanel({
  canConfirm,
  onChanged,
}: {
  canConfirm: boolean;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<InboundSummary[]>([]);
  const [detail, setDetail] = useState<InboundEmailDetail | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await apiRequest('/api/v1/inbound-emails', { notify: false });
    if (response.ok) setItems(((await response.json()) as { items: InboundSummary[] }).items);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(id: string) {
    setOpening(id);
    setMessage('');
    const response = await apiRequest(`/api/v1/inbound-emails/${id}`, { notify: false });
    setOpening(null);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setDetail((await response.json()) as InboundEmailDetail);
  }

  if (items.length === 0 && !detail) return null;

  return (
    <section className="inbound-panel">
      <h2>
        Pedidos por correo para revisar <span className="status-chip">{items.length}</span>
      </h2>
      {message ? <p className="text-sm text-ink-muted">{message}</p> : null}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{item.customerName ?? item.fromAddress}</strong>
              <span className="inbound-kind">{KIND_LABELS[item.status] ?? item.status}</span>
              <small>
                {formatMoment(item.receivedAt)} · {item.itemsSummary}
              </small>
            </div>
            <button
              className="button button-secondary"
              disabled={opening !== null}
              onClick={() => void open(item.id)}
              type="button"
            >
              {opening === item.id ? 'Abriendo…' : 'Revisar'}
            </button>
          </li>
        ))}
      </ul>
      {detail ? (
        <OrderImportDialog
          canConfirm={canConfirm}
          inbound={detail}
          onClose={() => setDetail(null)}
          onImported={() => {
            void load();
            onChanged();
          }}
        />
      ) : null}
    </section>
  );
}
