import { useEffect, useState, type ReactNode } from 'react';

export interface StatsSlide {
  content: ReactNode;
  key: string;
  subtitle?: string;
  title: string;
}

/** Cada cuánto pasa sola a la siguiente. */
export const SLIDE_MS = 7_000;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

/**
 * El carrusel de Estadísticas (STATS_REDESIGN_PLAN.md): un gráfico a la vez, a lo ancho, que pasa
 * solo con un fundido y un deslizamiento corto. Se frena con el mouse encima, con el foco adentro o
 * con el botón de pausa —un gráfico que se va mientras alguien lo lee es peor que ninguno—, y quien
 * pidió menos movimiento al sistema lo maneja a mano, sin transición.
 */
export function StatsHeroCarousel({ slides }: { slides: StatsSlide[] }) {
  const [index, setIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [paused, setPaused] = useState(() => prefersReducedMotion());
  const count = slides.length;
  const active = count === 0 ? 0 : index % count;
  const running = !paused && !hovered && count > 1;

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setIndex((current) => (current + 1) % count), SLIDE_MS);
    return () => window.clearTimeout(timer);
  }, [active, count, running]);

  if (count === 0) return null;
  const go = (next: number) => setIndex((next + count) % count);
  const current = slides[active];

  return (
    <section
      aria-label="Gráficos"
      aria-roledescription="carrusel"
      className="stats-hero operation-card"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHovered(false);
      }}
      onFocus={() => setHovered(true)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') go(active + 1);
        else if (event.key === 'ArrowLeft') go(active - 1);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <header className="stats-hero-head">
        <div>
          <h2 aria-live="polite" className="text-lg font-semibold text-forest">
            {current?.title}
          </h2>
          {current?.subtitle ? <p className="text-xs text-ink-muted">{current.subtitle}</p> : null}
        </div>
        {count > 1 ? (
          <div className="stats-hero-controls">
            <button
              aria-label="Gráfico anterior"
              className="stats-hero-button"
              onClick={() => go(active - 1)}
              type="button"
            >
              ‹
            </button>
            <span className="text-xs text-ink-muted">
              {active + 1} / {count}
            </span>
            <button
              aria-label={paused ? 'Seguir pasando los gráficos' : 'Pausar los gráficos'}
              aria-pressed={paused}
              className="stats-hero-button"
              onClick={() => setPaused((value) => !value)}
              type="button"
            >
              {paused ? '▶' : '❚❚'}
            </button>
            <button
              aria-label="Gráfico siguiente"
              className="stats-hero-button"
              onClick={() => go(active + 1)}
              type="button"
            >
              ›
            </button>
          </div>
        ) : null}
      </header>

      <div className="stats-hero-track">
        {slides.map((slide, position) => (
          <div
            aria-hidden={position !== active}
            aria-label={`${position + 1} de ${count}`}
            aria-roledescription="diapositiva"
            className={`stats-hero-slide ${
              position === active ? 'is-active' : position < active ? 'is-before' : 'is-after'
            }`}
            inert={position !== active}
            key={slide.key}
            role="group"
          >
            {slide.content}
          </div>
        ))}
      </div>

      {count > 1 ? (
        <div className="stats-hero-dots">
          {slides.map((slide, position) => (
            <button
              aria-current={position === active}
              aria-label={`Ver ${slide.title}`}
              className={`stats-hero-dot ${position === active ? 'is-active' : ''}`}
              key={slide.key}
              onClick={() => go(position)}
              type="button"
            >
              {position === active && running ? (
                <span
                  className="stats-hero-progress"
                  key={`${slide.key}-${String(index)}`}
                  style={{ animationDuration: `${SLIDE_MS}ms` }}
                />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
