import { useEffect, useMemo, useRef, useState } from 'react';

import { apiRequest } from '../lib/api.js';
import { errorMessage, type WeeklyMenu } from '../lib/operations.js';
import { currentPeriod, periodsFromMenus, type Period } from '../lib/periods.js';
import { showToast } from '../lib/toast.js';

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

const CONVERSATION_KEY = 'verdeo-buho-conversacion';
const OWL = {
  answer: '/brand/HOWL/Howl.png',
  hello: '/brand/HOWL/HowlHi.png',
  thinking: '/brand/HOWL/HowlThink.png',
} as const;

/** La conversación dura lo que la pestaña (BUHO_WORKBENCH_PLAN.md): `sessionStorage`, no la base. */
function storedConversation(): Turn[] {
  try {
    const raw = window.sessionStorage.getItem(CONVERSATION_KEY);
    return raw ? (JSON.parse(raw) as Turn[]) : [];
  } catch {
    return [];
  }
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
 * El búho del Workbench de IA (BUHO_WORKBENCH_PLAN.md, 2026-10-30): los modos, el cuadro para pegar
 * un mensaje, la conversación y "Copiar" en cada respuesta. Los datos del período y la ciudad los
 * arma el servidor; acá sólo se elige el período.
 */
export function BuhoAssistant({ permissions }: { permissions: readonly string[] }) {
  const [modes, setModes] = useState<AssistantModeSummary[]>([]);
  const [modeKey, setModeKey] = useState('');
  const [turns, setTurns] = useState<Turn[]>(storedConversation);
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
        setModeKey((current) => current || items[0]?.key || '');
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

  useEffect(() => {
    try {
      window.sessionStorage.setItem(CONVERSATION_KEY, JSON.stringify(turns));
    } catch {
      // Sin almacenamiento, la conversación vale hasta recargar.
    }
    // jsdom no tiene scrollIntoView: se pregunta antes de llamarlo.
    endRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [turns]);

  const mode = modes.find((candidate) => candidate.key === modeKey) ?? null;
  const groups = useMemo(() => {
    const byGroup = new Map<string, AssistantModeSummary[]>();
    for (const candidate of modes) {
      byGroup.set(candidate.group, [...(byGroup.get(candidate.group) ?? []), candidate]);
    }
    return [...byGroup.entries()];
  }, [modes]);

  const owl =
    sending || pasteOpen || draft.trim()
      ? { alt: 'El búho pensando', src: OWL.thinking }
      : turns.length === 0
        ? { alt: 'El búho saluda', src: OWL.hello }
        : { alt: 'El búho', src: OWL.answer };

  async function send(content: string, pasted?: string) {
    if (!mode || sending) return;
    setFailure('');
    const history = turns.slice(-20).map(({ content: text, role }) => ({ content: text, role }));
    const userTurn: Turn = { content, role: 'user', ...(pasted ? { pasted } : {}) };
    setTurns((current) => [...current, userTurn]);
    setSending(true);
    const response = await apiRequest('/api/v1/ai/assistant/messages', {
      body: JSON.stringify({
        history,
        message: content,
        mode: mode.key,
        ...(cycleId ? { cycleId } : {}),
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
      context: { cycleAlias: string | null; omitted: string[]; siteName: string | null };
      reply: string;
    };
    const where = [
      body.context.cycleAlias,
      body.context.siteName ?? (body.context.cycleAlias ? 'todas las ciudades' : null),
    ]
      .filter(Boolean)
      .join(' · ');
    const footnote = [
      `${mode.label}${where ? ` · ${where}` : ''}`,
      body.context.omitted.length > 0 ? `sin ${body.context.omitted.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    setTurns((current) => [...current, { content: body.reply, footnote, role: 'assistant' }]);
  }

  function submitPaste() {
    if (!mode?.input || !pasteText.trim()) return;
    const text = mask ? maskPersonal(pasteText.trim()) : pasteText.trim();
    const note = pasteNote.trim();
    setPasteOpen(false);
    setPasteText('');
    setPasteNote('');
    void send(`${mode.input.label}:\n${text}${note ? `\n\nIndicación: ${note}` : ''}`, text);
  }

  function submitDraft() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void send(text);
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
      </aside>

      <section className="buho-main" aria-label="Conversación con el búho">
        <div aria-label="Modos del búho" className="buho-modes" role="group">
          {groups.map(([group, items]) => (
            <div className="buho-mode-group" key={group}>
              <span>{group}</span>
              <div>
                {items.map((candidate) => (
                  <button
                    aria-pressed={candidate.key === modeKey}
                    key={candidate.key}
                    onClick={() => setModeKey(candidate.key)}
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
                onClick={() => void send(mode.starter ?? '')}
                type="button"
              >
                Generar
              </button>
            ) : null}
          </div>
        ) : null}

        <div aria-live="polite" className="buho-chat">
          {turns.length === 0 ? (
            <p className="buho-empty">
              ¡Hola! Elegí qué hacemos: pegá un mensaje para analizarlo, generá el análisis del
              período o preguntame lo que quieras sobre la operación.
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
          {sending ? <p className="buho-typing">El búho está pensando…</p> : null}
          {failure ? (
            <p className="buho-failure" role="alert">
              {failure}
            </p>
          ) : null}
          <div ref={endRef} />
        </div>

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
            placeholder="Preguntá algo o pedí un cambio a la última respuesta…"
            rows={2}
            value={draft}
          />
          <div className="buho-composer-actions">
            <button
              className="button button-primary"
              disabled={sending || !draft.trim() || !mode}
              type="submit"
            >
              Enviar
            </button>
            {turns.length > 0 ? (
              <button
                className="button button-secondary"
                disabled={sending}
                onClick={() => {
                  setTurns([]);
                  setFailure('');
                }}
                type="button"
              >
                Empezar de nuevo
              </button>
            ) : null}
          </div>
        </form>
      </section>

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
              Indicación para el búho (opcional)
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
                detectan: si no hacen falta, sacalos.
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
