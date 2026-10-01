import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { apiRequest } from '../lib/api.js';
import {
  CHAT_POLL_ACTIVE_MS,
  CHAT_POLL_HIDDEN_MS,
  PRESENCE_LABELS,
  chatMapsUrl,
  chatTimeLabel,
  conversationName,
  fetchContacts,
  fetchConversations,
  fetchMessages,
  fetchPresence,
  openConversationWith,
  unreadTotal,
  type ChatContact,
  type ChatConversation,
  type ChatMessage,
  type ChatPresence,
} from '../lib/chat.js';
import { ChatReferenceCard } from './ChatReferenceCard.js';

/** Cuántas ventanas caben abiertas a la vez en escritorio. Más que esto y cada una queda demasiado
 * angosta para leer, que es justamente lo que una ventanita de chat tiene que hacer bien. */
const MAX_OPEN = 3;

interface DockWindow {
  conversationId: string;
  minimized: boolean;
}

function PresenceDot({ entry }: { entry: ChatPresence | undefined }) {
  const status = entry?.status ?? 'offline';
  const label = PRESENCE_LABELS[status] ?? status;
  return <i aria-label={label} className={`chat-presence-dot is-${status}`} title={label} />;
}

interface ChatDockProps {
  canSeePresence: boolean;
  canShareReference: boolean;
  /** En el teléfono no hay muelle: el panel y la conversación ocupan la pantalla entera. */
  narrow: boolean;
  viewerUserId: string;
}

/**
 * La mensajería interna, acoplada a la barra de arriba.
 *
 * Antes el chat era una pantalla más del menú lateral: para contestarle a alguien había que irse de
 * lo que se estaba haciendo —un pedido a medio cargar, una ruta sin publicar— y volver después. Un
 * chat de equipo que obliga a abandonar la tarea es un chat que se contesta por WhatsApp.
 *
 * Así que vive donde vive en cualquier herramienta con chat: un ícono en la barra, un panel con las
 * conversaciones, y ventanitas acopladas abajo a la derecha que se abren sobre lo que haya en
 * pantalla. Se pueden tener tres a la vez y minimizarlas: la conversación sigue ahí mientras se
 * trabaja, que es el punto.
 *
 * El aviso es discreto a propósito: un número chico en el ícono y un punto en la ventana
 * minimizada. Nada que tape la pantalla ni suene — quien está tomando un pedido por teléfono no
 * puede ser interrumpido por un "hola".
 *
 * En el teléfono no hay muelle. Tres ventanitas de 320px sobre una pantalla de 375 no son tres
 * ventanas, son una pantalla rota: ahí el ícono abre el panel a pantalla completa y la conversación
 * ocupa todo.
 */
