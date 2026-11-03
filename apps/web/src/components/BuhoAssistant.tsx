import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { apiRequest } from '../lib/api.js';
import { errorMessage, type WeeklyMenu } from '../lib/operations.js';
import { currentPeriod, periodsFromMenus, type Period } from '../lib/periods.js';
import { showToast } from '../lib/toast.js';
import { ConfirmDialog } from './ConfirmDialog.js';

export interface AssistantModeSummary {
  group: string;
  input: { label: string; placeholder: string } | null;
  key: string;
  label: string;
  starter: string | null;
  summary: string;
}

interface Turn {
  content: string;
  /** Debajo de la respuesta: de qué período y ciudad son los datos, y qué no tuvo. */
  footnote?: string;
  /** El texto pegado se muestra plegado; lo que se mandó al modelo es `content`. */
  pasted?: string;
  role: 'assistant' | 'user';
}

/** Sólo cuál se está viendo: las conversaciones están en la base, y son de quien las tuvo. */
const CONVERSATION_KEY = 'verdeo-hera-conversacion';
/** Acá se guardaban los mensajes enteros; se limpia para no dejar textos pegados en el navegador. */
const OLD_CONVERSATION_KEY = 'verdeo-buho-conversacion';
const HISTORY_OPEN_FROM = '(min-width: 960px)';
/** Lo que se escribe en el cuadro de arriba: el modo con todos los datos, sin elegir nada. */
const DIRECT_QUERY = { key: 'buho_preguntar', label: 'Consulta directa' } as const;
const OWL = {
  answer: '/brand/HOWL/Howl.png',
  hello: '/brand/HOWL/HowlHi.png',
  thinking: '/brand/HOWL/HowlThink.png',
} as const;

interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

function storedConversationId(): string | null {
  try {
    window.sessionStorage.removeItem(OLD_CONVERSATION_KEY);
    return window.sessionStorage.getItem(CONVERSATION_KEY);
  } catch {
    return null;
  }
}

