import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { DashboardShell, type DashboardProfile } from '../components/DashboardShell.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage, formatMoney, orderStatusLabel } from '../lib/operations.js';

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

interface ChatPresence {
  connected: boolean;
  status: string;
  statusMessage: string | null;
  userId: string;
}

interface ChatLocation {
  label: string | null;
  latitude: number;
  longitude: number;
}

type ChatReferenceType = 'customer' | 'order';

interface ChatReference {
  resourceId: string;
  resourceType: ChatReferenceType;
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
  location: ChatLocation | null;
  reference: ChatReference | null;
}

/** Search result shape used by the reference picker — the same fields exist on both the customer
 * and order list endpoints, just under a different label field, so we normalize to this locally. */
interface ReferenceCandidate {
  id: string;
  label: string;
}

/** Serverless functions cannot hold a socket, so the transcript is polled while the tab is open. */
const POLL_ACTIVE_MS = 5_000;
const POLL_HIDDEN_MS = 30_000;

function conversationName(conversation: ChatConversation): string {
  if (conversation.title) return conversation.title;
  return conversation.participants.map((person) => person.displayName).join(', ') || 'Conversación';
}

function PresenceDot({ entry }: { entry: ChatPresence | undefined }) {
  const status = entry?.status ?? 'offline';
  const label =
    { available: 'Disponible', away: 'Ausente', busy: 'Ocupado', offline: 'Desconectado' }[
      status
    ] ?? status;
  return <i aria-label={label} className={`chat-presence-dot is-${status}`} title={label} />;
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
}

