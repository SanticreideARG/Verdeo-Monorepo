import { apiRequest } from './api.js';

/**
 * El chat interno, como datos.
 *
 * Vivía entero dentro de `ChatPage`. Desde que la mensajería también está acoplada a la barra de
 * arriba —el muelle de ventanitas, estilo Messenger— hay dos pantallas que hablan con los mismos
 * seis endpoints, y tener los tipos y las llamadas en un solo lugar es lo que evita que una de las
 * dos se entere tarde de un cambio.
 */

export interface ChatContact {
  avatarUrl: string | null;
  displayName: string;
  id: string;
}

export interface ChatConversation {
  id: string;
  kind: string;
  lastMessageAt: string | null;
  participants: ChatContact[];
  title: string | null;
  unreadCount: number;
}

export interface ChatPresence {
  connected: boolean;
  status: string;
  statusMessage: string | null;
  userId: string;
}

export interface ChatLocation {
  label: string | null;
  latitude: number;
  longitude: number;
}

export type ChatReferenceType = 'customer' | 'order';

export interface ChatReference {
  resourceId: string;
  resourceType: ChatReferenceType;
}

export interface ChatMessage {
  authorDisplayName: string | null;
  authorUserId: string | null;
  body: string | null;
  createdAt: string;
  deletedAt: string | null;
  editedAt: string | null;
  id: string;
  kind: string;
  location: ChatLocation | null;
  reference: ChatReference | null;
}

/*
 * Las funciones no sostienen un socket, así que la conversación se consulta mientras se mira.
 *
 * Cada consulta es una invocación que se paga: con 5 segundos a la vista y 30 escondida, unas
 * pocas pestañas abiertas pasaron el millón de invocaciones del plan gratis de Vercel y pausaron
 * la cuenta (2026-11-20). Ahora es cada 30 segundos y sólo a la vista; al volver a la pestaña se
 * pone al día enseguida.
 */
export const CHAT_POLL_MS = 30_000;

/*
 * La presencia de los compañeros cambia, como mucho, con su latido (cada dos minutos en el
 * servidor): pedirla cada 30 segundos era una invocación de más por vuelta sin nada nuevo.
 */
export const PRESENCE_REFRESH_MS = 120_000;

/**
 * `run` como mucho una vez cada `intervalMs`: las llamadas de más en ese lapso no hacen nada.
 * La primera corre siempre.
 */
export function atMostEvery(run: () => Promise<void>, intervalMs: number): () => Promise<void> {
  let last = Number.NEGATIVE_INFINITY;
  return async () => {
    const now = Date.now();
    if (now - last < intervalMs) return;
    last = now;
    await run();
  };
}

/**
 * Corre `poll` cada `intervalMs` mientras la pestaña está a la vista. Escondida no consulta nada;
 * al volver a verse consulta enseguida y retoma. Devuelve la función que lo detiene.
 */
export function pollWhileVisible(
  poll: () => Promise<void>,
  intervalMs: number = CHAT_POLL_MS,
): () => void {
  let timer = 0;
  let stopped = false;
  let running = false;
  const schedule = () => {
    window.clearTimeout(timer);
    if (stopped || document.visibilityState !== 'visible') return;
    timer = window.setTimeout(() => void run(), intervalMs);
  };
  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      await poll();
    } catch {
      // Una consulta fallida no corta el ciclo: la próxima vuelve a intentar.
    } finally {
      running = false;
    }
    schedule();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'visible') void run();
    else window.clearTimeout(timer);
  };
  document.addEventListener('visibilitychange', onVisibility);
  schedule();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

export function conversationName(conversation: ChatConversation): string {
  if (conversation.title) return conversation.title;
  return (
    conversation.participants.map((person) => person.displayName).join(', ') ||
    'Sin otros participantes'
  );
}

/**
 * Los contactos que todavía no tienen conversación directa: el que ya la tiene aparece arriba, en
 * Conversaciones, y repetirlo abajo era ver a la misma persona dos veces.
 */
export function contactsWithoutConversation(
  contacts: readonly ChatContact[],
  conversations: readonly ChatConversation[],
): ChatContact[] {
  const withConversation = new Set(
    conversations
      .filter((conversation) => conversation.participants.length === 1)
      .map((conversation) => conversation.participants[0]?.id),
  );
  return contacts.filter((contact) => !withConversation.has(contact.id));
}

export function chatTimeLabel(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
}

export function chatMapsUrl(location: ChatLocation): string {
  return `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
}

export const PRESENCE_LABELS: Record<string, string> = {
  available: 'Disponible',
  away: 'Ausente',
  busy: 'Ocupado',
  offline: 'Desconectado',
};

export async function fetchConversations(): Promise<ChatConversation[]> {
  const response = await apiRequest('/api/v1/chat/conversations', { background: true });
  if (!response.ok) return [];
  return ((await response.json()) as { items: ChatConversation[] }).items;
}

export async function fetchContacts(): Promise<ChatContact[]> {
  const response = await apiRequest('/api/v1/chat/contacts');
  if (!response.ok) return [];
  return ((await response.json()) as { items: ChatContact[] }).items;
}

export async function fetchPresence(): Promise<ChatPresence[]> {
  const response = await apiRequest('/api/v1/chat/presence', { background: true });
  if (!response.ok) return [];
  return ((await response.json()) as { items: ChatPresence[] }).items;
}

/**
 * Lee la conversación y, si había algo sin leer, la marca leída: mirarla es haberla leído.
 *
 * `markRead` existe porque esto se llama cada cinco segundos mientras el hilo está abierto, y
 * marcar leído lo que ya estaba leído es una escritura por consulta: tres mil por día con una
 * pestaña abierta, cada una con su aviso y su parpadeo de la barra de carga.
 */
export async function fetchMessages(
  conversationId: string,
  markRead = true,
): Promise<ChatMessage[]> {
  const response = await apiRequest(
    `/api/v1/chat/conversations/${conversationId}/messages?limit=100`,
    { background: true },
  );
  if (!response.ok) return [];
  const items = ((await response.json()) as { items: ChatMessage[] }).items;
  if (markRead) {
    await apiRequest(`/api/v1/chat/conversations/${conversationId}/read`, {
      background: true,
      method: 'POST',
    });
  }
  return items;
}

/** Abre (o recupera) la conversación uno a uno con alguien. */
export async function openConversationWith(userId: string): Promise<string | null> {
  const response = await apiRequest('/api/v1/chat/conversations', {
    body: JSON.stringify({ userId }),
    method: 'POST',
  });
  if (!response.ok) return null;
  return ((await response.json()) as { id: string }).id;
}

export function unreadTotal(conversations: readonly ChatConversation[]): number {
  return conversations.reduce((total, conversation) => total + conversation.unreadCount, 0);
}

/** La inicial que va en la burbuja cuando no hay foto. Una letra, en mayúscula, y nunca vacía. */
export function chatInitial(displayName: string): string {
  return displayName.trim().slice(0, 1).toLocaleUpperCase('es-AR') || '?';
}
