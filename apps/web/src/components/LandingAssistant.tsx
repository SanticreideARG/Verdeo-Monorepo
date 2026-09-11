import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { apiRequest } from '../lib/api.js';
import { formatMoney, type WeeklyMenu } from '../lib/operations.js';
import { whatsappHref } from '../lib/phone.js';

type Behaviour = 'responder' | 'preguntar' | 'llevar' | 'salir';
type Block = 'MENU_SEMANA' | 'PRECIOS' | 'ZONAS' | 'MEDIOS_DE_PAGO';

interface AssistantOption {
  behaviour: Behaviour;
  block?: Block;
  href?: string;
  key: string;
  label: string;
  needsCity: boolean;
  options?: AssistantOption[];
  reply?: string;
  whatsappMessage?: string;
  whatsappNumber?: string;
}

interface AssistantFlow {
  greeting: string;
  options: AssistantOption[];
}

interface Site {
  displayName: string;
  slug: string;
}

/**
 * Un turno de la conversación.
 *
 * `de: 'bot'` puede traer un bloque de datos debajo del texto; `de: 'yo'` es sólo la etiqueta de lo
 * que se tocó, para que la conversación se lea como una conversación y no como una lista de
 * respuestas sueltas.
 */
interface Turn {
  block?: Block;
  citySlug?: string;
  de: 'bot' | 'yo';
  id: number;
  text: string;
}

/**
 * Lo que el navegador recuerda.
 *
 * En `sessionStorage` y no en `localStorage`, a propósito: una conversación tiene que sobrevivir a
 * un F5 —perder el hilo por recargar es exasperante— pero no tiene que reaparecer una semana
 * después con las respuestas de otro día. Nada de esto viaja al servidor.
 */
const STORAGE_KEY = 'verdeo-asistente';

interface StoredSession {
  citySlug: string | null;
  turns: Turn[];
}

function readSession(): StoredSession | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function writeSession(session: StoredSession): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ventana privada o almacenamiento lleno: la conversación vive en memoria y se pierde al
    // recargar. Es degradación aceptable; no hay nada acá que no se pueda volver a preguntar.
  }
}

/** El menú de la semana de una ciudad, tal como lo publica la web. */
function MenuBlock({ citySlug, showPrices }: { citySlug: string | null; showPrices: boolean }) {
  const [menu, setMenu] = useState<WeeklyMenu | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const query = citySlug ? `?site=${encodeURIComponent(citySlug)}` : '';
    void apiRequest(`/api/v1/public/menu/current${query}`)
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          setFailed(true);
          return;
        }
        setMenu((await response.json()) as WeeklyMenu);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [citySlug]);

  if (failed) {
    return <p className="assistant-block-empty">Todavía no publicamos el menú de esta semana.</p>;
  }
  if (!menu) return <p className="assistant-block-empty">Buscando el menú…</p>;

  /*
   * Para precios alcanza con un renglón por tamaño: el precio depende del tamaño, no de la
   * variedad (ADR-030), así que listar las doce ofertas repetiría el mismo número seis veces.
   */
  if (showPrices) {
    const bySize = new Map<string, { currency: string; price: number }>();
    for (const offering of menu.offerings) {
      if (!bySize.has(offering.variantName)) {
        bySize.set(offering.variantName, {
          currency: offering.currency,
          price: offering.unitPriceMinor,
        });
      }
    }
    return (
      <ul className="assistant-block">
        {[...bySize.entries()].map(([size, { currency, price }]) => (
          <li key={size}>
            <span>Vianda de {size}</span>
            <strong>{formatMoney(price, currency)}</strong>
          </li>
        ))}
      </ul>
    );
  }

  const varieties = [...new Set(menu.offerings.map((offering) => offering.familyName))];
  return (
    <ul className="assistant-block">
      {varieties.map((variety) => (
        <li key={variety}>
          <span>{variety}</span>
        </li>
      ))}
    </ul>
  );
}

