import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { apiRequest, storedOperatingSiteId, subscribeToOperatingSite } from '../lib/api.js';
import { loadFeedCards, type FeedCard, type FeedCardKind } from '../lib/feedCards.js';
import {
  browserNoticesEnabled,
  browserNoticesSupported,
  refreshFeedUnread,
  setBrowserNotices,
} from '../lib/feedUnread.js';
import { errorMessage } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';

type FeedTag = 'aviso' | 'cambio' | 'novedad';

interface FeedPost {
  acknowledgedCount: number;
  authorDisplayName: string | null;
  authorUserId: string | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
  id: string;
  myAcknowledgedAt: string | null;
  myReadAt: string | null;
  needsAcknowledgement: boolean;
  operatingSiteId: string | null;
  operatingSiteName: string | null;
  pinnedUntil: string | null;
  reactedByMe: boolean;
  reactionCount: number;
  readCount: number;
  replyCount: number;
  tag: FeedTag;
}

interface Reply {
  authorDisplayName: string | null;
  authorUserId: string | null;
  body: string;
  createdAt: string;
  id: string;
}

interface Readers {
  pending: { displayName: string; userId: string }[];
  reads: { acknowledgedAt: string | null; displayName: string; readAt: string; userId: string }[];
}

const TAG_LABELS: Record<FeedTag, string> = {
  aviso: 'Aviso',
  cambio: 'Cambio',
  novedad: 'Novedad del sistema',
};

type Filter = 'agenda' | 'alertas' | 'comunicaciones' | 'mensajes' | 'todo';

const FILTERS: readonly { label: string; value: Filter }[] = [
  { label: 'Todo', value: 'todo' },
  { label: 'Alertas', value: 'alertas' },
  { label: 'Comunicaciones', value: 'comunicaciones' },
  { label: 'Agenda', value: 'agenda' },
  { label: 'Mensajes', value: 'mensajes' },
];

const CARD_FILTER: Record<FeedCardKind, Filter> = {
  agenda: 'agenda',
  alerta: 'alertas',
  mensajes: 'mensajes',
};

const CARD_LABEL: Record<FeedCardKind, string> = {
  agenda: 'Agenda',
  alerta: 'Alerta',
  mensajes: 'Mensajes',
};

/** "Hecho" esconde la tarjeta por un año: si lo que dice cambia, es otra y vuelve. */
const DONE_DAYS = 365;

/** Un campo de texto del formulario (un archivo no es texto: vale lo de reemplazo). */
function field(form: FormData, key: string, fallback: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : fallback;
}

const relative = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' });

