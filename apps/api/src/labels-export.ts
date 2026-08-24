import type { Label, LabelSettings } from '@verdeo/contracts';

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

export function buildLabelsPrintHtml(
  labels: readonly Label[],
  settings: Pick<LabelSettings, 'backgroundImageUrl' | 'labelsPerPage'>,
  title: string,
): string {
  const { columns, rows } = labelGrid(settings.labelsPerPage);
  const backgroundStyle = settings.backgroundImageUrl
    ? `background-image: url(${JSON.stringify(settings.backgroundImageUrl)}); background-size: cover; background-position: center;`
    : '';

  const cards = labels
    .map(
      (label) => `<div class="label" style="${backgroundStyle}">
        <p class="variety">${escape(label.familyName)} ${escape(label.variantName)}</p>
        ${label.customerDisplayName ? `<p class="customer">${escape(label.customerDisplayName)}</p>` : ''}
        <p class="order">${escape(label.orderPublicNumber)}</p>
      </div>`,
    )
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escape(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; margin: 0; padding: 12mm; color: #111; }
  .grid {
    display: grid;
    grid-template-columns: repeat(${columns}, 1fr);
    grid-auto-rows: ${(297 - 24) / rows}mm;
    gap: 4mm;
  }
  .label {
    border: 1px dashed #999;
    border-radius: 4px;
    padding: 4mm;
    display: flex;
    flex-direction: column;
    justify-content: center;
    text-align: center;
    overflow: hidden;
  }
  .variety { font-size: 14px; font-weight: 700; margin: 0; }
  .customer { font-size: 13px; margin: 2px 0 0; }
  .order { font-size: 11px; color: #555; margin: 4px 0 0; }
  .label:nth-child(${settings.labelsPerPage}n) { break-after: page; }
  @media print {
    body { padding: 8mm; }
    .label { border-style: solid; }
  }
  @page { size: A4; margin: 8mm; }
</style>
</head>
<body>
  <div class="grid">${cards}</div>
</body>
</html>`;
}
