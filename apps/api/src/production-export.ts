import * as XLSX from 'xlsx';

import type { ProductionSnapshotSchema } from '@verdeo/contracts';
import type { z } from 'zod';

type ProductionSnapshot = z.infer<typeof ProductionSnapshotSchema>;

/**
 * Lo que se exporta, venga de un snapshot congelado o del consolidado en vivo.
 *
 * Los dos informes son el mismo informe: uno se sacó el martes a las 20:00 y el otro es lo que hay
 * ahora. `actuals` y `delta` sólo tienen contenido en el congelado —producción real informada y
 * cuánto se movió contra el parcial—, y en el vivo llegan vacíos, que es más simple que sostener
 * dos juegos de constructores para la misma tabla.
 */
export interface ProductionReport {
  actuals: ProductionSnapshot['payload']['actuals'];
  base: ProductionSnapshot['payload']['base'];
  custom: ProductionSnapshot['payload']['custom'];
  cycle: ProductionSnapshot['payload']['cycle'];
  delta: ProductionSnapshot['payload']['delta'];
  dishTally: ProductionSnapshot['payload']['dishTally'];
  /** "Parcial (martes 20:00)", "Final" o "Consolidado al momento". */
  subtitle: string;
  totalOrders: number;
  totalUnits: number;
}

export function reportFromSnapshot(snapshot: ProductionSnapshot): ProductionReport {
  return {
    ...snapshot.payload,
    subtitle: snapshot.kind === 'partial' ? 'Parcial (martes 20:00)' : 'Final (miércoles 19:00)',
  };
}

/**
 * Turns a stored production snapshot into the three hand-off formats the spec asks for
 * (WEEKLY_MENU_AND_PRODUCTION.md "Snapshots"): Excel for the kitchen sheet, a WhatsApp-ready text
 * block, and a print-ready page. "PDF" is deliberately the print page rather than a generated
 * binary: adding a PDF-rendering library to a Vercel Function bundle for one report is a real
 * dependency and font-bundling risk, and every browser already turns a print-styled page into a
 * PDF via its native print dialog — so that is the adapter here instead of a new one.
 */

function lineLabel(familyName: string, variantName: string): string {
  return `${familyName} ${variantName}`;
}

export function productionSnapshotFilenameBase(snapshot: ProductionSnapshot): string {
  const alias = snapshot.payload.cycle.alias.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return `produccion-${alias}-${snapshot.kind}`;
}

export function buildProductionExcel(report: ProductionReport): ArrayBuffer {
  const { actuals, base, delta } = report;
  const actualByKey = new Map(
    actuals.map((actual) => [
      lineLabel(actual.familyName, actual.variantName),
      actual.quantityUnits,
    ]),
  );
  const deltaByKey = new Map(
    (delta ?? []).map((line) => [lineLabel(line.familyName, line.variantName), line.deltaUnits]),
  );

  const rows = base.map((line) => {
    const key = lineLabel(line.familyName, line.variantName);
    return {
      Delta: delta ? (deltaByKey.get(key) ?? 0) : '',
      Excepciones: line.exceptions
        .map(
          (exception) =>
            `${exception.quantityUnits} (${exception.customerDisplayName} · ${exception.orderPublicNumber}): ${exception.dietaryInstructions.join(' · ')}`,
        )
        .join(' | '),
      Familia: line.familyName,
      // Unidades y pedidos son dos números distintos: ocho unidades pueden ser ocho pedidos de una
      // o dos de cuatro, y eso cambia cuántos paquetes se arman.
      Pedidos: line.orderCount,
      'Producción real': actualByKey.get(key) ?? '',
      Tamaño: line.variantName,
      'Unidades planificadas': line.quantityUnits,
    };
  });

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Producción base');

  // Los platos de los Intuitivos, sumados: es la hoja con la que se va a comprar.
  if (report.dishTally.length > 0) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        report.dishTally.map((entry) => ({
          Plato: entry.dishName,
          Porciones: entry.portions,
        })),
      ),
      'Platos a preparar',
    );
  }

  if (report.custom.length > 0) {
    const customSheet = XLSX.utils.json_to_sheet(
      report.custom.map((item) => ({
        Cliente: item.customerDisplayName,
        Composición: item.dishSelections.join(' · '),
        Familia: item.familyName,
        Indicaciones: item.dietaryInstructions.join(' · '),
        Pedido: item.orderPublicNumber,
        Secuencia: item.sequence,
        Tamaño: item.variantName,
        Unidades: item.quantityUnits,
      })),
    );
    XLSX.utils.book_append_sheet(workbook, customSheet, 'Intuitivos');
  }

  // `type: 'array'` devuelve un ArrayBuffer, no un Uint8Array. Declararlo como Uint8Array era una
  // mentira que el compilador aceptaba y que después hacía leer `.buffer` —undefined en un
  // ArrayBuffer—, así que la respuesta salía vacía: un .xlsx de cero bytes, sin ningún error.
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

