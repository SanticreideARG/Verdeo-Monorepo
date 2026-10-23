/**
 * Etiquetas 2.0 (LABELS_2_PLAN.md): las etiquetas de producción, copiadas de las que se armaban a mano
 * en Illustrator, sobre un único papel. Sin opciones de hoja ni de formato: el papel es éste y las
 * etiquetas son éstas.
 */
import { PRODUCTION_BADGE, PRODUCTION_ICON } from './production-assets.js';

/** Husares H34124: A4, 24 etiquetas de 64,0 × 33,9 mm. Medidas tomadas del PDF de producción. */
export const PRODUCTION_PAPER = {
  code: 'H34124',
  columns: 3,
  gapXMm: 1.5,
  labelHeightMm: 33.9,
  labelWidthMm: 64,
  marginLeftMm: 7.5,
  marginTopMm: 12.9,
  name: 'Husares H34124 · A4 · 24 etiquetas de 64 × 33,9 mm',
  pageHeightMm: 297,
  pageWidthMm: 210,
  rows: 8,
} as const;

export const LABELS_PER_SHEET = PRODUCTION_PAPER.columns * PRODUCTION_PAPER.rows;

/** Una etiqueta de la tanda: de plato (horizontal) o de menú (vertical). */
export type ProductionLabel =
  | {
      /** Lo que va abajo: "VEGETARIANO ELAB # 15-10". */
      footer: string;
      dish: string;
      /** Clave estable, para recordar si ya se imprimió. */
      key: string;
      kind: 'plato';
      side: string | null;
    }
  | {
      key: string;
      kind: 'menu';
      /** La variedad ("KETO") o, en un Intuitivo, el nombre del cliente. */
      line: string;
      /** El número grande: "400". */
      size: string;
    };

/** "Pechuga rellena | Puré de calabaza" → el plato y su acompañamiento. */
export function splitDishName(name: string): { dish: string; side: string | null } {
  const [dish = '', ...rest] = name.split(/\s*\|\s*|\s+\/\s+/);
  const side = cleanDishText(rest.join(' · '));
  return { dish: cleanDishText(dish), side: side || null };
}

/**
 * El nombre de un plato como va en la etiqueta: sin las marcas del menú. El "*" del principio y el
 * "(k)" o "(v)" del final dicen de qué menú es, y en la etiqueta eso ya lo dice el pie. Empieza con
 * mayúscula ("fritatta de berenjenas" → "Fritatta de berenjenas"), como en producción.
 */
export function cleanDishText(text: string): string {
  const clean = text
    .trim()
    .replace(/^[*\s]+/, '')
    .replace(/\s*\(\s*\p{Letter}\s*\)\s*$/u, '')
    .trim();
  const [first = '', ...rest] = [...clean];
  return first.toLocaleUpperCase('es-AR') + rest.join('');
}

