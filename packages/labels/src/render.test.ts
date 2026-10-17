import { describe, expect, it } from 'vitest';

import { LABEL_LOGO } from './assets.js';
import { labelDocumentSize, labelPageCount, maskSurname, renderLabelDocument } from './render.js';
import { SAMPLE_LABELS } from './samples.js';
import type { LabelData, LabelRenderSettings } from './types.js';

const label: LabelData = {
  composable: false,
  customerDisplayName: 'Ana Isabella Vega',
  deliveryDate: '2026-08-28',
  deliveryZone: 'Centro',
  dietaryInstructions: ['Sin cebolla'],
  dishIndex: 1,
  dishName: null,
  dishTotal: 1,
  dishes: ['Pollo al horno', 'Wraps de pechuga', 'Tarta de zucchini'],
  familyName: 'Keto',
  orderPublicNumber: 'NQN-00090',
  unitIndex: 1,
  unitTotal: 3,
  variantName: '250',
};

const settings: LabelRenderSettings = {
  alignment: 'center',
  customPhrase: null,
  fields: ['tamano', 'numero'],
  fontFamily: 'system',
  fontScale: 100,
  hideSurname: false,
  labelGapMm: 4,
  labelsPerPage: 8,
  layout: 'clasica',
  logoHeightMm: 10,
  logoPaddingBottomMm: 2,
  nameOnlyForComposable: false,
  sheetHeightMm: 297,
  sheetMarginMm: 12,
  sheetWidthMm: 210,
  showBorders: true,
  showCutLines: false,
  showLogo: false,
  uppercaseName: false,
  showCustomerName: true,
  nameScale: 100,
  namePosition: 'arriba',
};

function render(
  overrides: Partial<LabelRenderSettings> = {},
  one: LabelData = label,
  extra: Partial<Parameters<typeof renderLabelDocument>[0]> = {},
): string {
  return renderLabelDocument({ labels: [one], settings: { ...settings, ...overrides }, ...extra });
}

