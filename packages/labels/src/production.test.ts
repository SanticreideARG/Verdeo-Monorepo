import { describe, expect, it } from 'vitest';

import {
  cleanDishText,
  LABELS_PER_SHEET,
  PRODUCTION_PAPER,
  elaborationDay,
  familyShortName,
  productionSheetCount,
  renderProductionSheets,
  sizeNumber,
  splitDishName,
  type ProductionLabel,
} from './production.js';

const plato = (key: string, side: string | null = 'Salsa rosa'): ProductionLabel => ({
  dish: 'Raviolones de muzza',
  footer: 'VEGETARIANO ELAB # 15-10',
  key,
  kind: 'plato',
  side,
});
const menu = (key: string, line = 'KETO'): ProductionLabel => ({
  key,
  kind: 'menu',
  line,
  size: '400',
});

describe('el papel', () => {
  it('es el Husares H34124: 24 de 64 × 33,9 mm, que entran en el A4', () => {
    const p = PRODUCTION_PAPER;
    expect(LABELS_PER_SHEET).toBe(24);
    expect(p.marginLeftMm * 2 + p.columns * p.labelWidthMm + (p.columns - 1) * p.gapXMm).toBe(210);
    expect(p.marginTopMm + p.rows * p.labelHeightMm).toBeLessThanOrEqual(297);
  });

  it('cuenta las hojas, también empezando en una hoja ya usada', () => {
    expect(productionSheetCount(0)).toBe(0);
    expect(productionSheetCount(24)).toBe(1);
    expect(productionSheetCount(25)).toBe(2);
    // Empezando en la posición 20, entran 5 en la primera.
    expect(productionSheetCount(5, 20)).toBe(1);
    expect(productionSheetCount(6, 20)).toBe(2);
  });
});

describe('los textos', () => {
  it('saca el * del principio y el (k) o (v) del final, y empieza con mayúscula', () => {
    expect(cleanDishText('* Pastel de calabaza y bondiola braseada (K)')).toBe(
      'Pastel de calabaza y bondiola braseada',
    );
    expect(cleanDishText('fritatta de berenjenas asadas (k)')).toBe(
      'Fritatta de berenjenas asadas',
    );
    expect(splitDishName('*Lomo relleno | zapallitos revueltos (v)')).toEqual({
      dish: 'Lomo relleno',
      side: 'Zapallitos revueltos',
    });
    expect(familyShortName('Menú Anti-Age')).toBe('ANTIAGE');
  });

  it('separa el plato de su acompañamiento', () => {
    expect(splitDishName('Pechuga rellena | Puré de calabaza')).toEqual({
      dish: 'Pechuga rellena',
      side: 'Puré de calabaza',
    });
    expect(splitDishName('Curry de lentejas')).toEqual({ dish: 'Curry de lentejas', side: null });
  });

  it('abrevia la variedad, el tamaño y la fecha como el original', () => {
    expect(familyShortName('Menú Nuevo Keto')).toBe('KETO');
    expect(familyShortName('Menú Vegetariano')).toBe('VEGETARIANO');
    expect(sizeNumber('400 g')).toBe('400');
    expect(elaborationDay('2026-10-15')).toBe('15-10');
  });
});

describe('la hoja', () => {
  it('el teléfono no agranda el texto (lo rompía letra por letra)', () => {
    const labels: ProductionLabel[] = [
      { dish: 'Lomo', footer: 'KETO', key: 'k-1', kind: 'plato', side: null },
    ];
    expect(renderProductionSheets({ labels, preview: true })).toContain('text-size-adjust: 100%');
    expect(renderProductionSheets({ labels })).toContain('text-size-adjust: 100%');
    // Y si igual lo agranda (el tamaño de letra del sistema): se parte entre palabras, no en letras.
    expect(renderProductionSheets({ labels })).not.toContain('overflow-wrap: anywhere');
  });

  it('en la vista previa, una "×" por etiqueta para sacarla; nunca en la impresión', () => {
    const labels: ProductionLabel[] = [
      { dish: 'Lomo', footer: 'KETO', key: 'k-1', kind: 'plato', side: null },
    ];
    expect(renderProductionSheets({ labels, preview: true, removable: true })).toContain(
      'data-key="k-1"',
    );
    expect(renderProductionSheets({ labels, removable: true })).not.toContain('class="remove"');
  });

  it('ubica cada etiqueta en su lugar del papel', () => {
    const html = renderProductionSheets({
      labels: [plato('a'), plato('b'), plato('c'), plato('d')],
    });

    expect(html).toContain('left:7.50mm;top:12.90mm');
    expect(html).toContain('left:73.00mm;top:12.90mm');
    // La cuarta empieza la segunda fila.
    expect(html).toContain('left:7.50mm;top:46.80mm');
  });

  it('el nombre va chico con acompañamiento y grande sin él', () => {
    expect(renderProductionSheets({ labels: [plato('a')] })).toContain('dish small');
    expect(renderProductionSheets({ labels: [plato('a', null)] })).toContain('dish large');
  });

  it('la de menú lleva el tamaño, Kcal y la variedad, o el nombre del Intuitivo', () => {
    const html = renderProductionSheets({ labels: [menu('m'), menu('n', 'Juan Manuel Brandan')] });

    expect(html).toContain('<span class="size">400</span><span class="kcal">Kcal</span>');
    expect(html).toContain('<p class="line">KETO</p>');
    expect(html).toContain('<p class="line name">JUAN MANUEL BRANDAN</p>');
  });

  it('platos y menús van juntos y llenan las hojas', () => {
    const labels = [
      ...Array.from({ length: 20 }, (_, i) => plato(`p${String(i)}`)),
      ...Array.from({ length: 8 }, (_, i) => menu(`m${String(i)}`)),
    ];

    const html = renderProductionSheets({ labels });
    expect(html.match(/class="sheet"/g)).toHaveLength(2);
    expect(html.match(/class="plato"/g)).toHaveLength(20);
    expect(html.match(/class="menu"/g)).toHaveLength(8);
  });

  it('empezando en una posición, deja libres las anteriores', () => {
    const html = renderProductionSheets({ labels: [plato('a')], startAt: 4 });

    // La única etiqueta va en la posición 4: primera columna, segunda fila.
    expect(html).toContain('left:7.50mm;top:46.80mm');
    expect(html).not.toContain('top:12.90mm"><div');
  });

  it('en la vista previa marca las que ya se imprimieron', () => {
    const html = renderProductionSheets({
      labels: [plato('a'), plato('b')],
      preview: true,
      printedKeys: new Set(['b']),
    });

    expect(html.match(/cell printed/g)).toHaveLength(1);
  });
});
