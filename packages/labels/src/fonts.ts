/**
 * Las tipografías de la etiqueta, como listas de familias de sistema.
 *
 * Todas se resuelven a fuentes que el equipo ya tiene: la hoja se imprime sin depender de bajar una
 * fuente, que en una cocina sin buena conexión es la diferencia entre imprimir y no imprimir. Cada
 * clave es una intención ("manuscrita", "titular") y no una fuente concreta, así que la lista de
 * respaldo puede cambiar sin migrar nada.
 */
export const FONT_STACKS = {
  clasica: '"Times New Roman", Times, "Liberation Serif", serif',
  condensed: '"Arial Narrow", "Roboto Condensed", "Liberation Sans Narrow", sans-serif',
  elegante: 'Garamond, "Palatino Linotype", Palatino, "Book Antiqua", serif',
  grotesque: '"Trebuchet MS", "Segoe UI", Tahoma, sans-serif',
  humanist: 'Verdana, Geneva, "DejaVu Sans", sans-serif',
  manuscrita: '"Segoe Script", "Brush Script MT", "Comic Sans MS", cursive',
  maquina: '"Courier New", Courier, "Liberation Mono", monospace',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
  rounded: '"SF Pro Rounded", "Nunito", "Segoe UI", system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  system: 'system-ui, sans-serif',
  titular: 'Impact, Haettenschweiler, "Arial Black", sans-serif',
} as const;

export type LabelFontKey = keyof typeof FONT_STACKS;

export function fontStack(key: string): string {
  return (FONT_STACKS as Record<string, string>)[key] ?? FONT_STACKS.system;
}
