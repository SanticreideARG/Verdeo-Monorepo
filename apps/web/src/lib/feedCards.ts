import { apiRequest } from './api.js';
import { addDaysIso, todayInOperation } from './dates.js';
import { inboundAdvice, inboundTone, inboundToneLabel, type InboundTracking } from './system.js';

/**
 * Las tarjetas del feed que no escribe nadie: lo que el sistema ya sabe (DASHBOARD_FEED_PLAN.md).
 *
 * Se arman acá con lo que la API ya da, cada una con su permiso: quien no puede ver los pedidos
 * repetidos no recibe la tarjeta de repetidos. La clave incluye lo que la tarjeta dice
 * ("duplicados:3"): marcarla como hecha la esconde a ella, y si mañana son cuatro, es otra.
 */
export type FeedCardKind = 'agenda' | 'alerta' | 'consejo' | 'mensajes';

export interface FeedCard {
  count: number | null;
  href: string;
  key: string;
  kind: FeedCardKind;
  text: string;
}

async function json<T>(path: string): Promise<T | null> {
  const response = await apiRequest(path, { notify: false }).catch(() => null);
  if (!response?.ok) return null;
  return (await response.json().catch(() => null)) as T | null;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

export async function loadFeedCards(permissions: readonly string[]): Promise<FeedCard[]> {
  const can = (permission: string) => permissions.includes(permission);
  const today = todayInOperation();
  const tomorrow = addDaysIso(today, 1);

  const [duplicates, inbound, drafts, calendar, chat, tips, inboundSignal] = await Promise.all([
    can('orders.read') ? json<{ groups: unknown[] }>('/api/v1/orders/duplicates') : null,
    can('orders.create') ? json<{ items: unknown[] }>('/api/v1/inbound-emails') : null,
    can('orders.confirm')
      ? json<{ items: unknown[] }>('/api/v1/orders?status=DRAFT&limit=51')
      : null,
    can('calendar.use')
      ? json<{
          items: { day: string; done: boolean; id: string; kind: string; title: string }[];
        }>(`/api/v1/calendar?from=${today}&to=${tomorrow}`)
      : null,
    can('chat.use')
      ? json<{
          items: {
            id: string;
            participants: { displayName: string }[];
            title: string | null;
            unreadCount: number;
          }[];
        }>('/api/v1/chat/conversations')
      : null,
    // Los consejos del día salen de la API, que ya los filtra por permiso.
    can('feed.post')
      ? json<{ items: { href: string; key: string; text: string }[] }>('/api/v1/feed/tips')
      : null,
    // El script de Gmail: quien ve el estado del sistema se entera si deja de andar.
    can('audit.read') ? json<{ inbound: InboundTracking | null }>('/api/v1/system/inbound') : null,
  ]);

  const cards: FeedCard[] = [];
  const duplicateCount = duplicates?.groups.length ?? 0;
  if (duplicateCount > 0) {
    cards.push({
      count: duplicateCount,
      href: '/app/pedidos',
      key: `duplicados:${String(duplicateCount)}`,
      kind: 'alerta',
      text: plural(
        duplicateCount,
        'cliente con pedidos repetidos en el período',
        'clientes con pedidos repetidos en el período',
      ),
    });
  }
  const inboundCount = inbound?.items.length ?? 0;
  if (inboundCount > 0) {
    cards.push({
      count: inboundCount,
      href: '/app/pedidos',
      key: `correos:${String(inboundCount)}`,
      kind: 'alerta',
      text: plural(
        inboundCount,
        'pedido por correo para revisar',
        'pedidos por correo para revisar',
      ),
    });
  }
  /*
   * El script de correo sin señal o con errores (2026-11-11). La clave lleva la última corrida:
   * marcar la tarjeta como hecha la esconde hasta que cambie algo.
   */
  const tracking = inboundSignal?.inbound;
  if (tracking) {
    const tone = inboundTone(tracking);
    if (tone !== 'bien') {
      const last = tracking.runs[0];
      cards.push({
        count: null,
        href: '/app/sistema',
        key: `correo-script:${tone}:${last?.ranAt ?? 'nunca'}`,
        kind: 'alerta',
        text: `Correo entrante: ${inboundToneLabel(tone).toLocaleLowerCase('es-AR')}. ${inboundAdvice(tone, tracking)}`,
      });
    }
  }
  const draftCount = drafts?.items.length ?? 0;
  if (draftCount > 0) {
    cards.push({
      count: draftCount,
      href: '/app/pedidos',
      key: `borradores:${String(draftCount)}`,
      kind: 'alerta',
      text: plural(
        draftCount,
        'pedido en borrador sin confirmar',
        'pedidos en borrador sin confirmar',
      ),
    });
  }

  // La agenda de hoy y mañana: recordatorios sin hacer, cierres y cortes de cocina.
  for (const event of calendar?.items ?? []) {
    if (event.done) continue;
    const when = event.day === today ? 'Hoy' : 'Mañana';
    const prefix =
      event.kind === 'cycle_close'
        ? 'cierra el período'
        : event.kind === 'kitchen_cutoff'
          ? 'corte de cocina'
          : null;
    cards.push({
      count: null,
      href: '/app/calendario',
      key: `agenda:${event.id}:${event.day}`,
      kind: 'agenda',
      text: prefix ? `${when}, ${prefix}: ${event.title}` : `${when}: ${event.title}`,
    });
  }

  // El chat interno: cada conversación con mensajes sin leer.
  for (const conversation of chat?.items ?? []) {
    if (conversation.unreadCount <= 0) continue;
    const who =
      conversation.title ??
      conversation.participants.map((participant) => participant.displayName).join(', ');
    cards.push({
      count: conversation.unreadCount,
      href: '/app/chat',
      key: `chat:${conversation.id}:${String(conversation.unreadCount)}`,
      kind: 'mensajes',
      text: `${plural(conversation.unreadCount, 'mensaje sin leer', 'mensajes sin leer')} de ${who}`,
    });
  }

  for (const tip of tips?.items ?? []) {
    cards.push({ count: null, href: tip.href, key: tip.key, kind: 'consejo', text: tip.text });
  }

  return cards;
}
