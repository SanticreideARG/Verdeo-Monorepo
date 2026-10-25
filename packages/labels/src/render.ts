import { LABEL_LOGO } from './assets.js';
import { fontStack } from './fonts.js';
import { labelCanvas } from './sheet.js';
import {
  LABEL_FIELDS,
  type LabelData,
  type LabelField,
  type LabelRenderSettings,
} from './types.js';

/**
 * El dibujo de las etiquetas: la hoja, una página de la hoja o una etiqueta suelta.
 *
 * Es **el único lugar que dibuja una etiqueta**. La impresión (el servidor arma este HTML y el
 * navegador lo manda a la impresora) y la vista previa de la pantalla (el mismo HTML dentro de un
 * marco) llaman a esta función con los mismos datos, así que no pueden discrepar: antes eran dos
 * implementaciones —una en React, otra en un generador de HTML—, y cada ajuste había que escribirlo
 * dos veces. Lo que se ve en la pantalla es, literalmente, lo que sale en el papel.
 *
 * Todo va en milímetros (hoja, márgenes, etiqueta, logo), que es como se mide una hoja de stickers.
 * El fondo es siempre blanco: lo que no es tinta es papel.
 */
export type LabelRenderMode = 'page' | 'sheet' | 'single';

export interface LabelRenderOptions {
  /** El índice, en la lista completa, de la etiqueta a destacar. Sólo se ve en pantalla. */
  highlight?: number | null;
  labels: readonly LabelData[];
  /** `sheet`: todas las páginas. `page`: sólo la página `page`. `single`: sólo la primera etiqueta. */
  mode?: LabelRenderMode;
  /** Qué página dibujar (desde 0), con `mode: 'page'`. */
  page?: number;
  /** Fondo gris y sombra alrededor de la hoja, para verla en pantalla. Al imprimir no cuenta. */
  preview?: boolean;
  /** La fecha de elaboración, `AAAA-MM-DD`, para el campo `produccion`. */
  productionDate?: string | null;
  settings: LabelRenderSettings;
  title?: string;
}

/** Cuánto pesa cada renglón: lo grande se lee de lejos, lo chico acompaña. */
type Weight = 'destacado' | 'frase' | 'menor' | 'platos';

interface FieldContext {
  phrase: string;
  productionDate: string | null;
}

const FIELD_RENDERERS: Record<
  LabelField,
  { lines: (label: LabelData, context: FieldContext) => string[]; weight: Weight }
> = {
  entrega: { lines: (label) => [shortDate(label.deliveryDate)], weight: 'menor' },
  frase: {
    lines: (_label, context) => (context.phrase ? [context.phrase] : []),
    weight: 'frase',
  },
  // El número de pedido es un control interno: no sale en ninguna etiqueta (2026-10-23).
  numero: { lines: () => [], weight: 'menor' },
  /*
   * El plato que acompaña esta etiqueta, con su posición cuando hay más de uno —"Pollo al horno · 2
   * de 5"—: cinco etiquetas de la misma vianda apiladas sobre la mesa no dicen de otro modo si
   * están las cinco.
   */
  plato: {
    lines: (label) =>
      label.dishName === null
        ? []
        : [
            label.dishTotal > 1
              ? `${label.dishName} · ${String(label.dishIndex)} de ${String(label.dishTotal)}`
              : label.dishName,
          ],
    weight: 'destacado',
  },
  /*
   * Los platos del menú se escriben "plato | acompañamiento" (es el formato de la hoja de cocina).
   * En la etiqueta de la vianda la barra se lee como un corte raro: va un punto medio.
   */
  platos: {
    lines: (label) => label.dishes.map((dish) => dish.replace(/\s*\|\s*/g, ' · ')),
    weight: 'platos',
  },
  produccion: {
    lines: (_label, context) =>
      context.productionDate ? [`Elaborado: ${shortDate(context.productionDate)}`] : [],
    weight: 'menor',
  },
  restricciones: {
    lines: (label) =>
      label.dietaryInstructions.length > 0 ? [label.dietaryInstructions.join(' · ')] : [],
    weight: 'destacado',
  },
  tamano: { lines: (label) => [label.variantName], weight: 'destacado' },
  // Sólo cuando hay más de una: "1 de 1" no le dice nada a nadie.
  unidad: {
    lines: (label) =>
      label.unitTotal > 1 ? [`${String(label.unitIndex)} de ${String(label.unitTotal)}`] : [],
    weight: 'menor',
  },
  variedad: { lines: (label) => [label.familyName], weight: 'destacado' },
  zona: { lines: (label) => (label.deliveryZone ? [label.deliveryZone] : []), weight: 'menor' },
};

