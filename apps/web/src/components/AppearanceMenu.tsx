import { useEffect, useRef, useState, type CSSProperties } from 'react';

export interface ThemeOption {
  color: string;
  label: string;
  tone: 'claro' | 'oscuro';
  value: string;
}

export const FONT_OPTIONS = [
  { label: 'Barlow', sample: 'Aa', value: 'barlow' },
  { label: 'Del sistema', sample: 'Aa', value: 'sistema' },
  { label: 'Serif', sample: 'Aa', value: 'serif' },
  { label: 'Monoespaciada', sample: 'Aa', value: 'mono' },
  { label: 'Alta legibilidad', sample: 'Aa', value: 'legible' },
] as const;

export const SCALE_OPTIONS = [
  { label: 'Compacto', value: 'compacto' },
  { label: 'Normal', value: 'normal' },
  { label: 'Cómodo', value: 'comodo' },
  { label: 'Grande', value: 'grande' },
  { label: 'Mayor', value: 'mayor' },
] as const;

/**
 * Tema, fuente y tamaño de texto en un solo panel.
 *
 * Con nueve temas la fila de muestras dejó de entrar en la barra superior, sobre todo en teléfono,
 * así que todo se colapsa detrás de un botón. Los temas quedan agrupados por claro/oscuro porque
 * esa es la primera decisión que toma quien los mira, y el color no siempre lo deja claro.
 */
export function AppearanceMenu({
  font,
  onFont,
  onScale,
  onTheme,
  scale,
  theme,
  themes,
}: {
  font: string;
  onFont: (value: string) => void;
  onScale: (value: string) => void;
  onTheme: (value: string) => void;
  scale: string;
  theme: string;
  themes: readonly ThemeOption[];
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const groups: { tone: ThemeOption['tone']; title: string }[] = [
    { title: 'Claros', tone: 'claro' },
    { title: 'Oscuros', tone: 'oscuro' },
  ];

  return (
    <div className="appearance-menu" ref={container}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Apariencia"
        className="appearance-trigger"
        onClick={() => setOpen((value) => !value)}
        title="Apariencia"
        type="button"
      >
        <span aria-hidden="true">Aa</span>
      </button>

      {open ? (
        <div aria-label="Apariencia" className="appearance-panel" role="dialog">
          {groups.map((group) => (
            <section key={group.tone}>
              <h3>{group.title}</h3>
              <div className="appearance-swatches">
                {themes
                  .filter((item) => item.tone === group.tone)
                  .map((item) => (
                    <button
                      aria-label={`Usar tema ${item.label}`}
                      aria-pressed={theme === item.value}
                      key={item.value}
                      onClick={() => onTheme(item.value)}
                      style={{ '--swatch': item.color } as CSSProperties}
                      title={item.label}
                      type="button"
                    />
                  ))}
              </div>
            </section>
          ))}

          <section>
            <h3>Fuente</h3>
            <div className="appearance-fonts">
              {FONT_OPTIONS.map((item) => (
                <button
                  aria-pressed={font === item.value}
                  className={`appearance-font appearance-font-${item.value}`}
                  key={item.value}
                  onClick={() => onFont(item.value)}
                  type="button"
                >
                  <strong aria-hidden="true">{item.sample}</strong>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3>Tamaño del texto</h3>
            <div className="appearance-scales">
              {SCALE_OPTIONS.map((item) => (
                <button
                  aria-pressed={scale === item.value}
                  key={item.value}
                  onClick={() => onScale(item.value)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