function ZonesBlock({ citySlug }: { citySlug: string | null }) {
  const [zones, setZones] = useState<string[] | null>(null);

  useEffect(() => {
    if (!citySlug) return;
    let active = true;
    void apiRequest(`/api/v1/public/operating-sites/${encodeURIComponent(citySlug)}/zones`)
      .then(async (response) => {
        if (!active || !response.ok) return;
        const body = (await response.json()) as { items: { displayName: string }[] };
        setZones(body.items.map((zone) => zone.displayName));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [citySlug]);

  if (!zones) return <p className="assistant-block-empty">Buscando las zonas…</p>;
  if (zones.length === 0) {
    return <p className="assistant-block-empty">Escribinos y coordinamos la entrega con vos.</p>;
  }
  return (
    <ul className="assistant-block">
      {zones.map((zone) => (
        <li key={zone}>
          <span>{zone}</span>
        </li>
      ))}
    </ul>
  );
}

function PaymentsBlock() {
  const [methods, setMethods] = useState<string[] | null>(null);

  useEffect(() => {
    let active = true;
    void apiRequest('/api/v1/public/payment-methods')
      .then(async (response) => {
        if (!active || !response.ok) return;
        const body = (await response.json()) as { items: { displayName: string }[] };
        setMethods(body.items.map((method) => method.displayName));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (!methods) return <p className="assistant-block-empty">Un momento…</p>;
  return (
    <ul className="assistant-block">
      {methods.map((method) => (
        <li key={method}>
          <span>{method}</span>
        </li>
      ))}
    </ul>
  );
}

function DataBlock({ block, citySlug }: { block: Block; citySlug: string | null }) {
  if (block === 'MENU_SEMANA') return <MenuBlock citySlug={citySlug} showPrices={false} />;
  if (block === 'PRECIOS') return <MenuBlock citySlug={citySlug} showPrices />;
  if (block === 'ZONAS') return <ZonesBlock citySlug={citySlug} />;
  return <PaymentsBlock />;
}

/**
 * El asistente de la landing.
 *
 * No es un chat y no pretende serlo: es un árbol de opciones que se toca, con las respuestas
 * escritas por quien lo configura y los datos —menú, precios, zonas— traídos en vivo de la misma
 * fuente que la web pública. Esa mezcla es el punto: el texto dice el sentido, que no caduca, y el
 * bloque dice el dato, que no puede quedar desactualizado.
 *
 * Tres de las respuestas dependen de la ciudad, porque el menú se distribuye por ciudad y el precio
 * depende del tamaño y de la ciudad. Se pregunta una vez y se recuerda por el resto de la visita.
 *
 * No se abre solo. Un panel que se despliega sin que nadie lo pida tapa la landing justo cuando la
 * persona está leyendo, y en un teléfono la tapa entera.
 */
export function LandingAssistant() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [flow, setFlow] = useState<AssistantFlow | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [citySlug, setCitySlug] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  /** La opción que espera que se elija una ciudad. Null cuando no hay nada pendiente. */
  const [awaitingCity, setAwaitingCity] = useState<AssistantOption | null>(null);
  /** El nivel en el que está la conversación: null es la raíz. */
  const [branch, setBranch] = useState<AssistantOption | null>(null);
  const nextId = useRef(1);
  const threadRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = readSession();
    if (stored) {
      setTurns(stored.turns);
      setCitySlug(stored.citySlug);
      nextId.current = Math.max(0, ...stored.turns.map((turn) => turn.id)) + 1;
    }
  }, []);

  /*
   * El árbol y las ciudades se piden recién al abrir.
   *
   * La landing es la cara pública y su tiempo de carga es lo que decide si alguien se queda: dos
   * peticiones más al abrirla, para un panel que la mayoría no va a tocar, se pagan en el peor
   * momento posible.
   */
  const load = useCallback(async () => {
    if (flow) return;
    const [flowResponse, sitesResponse] = await Promise.all([
      apiRequest('/api/v1/public/assistant'),
      apiRequest('/api/v1/public/operating-sites'),
    ]);
    if (flowResponse.ok) setFlow((await flowResponse.json()) as AssistantFlow);
    if (sitesResponse.ok) {
      setSites(((await sitesResponse.json()) as { items: Site[] }).items);
    }
  }, [flow]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  useEffect(() => {
    if (turns.length > 0) writeSession({ citySlug, turns });
  }, [citySlug, turns]);

  /*
   * El hilo baja solo al último turno.
   *
   * Con un `ResizeObserver` y no sólo al agregarse un turno: los bloques de datos llegan de la red
   * después del texto, y al dibujarse empujan la respuesta fuera de la vista. Bajar una sola vez,
   * cuando se agrega el turno, dejaba el precio justo abajo del borde.
   */
  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    const toBottom = () => {
      thread.scrollTo({ behavior: 'smooth', top: thread.scrollHeight });
    };
    toBottom();
    const observer = new ResizeObserver(toBottom);
    for (const child of thread.children) observer.observe(child);
    return () => observer.disconnect();
  }, [turns, awaitingCity]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function say(turn: Omit<Turn, 'id'>) {
    setTurns((current) => [...current, { ...turn, id: nextId.current++ }]);
  }

  /**
   * Cuenta el toque, sin bloquear nada.
   *
   * No se espera la respuesta ni se mira si falló: es una métrica, y una métrica que demore o
   * rompa la interacción de un visitante está cobrando demasiado por un contador.
   */
  function countHit(optionKey: string) {
    void apiRequest('/api/v1/public/assistant/hit', {
      body: JSON.stringify({ optionKey }),
      method: 'POST',
      notify: false,
    }).catch(() => undefined);
  }

  function answer(option: AssistantOption, city: string | null) {
    if (option.reply) {
      say({
        de: 'bot',
        text: option.reply,
        ...(option.block ? { block: option.block } : {}),
        ...(city ? { citySlug: city } : {}),
      });
    } else if (option.block) {
      say({ de: 'bot', text: '', block: option.block, ...(city ? { citySlug: city } : {}) });
    }

    if (option.behaviour === 'llevar' && option.href) {
      void navigate(option.href);
      setOpen(false);
      return;
    }
    if (option.behaviour === 'salir') {
      const site = sites.find((candidate) => candidate.slug === city);
      const message = option.whatsappMessage ?? 'Hola, quería hacer una consulta.';
      const text = site ? `${message} (${site.displayName})` : message;
      // Sin número configurado no se inventa uno: WhatsApp abre igual con el mensaje escrito y la
      // persona elige a quién mandárselo.
      window.open(whatsappHref(option.whatsappNumber ?? '', text), '_blank', 'noopener,noreferrer');
      return;
    }
    if (option.behaviour === 'preguntar' && (option.options?.length ?? 0) > 0) {
      setBranch(option);
    }
  }

  function choose(option: AssistantOption) {
    say({ de: 'yo', text: option.label });
    countHit(option.key);
    setBranch(null);

    if (option.needsCity && !citySlug) {
      setAwaitingCity(option);
      say({ de: 'bot', text: '¿De qué ciudad sos? Así te doy los datos que te sirven.' });
      return;
    }
    answer(option, citySlug);
  }

  function chooseCity(site: Site) {
    setCitySlug(site.slug);
    say({ de: 'yo', text: site.displayName });
    const pending = awaitingCity;
    setAwaitingCity(null);
    if (pending) answer(pending, site.slug);
  }

  function restart() {
    setTurns([]);
    setBranch(null);
    setAwaitingCity(null);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Sin almacenamiento, alcanza con haber vaciado el estado.
    }
  }

  const visibleOptions = branch?.options ?? flow?.options ?? [];

  return (
    <>
      {/*
       * El lanzador: la lechuza con su globo de diálogo.
       *
       * El globo dice qué es antes de tocarlo —un botón redondo con una cara sola podría ser
       * cualquier cosa—, y se esconde con el panel abierto, cuando la lechuza ya se presentó adentro.
       * Todo el conjunto es un solo botón: el globo no es decoración que haya que apuntar aparte.
       */}
      <button
        aria-expanded={open}
        aria-label={open ? 'Cerrar el asistente' : 'Abrir el asistente'}
        className={`assistant-launcher ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {open ? null : (
          <span aria-hidden="true" className="assistant-launcher-bubble">
            ¿Te ayudo?
          </span>
        )}
        <span className="assistant-launcher-avatar">
          {open ? (
            <span aria-hidden="true" className="assistant-launcher-close">
              ×
            </span>
          ) : (
            <img alt="" height="56" src="/brand/verdeo-buho-192.png" width="56" />
          )}
        </span>
      </button>

      {open ? (
        <div
          aria-label="Asistente de Verdeo"
          className="assistant-panel"
          ref={panelRef}
          role="dialog"
        >
          <header className="assistant-header">
            <div className="assistant-header-identity">
              <img alt="" height="32" src="/brand/verdeo-buho-192.png" width="32" />
              <p>Asistente de Verdeo</p>
            </div>
            <div className="assistant-header-actions">
              {turns.length > 0 ? (
                <button className="assistant-plain" onClick={restart} type="button">
                  Empezar de nuevo
                </button>
              ) : null}
              <button
                aria-label="Cerrar"
                className="assistant-plain"
                onClick={() => setOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
          </header>

          <div className="assistant-thread" ref={threadRef}>
            {flow ? (
              <div className="assistant-bot-row">
                <img alt="" height="28" src="/brand/verdeo-buho-192.png" width="28" />
                <p className="assistant-turn is-bot">{flow.greeting}</p>
              </div>
            ) : null}
            {turns.map((turn) => (
              <div key={turn.id}>
                {turn.text && turn.de === 'bot' ? (
                  <div className="assistant-bot-row">
                    <img alt="" height="28" src="/brand/verdeo-buho-192.png" width="28" />
                    <p className="assistant-turn is-bot">{turn.text}</p>
                  </div>
                ) : null}
                {turn.text && turn.de === 'yo' ? (
                  <p className="assistant-turn is-me">{turn.text}</p>
                ) : null}
                {turn.block ? (
                  <DataBlock block={turn.block} citySlug={turn.citySlug ?? citySlug} />
                ) : null}
              </div>
            ))}
          </div>

          <div className="assistant-options">
            {awaitingCity ? (
              sites.map((site) => (
                <button
                  className="assistant-option"
                  key={site.slug}
                  onClick={() => chooseCity(site)}
                  type="button"
                >
                  {site.displayName}
                </button>
              ))
            ) : (
              <>
                {visibleOptions.map((option) => (
                  <button
                    className="assistant-option"
                    key={option.key}
                    onClick={() => choose(option)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
                {branch ? (
                  <button className="assistant-plain" onClick={() => setBranch(null)} type="button">
                    ← Volver
                  </button>
                ) : null}
              </>
            )}
            {!flow ? <p className="assistant-block-empty">Un momento…</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