export function buildProductionWhatsAppText(report: ProductionReport): string {
  const { actuals, base, custom, cycle, delta, dishTally, totalOrders, totalUnits } = report;
  const actualByKey = new Map(
    actuals.map((actual) => [
      lineLabel(actual.familyName, actual.variantName),
      actual.quantityUnits,
    ]),
  );
  const deltaByKey = new Map(
    (delta ?? []).map((line) => [lineLabel(line.familyName, line.variantName), line.deltaUnits]),
  );

  const lines = [`*Producción — ${cycle.alias}*`, `_${report.subtitle}_`, ''];

  for (const line of base) {
    const key = lineLabel(line.familyName, line.variantName);
    const actual = actualByKey.get(key);
    const deltaUnits = deltaByKey.get(key);
    let text = `• ${line.familyName} ${line.variantName}: ${line.quantityUnits} (${line.orderCount} ${line.orderCount === 1 ? 'pedido' : 'pedidos'})`;
    if (actual !== undefined) text += ` (real: ${actual})`;
    if (deltaUnits !== undefined) text += ` (Δ ${deltaUnits >= 0 ? '+' : ''}${deltaUnits})`;
    lines.push(text);
    for (const exception of line.exceptions) {
      lines.push(
        `   ⚠ ${exception.quantityUnits} ${exception.customerDisplayName} (${exception.orderPublicNumber}): ${exception.dietaryInstructions.join(', ')}`,
      );
    }
  }

  if (custom.length > 0) {
    lines.push('', '*Intuitivos*');
    for (const item of custom) {
      lines.push(
        `• #${item.sequence} ${item.familyName} ${item.variantName} × ${item.quantityUnits} — ${item.customerDisplayName} (${item.orderPublicNumber}): ${item.dishSelections.join(', ')}`,
      );
    }
  }

  // Los platos van después de los Intuitivos y antes del total: es lo que se lee para ir a comprar,
  // y el detalle de arriba es lo que se consulta después, ya cocinando.
  if (dishTally.length > 0) {
    lines.push('', '*Platos a preparar*');
    for (const entry of dishTally) {
      lines.push(`• ${entry.dishName}: ${entry.portions}`);
    }
  }

  lines.push(
    '',
    `*Total: ${totalUnits} unidades en ${totalOrders} ${totalOrders === 1 ? 'pedido' : 'pedidos'}*`,
  );
  return lines.join('\n');
}

export function buildProductionPrintHtml(report: ProductionReport): string {
  const { actuals, base, custom, cycle, delta, dishTally, totalOrders, totalUnits } = report;
  const actualByKey = new Map(
    actuals.map((actual) => [
      lineLabel(actual.familyName, actual.variantName),
      actual.quantityUnits,
    ]),
  );
  const deltaByKey = new Map(
    (delta ?? []).map((line) => [lineLabel(line.familyName, line.variantName), line.deltaUnits]),
  );
  const escape = (value: string) =>
    value.replace(
      /[&<>"']/g,
      (char) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
    );

  const baseRows = base
    .map((line) => {
      const key = lineLabel(line.familyName, line.variantName);
      const actual = actualByKey.get(key);
      const deltaUnits = deltaByKey.get(key);
      const exceptions = line.exceptions
        .map(
          (exception) =>
            `<div class="exception">${exception.quantityUnits} — ${escape(exception.customerDisplayName)} (${escape(exception.orderPublicNumber)}): ${escape(exception.dietaryInstructions.join(', '))}</div>`,
        )
        .join('');
      return `<tr>
        <td>${escape(line.familyName)}</td>
        <td>${escape(line.variantName)}</td>
        <td>${line.quantityUnits}</td>
        <td>${line.orderCount}</td>
        <td>${actual ?? '—'}</td>
        <td>${deltaUnits === undefined ? '—' : (deltaUnits >= 0 ? '+' : '') + deltaUnits}</td>
        <td>${exceptions}</td>
      </tr>`;
    })
    .join('');

  const customRows = custom
    .map(
      (item) => `<tr>
        <td>#${item.sequence}</td>
        <td>${escape(item.familyName)} ${escape(item.variantName)}</td>
        <td>${item.quantityUnits}</td>
        <td>${escape(item.customerDisplayName)} (${escape(item.orderPublicNumber)})</td>
        <td>${escape(item.dishSelections.join(', '))}</td>
      </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Producción — ${escape(cycle.alias)}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; color: #111; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .subtitle { color: #555; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; font-size: 13px; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; }
  .exception { color: #b00020; font-size: 12px; }
  .total { text-align: right; font-weight: bold; font-size: 15px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>Producción — ${escape(cycle.alias)}</h1>
  <p class="subtitle">${escape(report.subtitle)}</p>
  <table>
    <thead><tr><th>Familia</th><th>Tamaño</th><th>Planificado</th><th>Pedidos</th><th>Real</th><th>Delta</th><th>Excepciones</th></tr></thead>
    <tbody>${baseRows}</tbody>
  </table>
  ${
    custom.length > 0
      ? `<h2>Intuitivos</h2><table>
    <thead><tr><th>#</th><th>Variedad</th><th>Unidades</th><th>Cliente</th><th>Composición</th></tr></thead>
    <tbody>${customRows}</tbody>
  </table>`
      : ''
  }
  ${
    dishTally.length > 0
      ? `<h2>Platos a preparar</h2><table>
    <thead><tr><th>Plato</th><th>Porciones</th></tr></thead>
    <tbody>${dishTally
      .map((entry) => `<tr><td>${escape(entry.dishName)}</td><td>${entry.portions}</td></tr>`)
      .join('')}</tbody>
  </table>`
      : ''
  }
  <p class="total">Total: ${totalUnits} unidades en ${totalOrders} ${totalOrders === 1 ? 'pedido' : 'pedidos'}</p>
</body>
</html>`;
}
