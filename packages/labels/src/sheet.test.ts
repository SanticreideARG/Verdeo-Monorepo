import { describe, expect, it } from 'vitest';

import { labelCanvas, labelGrid } from './sheet.js';

describe('la hoja', () => {
  it('reparte las etiquetas en una grilla escrita, no calculada', () => {
    expect(labelGrid(8)).toEqual({ columns: 2, rows: 4 });
    // La hoja de stickers troquelados de cocina.
    expect(labelGrid(24)).toEqual({ columns: 3, rows: 8 });
    expect(labelGrid(18)).toEqual({ columns: 3, rows: 6 });
    expect(labelGrid(13)).toEqual({ columns: 4, rows: 4 });
  });

  it('el lienzo es la hoja sin márgenes, dividida por la grilla', () => {
    const canvas = labelCanvas({ gapMm: 4, heightMm: 297, marginMm: 12, widthMm: 210 }, 8);

    expect(canvas.columns).toBe(2);
    expect(canvas.rows).toBe(4);
    expect(canvas.widthMm).toBeCloseTo(91, 5);
    expect(canvas.heightMm).toBeCloseTo((297 - 24 - 12) / 4, 5);
    expect(canvas.orientation).toBe('horizontal');
  });
});
