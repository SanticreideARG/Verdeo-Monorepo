/**
 * La geometría de una hoja de etiquetas.
 *
 * Vive acá y no en el generador de la impresión porque la pantalla de Ajustes necesita exactamente
 * la misma cuenta: si la vista previa calculara el lienzo por su lado, mostraría una etiqueta que no
 * es la que sale impresa, que es peor que no mostrar nada.
 */
export interface LabelSheet {
  /** Milímetros entre etiquetas. */
  gapMm: number;
  heightMm: number;
  /** Margen de la hoja, igual en los cuatro lados. */
  marginMm: number;
  widthMm: number;
}

export interface LabelCanvas {
  columns: number;
  heightMm: number;
  /** Apaisada cuando es más ancha que alta: la etiqueta se arma distinto. */
  orientation: 'horizontal' | 'vertical';
  rows: number;
  widthMm: number;
}

/** Las hojas que se usan en Argentina, más la medida libre. */
export const LABEL_SHEET_PRESETS = [
  { heightMm: 297, key: 'a4', label: 'A4 (210 × 297 mm)', widthMm: 210 },
  { heightMm: 356, key: 'oficio', label: 'Oficio (216 × 356 mm)', widthMm: 216 },
  { heightMm: 279, key: 'carta', label: 'Carta (216 × 279 mm)', widthMm: 216 },
] as const;

/**
 * Cómo se reparte la hoja en filas y columnas.
 *
 * Las combinaciones están escritas y no calculadas: con 12 etiquetas, 3 × 4 deja una etiqueta de
 * proporción usable y 4 × 3 una tira finita. La raíz cuadrada sólo se usa para un número que no
 * esté en la tabla.
 */
const GRID_BY_LABELS_PER_PAGE: Record<number, { columns: number; rows: number }> = {
  1: { columns: 1, rows: 1 },
  2: { columns: 1, rows: 2 },
  3: { columns: 1, rows: 3 },
  4: { columns: 2, rows: 2 },
  5: { columns: 3, rows: 2 },
  6: { columns: 2, rows: 3 },
  7: { columns: 3, rows: 3 },
  8: { columns: 2, rows: 4 },
  9: { columns: 3, rows: 3 },
  10: { columns: 2, rows: 5 },
  11: { columns: 3, rows: 4 },
  12: { columns: 3, rows: 4 },
};

export function labelGrid(labelsPerPage: number): { columns: number; rows: number } {
  const columns = Math.ceil(Math.sqrt(labelsPerPage));
  return (
    GRID_BY_LABELS_PER_PAGE[labelsPerPage] ?? {
      columns,
      rows: Math.ceil(labelsPerPage / columns),
    }
  );
}

/**
 * El lienzo de una etiqueta: lo que queda de la hoja, sin márgenes, dividido por la grilla.
 *
 * Es la superficie real que se imprime, así que es también la que hay que mostrar en la vista
 * previa para que alguien pueda decidir si su fondo y su tipografía entran.
 */
export function labelCanvas(sheet: LabelSheet, labelsPerPage: number): LabelCanvas {
  const { columns, rows } = labelGrid(labelsPerPage);
  const usableWidth = Math.max(0, sheet.widthMm - sheet.marginMm * 2 - sheet.gapMm * (columns - 1));
  const usableHeight = Math.max(0, sheet.heightMm - sheet.marginMm * 2 - sheet.gapMm * (rows - 1));
  const widthMm = usableWidth / columns;
  const heightMm = usableHeight / rows;
  return {
    columns,
    heightMm,
    orientation: widthMm >= heightMm ? 'horizontal' : 'vertical',
    rows,
    widthMm,
  };
}
