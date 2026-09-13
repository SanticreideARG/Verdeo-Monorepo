import type { Label, LabelField, LabelSettings } from '@verdeo/contracts';
import { labelCanvas } from '@verdeo/orders';

/**
 * Same adapter choice as production-export.ts: "PDF" is a print-ready HTML page, not a generated
 * binary — the browser's print dialog is the PDF adapter, so no PDF-rendering library ever enters
 * the Vercel Function bundle for this either.
 */

function escape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}

export function labelsExportFilenameBase(scopeLabel: string): string {
  return `etiquetas-${scopeLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
}

/** Familias de sistema: la etiqueta se imprime sin depender de descargar una fuente. */
const FONT_STACKS: Record<LabelSettings['fontFamily'], string> = {
  condensed: '"Arial Narrow", "Roboto Condensed", "Liberation Sans Narrow", sans-serif',
  mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
  rounded: '"SF Pro Rounded", "Nunito", "Segoe UI", system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  system: 'system-ui, sans-serif',
};

function shortDate(iso: string): string {
  // Fecha sola, leída como local: la entrega es un día, no un instante, y parsearla como UTC la
  // corría un día para atrás en Argentina.
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' }).format(
    new Date(`${iso}T00:00:00`),
  );
}

/**
 * Cómo se imprime cada campo, y con qué peso.
 *
 * `destacado` es el segundo renglón grande —el que se lee de lejos junto con el nombre—; el resto va
 * chico. Un campo que no tiene valor devuelve null y no ocupa lugar: una etiqueta con "Zona: —" es
 * peor que una sin zona.
 */
const FIELD_RENDERERS: Record<
  LabelField,
  { render: (label: Label) => string | null; weight: 'destacado' | 'menor' }
> = {
  entrega: { render: (label) => shortDate(label.deliveryDate), weight: 'menor' },
  numero: { render: (label) => label.orderPublicNumber, weight: 'menor' },
  restricciones: {
    render: (label) =>
      label.dietaryInstructions.length > 0 ? label.dietaryInstructions.join(' · ') : null,
    weight: 'destacado',
  },
  tamano: { render: (label) => label.variantName, weight: 'destacado' },
  // Sólo cuando hay más de una: "1 de 1" no le dice nada a nadie.
  unidad: {
    render: (label) =>
      label.unitTotal > 1 ? `${String(label.unitIndex)} de ${String(label.unitTotal)}` : null,
    weight: 'menor',
  },
  variedad: { render: (label) => label.familyName, weight: 'destacado' },
  zona: { render: (label) => label.deliveryZone, weight: 'menor' },
};

export function buildLabelsPrintHtml(
  labels: readonly Label[],
  settings: Pick<
    LabelSettings,
    | 'alignment'
    | 'backgroundImageUrl'
    | 'fields'
    | 'fontFamily'
    | 'fontScale'
    | 'labelGapMm'
    | 'labelsPerPage'
    | 'sheetHeightMm'
    | 'sheetMarginMm'
    | 'sheetWidthMm'
    | 'showBorders'
    | 'uppercaseName'
  >,
  title: string,
): string {
  /*
   * El lienzo real de cada etiqueta: hoja menos márgenes, dividido por la grilla. Antes la hoja era
   * A4 escrita acá adentro (297 - 24), así que cambiar de hoja obligaba a tocar el código.
   */
  const canvas = labelCanvas(
    {
      gapMm: settings.labelGapMm,
      heightMm: settings.sheetHeightMm,
      marginMm: settings.sheetMarginMm,
      widthMm: settings.sheetWidthMm,
    },
    settings.labelsPerPage,
  );
  /*
   * El fondo va en la hoja de estilos, no en un atributo `style` de cada etiqueta.
   *
   * Estaba inline con `JSON.stringify(url)`, que envuelve la URL en comillas dobles — las mismas que
   * delimitan el atributo. El navegador cortaba el atributo ahí y el fondo no se aplicaba nunca:
   * la URL aparecía en el HTML, así que revisar el HTML no lo delataba.
   *
   * Acá va entre comillas simples y con las comillas simples de la URL escapadas, que es lo que CSS
   * necesita. Además no se repite una vez por etiqueta.
   */
  const backgroundRule = settings.backgroundImageUrl
    ? `.label {
    background-image: url('${settings.backgroundImageUrl.replace(/'/g, "\\'")}');
    background-size: cover;
    background-position: center;
  }`
    : '';
  const scale = settings.fontScale / 100;
  const fontStack = FONT_STACKS[settings.fontFamily] ?? FONT_STACKS.system;

  /*
   * El nombre encabeza siempre y no se puede apagar: es lo único que responde de quién es la vianda,
   * que es la pregunta que la etiqueta existe para contestar. Lo demás sale de Ajustes, en el orden
   * en que se guardó.
   */
  const cards = labels
    .map((label) => {
      const extras = settings.fields
        .map((field) => {
          const spec = FIELD_RENDERERS[field];
          const value = spec.render(label);
          return value === null ? '' : `<p class="${spec.weight}">${escape(value)}</p>`;
        })
        .join('');
      return `<div class="label">
        <p class="customer">${escape(label.customerDisplayName)}</p>
        ${extras}
      </div>`;
    })
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escape(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ${fontStack}; margin: 0; padding: ${settings.sheetMarginMm}mm; color: #111; }
  .grid {
    display: grid;
    grid-template-columns: repeat(${canvas.columns}, ${canvas.widthMm.toFixed(2)}mm);
    grid-auto-rows: ${canvas.heightMm.toFixed(2)}mm;
    gap: ${settings.labelGapMm}mm;
    justify-content: center;
  }
  .label {
    border: ${settings.showBorders ? '1px dashed #999' : 'none'};
    border-radius: 4px;
    padding: 4mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: ${settings.alignment === 'left' ? 'flex-start' : 'center'};
    text-align: ${settings.alignment};
    overflow: hidden;
    /* Sin esto el navegador descarta el fondo al imprimir, que es exactamente lo que pasaba con el
       PNG cargado en Ajustes: se veía en pantalla y salía en blanco. */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* El nombre manda: es lo que se busca para saber a quién va cada vianda. */
  .customer {
    font-size: ${(20 * scale).toFixed(1)}px;
    font-weight: 700;
    line-height: 1.15;
    margin: 0;
    text-transform: ${settings.uppercaseName ? 'uppercase' : 'none'};
  }
  ${backgroundRule}
  .destacado { font-size: ${(15 * scale).toFixed(1)}px; font-weight: 600; margin: 1mm 0 0; }
  .menor { font-size: ${(10 * scale).toFixed(1)}px; color: #555; margin: 1mm 0 0; }
  .label:nth-child(${settings.labelsPerPage}n) { break-after: page; }
  @media print {
    /* El mismo margen que en pantalla: con 8 mm fijos, la hoja impresa no coincidía con la que se
       había configurado y las etiquetas salían corridas respecto de la vista previa. */
    body { padding: ${settings.sheetMarginMm}mm; }
    /* Punteado en pantalla, sólido al imprimir — pero sólo si hay borde: con el recuadro apagado,
       forzarlo acá lo hacía reaparecer justo en el papel. */
    ${settings.showBorders ? '.label { border-style: solid; }' : ''}
  }
  /* La hoja configurada, y el margen ya lo pone el cuerpo: duplicarlo acá corría todo hacia adentro. */
  @page { size: ${settings.sheetWidthMm}mm ${settings.sheetHeightMm}mm; margin: 0; }
</style>
</head>
<body>
  <div class="grid">${cards}</div>
</body>
</html>`;
}