describe('el nombre', () => {
  it('no imprime el nombre si se apagó', () => {
    const html = render({ showCustomerName: false });

    expect(html).not.toContain('class="customer');
    expect(html).not.toContain('Ana Isabella Vega');
  });

  it('puede ir abajo, después de los campos', () => {
    const arriba = render({ namePosition: 'arriba' });
    const abajo = render({ namePosition: 'abajo' });

    expect(arriba.indexOf('class="customer')).toBeLessThan(arriba.indexOf('class="fields"'));
    expect(abajo.indexOf('class="customer')).toBeGreaterThan(abajo.indexOf('class="fields"'));
  });

  it('el tamaño del nombre escala sobre el del formato', () => {
    expect(render({ nameScale: 100 })).toContain('--name-size: 20.0px');
    expect(render({ nameScale: 150 })).toContain('--name-size: 30.0px');
  });

  it('recorta el apellido cuando se pidió sin apellido', () => {
    const html = render({ hideSurname: true });

    expect(html).toContain('Ana I. V.');
    expect(html).not.toContain('Ana Isabella Vega');
  });

  it('saca el nombre de las estándar y lo deja en las Intuitivo', () => {
    // Una vianda estándar se identifica por variedad y tamaño; dos Intuitivo del mismo tamaño son
    // combinaciones de platos distintas, así que ahí el nombre es lo único que las separa.
    expect(render({ nameOnlyForComposable: true })).not.toContain('Ana');
    expect(render({ nameOnlyForComposable: true }, { ...label, composable: true })).toContain(
      'Ana Isabella Vega',
    );
  });

  it('combina las dos: iniciales en las Intuitivo, sin nombre en el resto', () => {
    const opciones = { hideSurname: true, nameOnlyForComposable: true };

    expect(render(opciones)).not.toContain('Ana');
    expect(render(opciones, { ...label, composable: true })).toContain('Ana I. V.');
  });

  it('imprime el nombre aunque no se haya elegido ningún campo', () => {
    const html = render({ fields: [] });

    expect(html).toContain('Ana Isabella Vega');
    expect(html).not.toContain('NQN-00090');
  });

  it('achica el cuerpo del nombre por escalones cuando es largo', () => {
    expect(render()).toContain('class="customer s0"');
    expect(
      render({}, { ...label, customerDisplayName: 'María de los Ángeles Fernández R.' }),
    ).toContain('class="customer s2"');
    expect(
      render(
        {},
        { ...label, customerDisplayName: 'María de los Ángeles Fernández Rodríguez Gómez' },
      ),
    ).toContain('class="customer s3"');
  });

  it('escapa lo que viene del cliente', () => {
    const html = render({}, { ...label, customerDisplayName: 'Ana <script>alert(1)</script>' });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('maskSurname deja las iniciales y respeta un nombre de una palabra', () => {
    expect(maskSurname('Ana Isabella Vega')).toBe('Ana I. V.');
    expect(maskSurname('Ana')).toBe('Ana');
  });
});

describe('los campos', () => {
  it('imprime sólo los campos elegidos, y en el orden guardado', () => {
    const html = render({ fields: ['zona', 'tamano'] });

    expect(html).toContain('Centro');
    expect(html).toContain('250');
    expect(html).not.toContain('Keto');
    expect(html.indexOf('Centro')).toBeLessThan(html.indexOf('250'));
  });

  it('omite un campo sin valor en vez de dejar un renglón vacío', () => {
    const html = render({ fields: ['zona'] }, { ...label, deliveryZone: null });

    expect(html).toContain('Ana Isabella Vega');
    expect(html).not.toContain('Centro');
  });

  it('numera la unidad sólo cuando hay más de una', () => {
    expect(render({ fields: ['unidad'] })).toContain('1 de 3');
    expect(render({ fields: ['unidad'] }, { ...label, unitTotal: 1 })).not.toContain('1 de 1');
  });

  it('lista los platos de la vianda, uno por renglón', () => {
    const html = render({ fields: ['platos'] });

    expect(html).toContain('<p class="platos">Pollo al horno</p>');
    expect(html).toContain('<p class="platos">Wraps de pechuga</p>');
    expect(html).toContain('<p class="platos">Tarta de zucchini</p>');
  });

  it('los platos con acompañamiento muestran un punto medio y no la barra del menú', () => {
    const html = render(
      { fields: ['platos'] },
      { ...label, dishes: ['Pollo al horno | Puré de calabaza'] },
    );

    expect(html).toContain('Pollo al horno · Puré de calabaza');
    expect(html).not.toContain('|');
  });

  it('la lista de platos va debajo de la variedad', () => {
    const html = render({ fields: ['platos', 'variedad', 'tamano'] });

    // El orden lo da el que se guardó; el catálogo ofrece la lista después de la variedad.
    expect(html.indexOf('Pollo al horno')).toBeLessThan(html.indexOf('>Keto<'));
  });

  it('el campo plato dice su posición cuando hay más de uno', () => {
    const html = render(
      { fields: ['plato'] },
      { ...label, dishIndex: 2, dishName: 'Pollo al horno', dishTotal: 5 },
    );

    expect(html).toContain('Pollo al horno · 2 de 5');
  });

  it('la fecha de producción sale con la que se eligió, y no sale sin ella', () => {
    const con = render({ fields: ['produccion'] }, label, { productionDate: '2026-10-16' });
    const sin = render({ fields: ['produccion'] });

    expect(con).toContain('Elaborado: 16/10');
    expect(sin).not.toContain('Elaborado');
  });

  it('la frase propia se imprime y se escapa', () => {
    const html = render({ customPhrase: 'Calentar 3 min <b>', fields: ['frase'] });

    expect(html).toContain('<p class="frase">Calentar 3 min &lt;b&gt;</p>');
    expect(render({ customPhrase: '  ', fields: ['frase'] })).not.toContain('class="frase"');
  });
});

describe('el logo', () => {
  it('va arriba, centrado y embebido en la hoja', () => {
    const html = render({ showLogo: true });

    expect(html).toContain('class="logo"');
    expect(html).toContain(LABEL_LOGO.src.slice(0, 60));
    // Una sola copia en la hoja (en el CSS), no una por etiqueta.
    expect(html.split(LABEL_LOGO.src).length - 1).toBe(1);
    expect(html.indexOf('class="logo"')).toBeLessThan(html.indexOf('class="customer'));
  });

  it('se puede cambiar su alto y el espacio de abajo', () => {
    const html = render({ logoHeightMm: 18, logoPaddingBottomMm: 5, showLogo: true });

    expect(html).toContain('height: 18mm');
    expect(html).toContain('margin-bottom: 5mm');
    // El logo es cuadrado: el ancho sigue al alto.
    expect(html).toContain('width: 18.00mm');
  });

  it('con el interruptor apagado no hay franja del logo', () => {
    expect(render({ showLogo: false })).not.toContain('class="logo"');
  });
});

describe('borde y líneas de recorte', () => {
  it('el borde es opcional y no reaparece al imprimir cuando está apagado', () => {
    expect(render({ showBorders: true })).toContain('border: 0.25mm solid #444');
    const sin = render({ showBorders: false });
    expect(sin).toContain('border: none');
    expect(sin).not.toContain('solid #444');
  });

  it('las marcas de recorte son opcionales e independientes del borde', () => {
    const con = render({ showBorders: false, showCutLines: true });
    const sin = render({ showCutLines: false });

    expect(con).toContain('.cell::after');
    expect(con).toContain('border: none');
    expect(sin).not.toContain('.cell::after');
  });

  it('las marcas caben en la separación entre etiquetas', () => {
    expect(render({ labelGapMm: 4, showCutLines: true })).toContain('inset: -2.00mm');
    // Pegadas, no hay separación: las marcas quedan en las esquinas de adentro.
    expect(render({ labelGapMm: 0, showCutLines: true })).toContain('inset: 0');
  });
});

describe('el fondo', () => {
  it('es siempre blanco: no hay imagen de fondo', () => {
    const html = render({ showLogo: false });

    expect(html).toContain('background: #fff');
    expect(html).not.toContain('background-image');
  });
});

describe('el formato', () => {
  it('aplica mayúsculas, alineación y escala', () => {
    const html = render({ alignment: 'left', fontScale: 150, uppercaseName: true });

    expect(html).toContain('text-transform: uppercase');
    expect(html).toContain('text-align: left');
    expect(html).toContain('30.0px');
  });

  it('cada layout cambia el cuerpo del nombre', () => {
    expect(render({ layout: 'clasica' })).toContain('--name-size: 20.0px');
    expect(render({ layout: 'protagonista' })).toContain('--name-size: 30.0px');
    expect(render({ layout: 'compacta' })).toContain('--name-size: 15.0px');
  });

  it('declara el tamaño de la hoja para la impresora', () => {
    expect(render()).toContain('@page { size: 210mm 297mm; margin: 0; }');
  });
});

describe('las páginas', () => {
  const many = Array.from({ length: 19 }, (_, index) => ({
    ...label,
    orderPublicNumber: `NQN-${String(index).padStart(5, '0')}`,
  }));

  it('cuenta las hojas', () => {
    expect(labelPageCount(19, 8)).toBe(3);
    expect(labelPageCount(0, 8)).toBe(1);
  });

  it('la hoja trae una página por cada grupo de la grilla', () => {
    const html = renderLabelDocument({ labels: many, settings });

    expect(html.match(/class="sheet"/g)).toHaveLength(3);
    expect(html.match(/class="cell"/g)).toHaveLength(19);
  });

  it('una página trae sólo sus etiquetas', () => {
    const html = renderLabelDocument({ labels: many, mode: 'page', page: 2, settings });

    expect(html.match(/class="sheet"/g)).toHaveLength(1);
    expect(html.match(/class="cell"/g)).toHaveLength(3);
    expect(html).toContain('NQN-00018');
    expect(html).not.toContain('NQN-00000');
  });

  it('destaca la etiqueta actual, y sólo en la vista previa', () => {
    const html = renderLabelDocument({
      highlight: 10,
      labels: many,
      mode: 'page',
      page: 1,
      preview: true,
      settings,
    });

    expect(html.match(/cell current/g)).toHaveLength(1);
    expect(html).toContain('.cell.current .label');
    expect(renderLabelDocument({ labels: many, mode: 'page', page: 1, settings })).not.toContain(
      '.cell.current .label',
    );
  });

  it('una etiqueta suelta se dibuja al tamaño exacto, con lugar para las marcas', () => {
    const html = renderLabelDocument({
      labels: many,
      mode: 'single',
      settings: { ...settings, showCutLines: true },
    });

    expect(html.match(/class="cell"/g)).toHaveLength(1);
    expect(html).toContain('sheet single');
    // 210 − 24 de margen − 4 de separación = 182 / 2 columnas = 91 mm de ancho.
    expect(html).toContain('grid-template-columns:91.00mm');
  });

  it('el ejemplo trae casos difíciles para probar un formato', () => {
    const html = renderLabelDocument({ labels: SAMPLE_LABELS, settings });

    expect(html).toContain('María de los Ángeles');
    expect(SAMPLE_LABELS.some((sample) => sample.composable)).toBe(true);
  });
});

describe('el tamaño del documento', () => {
  it('una página mide la hoja más el gris de alrededor en la vista previa', () => {
    expect(labelDocumentSize({ mode: 'page', preview: true, settings })).toEqual({
      heightMm: 297 - 0.5 + 12,
      widthMm: 210 + 12,
    });
    expect(labelDocumentSize({ mode: 'page', settings }).widthMm).toBe(210);
  });

  it('una etiqueta suelta mide su lienzo más el lugar de las marcas', () => {
    const sin = labelDocumentSize({
      mode: 'single',
      settings: { ...settings, showCutLines: false },
    });
    const con = labelDocumentSize({
      mode: 'single',
      settings: { ...settings, showCutLines: true },
    });

    // 91 mm de lienzo más 3 mm de aire de cada lado.
    expect(sin.widthMm).toBeCloseTo(97, 5);
    expect(con.widthMm).toBeGreaterThan(sin.widthMm - 1);
  });
});