export function ChatDock({
  canSeePresence,
  canShareReference,
  narrow,
  viewerUserId,
}: ChatDockProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [presence, setPresence] = useState<Map<string, ChatPresence>>(new Map());
  const [windows, setWindows] = useState<DockWindow[]>([]);
  const [transcripts, setTranscripts] = useState<Map<string, ChatMessage[]>>(new Map());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  const loadConversations = useCallback(async () => {
    setConversations(await fetchConversations());
  }, []);

  const loadPresence = useCallback(async () => {
    if (!canSeePresence) return;
    const items = await fetchPresence();
    setPresence(new Map(items.map((entry) => [entry.userId, entry])));
  }, [canSeePresence]);

  const loadTranscript = useCallback(async (conversationId: string) => {
    const items = await fetchMessages(conversationId);
    setTranscripts((current) => new Map(current).set(conversationId, items));
  }, []);

  useEffect(() => {
    void loadConversations();
    void loadPresence();
    void fetchContacts().then(setContacts);
  }, [loadConversations, loadPresence]);

  /*
   * Mientras la pestaña está escondida se consulta cada treinta segundos y no cada cinco: nadie
   * está mirando, y cada consulta es una invocación que se paga. Sólo se leen las ventanas abiertas
   * y no minimizadas — una minimizada no se está leyendo, y pedirle la conversación la marcaría
   * leída sin que nadie la haya visto.
   */
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      const delay =
        document.visibilityState === 'visible' ? CHAT_POLL_ACTIVE_MS : CHAT_POLL_HIDDEN_MS;
      timer = window.setTimeout(() => {
        void (async () => {
          await loadConversations();
          await loadPresence();
          for (const entry of windows) {
            if (!entry.minimized) await loadTranscript(entry.conversationId);
          }
          tick();
        })();
      }, delay);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [loadConversations, loadPresence, loadTranscript, windows]);

  const openConversation = useCallback(
    (conversationId: string) => {
      setPanelOpen(false);
      setWindows((current) => {
        const existing = current.find((entry) => entry.conversationId === conversationId);
        if (existing) {
          return current.map((entry) =>
            entry.conversationId === conversationId ? { ...entry, minimized: false } : entry,
          );
        }
        // En el teléfono hay una sola; en escritorio, la más vieja cede el lugar.
        const limit = narrow ? 1 : MAX_OPEN;
        const next = [...current, { conversationId, minimized: false }];
        return next.slice(Math.max(0, next.length - limit));
      });
      void loadTranscript(conversationId);
      void loadConversations();
    },
    [loadConversations, loadTranscript, narrow],
  );

  async function startWith(contact: ChatContact) {
    const conversationId = await openConversationWith(contact.id);
    if (!conversationId) return;
    await loadConversations();
    openConversation(conversationId);
  }

  function closeWindow(conversationId: string) {
    setWindows((current) => current.filter((entry) => entry.conversationId !== conversationId));
  }

  function toggleMinimized(conversationId: string) {
    setWindows((current) =>
      current.map((entry) =>
        entry.conversationId === conversationId ? { ...entry, minimized: !entry.minimized } : entry,
      ),
    );
    const entry = windows.find((item) => item.conversationId === conversationId);
    if (entry?.minimized) void loadTranscript(conversationId);
  }

  const unread = unreadTotal(conversations);
  const needle = search.trim().toLocaleLowerCase('es-AR');
  const visibleConversations = needle
    ? conversations.filter((conversation) =>
        conversationName(conversation).toLocaleLowerCase('es-AR').includes(needle),
      )
    : conversations;
  const visibleContacts = needle
    ? contacts.filter((contact) => contact.displayName.toLocaleLowerCase('es-AR').includes(needle))
    : contacts;

  return (
    <>
      <div className="chat-dock-trigger">
        <button
          aria-expanded={panelOpen}
          aria-label={unread > 0 ? `Mensajes, ${String(unread)} sin leer` : 'Mensajes'}
          className={`dashboard-topbar-icon ${panelOpen ? 'is-open' : ''}`}
          onClick={() => setPanelOpen((current) => !current)}
          title="Mensajes"
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="18"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
            viewBox="0 0 24 24"
            width="18"
          >
            <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.3-.6L3 21l1.7-5a8.2 8.2 0 0 1-.7-3.4 8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 8 7.3Z" />
          </svg>
          {unread > 0 ? <b className="chat-dock-badge">{unread > 10 ? '+10' : unread}</b> : null}
        </button>

        {panelOpen ? (
          <>
            <button
              aria-label="Cerrar mensajes"
              className="chat-dock-backdrop"
              onClick={() => setPanelOpen(false)}
              type="button"
            />
            <section aria-label="Mensajes" className="chat-dock-panel">
              <header>
                <h2>Mensajes</h2>
                <Link onClick={() => setPanelOpen(false)} to="/app/chat">
                  Ver todo
                </Link>
              </header>
              <input
                aria-label="Buscar en mensajes"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar"
                type="search"
                value={search}
              />
              <div className="chat-dock-panel-scroll">
                {visibleConversations.length > 0 ? (
                  <>
                    <h3>Conversaciones</h3>
                    {visibleConversations.map((conversation) => (
                      <button
                        className="chat-dock-row"
                        key={conversation.id}
                        onClick={() => openConversation(conversation.id)}
                        type="button"
                      >
                        <span>{conversationName(conversation)}</span>
                        {conversation.unreadCount > 0 ? (
                          <b>{conversation.unreadCount}</b>
                        ) : conversation.lastMessageAt ? (
                          <small>{chatTimeLabel(conversation.lastMessageAt)}</small>
                        ) : null}
                      </button>
                    ))}
                  </>
                ) : null}

                <h3>Contactos</h3>
                {visibleContacts.map((contact) => (
                  <button
                    className="chat-dock-row"
                    key={contact.id}
                    onClick={() => void startWith(contact)}
                    type="button"
                  >
                    <span>
                      {canSeePresence ? <PresenceDot entry={presence.get(contact.id)} /> : null}
                      {contact.displayName}
                    </span>
                  </button>
                ))}
                {visibleContacts.length === 0 && visibleConversations.length === 0 ? (
                  <p className="chat-dock-empty">
                    {needle
                      ? 'Nadie con ese nombre.'
                      : 'Nadie habilitado todavía. Un superadmin configura los enlaces en Ajustes.'}
                  </p>
                ) : null}
              </div>
            </section>
          </>
        ) : null}
      </div>

      <div className={`chat-dock ${narrow ? 'is-narrow' : ''}`}>
        {windows.map((entry) => {
          const conversation = conversations.find((item) => item.id === entry.conversationId);
          if (!conversation) return null;
          return (
            <ChatWindow
              canShareReference={canShareReference}
              conversation={conversation}
              draft={drafts[entry.conversationId] ?? ''}
              key={entry.conversationId}
              messages={transcripts.get(entry.conversationId) ?? []}
              minimized={entry.minimized}
              onClose={() => closeWindow(entry.conversationId)}
              onDraft={(value) =>
                setDrafts((current) => ({ ...current, [entry.conversationId]: value }))
              }
              onSent={() => {
                void loadTranscript(entry.conversationId);
                void loadConversations();
              }}
              onToggle={() => toggleMinimized(entry.conversationId)}
              presence={presence}
              showPresence={canSeePresence}
              viewerUserId={viewerUserId}
            />
          );
        })}
      </div>
    </>
  );
}