/** Los cuerpos de letra (en px, antes de la escala del usuario) y el aire de cada layout. */
const LAYOUT_SIZES = {
  clasica: { minor: 10, name: 20, paddingMm: 4, strong: 15 },
  compacta: { minor: 8.5, name: 15, paddingMm: 2, strong: 12 },
  protagonista: { minor: 9.5, name: 30, paddingMm: 4, strong: 13 },
} as const;

/** La fecha sola, leída como local: la entrega es un día, no un instante (UTC la corría un día). */
function shortDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${day ?? ''}/${month ?? ''}`;
}

function escape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}

/**
 * El nombre sin apellido: nombre de pila e iniciales ("Ana I. V."), para que dos "Ana" sigan siendo
 * dos personas. Un nombre de una sola palabra queda como está.
 */
export function maskSurname(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return displayName.trim();
  const [first, ...rest] = parts;
  return [first, ...rest.map((part) => `${[...part][0] ?? ''}.`)].join(' ');
}

/**
 * Qué nombre lleva esta etiqueta, según lo que se haya parametrizado.
 *
 * Una vianda estándar se identifica por variedad y tamaño; una Intuitivo no, porque dos del mismo
 * tamaño son combinaciones de platos distintas y sin el nombre no hay forma de saber cuál es cuál.
 * Por eso "sólo en las Intuitivo" es una opción y no un descuido. Cadena vacía: la etiqueta sale sin
 * renglón de nombre, no con uno en blanco.
 */
export function labelDisplayName(
  label: Pick<LabelData, 'composable' | 'customerDisplayName'>,
  settings: Pick<LabelRenderSettings, 'hideSurname' | 'nameOnlyForComposable' | 'showCustomerName'>,
): string {
  if (!settings.showCustomerName) return '';
  if (settings.nameOnlyForComposable && !label.composable) return '';
  return settings.hideSurname ? maskSurname(label.customerDisplayName) : label.customerDisplayName;
}

/** Un nombre largo baja de cuerpo por escalones (y no con una medición) para no desbordar. */
function nameStep(name: string): 0 | 1 | 2 | 3 {
  const length = [...name].length;
  if (length > 40) return 3;
  if (length > 30) return 2;
  if (length > 22) return 1;
  return 0;
}

export function labelPageCount(labelCount: number, labelsPerPage: number): number {
  return Math.max(1, Math.ceil(labelCount / Math.max(1, labelsPerPage)));
}

/** El largo de las marcas de recorte: caben en la separación entre etiquetas, sin tocarse. */
function cutMarkLength(gapMm: number): { insideLabel: boolean; lengthMm: number } {
  if (gapMm < 1) return { insideLabel: true, lengthMm: 2.5 };
  return { insideLabel: false, lengthMm: Math.min(3, gapMm / 2) };
}

function cutMarksCss(gapMm: number): string {
  const { insideLabel, lengthMm } = cutMarkLength(gapMm);
  const thickness = 0.2;
  const length = `${lengthMm.toFixed(2)}mm`;
  const edge = insideLabel ? '0mm' : `${(lengthMm - thickness / 2).toFixed(2)}mm`;
  const line = 'linear-gradient(#000, #000)';
  const horizontal = (side: 'bottom' | 'top', corner: 'left' | 'right') =>
    `${line} ${corner} 0 ${side} ${edge} / ${length} ${thickness}mm no-repeat`;
  const vertical = (side: 'bottom' | 'top', corner: 'left' | 'right') =>
    `${line} ${corner} ${edge} ${side} 0 / ${thickness}mm ${length} no-repeat`;
  return `.cell::after {
    content: '';
    position: absolute;
    inset: ${insideLabel ? '0' : `-${length}`};
    pointer-events: none;
    background:
      ${horizontal('top', 'left')},
      ${vertical('top', 'left')},
      ${horizontal('top', 'right')},
      ${vertical('top', 'right')},
      ${horizontal('bottom', 'left')},
      ${vertical('bottom', 'left')},
      ${horizontal('bottom', 'right')},
      ${vertical('bottom', 'right')};
  }`;
}

/** El aire alrededor de la hoja en la vista previa (el gris del fondo), en milímetros. */
const PREVIEW_PADDING_MM = 6;

/** El aire alrededor de una etiqueta suelta: lo que dejan las marcas de recorte, o un mínimo. */
function singleMarginMm(settings: LabelRenderSettings): number {
  return settings.showCutLines ? cutMarkLength(settings.labelGapMm).lengthMm + 2 : 3;
}

/**
 * Cuánto mide, en milímetros, el documento que dibuja `renderLabelDocument` con esas opciones.
 *
 * Existe para que quien lo muestre en un marco (la vista previa) lo dimensione sin tener que
 * medirlo: el marco, la escala y el zoom salen de acá, de la misma cuenta que el dibujo.
 */
export function labelDocumentSize(options: {
  mode: Exclude<LabelRenderMode, 'sheet'>;
  preview?: boolean;
  settings: LabelRenderSettings;
}): { heightMm: number; widthMm: number } {
  const { settings } = options;
  const canvas = labelCanvas(
    {
      gapMm: settings.labelGapMm,
      heightMm: settings.sheetHeightMm,
      marginMm: settings.sheetMarginMm,
      widthMm: settings.sheetWidthMm,
    },
    settings.labelsPerPage,
  );
  const around = options.preview ? PREVIEW_PADDING_MM * 2 : 0;
  if (options.mode === 'single') {
    const margin = singleMarginMm(settings) * 2;
    return {
      heightMm: canvas.heightMm + margin + around,
      widthMm: canvas.widthMm + margin + around,
    };
  }
  return {
    heightMm: settings.sheetHeightMm - 0.5 + around,
    widthMm: settings.sheetWidthMm + around,
  };
}

export function renderLabelDocument(options: LabelRenderOptions): string {
  const { labels, settings } = options;
  const mode = options.mode ?? 'sheet';
  const canvas = labelCanvas(
    {
      gapMm: settings.labelGapMm,
      heightMm: settings.sheetHeightMm,
      marginMm: settings.sheetMarginMm,
      widthMm: settings.sheetWidthMm,
    },
    settings.labelsPerPage,
  );
  const scale = settings.fontScale / 100;
  const sizes = LAYOUT_SIZES[settings.layout] ?? LAYOUT_SIZES.clasica;
  const px = (value: number) => `${(value * scale).toFixed(1)}px`;
  const context: FieldContext = {
    phrase: (settings.customPhrase ?? '').trim(),
    productionDate: options.productionDate ?? null,
  };
  const fields = settings.fields.filter(
    (field, index, all): field is LabelField =>
      (LABEL_FIELDS as readonly string[]).includes(field) && all.indexOf(field) === index,
  );
  const logoWidthMm = (settings.logoHeightMm * LABEL_LOGO.width) / LABEL_LOGO.height;

  const cell = (label: LabelData, index: number) => {
    const body = fields
      .map((field) => {
        const spec = FIELD_RENDERERS[field];
        return spec
          .lines(label, context)
          .map((line) => `<p class="${spec.weight}">${escape(line)}</p>`)
          .join('');
      })
      .join('');
    const name = labelDisplayName(label, settings);
    const step = name ? nameStep(name) : 0;
    const logo = settings.showLogo ? '<div class="logo" role="img" aria-label="Verdeo"></div>' : '';
    const current = options.highlight === index ? ' current' : '';
    const customer = name ? `<p class="customer s${String(step)}">${escape(name)}</p>` : '';
    const fieldsBlock = `<div class="fields">${body}</div>`;
    const inner =
      settings.namePosition === 'abajo' ? fieldsBlock + customer : customer + fieldsBlock;
    return `<div class="cell${current}"><div class="label">${logo}<div class="body">${inner}</div></div></div>`;
  };

  const perPage = settings.labelsPerPage;
  let sheets: string;
  if (mode === 'single') {
    const single = labels[0];
    const margin = singleMarginMm(settings);
    sheets = `<section class="sheet single" style="width:${(canvas.widthMm + margin * 2).toFixed(2)}mm;height:${(canvas.heightMm + margin * 2).toFixed(2)}mm;padding:${margin.toFixed(2)}mm"><div class="grid" style="grid-template-columns:${canvas.widthMm.toFixed(2)}mm;grid-template-rows:${canvas.heightMm.toFixed(2)}mm">${
      single ? cell(single, 0) : ''
    }</div></section>`;
  } else {
    const pageCount = labelPageCount(labels.length, perPage);
    const pages =
      mode === 'page'
        ? [Math.min(Math.max(0, options.page ?? 0), pageCount - 1)]
        : Array.from({ length: pageCount }, (_, index) => index);
    sheets = pages
      .map((page) => {
        const start = page * perPage;
        const cells = labels
          .slice(start, start + perPage)
          .map((label, offset) => cell(label, start + offset))
          .join('');
        return `<section class="sheet"><div class="grid">${cells}</div></section>`;
      })
      .join('');
  }

  // El logo sólo viaja en la hoja cuando se usa: son ~65 KB que no hay por qué mandar si está apagado.
  const logoCss = settings.showLogo
    ? `  /* El logo arriba y centrado, en su propia franja: lo demás empieza debajo. */
  .logo {
    flex: none;
    align-self: center;
    width: ${logoWidthMm.toFixed(2)}mm;
    height: ${String(settings.logoHeightMm)}mm;
    margin-bottom: ${String(settings.logoPaddingBottomMm)}mm;
    background: url('${LABEL_LOGO.src}') center / contain no-repeat;
  }`
    : '';
  const border = settings.showBorders ? '0.25mm solid #444' : 'none';
  const align = settings.alignment === 'left' ? 'flex-start' : 'center';
  const inlineFields = settings.layout === 'protagonista';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escape(options.title ?? 'Etiquetas')}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  /* Sin agrandar el texto en el teléfono: en una etiqueta de medida fija lo rompía letra por letra. */
  html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  body {
    font-family: ${fontStack(settings.fontFamily)};
    color: #111;
    /* Sin esto el navegador descarta los fondos al imprimir, y el logo es un fondo. */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet {
    --name-size: ${px((sizes.name * Math.min(200, Math.max(50, settings.nameScale))) / 100)};
    --strong-size: ${px(sizes.strong)};
    --minor-size: ${px(sizes.minor)};
    position: relative;
    width: ${String(settings.sheetWidthMm)}mm;
    /* Medio milímetro menos que el papel: con la altura exacta, el redondeo de la impresora
       agrega una hoja en blanco al final. */
    height: ${String(settings.sheetHeightMm - 0.5)}mm;
    padding: ${String(settings.sheetMarginMm)}mm;
    overflow: hidden;
    background: #fff;
    break-after: page;
    page-break-after: always;
  }
  .sheet:last-child { break-after: auto; page-break-after: auto; }
  .grid {
    display: grid;
    grid-template-columns: repeat(${String(canvas.columns)}, ${canvas.widthMm.toFixed(2)}mm);
    grid-template-rows: repeat(${String(canvas.rows)}, ${canvas.heightMm.toFixed(2)}mm);
    gap: ${String(settings.labelGapMm)}mm;
    justify-content: center;
    align-content: start;
  }
  .cell { position: relative; min-width: 0; min-height: 0; }
  ${settings.showCutLines ? cutMarksCss(settings.labelGapMm) : ''}
  .label {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: ${align};
    text-align: ${settings.alignment};
    padding: ${String(sizes.paddingMm)}mm;
    border: ${border};
    overflow: hidden;
    background: #fff;
  }
  ${logoCss}
  .body {
    flex: 1;
    min-height: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: ${align};
  }
  /* El nombre manda: es lo que se busca para saber a quién va cada vianda. */
  .customer {
    margin: 0;
    max-width: 100%;
    font-size: var(--name-size);
    font-weight: 700;
    line-height: 1.15;
    overflow-wrap: break-word;
    text-transform: ${settings.uppercaseName ? 'uppercase' : 'none'};
  }
  .customer.s1 { font-size: calc(var(--name-size) * 0.85); }
  .customer.s2 { font-size: calc(var(--name-size) * 0.72); }
  .customer.s3 { font-size: calc(var(--name-size) * 0.6); }
  .fields {
    max-width: 100%;
    display: flex;
    flex-direction: ${inlineFields ? 'row' : 'column'};
    flex-wrap: wrap;
    justify-content: ${align};
    align-items: ${inlineFields ? 'baseline' : align};
    column-gap: 2.5mm;
  }
  .fields p { margin: 0; max-width: 100%; overflow-wrap: break-word; }
  .destacado { font-size: var(--strong-size); font-weight: 600; margin: 1mm 0 0; }
  .menor { font-size: var(--minor-size); color: #555; margin: 1mm 0 0; }
  .platos { font-size: var(--minor-size); color: #333; margin: 0.4mm 0 0; }
  .frase { font-size: var(--minor-size); font-style: italic; color: #222; margin: 1mm 0 0; }
  @page { size: ${String(settings.sheetWidthMm)}mm ${String(settings.sheetHeightMm)}mm; margin: 0; }
  ${
    options.preview
      ? `@media screen {
    body { background: #e4e9e1; padding: ${String(PREVIEW_PADDING_MM)}mm; }
    .sheet { margin: 0 auto 6mm; box-shadow: 0 1mm 4mm rgb(0 0 0 / 25%); }
    .sheet:last-child { margin-bottom: 0; }
    .cell.current .label { outline: 0.5mm solid #2563eb; outline-offset: 0.3mm; }
  }`
      : ''
  }
</style>
</head>
<body>
  ${sheets}
</body>
</html>`;
}
