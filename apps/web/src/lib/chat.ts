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

/** Las funciones no sostienen un socket, así que la conversación se consulta mientras se mira. */
export const CHAT_POLL_ACTIVE_MS = 5_000;
export const CHAT_POLL_HIDDEN_MS = 30_000;

export function conversationName(conversation: ChatConversation): string {
  if (conversation.title) return conversation.title;
  return conversation.participants.map((person) => person.displayName).join(', ') || 'Conversación';
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
  const response = await apiRequest('/api/v1/chat/conversations');
  if (!response.ok) return [];
  return ((await response.json()) as { items: ChatConversation[] }).items;
}

export async function fetchContacts(): Promise<ChatContact[]> {
  const response = await apiRequest('/api/v1/chat/contacts');
  if (!response.ok) return [];
  return ((await response.json()) as { items: ChatContact[] }).items;
}

export async function fetchPresence(): Promise<ChatPresence[]> {
  const response = await apiRequest('/api/v1/chat/presence');
  if (!response.ok) return [];
  return ((await response.json()) as { items: ChatPresence[] }).items;
}

/** Lee la conversación y la marca leída: mirarla es haberla leído. */
export async function fetchMessages(conversationId: string): Promise<ChatMessage[]> {
  const response = await apiRequest(
    `/api/v1/chat/conversations/${conversationId}/messages?limit=100`,
  );
  if (!response.ok) return [];
  const items = ((await response.json()) as { items: ChatMessage[] }).items;
  await apiRequest(`/api/v1/chat/conversations/${conversationId}/read`, { method: 'POST' });
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