function mapsUrl(location: ChatLocation): string {
  return `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;
}

/** Resolves a shared pointer through the viewer's own session and permissions — never a copy of the
 * data, always a live lookup, so a viewer without access sees "no disponible" instead of stale PII. */
function ReferenceCard({ reference }: { reference: ChatReference }) {
  const [state, setState] = useState<'loading' | 'ok' | 'denied'>('loading');
  const [summary, setSummary] = useState<{ href: string; title: string; subtitle: string } | null>(
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
  const [presence, setPresence] = useState<Map<string, ChatPresence>>(new Map());
  const [locationBusy, setLocationBusy] = useState(false);
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  const [referenceType, setReferenceType] = useState<ChatReferenceType>('customer');
  const [referenceQuery, setReferenceQuery] = useState('');
  const [referenceCandidates, setReferenceCandidates] = useState<ReferenceCandidate[]>([]);
  const [referenceSearching, setReferenceSearching] = useState(false);
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
  const canSeePresence = profile?.permissions.includes('chat.presence.read') ?? false;
  const canShareReference = profile?.permissions.includes('chat.share_reference') ?? false;

  const loadPresence = useCallback(async () => {
    if (!canSeePresence) return;
    const response = await apiRequest('/api/v1/chat/presence');
    if (!response.ok) return;
    const body = (await response.json()) as { items: ChatPresence[] };
    setPresence(new Map(body.items.map((entry) => [entry.userId, entry])));
  }, [canSeePresence]);

  const loadConversations = useCallback(async () => {
    const response = await apiRequest('/api/v1/chat/conversations');
    if (!response.ok) return;
    const body = (await response.json()) as { items: ChatConversation[] };
    setConversations(body.items);
  }, []);

  useEffect(() => {
    if (!canChat) return;
    void loadConversations();
    void loadPresence();
    void apiRequest('/api/v1/chat/contacts')
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { items: ChatContact[] };
        setContacts(body.items);
      })
      .catch(() => setContacts([]));
  }, [canChat, loadConversations, loadPresence]);

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
          await loadPresence();
          if (selectedId) await loadMessages(selectedId);
          tick();
        })();
      }, delay);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [canChat, loadConversations, loadMessages, loadPresence, selectedId]);

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

  function sendLocation() {
    if (!selectedId || !navigator.geolocation) return;
    setMessage('');
    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void (async () => {
          const response = await apiRequest(`/api/v1/chat/conversations/${selectedId}/locations`, {
            body: JSON.stringify({
              label: null,
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            }),
            method: 'POST',
          });
          setLocationBusy(false);
          if (!response.ok) {
            setMessage(await errorMessage(response));
            return;
          }
          await loadMessages(selectedId);
          await loadConversations();
        })();
      },
      () => {
        setLocationBusy(false);
        setMessage('No pudimos obtener tu ubicación. Revisá los permisos del navegador.');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function openReferencePicker() {
    setReferencePickerOpen(true);
    setReferenceType('customer');
    setReferenceQuery('');
    setReferenceCandidates([]);
  }

  useEffect(() => {
    if (!referencePickerOpen) return;
    const query = referenceQuery.trim();
    if (!query) {
      setReferenceCandidates([]);
      return;
    }
    let active = true;
    setReferenceSearching(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        const endpoint =
          referenceType === 'customer'
            ? `/api/v1/customers?search=${encodeURIComponent(query)}`
            : `/api/v1/orders?search=${encodeURIComponent(query)}`;
        const response = await apiRequest(endpoint);
        if (!active) return;
        setReferenceSearching(false);
        if (!response.ok) {
          setReferenceCandidates([]);
          return;
        }
        const body = (await response.json()) as {
          items: Array<{ displayName?: string; id: string; publicNumber?: string }>;
        };
        setReferenceCandidates(
          body.items.map((item) => ({
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
  }, [referencePickerOpen, referenceQuery, referenceType]);

  async function sendReference(candidate: ReferenceCandidate) {
    if (!selectedId) return;
    setMessage('');
    setReferencePickerOpen(false);
    const response = await apiRequest(`/api/v1/chat/conversations/${selectedId}/references`, {
      body: JSON.stringify({ resourceId: candidate.id, resourceType: referenceType }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
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
                    <span>
                      {canSeePresence ? <PresenceDot entry={presence.get(contact.id)} /> : null}
                      {contact.displayName}
                    </span>
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
                  {messages.map((entry, index) => (
                    <article
                      className={[
                        'chat-bubble',
                        entry.authorUserId === profile.user.id ? 'is-mine' : '',
                        messages[index - 1]?.authorUserId === entry.authorUserId
                          ? 'is-continuation'
                          : '',
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
                          href={mapsUrl(entry.location)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          📍 {entry.location.label ?? 'Ubicación compartida'}
                        </a>
                      ) : entry.kind === 'reference' && entry.reference ? (
                        <ReferenceCard reference={entry.reference} />
                      ) : (
                        <p>{entry.body}</p>
                      )}
                      <small>{timeLabel(entry.createdAt)}</small>
                    </article>
                  ))}
                  {messages.length === 0 ? (
                    <p className="text-sm text-ink-muted">Escribí el primer mensaje.</p>
                  ) : null}
                </div>
                {referencePickerOpen ? (
                  <div className="chat-reference-picker">
                    <div className="flex items-center justify-between gap-3">
                      <label className="field">
                        Tipo
                        <select
                          onChange={(event) =>
                            setReferenceType(event.target.value as ChatReferenceType)
                          }
                          value={referenceType}
                        >
                          <option value="customer">Cliente</option>
                          <option value="order">Pedido</option>
                        </select>
                      </label>
                      <button
                        className="button button-secondary"
                        onClick={() => setReferencePickerOpen(false)}
                        type="button"
                      >
                        Cancelar
                      </button>
                    </div>
                    <input
                      aria-label="Buscar"
                      autoFocus
                      onChange={(event) => setReferenceQuery(event.target.value)}
                      placeholder={
                        referenceType === 'customer' ? 'Buscar cliente…' : 'Buscar pedido…'
                      }
                      value={referenceQuery}
                    />
                    <ul className="mt-2 space-y-1">
                      {referenceCandidates.map((candidate) => (
                        <li key={candidate.id}>
                          <button
                            className="chat-thread"
                            onClick={() => void sendReference(candidate)}
                            type="button"
                          >
                            {candidate.label}
                          </button>
                        </li>
                      ))}
                      {!referenceSearching &&
                      referenceQuery.trim() &&
                      referenceCandidates.length === 0 ? (
                        <li className="text-sm text-ink-muted">Sin resultados.</li>
                      ) : null}
                    </ul>
                  </div>
                ) : null}
                <form className="chat-composer" onSubmit={(event) => void send(event)}>
                  <button
                    aria-label="Compartir ubicación"
                    className="button button-secondary"
                    disabled={locationBusy}
                    onClick={() => void sendLocation()}
                    title="Compartir ubicación"
                    type="button"
                  >
                    📍
                  </button>
                  {canShareReference ? (
                    <button
                      aria-label="Compartir referencia"
                      className="button button-secondary"
                      onClick={openReferencePicker}
                      title="Compartir pedido o cliente"
                      type="button"
                    >
                      🔗
                    </button>
                  ) : null}
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
