import type { Label, LabelSettings } from '@verdeo/contracts';
import { describe, expect, it } from 'vitest';

import { buildLabelsPrintHtml } from './labels-export.js';

const label: Label = {
  composable: false,
  customerDisplayName: 'Ana Isabella Vega',
  deliveryDate: '2026-08-28',
  deliveryZone: 'Centro',
  dietaryInstructions: ['Sin cebolla'],
  familyName: 'Keto',
  orderPublicNumber: 'NQN-00090',
  unitIndex: 1,
  unitTotal: 3,
  variantName: '250',
};

const settings: Pick<
  LabelSettings,
  | 'alignment'
  | 'backgroundImageUrl'
  | 'fields'
  | 'fontFamily'
  | 'fontScale'
  | 'hideSurname'
  | 'labelGapMm'
  | 'nameOnlyForComposable'
  | 'labelsPerPage'
  | 'sheetHeightMm'
  | 'sheetMarginMm'
  | 'sheetWidthMm'
  | 'showBorders'
  | 'uppercaseName'
> = {
  alignment: 'center',
  backgroundImageUrl: null,
  fields: ['tamano', 'numero'],
  fontFamily: 'system',
  fontScale: 100,
  hideSurname: false,
  labelGapMm: 4,
  nameOnlyForComposable: false,
  labelsPerPage: 8,
  sheetHeightMm: 297,
  sheetMarginMm: 12,
  sheetWidthMm: 210,
  showBorders: true,
  uppercaseName: false,
};

function render(overrides: Partial<typeof settings> = {}, one: Label = label): string {
  return buildLabelsPrintHtml([one], { ...settings, ...overrides }, 'Etiquetas');
}

describe('buildLabelsPrintHtml', () => {
  it('recorta el apellido cuando se pidió sin apellido', () => {
    const html = render({ hideSurname: true });

    expect(html).toContain('Ana I. V.');
    expect(html).not.toContain('Ana Isabella Vega');
  });

  it('saca el nombre de las estándar y lo deja en las Intuitivo', () => {
    // Una vianda estándar se identifica por variedad y tamaño; dos Intuitivo del mismo tamaño son
    // combinaciones de platos distintas, así que ahí el nombre es lo único que las separa.
    const estandar = render({ nameOnlyForComposable: true });
    const intuitivo = render({ nameOnlyForComposable: true }, { ...label, composable: true });

    expect(estandar).not.toContain('Ana');
    expect(intuitivo).toContain('Ana Isabella Vega');
  });

  it('combina las dos: iniciales en las Intuitivo, sin nombre en el resto', () => {
    const opciones = { hideSurname: true, nameOnlyForComposable: true };

    expect(render(opciones)).not.toContain('Ana');
    expect(render(opciones, { ...label, composable: true })).toContain('Ana I. V.');
  });

  it('imprime el nombre aunque no se haya elegido ningún campo', () => {
    const html = render({ fields: [] });

    // El nombre no es un campo elegible: es lo único que responde de quién es la vianda.
    expect(html).toContain('Ana Isabella Vega');
    expect(html).not.toContain('NQN-00090');
  });

  it('imprime sólo los campos elegidos, y en el orden guardado', () => {
    const html = render({ fields: ['zona', 'tamano'] });

    expect(html).toContain('Centro');
    expect(html).toContain('250');
    expect(html).not.toContain('Keto');
    expect(html.indexOf('Centro')).toBeLessThan(html.indexOf('250'));
  });

  it('omite un campo sin valor en vez de dejar un renglón vacío', () => {
    // Una etiqueta que dice "Zona:" y nada más ocupa lugar sin informar.
    const html = render({ fields: ['zona'] }, { ...label, deliveryZone: null });

    expect(html).toContain('Ana Isabella Vega');
    expect(html).not.toContain('Centro');
  });

  it('numera la unidad sólo cuando hay más de una', () => {
    expect(render({ fields: ['unidad'] })).toContain('1 de 3');
    // "1 de 1" no le dice nada a nadie.
    expect(render({ fields: ['unidad'] }, { ...label, unitTotal: 1 })).not.toContain('1 de 1');
  });

  it('mantiene el fondo imprimible', () => {
    const html = render({ backgroundImageUrl: 'https://ejemplo.test/fondo.png' });

    // Sin esto el navegador descarta el fondo al imprimir: se ve en pantalla y sale en blanco.
    expect(html).toContain('print-color-adjust: exact');
    expect(html).toContain('https://ejemplo.test/fondo.png');
  });

  it('declara el fondo de forma que el navegador lo pueda leer', () => {
    const html = render({ backgroundImageUrl: 'https://ejemplo.test/fondo.png' });

    /*
     * Estaba inline como `style="background-image: url("https://…")"`: las comillas dobles de la
     * URL cerraban el atributo y el fondo no se aplicaba nunca. La URL igual aparecía en el HTML,
     * así que el test anterior —que sólo la buscaba— pasaba con el fondo roto.
     */
    expect(html).toContain("url('https://ejemplo.test/fondo.png')");
    expect(html).not.toContain('style="background-image');
  });

  it('no declara ningún fondo cuando no hay imagen', () => {
    expect(render({ backgroundImageUrl: null })).not.toContain('background-image');
  });

  it('no reimprime el recuadro al imprimir cuando está apagado', () => {
    const html = render({ showBorders: false });

    expect(html).toContain('border: none');
    // La regla de @media print forzaba el borde sólido y lo hacía reaparecer justo en el papel.
    expect(html).not.toContain('border-style: solid');
  });

  it('aplica mayúsculas, alineación y escala', () => {
    const html = render({ alignment: 'left', fontScale: 150, uppercaseName: true });

    expect(html).toContain('text-transform: uppercase');
    expect(html).toContain('text-align: left');
    expect(html).toContain('30.0px');
  });

  it('escapa lo que viene del cliente', () => {
    const html = render({}, { ...label, customerDisplayName: 'Ana <script>alert(1)</script>' });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
