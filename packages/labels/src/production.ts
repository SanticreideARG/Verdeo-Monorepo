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
 * El tamaño del plato, como en producción: entre 12 y 10 pt según la cantidad de texto, el más
 * grande con el que entra en dos renglones (de a medio punto). Cuántos renglones ocupa depende de la
 * tipografía, así que se mide en la hoja ya cargada (FIT_SCRIPT); la clase inicial es la estimación
 * para cuando no corre.
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
      var box = el.parentElement;
      var side = box.querySelector('.side');
      function fitsIn(maxLines) {
        var used = 0;
        for (var c = box.firstElementChild; c; c = c.nextElementSibling) used += c.getBoundingClientRect().height;
        return lines(el) <= maxLines && used <= box.getBoundingClientRect().height + 0.5;
      }
      function fits() { return fitsIn(2); }
      function fits3() { return fitsIn(3); }
      for (var size = 12; size >= 10; size -= 0.5) {
        el.style.fontSize = size + 'pt';
        if (fits()) return;
      }
      // Para un nombre largo, primero se achica el acompañamiento.
      for (var s = 11.5; side && s >= 10 && !fits(); s -= 0.5) side.style.fontSize = s + 'pt';
      if (fits()) return;
      /*
       * Un nombre muy largo ("Sorrentinos integrales de calabaza, roquefort y cebolla
       * caramelizada") va en tres renglones, un poco más juntos, antes que en letra diminuta:
       * con dos renglones como máximo se achicaba hasta 6 pt y no se leía (2026-10-29).
       */
      el.style.lineHeight = '1.1';
      if (side) side.style.lineHeight = '1.1';
      for (var t = 10; t >= 8.5; t -= 0.5) {
        el.style.fontSize = t + 'pt';
        if (side) side.style.fontSize = Math.min(10, t) + 'pt';
        if (fits3()) return;
      }
      // Si el teléfono agrandó el texto (el tamaño de letra del sistema), se sigue achicando todo
      // hasta que entre: una etiqueta de medida fija no puede crecer (2026-10-25).
      for (var k = 8; k >= 4 && !fits3(); k -= 0.5) {
        el.style.fontSize = k + 'pt';
        if (side) side.style.fontSize = Math.min(10, k + 1) + 'pt';
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

/** La "×" de la vista previa avisa a la página que la contiene qué etiqueta sacar. */
const REMOVE_SCRIPT = `<script>
document.addEventListener('click', function (event) {
  var button = event.target.closest && event.target.closest('.remove');
  if (button) parent.postMessage({ type: 'verdeo-label-remove', key: button.getAttribute('data-key') }, '*');
});
</script>`;

const FONTS =
  'https://fonts.googleapis.com/css2?family=Crimson+Pro:ital,wght@1,400&family=Source+Sans+3:wght@400&family=Source+Serif+4:opsz,wght@8..60,400;8..60,500&display=swap';

function css(preview: boolean): string {
  const p = PRODUCTION_PAPER;
  return `
  @page { size: ${String(p.pageWidthMm)}mm ${String(p.pageHeightMm)}mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: ${preview ? '#e8e8e8' : '#fff'}; }
  /*
   * Sin agrandar el texto: en un teléfono, el navegador agranda solo el texto de una página ancha
   * mostrada en poco espacio, y en una etiqueta de medida fija un nombre agrandado quedaba con una
   * o dos letras por renglón, leyéndose en vertical (2026-10-25).
   */
  html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; color: #231f20; }
  .sheet {
    position: relative;
    width: ${String(p.pageWidthMm)}mm;
    height: ${String(p.pageHeightMm)}mm;
    background: #fff;
    overflow: hidden;
    break-inside: avoid;
    page-break-after: always;
    break-after: page;
    ${preview ? 'margin: 0 auto 8mm; box-shadow: 0 1px 6px rgb(0 0 0 / 25%);' : ''}
  }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  /* Lo que corre el ajuste de la impresora: todas las etiquetas de la hoja juntas. */
  .frame { position: absolute; inset: 0; transform-origin: 0 0; }
  .cell {
    position: absolute;
    width: ${String(p.labelWidthMm)}mm;
    height: ${String(p.labelHeightMm)}mm;
    overflow: hidden;
    break-inside: avoid;
    ${preview ? 'outline: 0.2mm dashed #c9c9c9;' : ''}
  }
  .cell.empty { ${preview ? 'background: repeating-linear-gradient(45deg, #fafafa 0 2mm, #f0f0f0 2mm 4mm);' : ''} }
  .cell.printed { ${preview ? 'outline: 0.5mm solid #d98e04;' : ''} }
  /* La "×" para sacar una etiqueta de la tanda: sólo en la vista previa y al pasar por encima. */
  .cell .remove {
    display: none;
    position: absolute;
    top: 0.8mm;
    right: 0.8mm;
    z-index: 2;
    width: 5mm;
    height: 5mm;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: #b42318;
    color: #fff;
    font: 700 3.6mm/5mm Arial, sans-serif;
    cursor: pointer;
  }
  .cell:hover .remove { display: block; }

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
    top: 11.8mm;
    /* Con el pie a 11 pt, deja un respiro entre el texto y el pie. */
    bottom: 7.2mm;
    left: 2mm;
    right: 2mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .plato .dish {
    font-family: 'Source Serif Variable', 'Source Serif 4', 'Source Serif Pro', Georgia, serif;
    font-weight: 400;
    /* El original es Source Serif Pro: el diseño de texto, no el de tamaños chicos, que es más ancho. */
    font-optical-sizing: none;
    line-height: 1.2;
    max-width: 56mm;
    /* Se parte entre palabras; una palabra sola sólo si no entra entera (antes se partía en
       cualquier letra, y con el texto agrandado quedaba una letra por renglón). */
    overflow-wrap: break-word;
  }
  .plato .dish.large { font-size: 12pt; }
  .plato .dish.small { font-size: 10pt; }
  .plato .side {
    max-width: 56mm;
    /*
     * Minion y Myriad son de Adobe: no se pueden incrustar. Se piden por nombre —si están
     * instaladas en la compu que imprime, se usan— y si no, sus equivalentes libres.
     */
    font-family: 'Minion Variable Concept', 'Minion Pro', 'Crimson Pro', Georgia, serif;
    font-style: italic;
    font-size: 12pt;
    line-height: 1.2;
  }
  .plato .foot {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 2.1mm;
    font-family: 'Myriad Pro', 'Source Sans 3', Arial, sans-serif;
    font-size: 11pt;
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
  /*
   * El texto girado se escribe en vertical (writing-mode) y se da vuelta, y no girando una caja
   * acostada: así su caja queda siempre adentro de la etiqueta. La caja girada quedaba, antes de
   * girar, colgando debajo de la etiqueta, y al imprimir el navegador la cortaba entre páginas y la
   * corría de lugar (2026-10-23).
   */
  .menu .turn {
    position: absolute;
    left: 34mm;
    top: 0;
    width: 29mm;
    height: ${String(p.labelHeightMm)}mm;
    padding: 3.4mm 0;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
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
 * El ajuste de la impresora (2026-10-29). Con el PDF a tamaño real, una impresión salió igual
 * corrida: las etiquetas de arriba bajaban hasta pisar el borde y las de abajo calzaban. Cada
 * impresora arrastra el papel y escala a su manera, y eso no se arregla desde el PDF: se mide con la
 * hoja de prueba y se corrige acá. Corre todo el contenido de la hoja junto, nunca una etiqueta sola.
 */
export interface PrintCalibration {
  /** Milímetros hacia la derecha (negativo: hacia la izquierda). */
  offsetXMm: number;
  /** Milímetros hacia abajo (negativo: hacia arriba). */
  offsetYMm: number;
  /** Escala vertical en %: 100 es tamaño real. Más de 100 separa las filas. */
  scaleYPercent: number;
  /** Escala horizontal en %. */
  scaleXPercent: number;
}

export const NO_CALIBRATION: PrintCalibration = {
  offsetXMm: 0,
  offsetYMm: 0,
  scaleXPercent: 100,
  scaleYPercent: 100,
};

/** Un ajuste guardado, acotado a lo razonable: un valor raro no puede mandar la hoja afuera. */
export function normalizeCalibration(value: Partial<PrintCalibration> | null | undefined) {
  const clamp = (raw: unknown, min: number, max: number, fallback: number) => {
    const number = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
    return Math.min(max, Math.max(min, number));
  };
  return {
    offsetXMm: clamp(value?.offsetXMm, -10, 10, 0),
    offsetYMm: clamp(value?.offsetYMm, -10, 10, 0),
    scaleXPercent: clamp(value?.scaleXPercent, 90, 110, 100),
    scaleYPercent: clamp(value?.scaleYPercent, 90, 110, 100),
  } satisfies PrintCalibration;
}

function frameStyle(calibration: PrintCalibration | undefined): string {
  if (!calibration) return '';
  const c = normalizeCalibration(calibration);
  if (c.offsetXMm === 0 && c.offsetYMm === 0 && c.scaleXPercent === 100 && c.scaleYPercent === 100)
    return '';
  return ` style="transform:translate(${String(c.offsetXMm)}mm,${String(c.offsetYMm)}mm) scale(${String(
    c.scaleXPercent / 100,
  )},${String(c.scaleYPercent / 100)})"`;
}

