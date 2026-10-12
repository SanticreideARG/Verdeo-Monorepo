import { describe, expect, it } from 'vitest';

import { buildKitchenLabelsPrintHtml, kitchenLabelFooter } from './kitchen-labels-export.js';

const ajustes = {
  fontScale: 100,
  labelGapMm: 0,
  labelsPerPage: 24,
  sheetHeightMm: 297,
  sheetMarginMm: 10,
  sheetWidthMm: 210,
  showBorders: false,
  showLogo: true,
};

const etiqueta = {
  abbreviation: 'KETO',
  composable: false,
  customerName: null,
  dish: 'Wraps de pechuga con crema de cúrcuma',
  side: 'Tortilla de brócoli',
  sizeName: null,
};

describe('kitchenLabelFooter', () => {
  it('arma el pie como en la hoja de producción', () => {
    expect(kitchenLabelFooter(etiqueta, '2026-09-24')).toBe('KETO ELAB # 24-09');
    expect(kitchenLabelFooter({ ...etiqueta, sizeName: '400' }, '2026-09-24')).toBe(
      'KETO 400 ELAB # 24-09',
    );
  });
});

describe('buildKitchenLabelsPrintHtml', () => {
  it('imprime el plato, el acompañamiento, el pie y el logo en una grilla de 3 × 8', () => {
    const html = buildKitchenLabelsPrintHtml([etiqueta], ajustes, '2026-09-24', 'https://app.test');

    expect(html).toContain('Wraps de pechuga con crema de cúrcuma');
    expect(html).toContain('<p class="side">Tortilla de brócoli</p>');
    expect(html).toContain('KETO ELAB # 24-09');
    expect(html).toContain('https://app.test/brand/verdeo-icon-128.webp');
    expect(html).toContain('grid-template-columns: repeat(3,');
    expect(html).toContain('.label:nth-child(24n) { break-after: page; }');
  });

  it('sin acompañamiento no deja un renglón vacío, y sin cliente no imprime nombre', () => {
    const html = buildKitchenLabelsPrintHtml([{ ...etiqueta, side: null }], ajustes, '2026-09-24');
    expect(html).not.toContain('class="side"');
    expect(html).not.toContain('class="who"');
  });

  it('un Intuitivo con nombre lo imprime, escapado', () => {
    const html = buildKitchenLabelsPrintHtml(
      [{ ...etiqueta, composable: true, customerName: 'Ana <Prueba>' }],
      ajustes,
      '2026-09-24',
    );
    expect(html).toContain('<p class="who">Ana &lt;Prueba&gt;</p>');
  });
});
