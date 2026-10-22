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
  const side = rest.join(' · ').trim();
  return { dish: dish.trim(), side: side || null };
}

/** "Menú Nuevo Keto" → "KETO": la última palabra, sin "Menú", como en las etiquetas de producción. */
export function familyShortName(familyName: string): string {
  const words = familyName
    .replace(/^men[uú]\s+/i, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (words.at(-1) ?? familyName).toLocaleUpperCase('es-AR');
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

/**
 * Como en el original: con acompañamiento, el plato va a 9,8 pt (son tres renglones de texto en la
 * etiqueta); sin acompañamiento, a 11,7 pt.
 */
function dishStep(label: { dish: string; side: string | null }): 'large' | 'small' {
  return label.side ? 'small' : 'large';
}

function plateHtml(label: Extract<ProductionLabel, { kind: 'plato' }>): string {
  return `<div class="plato"><img class="icon" src="${PRODUCTION_ICON}" alt=""><p class="dish ${dishStep(label)}">${escape(label.dish.toLocaleUpperCase('es-AR'))}</p>${
    label.side ? `<p class="side">${escape(label.side)}</p>` : ''
  }<p class="foot">${escape(label.footer)}</p></div>`;
}

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

  /* Plato: el ícono arriba, el plato en mayúsculas, el acompañamiento en cursiva, el pie. */
  .plato {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 1mm 2.5mm;
    text-align: center;
  }
  .plato .icon { width: 10.5mm; height: 10.5mm; margin-bottom: 0.9mm; }
  .plato p { margin: 0; }
  .plato .dish {
    font-family: 'Source Serif 4', 'Source Serif Pro', Georgia, serif;
    font-weight: 500;
    line-height: 1.05;
    /* El original corta los nombres a unos 46 mm: dos renglones parejos, no uno largo y uno corto. */
    max-width: 46mm;
    overflow-wrap: anywhere;
  }
  .plato .dish.large { font-size: 11.7pt; }
  .plato .dish.small { font-size: 9.8pt; }
  .plato .side {
    font-family: 'Crimson Pro', 'Minion Pro', Georgia, serif;
    font-style: italic;
    font-size: 11.7pt;
    line-height: 1.1;
  }
  .plato .foot {
    margin-top: 0.6mm;
    font-family: 'Source Sans 3', 'Myriad Pro', Arial, sans-serif;
    font-size: 10.6pt;
    line-height: 1.1;
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
  )}</title><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${FONTS}"><style>${css(preview)}</style></head><body>${sheets.join('')}</body></html>`;
}
