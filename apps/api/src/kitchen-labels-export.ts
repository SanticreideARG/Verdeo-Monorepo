import type { KitchenLabel, LabelSettings } from '@verdeo/contracts';
import { elaborationLabel, labelCanvas } from '@verdeo/orders';

function escape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}

/** "KETO ELAB # 24-09", o "KETO 400 ELAB # 24-09" si se muestra el tamaño. */
export function kitchenLabelFooter(
  label: Pick<KitchenLabel, 'abbreviation' | 'sizeName'>,
  elaboratedOn: string,
): string {
  return `${label.abbreviation}${label.sizeName ? ` ${label.sizeName}` : ''} ELAB # ${elaborationLabel(elaboratedOn)}`;
}

/**
 * La hoja de etiquetas de cocina, lista para imprimir.
 *
 * Diseño fijo, el de la hoja de producción: logo arriba, el plato en mayúsculas con letra con serif,
 * el acompañamiento debajo en cursiva y el pie "KETO ELAB # 24-09" en letra sin serif. Usa la hoja
 * del formato guardado (tamaño, márgenes, separación, etiquetas por hoja), así que con 24 por hoja
 * coincide con los stickers troquelados de 3 × 8. La última hoja queda con los lugares que sobran
 * en blanco.
 */
export function buildKitchenLabelsPrintHtml(
  labels: readonly KitchenLabel[],
  settings: Pick<
    LabelSettings,
    | 'fontScale'
    | 'labelGapMm'
    | 'labelsPerPage'
    | 'sheetHeightMm'
    | 'sheetMarginMm'
    | 'sheetWidthMm'
    | 'showBorders'
    | 'showLogo'
  >,
  elaboratedOn: string,
  appOrigin?: string,
): string {
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
  const logo =
    settings.showLogo && appOrigin
      ? `<img class="logo" src="${escape(appOrigin)}/brand/verdeo-icon-128.webp" alt="" />`
      : '';
  const cards = labels
    .map(
      (label) => `<div class="label">
        ${logo}
        <div class="text">
          <p class="dish">${escape(label.dish)}</p>
          ${label.side ? `<p class="side">${escape(label.side)}</p>` : ''}
          ${label.customerName ? `<p class="who">${escape(label.customerName)}</p>` : ''}
        </div>
        <p class="foot">${escape(kitchenLabelFooter(label, elaboratedOn))}</p>
      </div>`,
    )
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Etiquetas de cocina · elaboración ${escape(elaborationLabel(elaboratedOn))}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: ${settings.sheetMarginMm}mm; color: #222; }
  .grid {
    display: grid;
    grid-template-columns: repeat(${canvas.columns}, ${canvas.widthMm.toFixed(2)}mm);
    grid-auto-rows: ${canvas.heightMm.toFixed(2)}mm;
    gap: ${settings.labelGapMm}mm;
    justify-content: center;
  }
  .label {
    display: grid;
    grid-template-rows: auto 1fr auto;
    justify-items: center;
    align-items: center;
    padding: 1.5mm 2mm;
    text-align: center;
    overflow: hidden;
    border: ${settings.showBorders ? '1px dashed #999' : 'none'};
    border-radius: 3px;
  }
  .logo { height: ${(7 * scale).toFixed(1)}mm; width: auto; }
  .text { display: grid; gap: 0.4mm; align-content: center; }
  .dish {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: ${(8.5 * scale).toFixed(1)}pt;
    line-height: 1.15;
    text-transform: uppercase;
  }
  .side {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: ${(8.5 * scale).toFixed(1)}pt;
    font-style: italic;
    line-height: 1.15;
  }
  .who {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    font-size: ${(7 * scale).toFixed(1)}pt;
    font-weight: 700;
  }
  .foot {
    margin: 0;
    font-family: Arial, Helvetica, sans-serif;
    font-size: ${(7 * scale).toFixed(1)}pt;
    letter-spacing: 0.02em;
  }
  .label:nth-child(${settings.labelsPerPage}n) { break-after: page; }
  @media print {
    body { padding: ${settings.sheetMarginMm}mm; }
    ${settings.showBorders ? '.label { border-style: solid; }' : ''}
  }
  @page { size: ${settings.sheetWidthMm}mm ${settings.sheetHeightMm}mm; margin: 0; }
</style>
</head>
<body>
  <div class="grid">${cards}</div>
</body>
</html>`;
}