function historyDate(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

/**
 * Oculta teléfonos, correos y números de documento antes de mandar un texto pegado. Los nombres no
 * se pueden detectar con seguridad, y el diálogo lo dice.
 */
export function maskPersonal(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[correo]')
    .replace(/\b\d{1,2}\.?\d{3}\.?\d{3}\b/g, '[documento]')
    .replace(/\+?\d[\d\s-]{7,}\d/g, '[teléfono]');
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Sin permiso de portapapeles (o fuera de https): el viejo camino de seleccionar y copiar.
    const area = document.createElement('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  showToast('Copiado.');
}

/**
 * Hera, en la pantalla Hera IA (BUHO_WORKBENCH_PLAN.md, 2026-10-30): la consulta directa, las tareas
 * armadas, el cuadro para pegar un mensaje y "Copiar" en cada respuesta. Los datos del período y la
 * ciudad los arma el servidor; acá sólo se elige el período.
 */
export function BuhoAssistant({ permissions }: { permissions: readonly string[] }) {
  const [modes, setModes] = useState<AssistantModeSummary[]>([]);
  const [modeKey, setModeKey] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(storedConversationId);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [deleting, setDeleting] = useState<ConversationSummary | null>(null);
  const [historyOpen] = useState(() => window.matchMedia?.(HISTORY_OPEN_FROM).matches ?? false);
  const [draft, setDraft] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteNote, setPasteNote] = useState('');
  const [mask, setMask] = useState(true);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState('');
  const [periods, setPeriods] = useState<Period[]>([]);
  const [cycleId, setCycleId] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void apiRequest('/api/v1/ai/assistant/modes', { notify: false })
      .then(async (response) => {
        if (!response.ok) return;
        const items = ((await response.json()) as { items?: AssistantModeSummary[] }).items ?? [];
        setModes(items);
      })
      .catch(() => undefined);
  }, []);

  const canChoosePeriod = permissions.some((permission) =>
    ['orders.read', 'production.read'].includes(permission),
  );
  useEffect(() => {
    if (!canChoosePeriod) return;
    void apiRequest('/api/v1/menus', { notify: false })
      .then(async (response) => {
        if (!response.ok) return;
        const list = periodsFromMenus(
          ((await response.json()) as { items?: WeeklyMenu[] }).items ?? [],
        );
        setPeriods(list);
        setCycleId((current) => current || currentPeriod(list)?.id || '');
      })
      .catch(() => undefined);
  }, [canChoosePeriod]);

  const loadHistory = useCallback(async () => {
    const response = await apiRequest('/api/v1/ai/assistant/conversations', {
      notify: false,
    }).catch(() => null);
    if (!response?.ok) return;
    setHistory(((await response.json()) as { items?: ConversationSummary[] }).items ?? []);
  }, []);

  const openConversation = useCallback(async (id: string) => {
    setFailure('');
    const response = await apiRequest(`/api/v1/ai/assistant/conversations/${id}`, {
      notify: false,
    }).catch(() => null);
    if (!response?.ok) {
      // Se borró en otra pestaña, o era de otro usuario en este navegador: se arranca de cero.
      setConversationId(null);
      setTurns([]);
      return;
    }
    const detail = (await response.json()) as {
      turns: {
        content: string;
        footnote: string | null;
        pasted: string | null;
        role: Turn['role'];
      }[];
    };
    setConversationId(id);
    setTurns(
      detail.turns.map(({ content, footnote, pasted, role }) => ({
        content,
        role,
        ...(footnote ? { footnote } : {}),
        ...(pasted ? { pasted } : {}),
      })),
    );
  }, []);

  useEffect(() => {
    void loadHistory();
    const stored = storedConversationId();
    if (stored) void openConversation(stored);
  }, [loadHistory, openConversation]);

  useEffect(() => {
    try {
      if (conversationId) window.sessionStorage.setItem(CONVERSATION_KEY, conversationId);
      else window.sessionStorage.removeItem(CONVERSATION_KEY);
    } catch {
      // Sin almacenamiento, al recargar se arranca de cero; el historial sigue a mano.
    }
  }, [conversationId]);

  useEffect(() => {
    // jsdom no tiene scrollIntoView: se pregunta antes de llamarlo.
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  const mode = modes.find((candidate) => candidate.key === modeKey) ?? null;
  const groups = useMemo(() => {
    const byGroup = new Map<string, AssistantModeSummary[]>();
    // Preguntar y "cómo se hace" no son tareas: los contesta el cuadro de arriba.
    for (const candidate of modes.filter((item) => item.group !== 'Preguntas')) {
      byGroup.set(candidate.group, [...(byGroup.get(candidate.group) ?? []), candidate]);
    }
    return [...byGroup.entries()];
  }, [modes]);

  const owl =
    sending || pasteOpen || draft.trim()
      ? { alt: 'Hera pensando', src: OWL.thinking }
      : turns.length === 0
        ? { alt: 'Hera saluda', src: OWL.hello }
        : { alt: 'Hera', src: OWL.answer };

  async function send(content: string, target: { key: string; label: string }, pasted?: string) {
    if (sending) return;
    setFailure('');
    const history = turns.slice(-20).map(({ content: text, role }) => ({ content: text, role }));
    const userTurn: Turn = { content, role: 'user', ...(pasted ? { pasted } : {}) };
    setTurns((current) => [...current, userTurn]);
    setSending(true);
    const response = await apiRequest('/api/v1/ai/assistant/messages', {
      body: JSON.stringify({
        history,
        message: content,
        mode: target.key,
        save: true,
        ...(conversationId ? { conversationId } : {}),
        ...(cycleId ? { cycleId } : {}),
        ...(pasted ? { pasted } : {}),
      }),
      method: 'POST',
      notify: false,
    }).catch(() => null);
    setSending(false);
    if (!response?.ok) {
      setFailure(response ? await errorMessage(response) : 'No hubo conexión con el servidor.');
      return;
    }
    const body = (await response.json()) as {
      conversationId: string | null;
      footnote: string;
      reply: string;
    };
    setTurns((current) => [
      ...current,
      { content: body.reply, footnote: body.footnote, role: 'assistant' },
    ]);
    if (body.conversationId) {
      setConversationId(body.conversationId);
      void loadHistory();
    } else {
      showToast('La respuesta no se pudo guardar en tu historial.', 'error');
    }
  }

  function startNewConversation() {
    setConversationId(null);
    setTurns([]);
    setFailure('');
  }

  async function deleteConversation(target: ConversationSummary) {
    const response = await apiRequest(`/api/v1/ai/assistant/conversations/${target.id}`, {
      method: 'DELETE',
    }).catch(() => null);
    setDeleting(null);
    if (!response?.ok) {
      showToast('No se pudo borrar la conversación.', 'error');
      return;
    }
    if (target.id === conversationId) startNewConversation();
    void loadHistory();
  }

  function submitPaste() {
    if (!mode?.input || !pasteText.trim()) return;
    const text = mask ? maskPersonal(pasteText.trim()) : pasteText.trim();
    const note = pasteNote.trim();
    setPasteOpen(false);
    setPasteText('');
    setPasteNote('');
    void send(`${mode.input.label}:\n${text}${note ? `\n\nIndicación: ${note}` : ''}`, mode, text);
  }

  function submitDraft() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void send(text, DIRECT_QUERY);
  }

  return (
    <div className="buho">
      <aside className="buho-side">
        <img alt={owl.alt} className="buho-owl" height={1254} src={owl.src} width={1254} />
        {/* Las otras dos ya cargadas: el cambio de estado no espera a la red. */}
        <link as="image" href={OWL.thinking} rel="preload" />
        <link as="image" href={OWL.answer} rel="preload" />
        {periods.length > 0 ? (
          <label className="field buho-period">
            Período
            <select onChange={(event) => setCycleId(event.target.value)} value={cycleId}>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.alias}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <p className="buho-side-note">
          La ciudad es la elegida arriba. Los datos del sistema viajan sin nombres, teléfonos ni
          domicilios.
        </p>
        <details className="buho-history" open={historyOpen}>
          <summary>Tu historial{history.length > 0 ? ` (${history.length})` : ''}</summary>
          <p className="buho-side-note">Lo ves sólo vos. Podés borrar lo que quieras.</p>
          {history.length === 0 ? (
            <p className="buho-side-note">Todavía no hay conversaciones guardadas.</p>
          ) : (
            <ul>
              {history.map((item) => (
                <li className={item.id === conversationId ? 'is-current' : ''} key={item.id}>
                  <button
                    disabled={sending}
                    onClick={() => void openConversation(item.id)}
                    type="button"
                  >
                    <strong>{item.title}</strong>
                    <small>{historyDate(item.updatedAt)}</small>
                  </button>
                  <button
                    aria-label={`Borrar la conversación: ${item.title}`}
                    className="buho-history-delete"
                    disabled={sending}
                    onClick={() => setDeleting(item)}
                    type="button"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </details>
      </aside>

      <section className="buho-main" aria-label="Conversación con Hera">
        <div className="buho-dialog">
          <form
            className="buho-composer"
            onSubmit={(event) => {
              event.preventDefault();
              submitDraft();
            }}
          >
            <textarea
              aria-label="Tu pregunta o pedido"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submitDraft();
                }
              }}
              placeholder="Ej.: ¿cuánto efectivo hay que rendir hoy? También podés pedir un cambio a la última respuesta."
              rows={2}
              value={draft}
            />
            <div className="buho-composer-actions">
              <button
                className="button button-primary"
                disabled={sending || !draft.trim()}
                type="submit"
              >
                Preguntar
              </button>
              {turns.length > 0 ? (
                <button
                  className="button button-secondary"
                  disabled={sending}
                  onClick={startNewConversation}
                  type="button"
                >
                  Nueva conversación
                </button>
              ) : null}
            </div>
          </form>
          <div aria-live="polite" className="buho-chat">
            {turns.length === 0 ? (
              <p className="buho-empty">
                ¡Hola! Preguntame lo que quieras sobre la operación, o elegí una tarea armada de acá
                abajo.
              </p>
            ) : null}
            {turns.map((turn, index) => (
              <article className={`buho-turn is-${turn.role}`} key={index}>
                {turn.pasted ? (
                  <details>
                    <summary>Texto pegado</summary>
                    <p>{turn.pasted}</p>
                  </details>
                ) : (
                  <p>{turn.content}</p>
                )}
                {turn.role === 'assistant' ? (
                  <footer>
                    {turn.footnote ? <small>{turn.footnote}</small> : null}
                    <button
                      className="button button-secondary"
                      onClick={() => void copyText(turn.content)}
                      type="button"
                    >
                      Copiar
                    </button>
                  </footer>
                ) : null}
              </article>
            ))}
            {sending ? <p className="buho-typing">Hera está pensando…</p> : null}
            {failure ? (
              <p className="buho-failure" role="alert">
                {failure}
              </p>
            ) : null}
            <div ref={endRef} />
          </div>
        </div>

        <h3 className="buho-tasks-title">Tareas armadas</h3>
        <div aria-label="Modos de Hera" className="buho-modes" role="group">
          {groups.map(([group, items]) => (
            <div className="buho-mode-group" key={group}>
              <span>{group}</span>
              <div>
                {items.map((candidate) => (
                  <button
                    aria-pressed={candidate.key === modeKey}
                    key={candidate.key}
                    onClick={() =>
                      setModeKey((current) => (current === candidate.key ? '' : candidate.key))
                    }
                    title={candidate.summary}
                    type="button"
                  >
                    {candidate.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {mode ? (
          <div className="buho-mode-card">
            <p>
              <strong>{mode.label}.</strong> {mode.summary}
            </p>
            {mode.input ? (
              <button
                className="button button-primary"
                disabled={sending}
                onClick={() => setPasteOpen(true)}
                type="button"
              >
                Pegar el texto
              </button>
            ) : mode.starter ? (
              <button
                className="button button-primary"
                disabled={sending}
                onClick={() => void send(mode.starter ?? '', mode)}
                type="button"
              >
                Generar
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      {deleting ? (
        <ConfirmDialog
          confirmLabel="Borrar"
          detail="Se borra para siempre, con todos sus mensajes."
          onCancel={() => setDeleting(null)}
          onConfirm={() => deleteConversation(deleting)}
          title={`¿Borrar "${deleting.title}"?`}
          tone="destructivo"
        />
      ) : null}

      {pasteOpen && mode?.input ? (
        <div aria-label={mode.label} aria-modal="true" className="modal-backdrop" role="dialog">
          <div className="modal-panel buho-paste">
            <h2 className="text-xl font-semibold text-forest">{mode.label}</h2>
            <label className="field">
              {mode.input.label}
              <textarea
                autoFocus
                onChange={(event) => setPasteText(event.target.value)}
                placeholder={mode.input.placeholder}
                rows={12}
                value={pasteText}
              />
            </label>
            <label className="field">
              Indicación para Hera (opcional)
              <input
                onChange={(event) => setPasteNote(event.target.value)}
                placeholder="Ej.: más corto, tono formal, ofrecele el Real"
                value={pasteNote}
              />
            </label>
            <label className="buho-mask">
              <input
                checked={mask}
                onChange={(event) => setMask(event.target.checked)}
                type="checkbox"
              />
              <span>
                Ocultar teléfonos, correos y documentos antes de mandarlo. Los nombres no se
                detectan: si no hacen falta, sacalos. El texto queda en tu historial hasta que lo
                borres.
              </span>
            </label>
            <div className="form-actions mt-4">
              <button
                className="button button-primary"
                disabled={!pasteText.trim()}
                onClick={submitPaste}
                type="button"
              >
                Analizar
              </button>
              <button
                className="button button-secondary"
                onClick={() => setPasteOpen(false)}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