/** "Menú Nuevo Keto" → "KETO": la última palabra, sin "Menú", como en las etiquetas de producción. */
export function familyShortName(familyName: string): string {
  const words = familyName
    .replace(/^men[uú]\s+/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  // "Anti-Age" es una sola palabra: "ANTIAGE".
  return (words.at(-1) ?? familyName).replace(/-/g, '').toLocaleUpperCase('es-AR');
}

/** "2026-10-15" → "15-10": la fecha de elaboración como va en el pie. */
export function elaborationDay(isoDate: string): string {
  const [, month = '', day = ''] = isoDate.split('-');
  return `${day}-${month}`;
}

/** "400 g" → "400": el número grande de la etiqueta de menú. */
export function sizeNumber(variantName: string): string {
  return /\d+/.exec(variantName)?.[0] ?? variantName;
}

/** Cuántas hojas ocupa una tanda que empieza en la posición `startAt` (1 a 24) de la primera. */
export function productionSheetCount(count: number, startAt = 1): number {
  if (count === 0) return 0;
  return Math.ceil(
    (count + Math.max(0, Math.min(LABELS_PER_SHEET, startAt) - 1)) / LABELS_PER_SHEET,
  );
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/*
 * El tamaño del plato, como en producción: el más grande que entra. Sin acompañamiento, 11,7 pt si
 * entra en dos renglones, si no 10,75 y si no 9,8. Con acompañamiento, 11,7 si entra en uno y 9,8
 * en dos. Cuántos renglones ocupa depende de la tipografía, así que se mide en la hoja ya cargada
 * (FIT_SCRIPT); la clase inicial es la estimación para cuando no corre.
 */
function plateHtml(label: Extract<ProductionLabel, { kind: 'plato' }>): string {
  const step = label.side ? 'small' : 'large';
  // El pie lleva un espacio ancho después del "#", como en producción.
  const foot = escape(label.footer).replace('# ', '#&ensp;');
  return `<div class="plato"><img class="icon" src="${PRODUCTION_ICON}" alt=""><div class="text"><p class="dish ${step}"${
    label.side ? ' data-side' : ''
  }>${escape(label.dish.toLocaleUpperCase('es-AR'))}</p>${
    label.side ? `<p class="side">${escape(label.side)}</p>` : ''
  }</div><p class="foot">${foot}</p></div>`;
}

const FIT_SCRIPT = `<script>
(function () {
  function lines(el) {
    return Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight));
  }
  function fit() {
    document.querySelectorAll('.plato .dish').forEach(function (el) {
      var steps = el.hasAttribute('data-side') ? [[11.7, 1], [9.8, 2]] : [[11.7, 2], [10.75, 2], [9.8, 2]];
      for (var i = 0; i < steps.length; i++) {
        el.style.fontSize = steps[i][0] + 'pt';
        if (lines(el) <= steps[i][1]) break;
      }
    });
    document.documentElement.setAttribute('data-fitted', '');
  }
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(fit);
})();
</script>`;

function menuHtml(label: Extract<ProductionLabel, { kind: 'menu' }>): string {
  const isName = [...label.line].length > 12;
  return `<div class="menu"><img class="badge" src="${PRODUCTION_BADGE}" alt=""><div class="turn"><div class="figures"><span class="size">${escape(label.size)}</span><span class="kcal">Kcal</span></div><p class="line${isName ? ' name' : ''}">${escape(label.line.toLocaleUpperCase('es-AR'))}</p></div></div>`;
}

const FONTS =
  'https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@1,400&family=Source+Sans+3:wght@400&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&display=swap';

function css(preview: boolean): string {
  const p = PRODUCTION_PAPER;
  return `
  @page { size: ${String(p.pageWidthMm)}mm ${String(p.pageHeightMm)}mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: ${preview ? '#e8e8e8' : '#fff'}; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #231f20; }
  .sheet {
    position: relative;
    width: ${String(p.pageWidthMm)}mm;
    height: ${String(p.pageHeightMm)}mm;
    background: #fff;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
    ${preview ? 'margin: 0 auto 8mm; box-shadow: 0 1px 6px rgb(0 0 0 / 25%);' : ''}
  }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .cell {
    position: absolute;
    width: ${String(p.labelWidthMm)}mm;
    height: ${String(p.labelHeightMm)}mm;
    overflow: hidden;
    ${preview ? 'outline: 0.2mm dashed #c9c9c9;' : ''}
  }
  .cell.empty { ${preview ? 'background: repeating-linear-gradient(45deg, #fafafa 0 2mm, #f0f0f0 2mm 4mm);' : ''} }
  .cell.printed { ${preview ? 'outline: 0.5mm solid #d98e04;' : ''} }

  /*
   * Plato, medido sobre el PDF de producción: el ícono fijo arriba (a 1 mm del borde), el pie fijo
   * abajo (su renglón a 2,9 mm del borde) y el texto centrado entre los dos.
   */
  .plato { position: relative; height: 100%; text-align: center; }
  .plato .icon {
    position: absolute;
    top: 1mm;
    left: 50%;
    width: 10.5mm;
    height: 10.5mm;
    transform: translateX(-50%);
  }
  .plato p { margin: 0; }
  .plato .text {
    position: absolute;
    top: 11.5mm;
    bottom: 6.8mm;
    left: 2mm;
    right: 2mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .plato .dish {
    font-family: 'Source Serif 4', 'Source Serif Pro', Georgia, serif;
    font-weight: 400;
    /* El original es Source Serif Pro: el diseño de texto, no el de tamaños chicos, que es más ancho. */
    font-optical-sizing: none;
    line-height: 1.2;
    max-width: 56mm;
    overflow-wrap: anywhere;
  }
  .plato .dish.large { font-size: 11.7pt; }
  .plato .dish.small { font-size: 9.8pt; }
  .plato .side {
    max-width: 56mm;
    font-family: 'Crimson Pro', 'Minion Pro', Georgia, serif;
    font-style: italic;
    font-size: 11.7pt;
    line-height: 1.2;
  }
  .plato .foot {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 2.1mm;
    font-family: 'Source Sans 3', 'Myriad Pro', Arial, sans-serif;
    font-size: 10.6pt;
    line-height: 1;
    letter-spacing: 0.01em;
  }

  /* Menú: el sello a la izquierda y el texto girado, que se lee de abajo hacia arriba. */
  .menu { position: relative; height: 100%; }
  .menu .badge {
    position: absolute;
    left: 3.4mm;
    top: 50%;
    width: 26.7mm;
    height: 26.7mm;
    transform: translateY(-50%) rotate(-90deg);
  }
  .menu .turn {
    position: absolute;
    left: 34mm;
    top: ${String(p.labelHeightMm)}mm;
    width: ${String(p.labelHeightMm)}mm;
    height: 29mm;
    padding: 0 3.4mm;
    transform: rotate(-90deg);
    transform-origin: top left;
    font-family: 'Source Serif 4', 'Source Serif Pro', Georgia, serif;
    font-optical-sizing: none;
  }
  .menu .figures {
    display: grid;
    grid-template-columns: auto auto;
    justify-content: start;
    line-height: 1;
  }
  .menu .size { font-size: 24pt; line-height: 17pt; }
  .menu .kcal { grid-column: 2; grid-row: 2; font-size: 14pt; line-height: 15pt; padding-left: 0.4mm; }
  .menu .line { margin: 0.4mm 0 0; font-size: 12pt; line-height: 1.05; }
  .menu .line.name { font-size: 9.5pt; max-width: 26mm; }
  `;
}

/**
 * La tanda lista para imprimir: hojas A4 con las etiquetas en sus posiciones del papel. `startAt`
 * deja libres las primeras posiciones de la primera hoja, para aprovechar una hoja ya usada.
 * `printedKeys` (sólo en la vista previa) marca las que ya se imprimieron.
 */
export function renderProductionSheets(options: {
  labels: readonly ProductionLabel[];
  preview?: boolean;
  printedKeys?: ReadonlySet<string>;
  startAt?: number;
  title?: string;
}): string {
  const p = PRODUCTION_PAPER;
  const preview = options.preview ?? false;
  const skip = Math.max(0, Math.min(LABELS_PER_SHEET, options.startAt ?? 1) - 1);
  const slots: (ProductionLabel | null)[] = [
    ...Array.from({ length: skip }, () => null),
    ...options.labels,
  ];
  const sheets: string[] = [];
  for (let start = 0; start < slots.length; start += LABELS_PER_SHEET) {
    const cells = slots.slice(start, start + LABELS_PER_SHEET);
    while (preview && cells.length < LABELS_PER_SHEET) cells.push(null);
    const html = cells
      .map((label, index) => {
        const column = index % p.columns;
        const row = Math.floor(index / p.columns);
        const left = p.marginLeftMm + column * (p.labelWidthMm + p.gapXMm);
        const top = p.marginTopMm + row * p.labelHeightMm;
        const printed = label && options.printedKeys?.has(label.key) ? ' printed' : '';
        const body = !label ? '' : label.kind === 'plato' ? plateHtml(label) : menuHtml(label);
        return `<div class="cell${label ? '' : ' empty'}${printed}" style="left:${left.toFixed(2)}mm;top:${top.toFixed(2)}mm">${body}</div>`;
      })
      .join('');
    sheets.push(`<section class="sheet">${html}</section>`);
  }
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escape(
    options.title ?? 'Etiquetas',
  )}</title><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${FONTS}"><style>${css(preview)}</style></head><body>${sheets.join('')}${FIT_SCRIPT}</body></html>`;
}