/** "hace 5 minutos", "ayer", "el 3 de octubre": cuándo, dicho como se dice. */
function when(iso: string): string {
  const minutes = Math.round((Date.parse(iso) - Date.now()) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return relative.format(days, 'day');
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(new Date(iso));
}

/** El texto tal cual, con los enlaces clickeables. Nada de HTML: lo que se escribe es texto. */
function Body({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const pattern = /https?:\/\/[^\s<>()]+/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    if (start > last) parts.push(text.slice(last, start));
    parts.push(
      <a href={match[0]} key={start} rel="noopener noreferrer" target="_blank">
        {match[0]}
      </a>,
    );
    last = start + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <p className="feed-post-body">{parts}</p>;
}

/** Una semana: lo que se fija es "esta semana pasa esto"; más largo se suelta a mano. */
function defaultPinDate(): string {
  const date = new Date(Date.now() + 7 * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/**
 * El feed del tablero (DASHBOARD_FEED_PLAN.md): lo que el sistema ya sabe —alertas, la agenda de
 * hoy y mañana, los mensajes sin leer—, que cada uno marca como hecho o pospone, y lo que publica
 * el equipo, con respuestas y un 👍.
 *
 * Las publicaciones son avisos que quedan, no una charla (para eso está el chat): las fijadas
 * arriba, y las que piden "lo leí" (las fijadas y los cambios) muestran quién falta.
 */
export function FeedPanel({
  permissions,
  userId,
}: {
  permissions: readonly string[];
  userId: string;
}) {
  const canPost = permissions.includes('feed.post');
  const canModerate = permissions.includes('feed.moderate');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [cards, setCards] = useState<FeedCard[]>([]);
  // Las tarjetas que esta persona marcó como hechas o pospuso.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [replies, setReplies] = useState<{ items: Reply[]; postId: string } | null>(null);
  const [notices, setNotices] = useState(browserNoticesEnabled);
  const [filter, setFilter] = useState<Filter>('todo');
  const [loaded, setLoaded] = useState(false);
  // Las que no había visto al abrir: se marcan vistas enseguida, pero siguen diciendo "nueva".
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const [composing, setComposing] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [readers, setReaders] = useState<{ id: string; data: Readers } | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const tasks: Promise<void>[] = [];
    if (canPost) {
      tasks.push(
        apiRequest('/api/v1/feed/posts', { notify: false })
          .then(async (response) => {
            if (!response.ok) return;
            const items = ((await response.json()) as { items: FeedPost[] }).items;
            setPosts(items);
            const unseen = items.filter((post) => !post.myReadAt).map((post) => post.id);
            if (unseen.length > 0) {
              setFresh((current) => new Set([...current, ...unseen]));
              await Promise.all(
                unseen.map((id) =>
                  apiRequest(`/api/v1/feed/posts/${id}/read`, {
                    body: JSON.stringify({ acknowledge: false }),
                    method: 'POST',
                    notify: false,
                  }).catch(() => undefined),
                ),
              );
              void refreshFeedUnread();
            }
          })
          .catch(() => undefined),
      );
    }
    tasks.push(loadFeedCards(permissions).then((loadedCards) => setCards(loadedCards)));
    if (canPost) {
      tasks.push(
        apiRequest('/api/v1/feed/cards/hidden', { notify: false })
          .then(async (response) => {
            if (!response.ok) return;
            setHidden(new Set(((await response.json()) as { keys: string[] }).keys));
          })
          .catch(() => undefined),
      );
    }
    await Promise.all(tasks);
    setLoaded(true);
  }, [canPost, permissions]);

  useEffect(() => {
    void load();
    // Al cambiar de ciudad, el feed es otro.
    return subscribeToOperatingSite(() => void load());
  }, [load]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = field(form, 'body', '').trim();
    if (!body) {
      setMessage('Escribí algo para publicar.');
      return;
    }
    const onlyHere = form.get('onlyHere') === 'on';
    const pin = form.get('pin') === 'on';
    const pinDay = field(form, 'pinUntil', '');
    setMessage('');
    const response = await apiRequest('/api/v1/feed/posts', {
      body: JSON.stringify({
        body,
        operatingSiteId: onlyHere ? storedOperatingSiteId() : null,
        pinnedUntil: pin && pinDay ? new Date(`${pinDay}T23:59:00-03:00`).toISOString() : null,
        tag: field(form, 'tag', 'aviso'),
      }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setComposing(false);
    showToast('Publicado.');
    await load();
  }

  async function saveEdit(post: FeedPost, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await apiRequest(`/api/v1/feed/posts/${post.id}`, {
      body: JSON.stringify({
        body: field(form, 'body', ''),
        tag: field(form, 'tag', post.tag),
      }),
      method: 'PATCH',
    });
    if (!response.ok) {
      showToast(await errorMessage(response));
      return;
    }
    setEditing(null);
    await load();
  }

  async function remove(post: FeedPost) {
    if (!window.confirm('¿Borrar esta publicación? Deja de verse para todos.')) return;
    const response = await apiRequest(`/api/v1/feed/posts/${post.id}`, { method: 'DELETE' });
    if (response.ok) await load();
  }

  async function togglePin(post: FeedPost) {
    const pinnedUntil = post.pinnedUntil
      ? null
      : new Date(`${defaultPinDate()}T23:59:00-03:00`).toISOString();
    const response = await apiRequest(`/api/v1/feed/posts/${post.id}/pin`, {
      body: JSON.stringify({ pinnedUntil }),
      method: 'PUT',
    });
    if (response.ok) await load();
  }

  async function acknowledge(post: FeedPost) {
    const response = await apiRequest(`/api/v1/feed/posts/${post.id}/read`, {
      body: JSON.stringify({ acknowledge: true }),
      method: 'POST',
    });
    if (response.ok) await load();
  }

  /** Esconder una tarjeta: "Hecho" (no vuelve mientras diga lo mismo) o "Mañana". */
  async function hideCard(card: FeedCard, days: number) {
    setHidden((current) => new Set([...current, card.key]));
    const until = new Date(Date.now() + days * 86_400_000);
    if (days === 1) until.setHours(6, 0, 0, 0);
    await apiRequest('/api/v1/feed/cards', {
      body: JSON.stringify({ cardKey: card.key, hiddenUntil: until.toISOString() }),
      method: 'PUT',
      notify: false,
    }).catch(() => undefined);
  }

  async function toggleReaction(post: FeedPost) {
    const on = !post.reactedByMe;
    setPosts((current) =>
      current.map((item) =>
        item.id === post.id
          ? { ...item, reactedByMe: on, reactionCount: item.reactionCount + (on ? 1 : -1) }
          : item,
      ),
    );
    await apiRequest(`/api/v1/feed/posts/${post.id}/reaction`, {
      body: JSON.stringify({ on }),
      method: 'PUT',
      notify: false,
    }).catch(() => undefined);
  }

  async function openReplies(post: FeedPost) {
    if (replies?.postId === post.id) {
      setReplies(null);
      return;
    }
    const response = await apiRequest(`/api/v1/feed/posts/${post.id}/replies`);
    if (response.ok) {
      setReplies({ items: ((await response.json()) as { items: Reply[] }).items, postId: post.id });
    }
  }

  async function sendReply(post: FeedPost, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const body = field(new FormData(formElement), 'reply', '').trim();
    if (!body) return;
    const response = await apiRequest(`/api/v1/feed/posts/${post.id}/replies`, {
      body: JSON.stringify({ body }),
      method: 'POST',
    });
    if (!response.ok) {
      showToast(await errorMessage(response));
      return;
    }
    formElement.reset();
    setReplies(null);
    await load();
    await openReplies(post);
  }

  async function deleteReply(post: FeedPost, reply: Reply) {
    if (!window.confirm('¿Borrar esta respuesta?')) return;
    const response = await apiRequest(`/api/v1/feed/replies/${reply.id}`, { method: 'DELETE' });
    if (!response.ok) return;
    setReplies(null);
    await load();
    await openReplies(post);
  }

  async function toggleNotices() {
    const next = await setBrowserNotices(!notices);
    setNotices(next);
    if (!next && !notices) showToast('El navegador no dio permiso para avisar.');
  }

  async function showReaders(post: FeedPost) {
    if (readers?.id === post.id) {
      setReaders(null);
      return;
    }
    const response = await apiRequest(`/api/v1/feed/posts/${post.id}/readers`);
    if (response.ok) setReaders({ data: (await response.json()) as Readers, id: post.id });
  }

  const visibleCards = cards.filter(
    (card) => !hidden.has(card.key) && (filter === 'todo' || CARD_FILTER[card.kind] === filter),
  );
  if (!canPost && cards.length === 0) return null;

  const showPosts = filter === 'todo' || filter === 'comunicaciones';

  return (
    <section aria-labelledby="feed-titulo" className="feed">
      <header className="feed-head">
        <h2 id="feed-titulo">Novedades</h2>
        <div aria-label="Qué mostrar" className="feed-filters" role="group">
          {FILTERS.map((option) => (
            <button
              aria-pressed={filter === option.value}
              key={option.value}
              onClick={() => setFilter(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        {canPost && browserNoticesSupported() ? (
          <button
            aria-pressed={notices}
            className="feed-link"
            onClick={() => void toggleNotices()}
            title="Un aviso del navegador cuando alguien publica y no estás mirando esta pestaña"
            type="button"
          >
            {notices ? 'Avisos del navegador: sí' : 'Avisarme en el navegador'}
          </button>
        ) : null}
        {canPost && !composing ? (
          <button
            className="button button-primary feed-new"
            onClick={() => setComposing(true)}
            type="button"
          >
            Publicar
          </button>
        ) : null}
      </header>

      {composing ? (
        <form className="feed-composer" onSubmit={(event) => void publish(event)}>
          <label className="sr-only" htmlFor="feed-body">
            Qué querés contar
          </label>
          <textarea
            autoFocus
            id="feed-body"
            maxLength={4000}
            name="body"
            placeholder="Contale algo al equipo: un cambio, un aviso, una novedad…"
            rows={4}
          />
          <div className="feed-composer-options">
            <label>
              Tipo
              <select defaultValue="aviso" name="tag">
                <option value="aviso">Aviso</option>
                <option value="cambio">Cambio (pide &quot;lo leí&quot;)</option>
                {canModerate ? <option value="novedad">Novedad del sistema</option> : null}
              </select>
            </label>
            {storedOperatingSiteId() ? (
              <label className="feed-check">
                <input name="onlyHere" type="checkbox" />
                Sólo para esta ciudad
              </label>
            ) : null}
            {canModerate ? (
              <label className="feed-check">
                <input name="pin" type="checkbox" />
                Fijar arriba hasta
                <input defaultValue={defaultPinDate()} name="pinUntil" type="date" />
              </label>
            ) : null}
          </div>
          {message ? (
            <p className="screen-notice" role="alert">
              {message}
            </p>
          ) : null}
          <div className="feed-composer-actions">
            <button className="button button-primary" type="submit">
              Publicar
            </button>
            <button
              className="button button-secondary"
              onClick={() => {
                setComposing(false);
                setMessage('');
              }}
              type="button"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      <ul className="feed-list">
        {visibleCards.map((card) => (
          <li className={`feed-card feed-alert kind-${card.kind}`} key={card.key}>
            <span className="feed-tag">{CARD_LABEL[card.kind]}</span>
            <Link to={card.href}>
              {card.count !== null ? <strong>{card.count}</strong> : null} {card.text}
            </Link>
            {canPost ? (
              <span className="feed-card-actions">
                <button
                  className="feed-link"
                  onClick={() => void hideCard(card, DONE_DAYS)}
                  type="button"
                >
                  Hecho
                </button>
                <button className="feed-link" onClick={() => void hideCard(card, 1)} type="button">
                  Mañana
                </button>
              </span>
            ) : null}
          </li>
        ))}

        {showPosts
          ? posts.map((post) => {
              const mine = post.authorUserId === userId;
              const pinned = post.pinnedUntil !== null && Date.parse(post.pinnedUntil) > Date.now();
              return (
                <li
                  className={`feed-card feed-post tag-${post.tag}${pinned ? ' is-pinned' : ''}`}
                  key={post.id}
                >
                  <div className="feed-post-meta">
                    <span className="feed-tag">{TAG_LABELS[post.tag]}</span>
                    {pinned ? <span className="feed-pin">Fijada</span> : null}
                    {fresh.has(post.id) ? <span className="feed-fresh">Nueva</span> : null}
                    <span>
                      {post.authorDisplayName ?? 'Alguien que ya no está'} · {when(post.createdAt)}
                      {post.editedAt ? ' · editada' : ''}
                      {post.operatingSiteName ? ` · ${post.operatingSiteName}` : ''}
                    </span>
                  </div>

                  {editing === post.id ? (
                    <form onSubmit={(event) => void saveEdit(post, event)}>
                      <textarea defaultValue={post.body} maxLength={4000} name="body" rows={4} />
                      <div className="feed-composer-actions">
                        <select defaultValue={post.tag} name="tag">
                          <option value="aviso">Aviso</option>
                          <option value="cambio">Cambio</option>
                          {canModerate || post.tag === 'novedad' ? (
                            <option value="novedad">Novedad del sistema</option>
                          ) : null}
                        </select>
                        <button className="button button-primary" type="submit">
                          Guardar
                        </button>
                        <button
                          className="button button-secondary"
                          onClick={() => setEditing(null)}
                          type="button"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <Body text={post.body} />
                  )}

                  <div className="feed-post-actions">
                    {post.needsAcknowledgement && !post.myAcknowledgedAt ? (
                      <button
                        className="button button-primary"
                        onClick={() => void acknowledge(post)}
                        type="button"
                      >
                        Lo leí
                      </button>
                    ) : post.needsAcknowledgement ? (
                      <span className="feed-ack-done">✓ Leído</span>
                    ) : null}
                    <button
                      aria-label={post.reactedByMe ? 'Sacar mi 👍' : 'Poner 👍'}
                      aria-pressed={post.reactedByMe}
                      className="feed-reaction"
                      onClick={() => void toggleReaction(post)}
                      type="button"
                    >
                      👍 {post.reactionCount > 0 ? post.reactionCount : ''}
                    </button>
                    <button
                      aria-expanded={replies?.postId === post.id}
                      className="feed-link"
                      onClick={() => void openReplies(post)}
                      type="button"
                    >
                      {post.replyCount === 0
                        ? 'Responder'
                        : post.replyCount === 1
                          ? '1 respuesta'
                          : `${String(post.replyCount)} respuestas`}
                    </button>
                    <button
                      aria-expanded={readers?.id === post.id}
                      className="feed-link"
                      onClick={() => void showReaders(post)}
                      type="button"
                    >
                      {post.needsAcknowledgement
                        ? `Confirmaron ${String(post.acknowledgedCount)}`
                        : `Lo vieron ${String(post.readCount)}`}
                    </button>
                    {mine || canModerate ? (
                      <>
                        <button
                          className="feed-link"
                          onClick={() => setEditing(post.id)}
                          type="button"
                        >
                          Editar
                        </button>
                        <button
                          className="feed-link"
                          onClick={() => void remove(post)}
                          type="button"
                        >
                          Borrar
                        </button>
                      </>
                    ) : null}
                    {canModerate ? (
                      <button
                        className="feed-link"
                        onClick={() => void togglePin(post)}
                        type="button"
                      >
                        {pinned ? 'Soltar' : 'Fijar una semana'}
                      </button>
                    ) : null}
                  </div>

                  {replies?.postId === post.id ? (
                    <div className="feed-replies">
                      {replies.items.map((reply) => (
                        <div className="feed-reply" key={reply.id}>
                          <p>
                            <strong>{reply.authorDisplayName ?? 'Alguien que ya no está'}</strong>{' '}
                            <small>{when(reply.createdAt)}</small>
                          </p>
                          <Body text={reply.body} />
                          {reply.authorUserId === userId || canModerate ? (
                            <button
                              className="feed-link"
                              onClick={() => void deleteReply(post, reply)}
                              type="button"
                            >
                              Borrar
                            </button>
                          ) : null}
                        </div>
                      ))}
                      <form
                        className="feed-reply-form"
                        onSubmit={(event) => void sendReply(post, event)}
                      >
                        <label className="sr-only" htmlFor={`reply-${post.id}`}>
                          Tu respuesta
                        </label>
                        <input
                          id={`reply-${post.id}`}
                          maxLength={1000}
                          name="reply"
                          placeholder="Respondé corto…"
                        />
                        <button className="button button-secondary" type="submit">
                          Enviar
                        </button>
                      </form>
                    </div>
                  ) : null}

                  {readers?.id === post.id ? (
                    <div className="feed-readers">
                      <p>
                        <strong>Lo vieron:</strong>{' '}
                        {readers.data.reads
                          .map(
                            (read) =>
                              `${read.displayName}${post.needsAcknowledgement && read.acknowledgedAt ? ' ✓' : ''}`,
                          )
                          .join(', ') || 'nadie todavía'}
                      </p>
                      {readers.data.pending.length > 0 ? (
                        <p>
                          <strong>Falta:</strong>{' '}
                          {readers.data.pending.map((person) => person.displayName).join(', ')}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })
          : null}
      </ul>

      {loaded && (showPosts ? posts.length === 0 : true) && visibleCards.length === 0 ? (
        <p className="feed-empty">
          {filter === 'alertas'
            ? 'Sin alertas. Todo en orden.'
            : filter === 'agenda'
              ? 'Nada en la agenda para hoy ni mañana.'
              : filter === 'mensajes'
                ? 'Sin mensajes por leer.'
                : canPost
                  ? 'Todavía nadie publicó nada. Contale algo al equipo con "Publicar".'
                  : 'Nada nuevo.'}
        </p>
      ) : null}
    </section>
  );
}
