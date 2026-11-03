import { useEffect, useState } from 'react';

export type HeraPose = 'answer' | 'hello' | 'thinking';

/** Versiones livianas (10 KB): el lanzador está en la landing, donde cada byte se paga. */
const HERA_FACES: Record<HeraPose, string> = {
  answer: '/brand/HOWL/Hera-160.webp',
  hello: '/brand/HOWL/HeraHi-160.webp',
  thinking: '/brand/HOWL/HeraThink-160.webp',
};

const GREETING_MS = 3_000;
const GREETING_MIN_WAIT_MS = 30_000;
const GREETING_MAX_WAIT_MS = 75_000;

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Hera saluda cada tanto, a intervalos al azar para que no parezca un reloj. No saluda con la
 * pestaña en segundo plano, ni a quien pidió menos movimiento en su sistema.
 */
export function useHeraGreeting(active: boolean): boolean {
  const [greeting, setGreeting] = useState(false);

  useEffect(() => {
    if (!active || prefersReducedMotion()) return;
    let timer: number;
    const wait = () => {
      const delay =
        GREETING_MIN_WAIT_MS + Math.random() * (GREETING_MAX_WAIT_MS - GREETING_MIN_WAIT_MS);
      timer = window.setTimeout(() => {
        if (document.hidden) {
          wait();
          return;
        }
        setGreeting(true);
        timer = window.setTimeout(() => {
          setGreeting(false);
          wait();
        }, GREETING_MS);
      }, delay);
    };
    wait();
    return () => {
      window.clearTimeout(timer);
      setGreeting(false);
    };
  }, [active]);

  return greeting;
}

/**
 * Qué cara pone Hera con el panel abierto: pensando si está buscando algo, saludando al abrir y cada
 * tanto, y si no, atenta.
 */
export function useHeraPanelPose(open: boolean, busy: boolean): HeraPose {
  const [justOpened, setJustOpened] = useState(false);
  const greeting = useHeraGreeting(open);

  useEffect(() => {
    if (!open) return;
    setJustOpened(true);
    const timer = window.setTimeout(() => setJustOpened(false), GREETING_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (busy) return 'thinking';
  return justOpened || greeting ? 'hello' : 'answer';
}

/** `key` por pose: al cambiar de imagen se vuelve a dibujar y corre su animación de entrada. */
export function HeraFace({
  className,
  pose,
  size,
}: {
  className?: string;
  pose: HeraPose;
  size: number;
}) {
  return (
    <img
      alt=""
      className={`hera-face ${className ?? ''}`}
      height={size}
      key={pose}
      src={HERA_FACES[pose]}
      width={size}
    />
  );
}

/**
 * Las otras dos caras ya cargadas, para que el primer cambio no parpadee. Con demora, para no
 * competir con la carga de la página.
 */
function usePreloadedFaces(): void {
  useEffect(() => {
    const timer = window.setTimeout(() => {
      for (const src of Object.values(HERA_FACES)) new Image().src = src;
    }, 3_000);
    return () => window.clearTimeout(timer);
  }, []);
}

/**
 * El botón flotante de Hera, el mismo en la landing y en el panel. El globo dice qué es antes de
 * tocarlo; todo el conjunto es un solo botón.
 */
export function HeraLauncher({
  bubble,
  label,
  onClick,
  open,
  operator = false,
}: {
  bubble: string;
  label: string;
  onClick: () => void;
  open: boolean;
  operator?: boolean;
}) {
  const greeting = useHeraGreeting(!open);
  const [hovered, setHovered] = useState(false);
  usePreloadedFaces();

  const classes = [
    'assistant-launcher',
    operator ? 'is-operator' : '',
    open ? 'is-open' : '',
    greeting ? 'is-greeting' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      aria-expanded={open}
      aria-label={label}
      className={classes}
      onClick={onClick}
      // Sólo con mouse: en una pantalla táctil, el "hover" queda pegado después del toque.
      onPointerEnter={(event) => setHovered(event.pointerType === 'mouse')}
      onPointerLeave={() => setHovered(false)}
      type="button"
    >
      {open ? null : (
        <span aria-hidden="true" className="assistant-launcher-bubble">
          {greeting ? '¡Hola! Soy Hera' : bubble}
        </span>
      )}
      <span className="assistant-launcher-avatar">
        {open ? (
          <span aria-hidden="true" className="assistant-launcher-close">
            ×
          </span>
        ) : (
          <HeraFace pose={hovered || greeting ? 'hello' : 'answer'} size={56} />
        )}
      </span>
    </button>
  );
}
