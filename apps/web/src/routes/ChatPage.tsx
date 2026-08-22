import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { DashboardShell, type DashboardProfile } from '../components/DashboardShell.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';

interface ChatContact {
  displayName: string;
  id: string;
}

interface ChatConversation {
  id: string;
  kind: string;
  lastMessageAt: string | null;
  participants: ChatContact[];
  title: string | null;
  unreadCount: number;
}

interface ChatMessage {
  authorDisplayName: string | null;
  authorUserId: string | null;
  body: string | null;
  createdAt: string;
  deletedAt: string | null;
  editedAt: string | null;
  id: string;
  kind: string;
}

/** Serverless functions cannot hold a socket, so the transcript is polled while the tab is open. */
const POLL_ACTIVE_MS = 5_000;
const POLL_HIDDEN_MS = 30_000;

function conversationName(conversation: ChatConversation): string {
  if (conversation.title) return conversation.title;
  return conversation.participants.map((person) => person.displayName).join(', ') || 'Conversación';
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
}

export function ChatPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<DashboardProfile | null>(null);
  const [failed, setFailed] = useState(false);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    void apiRequest('/api/v1/me')
      .then(async (response) => {
        if (response.status === 401) {
          await navigate('/login', { replace: true });
          return;
        }
        if (!response.ok) throw new Error('sesión');
        const body = (await response.json()) as DashboardProfile;
        if (active) setProfile(body);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  const canChat = profile?.permissions.includes('chat.use') ?? false;

  const loadConversations = useCallback(async () => {
    const response = await apiRequest('/api/v1/chat/conversations');
    if (!response.ok) return;
    const body = (await response.json()) as { items: ChatConversation[] };
    setConversations(body.items);
  }, []);

  useEffect(() => {
    if (!canChat) return;
    void loadConversations();
    void apiRequest('/api/v1/chat/contacts')
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { items: ChatContact[] };
        setContacts(body.items);
      })
      .catch(() => setContacts([]));
  }, [canChat, loadConversations]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const response = await apiRequest(
      `/api/v1/chat/conversations/${conversationId}/messages?limit=100`,
    );
    if (!response.ok) return;
    const body = (await response.json()) as { items: ChatMessage[] };
    setMessages(body.items);
    await apiRequest(`/api/v1/chat/conversations/${conversationId}/read`, { method: 'POST' });
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedId);
  }, [loadMessages, selectedId]);

  // Polling slows down while the tab is hidden: an operator with the window in the background does
  // not need a five-second refresh, and every poll is a function invocation.
  useEffect(() => {
    if (!canChat) return;
    let timer = 0;
    const tick = () => {
      const delay = document.visibilityState === 'visible' ? POLL_ACTIVE_MS : POLL_HIDDEN_MS;
      timer = window.setTimeout(() => {
        void (async () => {
          await loadConversations();
          if (selectedId) await loadMessages(selectedId);
          tick();
        })();
      }, delay);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [canChat, loadConversations, loadMessages, selectedId]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      behavior: 'smooth',
      top: transcriptRef.current.scrollHeight,
    });
  }, [messages]);

  const selected = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  async function logout() {
    await apiRequest('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    await navigate('/login', { replace: true });
  }

  async function openWith(contact: ChatContact) {
    setMessage('');
    const response = await apiRequest('/api/v1/chat/conversations', {
      body: JSON.stringify({ userId: contact.id }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const conversation = (await response.json()) as { id: string };
    await loadConversations();
    setSelectedId(conversation.id);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !draft.trim()) return;
    const body = draft.trim();
    setDraft('');
    const response = await apiRequest(`/api/v1/chat/conversations/${selectedId}/messages`, {
      body: JSON.stringify({ body }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      setDraft(body);
      return;
    }
    await loadMessages(selectedId);
    await loadConversations();
  }

  if (failed) {
    return (
      <main className="grid min-h-screen place-items-center bg-cream px-5 text-center">
        <div>
          <p className="eyebrow">Verdeo SCA</p>
          <h1 className="mt-4 text-3xl font-semibold text-forest">No pudimos cargar el chat.</h1>
          <button className="button button-primary mt-7" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="dashboard-loading" aria-live="polite">
        <img src="/brand/verdeo-icon.png" alt="" width="54" height="54" />
        <p>Cargando tu espacio…</p>
      </main>
    );
  }

  if (!canChat) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Chat interno</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene habilitado el chat.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Equipo</p>
          <h1 className="text-2xl font-semibold text-forest">Chat interno</h1>
        </header>

        {message ? (
          <p className="mt-4 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        <div className="chat-layout mt-6">
          <aside>
            <h2 className="text-sm font-bold text-forest">Conversaciones</h2>
            <ul className="mt-3 space-y-1">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    className={`chat-thread ${conversation.id === selectedId ? 'is-active' : ''}`}
                    onClick={() => setSelectedId(conversation.id)}
                    type="button"
                  >
                    <span>{conversationName(conversation)}</span>
                    {conversation.unreadCount > 0 ? <i>{conversation.unreadCount}</i> : null}
                  </button>
                </li>
              ))}
              {conversations.length === 0 ? (
                <li className="text-sm text-ink-muted">Todavía no tenés conversaciones.</li>
              ) : null}
            </ul>

            <h2 className="mt-6 text-sm font-bold text-forest">Contactos</h2>
            <ul className="mt-3 space-y-1">
              {contacts.map((contact) => (
                <li key={contact.id}>
                  <button
                    className="chat-thread"
                    onClick={() => void openWith(contact)}
                    type="button"
                  >
                    <span>{contact.displayName}</span>
                  </button>
                </li>
              ))}
              {contacts.length === 0 ? (
                <li className="text-sm text-ink-muted">
                  Nadie habilitado todavía. Un superadmin configura los enlaces en Ajustes.
                </li>
              ) : null}
            </ul>
          </aside>

          <div className="chat-panel">
            {selected ? (
              <>
                <h2 className="chat-panel-title">{conversationName(selected)}</h2>
                <div className="chat-transcript" ref={transcriptRef}>
                  {messages.map((entry) => (
                    <article
                      className={`chat-bubble ${
                        entry.authorUserId === profile.user.id ? 'is-mine' : ''
                      }`}
                      key={entry.id}
                    >
                      <p>{entry.deletedAt ? <em>Mensaje eliminado</em> : entry.body}</p>
                      <small>{timeLabel(entry.createdAt)}</small>
                    </article>
                  ))}
                  {messages.length === 0 ? (
                    <p className="text-sm text-ink-muted">Escribí el primer mensaje.</p>
                  ) : null}
                </div>
                <form className="chat-composer" onSubmit={(event) => void send(event)}>
                  <input
                    aria-label="Mensaje"
                    maxLength={4000}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Escribí un mensaje"
                    value={draft}
                  />
                  <button className="button button-primary" disabled={!draft.trim()} type="submit">
                    Enviar
                  </button>
                </form>
              </>
            ) : (
              <p className="text-ink-muted">Elegí una conversación o un contacto para empezar.</p>
            )}
          </div>
        </div>
      </section>
    </DashboardShell>
  );
}