/**
 * La hoja de prueba: el contorno de cada una de las 24 etiquetas, con su número y una cruz al
 * centro. Se imprime en una hoja común y se pone a contraluz sobre una de etiquetas: lo que no
 * calce se corrige con el ajuste, y se vuelve a imprimir hasta que calce.
 */
export function renderCalibrationSheet(calibration?: PrintCalibration): string {
  const p = PRODUCTION_PAPER;
  const cells = Array.from({ length: LABELS_PER_SHEET }, (_, index) => {
    const column = index % p.columns;
    const row = Math.floor(index / p.columns);
    const left = p.marginLeftMm + column * (p.labelWidthMm + p.gapXMm);
    const top = p.marginTopMm + row * p.labelHeightMm;
    return `<div class="cell probe" style="left:${left.toFixed(2)}mm;top:${top.toFixed(2)}mm"><span>${String(index + 1)}</span></div>`;
  }).join('');
  const probe = `
  .probe { outline: 0.25mm solid #000; outline-offset: -0.125mm; }
  .probe::before, .probe::after { content: ''; position: absolute; background: #000; }
  .probe::before { left: 50%; top: 40%; width: 0.25mm; height: 20%; }
  .probe::after { top: 50%; left: 45%; height: 0.25mm; width: 10%; }
  .probe span { position: absolute; top: 2mm; left: 3mm; font: 10pt Arial, sans-serif; }`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Hoja de prueba</title><style>${css(false)}${probe}</style></head><body><section class="sheet"><div class="frame"${frameStyle(calibration)}>${cells}</div></section><script>document.documentElement.setAttribute('data-fitted','')</script></body></html>`;
}

/**
 * La tanda lista para imprimir: hojas A4 con las etiquetas en sus posiciones del papel. `startAt`
 * deja libres las primeras posiciones de la primera hoja, para aprovechar una hoja ya usada.
 * `printedKeys` (sólo en la vista previa) marca las que ya se imprimieron.
 */
export function renderProductionSheets(options: {
  /** El ajuste de la impresora: sólo al imprimir, la vista previa muestra la hoja tal cual. */
  calibration?: PrintCalibration;
  labels: readonly ProductionLabel[];
  preview?: boolean;
  printedKeys?: ReadonlySet<string>;
  /** Sólo en la vista previa: una "×" en cada etiqueta que avisa a la página cuál sacar. */
  removable?: boolean;
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
        const remove =
          label && preview && options.removable
            ? `<button class="remove" data-key="${escape(label.key)}" title="Sacar de la tanda" type="button">×</button>`
            : '';
        return `<div class="cell${label ? '' : ' empty'}${printed}" style="left:${left.toFixed(2)}mm;top:${top.toFixed(2)}mm">${remove}${body}</div>`;
      })
      .join('');
    sheets.push(
      `<section class="sheet"><div class="frame"${preview ? '' : frameStyle(options.calibration)}>${html}</div></section>`,
    );
  }
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escape(
    options.title ?? 'Etiquetas',
  )}</title><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${FONTS}"><style>${css(preview)}</style></head><body>${sheets.join('')}${FIT_SCRIPT}${
    preview && options.removable ? REMOVE_SCRIPT : ''
  }</body></html>`;
}
