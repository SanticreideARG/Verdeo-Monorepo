import type { Label, LabelField, LabelSettings } from '@verdeo/contracts';

/**
 * Same adapter choice as production-export.ts: "PDF" is a print-ready HTML page, not a generated
 * binary — the browser's print dialog is the PDF adapter, so no PDF-rendering library ever enters
 * the Vercel Function bundle for this either.
 */

const GRID_BY_LABELS_PER_PAGE: Record<number, { columns: number; rows: number }> = {
  4: { columns: 2, rows: 2 },
  5: { columns: 3, rows: 2 },
  6: { columns: 2, rows: 3 },
  7: { columns: 3, rows: 3 },
  8: { columns: 2, rows: 4 },
  9: { columns: 3, rows: 3 },
  10: { columns: 2, rows: 5 },
  11: { columns: 3, rows: 4 },
  12: { columns: 3, rows: 4 },
};

function labelGrid(labelsPerPage: number): { columns: number; rows: number } {
  return (
    GRID_BY_LABELS_PER_PAGE[labelsPerPage] ?? {
      columns: Math.ceil(Math.sqrt(labelsPerPage)),
      rows: Math.ceil(labelsPerPage / Math.ceil(Math.sqrt(labelsPerPage))),
    }
  );
}

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
    | 'labelsPerPage'
    | 'showBorders'
    | 'uppercaseName'
  >,
  title: string,
): string {
  const { columns, rows } = labelGrid(settings.labelsPerPage);
  const backgroundStyle = settings.backgroundImageUrl
    ? `background-image: url(${JSON.stringify(settings.backgroundImageUrl)}); background-size: cover; background-position: center;`
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
      return `<div class="label" style="${backgroundStyle}">
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
  body { font-family: ${fontStack}; margin: 0; padding: 12mm; color: #111; }
  .grid {
    display: grid;
    grid-template-columns: repeat(${columns}, 1fr);
    grid-auto-rows: ${(297 - 24) / rows}mm;
    gap: 4mm;
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
  .destacado { font-size: ${(15 * scale).toFixed(1)}px; font-weight: 600; margin: 1mm 0 0; }
  .menor { font-size: ${(10 * scale).toFixed(1)}px; color: #555; margin: 1mm 0 0; }
  .label:nth-child(${settings.labelsPerPage}n) { break-after: page; }
  @media print {
    body { padding: 8mm; }
    /* Punteado en pantalla, sólido al imprimir — pero sólo si hay borde: con el recuadro apagado,
       forzarlo acá lo hacía reaparecer justo en el papel. */
    ${settings.showBorders ? '.label { border-style: solid; }' : ''}
  }
  @page { size: A4; margin: 8mm; }
</style>
</head>
<body>
  <div class="grid">${cards}</div>
</body>
</html>`;
}
