import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface ConversationRow {
  customerDisplayName: string | null;
  id: string;
  lastMessageAt: string;
  messagingAccountLabel: string;
  status: string;
}

interface MessageRow {
  body: string | null;
  createdAt: string;
  direction: 'inbound' | 'outbound';
  id: string;
  status: string;
}

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value),
  );
}

/** Customer WhatsApp inbox (Fase 5 skeleton — MESSAGING_WHATSAPP.md). Distinct from `/app/chat`,
 * which is staff-to-staff. Polls like the internal chat client does, for the same reason: Vercel
 * Functions can't hold a connection open. Works with zero conversations until a superadmin adds a
 * messaging account (`/app/ajustes/mensajes`) and real inbound traffic starts arriving. */
export function MessagingInboxPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const canRead = profile?.permissions.includes('messages.read') ?? false;
  const canSend = profile?.permissions.includes('messages.send') ?? false;

  const loadConversations = useCallback(async () => {
    const response = await apiRequest('/api/v1/messaging/conversations');
    if (response.ok) {
      setConversations(((await response.json()) as { items: ConversationRow[] }).items);
    }
  }, []);

  const loadMessages = useCallback(async (conversationId: string) => {
    const response = await apiRequest(`/api/v1/messaging/conversations/${conversationId}/messages`);
    if (response.ok) {
      setMessages(((await response.json()) as { items: MessageRow[] }).items);
    }
  }, []);

  useEffect(() => {
    if (!canRead) {
      setLoading(false);
      return;
    }
    void loadConversations().finally(() => setLoading(false));
    const interval = setInterval(() => void loadConversations(), 10_000);
    return () => clearInterval(interval);
  }, [canRead, loadConversations]);

  useEffect(() => {
    if (!selectedId) return;
    void loadMessages(selectedId);
    const interval = setInterval(() => void loadMessages(selectedId), 5_000);
    return () => clearInterval(interval);
  }, [selectedId, loadMessages]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    setSending(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const response = await apiRequest(`/api/v1/messaging/conversations/${selectedId}/messages`, {
      body: JSON.stringify({ body: formText(form, 'body').trim() }),
      method: 'POST',
    });
    setSending(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    event.currentTarget.reset();
    await loadMessages(selectedId);
    await loadConversations();
  }

  if (failed) return <DashboardFailed label="los mensajes" />;
  if (!profile) return <DashboardLoading />;

  if (!canRead) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Mensajes</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver mensajes.</p>
        </section>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Operación</p>
          <h1 className="text-2xl font-semibold text-forest">Mensajes</h1>
        </header>

        {loading ? (
          <p className="mt-4 text-ink-muted">Cargando…</p>
        ) : conversations.length === 0 ? (
          <p className="mt-4 text-ink-muted">
            Todavía no hay conversaciones. Van a aparecer acá en cuanto un cliente escriba a una
            cuenta de WhatsApp configurada.
          </p>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-[0.35fr_0.65fr]">
            <ul className="grid gap-2">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    className={`w-full rounded-xl border px-4 py-3 text-left ${
                      selectedId === conversation.id
                        ? 'border-forest bg-forest/5'
                        : 'border-forest/10 bg-[var(--db-surface)]'
                    }`}
                    onClick={() => setSelectedId(conversation.id)}
                    type="button"
                  >
                    <p className="font-semibold text-forest">
                      {conversation.customerDisplayName ?? 'Cliente sin nombre'}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {conversation.messagingAccountLabel} · {timeLabel(conversation.lastMessageAt)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>

            <div className="rounded-2xl border border-forest/10 bg-[var(--db-surface)] p-4">
              {!selectedId ? (
                <p className="text-ink-muted">Elegí una conversación para verla.</p>
              ) : (
                <>
                  <ul className="grid max-h-[50vh] gap-2 overflow-y-auto">
                    {messages.map((item) => (
                      <li
                        key={item.id}
                        className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                          item.direction === 'outbound'
                            ? 'ml-auto bg-forest text-white'
                            : 'bg-forest/10 text-forest'
                        }`}
                      >
                        <p>{item.body}</p>
                        <p className="mt-1 text-[10px] opacity-70">{timeLabel(item.createdAt)}</p>
                      </li>
                    ))}
                  </ul>
                  {canSend ? (
                    <form className="mt-4 flex gap-2" onSubmit={(event) => void submit(event)}>
                      <input
                        className="flex-1 rounded-xl border border-forest/20 px-3 py-2"
                        name="body"
                        placeholder="Escribí un mensaje…"
                        required
                      />
                      <button className="button button-primary" disabled={sending}>
                        {sending ? 'Enviando…' : 'Enviar'}
                      </button>
                    </form>
                  ) : null}
                  {message ? <p className="mt-2 text-sm text-red-600">{message}</p> : null}
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
