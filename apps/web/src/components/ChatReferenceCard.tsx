import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { apiRequest } from '../lib/api.js';
import { formatMoney, orderStatusLabel } from '../lib/operations.js';
import type { ChatReference } from '../lib/chat.js';

/** Resuelve un puntero compartido con la sesión y los permisos de quien mira — nunca una copia de
 * los datos, siempre una consulta en vivo, así que quien no tenga acceso ve "no disponible" en vez
 * de datos personales viejos (ADR-032). Lo usan la pantalla de chat y el muelle de la barra. */
export function ChatReferenceCard({ reference }: { reference: ChatReference }) {
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading');
  const [summary, setSummary] = useState<{ href: string; subtitle: string; title: string } | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    const load = async () => {
      const response = await apiRequest(
        reference.resourceType === 'customer'
          ? `/api/v1/customers/${reference.resourceId}`
          : `/api/v1/orders/${reference.resourceId}`,
      );
      if (!active) return;
      if (!response.ok) {
        setState('denied');
        return;
      }
      if (reference.resourceType === 'customer') {
        const customer = (await response.json()) as { displayName: string; id: string };
        setSummary({
          href: `/app/clientes?customerId=${customer.id}`,
          subtitle: 'Cliente',
          title: customer.displayName,
        });
      } else {
        const order = (await response.json()) as {
          currency: string;
          publicNumber: string;
          status: string;
          totalMinor: number;
        };
        setSummary({
          href: `/app/pedidos?search=${encodeURIComponent(order.publicNumber)}`,
          subtitle: `${orderStatusLabel(order.status)} · ${formatMoney(order.totalMinor, order.currency)}`,
          title: order.publicNumber,
        });
      }
      setState('ok');
    };
    void load().catch(() => {
      if (active) setState('denied');
    });
    return () => {
      active = false;
    };
  }, [reference.resourceId, reference.resourceType]);

  if (state === 'loading')
    return <p className="chat-reference-card text-sm text-ink-muted">Cargando…</p>;
  if (state === 'denied' || !summary)
    return <p className="chat-reference-card text-sm text-ink-muted">Referencia no disponible.</p>;
  return (
    <Link className="chat-reference-card" to={summary.href}>
      <strong>{summary.title}</strong>
      <span>{summary.subtitle}</span>
    </Link>
  );
}
