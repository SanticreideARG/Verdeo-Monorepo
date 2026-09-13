/**
 * La geometría de una hoja de etiquetas, del lado del navegador.
 *
 * Es la misma cuenta que hace `@verdeo/orders/label-sheet.ts`, que usa el generador de la impresión.
 * Se repite acá porque la aplicación web no depende de los paquetes internos —mantiene sus propios
 * tipos, como el resto de `lib/operations.ts`—, y la alternativa (que la vista previa pidiera las
 * medidas al servidor) haría que mover un control esperara un viaje de red.
 *
 * Si cambia una, tiene que cambiar la otra: la vista previa existe para mostrar lo que va a salir
 * impreso, y dos cuentas distintas la vuelven una mentira prolija.
 */
export interface LabelSheet {
  gapMm: number;
  heightMm: number;
  marginMm: number;
  widthMm: number;
}

export interface LabelCanvas {
  columns: number;
  heightMm: number;
  orientation: 'horizontal' | 'vertical';
  rows: number;
  widthMm: number;
}

export const SHEET_PRESETS = [
  { heightMm: 297, key: 'a4', label: 'A4 · 210 × 297 mm', widthMm: 210 },
  { heightMm: 356, key: 'oficio', label: 'Oficio · 216 × 356 mm', widthMm: 216 },
  { heightMm: 279, key: 'carta', label: 'Carta · 216 × 279 mm', widthMm: 216 },
] as const;

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

/** Lo que queda de la hoja sin márgenes, dividido por la grilla: la superficie real de una etiqueta. */
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