interface ChatWindowProps {
  canShareReference: boolean;
  conversation: ChatConversation;
  draft: string;
  messages: ChatMessage[];
  minimized: boolean;
  onClose: () => void;
  onDraft: (value: string) => void;
  onSent: () => void;
  onToggle: () => void;
  presence: Map<string, ChatPresence>;
  showPresence: boolean;
  viewerUserId: string;
}

function ChatWindow({
  canShareReference,
  conversation,
  draft,
  messages,
  minimized,
  onClose,
  onDraft,
  onSent,
  onToggle,
  presence,
  showPresence,
  viewerUserId,
}: ChatWindowProps) {
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [referenceType, setReferenceType] = useState<'customer' | 'order'>('customer');
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    if (minimized) return;
    transcriptRef.current?.scrollTo({
      behavior: 'smooth',
      top: transcriptRef.current.scrollHeight,
    });
  }, [messages, minimized]);

  useEffect(() => {
    if (!pickerOpen || !query.trim()) {
      setCandidates([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        const response = await apiRequest(
          referenceType === 'customer'
            ? `/api/v1/customers?search=${encodeURIComponent(query.trim())}`
            : `/api/v1/orders?search=${encodeURIComponent(query.trim())}`,
        );
        if (!active || !response.ok) return;
        const body = (await response.json()) as {
          items: { displayName?: string; id: string; publicNumber?: string }[];
        };
        setCandidates(
          body.items.slice(0, 6).map((item) => ({
            id: item.id,
            label: item.displayName ?? item.publicNumber ?? item.id,
          })),
        );
      })();
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [pickerOpen, query, referenceType]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    onDraft('');
    setFailed('');
    const response = await apiRequest(`/api/v1/chat/conversations/${conversation.id}/messages`, {
      body: JSON.stringify({ body }),
      method: 'POST',
    });
    if (!response.ok) {
      // El texto vuelve al campo: perderlo por un fallo de red sería perder lo que se escribió.
      onDraft(body);
      setFailed('No se pudo enviar. Probá de nuevo.');
      return;
    }
    onSent();
  }

  function sendLocation() {
    if (!navigator.geolocation) return;
    setFailed('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void (async () => {
          const response = await apiRequest(
            `/api/v1/chat/conversations/${conversation.id}/locations`,
            {
              body: JSON.stringify({
                label: null,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              }),
              method: 'POST',
            },
          );
          if (!response.ok) {
            setFailed('No se pudo compartir la ubicación.');
            return;
          }
          onSent();
        })();
      },
      () => setFailed('No pudimos obtener tu ubicación. Revisá los permisos del navegador.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function sendReference(candidate: { id: string; label: string }) {
    setPickerOpen(false);
    setQuery('');
    const response = await apiRequest(`/api/v1/chat/conversations/${conversation.id}/references`, {
      body: JSON.stringify({ resourceId: candidate.id, resourceType: referenceType }),
      method: 'POST',
    });
    if (!response.ok) {
      setFailed('No se pudo compartir la referencia.');
      return;
    }
    onSent();
  }

  const other = conversation.participants.find((person) => person.id !== viewerUserId);

  return (
    <section className={`chat-window ${minimized ? 'is-minimized' : ''}`}>
      <header>
        <button className="chat-window-title" onClick={onToggle} type="button">
          {showPresence && other ? <PresenceDot entry={presence.get(other.id)} /> : null}
          <span>{conversationName(conversation)}</span>
          {/* Minimizada, un punto alcanza: el número exacto está en el ícono de la barra. */}
          {minimized && conversation.unreadCount > 0 ? (
            <i aria-label="Mensajes sin leer" className="chat-window-unread" />
          ) : null}
        </button>
        <button
          aria-label={minimized ? 'Abrir conversación' : 'Minimizar conversación'}
          onClick={onToggle}
          title={minimized ? 'Abrir' : 'Minimizar'}
          type="button"
        >
          {minimized ? '▴' : '▾'}
        </button>
        <button aria-label="Cerrar conversación" onClick={onClose} title="Cerrar" type="button">
          ✕
        </button>
      </header>

      {minimized ? null : (
        <>
          <div className="chat-window-transcript" ref={transcriptRef}>
            {messages.map((entry, index) => (
              <article
                className={[
                  'chat-bubble',
                  entry.authorUserId === viewerUserId ? 'is-mine' : '',
                  messages[index - 1]?.authorUserId === entry.authorUserId ? 'is-continuation' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={entry.id}
              >
                {entry.deletedAt ? (
                  <p>
                    <em>Mensaje eliminado</em>
                  </p>
                ) : entry.kind === 'location' && entry.location ? (
                  <a
                    className="chat-location-card"
                    href={chatMapsUrl(entry.location)}
                    rel="noreferrer"
                    target="_blank"
                  >
                    📍 {entry.location.label ?? 'Ubicación compartida'}
                  </a>
                ) : entry.kind === 'reference' && entry.reference ? (
                  <ChatReferenceCard reference={entry.reference} />
                ) : (
                  <p>{entry.body}</p>
                )}
                <small>{chatTimeLabel(entry.createdAt)}</small>
              </article>
            ))}
            {messages.length === 0 ? (
              <p className="chat-dock-empty">Escribí el primer mensaje.</p>
            ) : null}
          </div>

          {failed ? (
            <p className="chat-window-error" role="alert">
              {failed}
            </p>
          ) : null}

          {pickerOpen ? (
            <div className="chat-window-picker">
              <div>
                <select
                  aria-label="Tipo de referencia"
                  onChange={(event) => setReferenceType(event.target.value as 'customer' | 'order')}
                  value={referenceType}
                >
                  <option value="customer">Cliente</option>
                  <option value="order">Pedido</option>
                </select>
                <input
                  aria-label="Buscar"
                  autoFocus
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={referenceType === 'customer' ? 'Buscar cliente…' : 'Buscar pedido…'}
                  value={query}
                />
              </div>
              {candidates.map((candidate) => (
                <button
                  key={candidate.id}
                  onClick={() => void sendReference(candidate)}
                  type="button"
                >
                  {candidate.label}
                </button>
              ))}
            </div>
          ) : null}

          <form className="chat-window-composer" onSubmit={(event) => void send(event)}>
            <button
              aria-label="Compartir ubicación"
              onClick={sendLocation}
              title="Compartir ubicación"
              type="button"
            >
              📍
            </button>
            {canShareReference ? (
              <button
                aria-label="Compartir pedido o cliente"
                onClick={() => setPickerOpen((current) => !current)}
                title="Compartir pedido o cliente"
                type="button"
              >
                🔗
              </button>
            ) : null}
            <input
              aria-label="Mensaje"
              maxLength={4000}
              onChange={(event) => onDraft(event.target.value)}
              placeholder="Escribí un mensaje"
              value={draft}
            />
            <button className="chat-window-send" disabled={!draft.trim()} type="submit">
              Enviar
            </button>
          </form>
        </>
      )}
    </section>
  );
}
