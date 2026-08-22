import * as XLSX from 'xlsx';

import type { ProductionSnapshotSchema } from '@verdeo/contracts';
import type { z } from 'zod';

type ProductionSnapshot = z.infer<typeof ProductionSnapshotSchema>;

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

export function buildProductionExcel(snapshot: ProductionSnapshot): Uint8Array {
  const { actuals, base, delta } = snapshot.payload;
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
      'Producción real': actualByKey.get(key) ?? '',
      Tamaño: line.variantName,
      'Unidades planificadas': line.quantityUnits,
    };
  });

  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, 'Producción base');

  if (snapshot.payload.custom.length > 0) {
    const customSheet = XLSX.utils.json_to_sheet(
      snapshot.payload.custom.map((item) => ({
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

  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as Uint8Array;
}

export function buildProductionWhatsAppText(snapshot: ProductionSnapshot): string {
  const { actuals, base, custom, cycle, delta, totalUnits } = snapshot.payload;
  const actualByKey = new Map(
    actuals.map((actual) => [
      lineLabel(actual.familyName, actual.variantName),
      actual.quantityUnits,
    ]),
  );
  const deltaByKey = new Map(
    (delta ?? []).map((line) => [lineLabel(line.familyName, line.variantName), line.deltaUnits]),
  );

  const kindLabel =
    snapshot.kind === 'partial' ? 'Parcial (martes 20:00)' : 'Final (miércoles 19:00)';
  const lines = [`*Producción — ${cycle.alias}*`, `_${kindLabel}_`, ''];

  for (const line of base) {
    const key = lineLabel(line.familyName, line.variantName);
    const actual = actualByKey.get(key);
    const deltaUnits = deltaByKey.get(key);
    let text = `• ${line.familyName} ${line.variantName}: ${line.quantityUnits}`;
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

  lines.push('', `*Total: ${totalUnits} unidades*`);
  return lines.join('\n');
}

export function buildProductionPrintHtml(snapshot: ProductionSnapshot): string {
  const { actuals, base, custom, cycle, delta, totalUnits } = snapshot.payload;
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

  const kindLabel =
    snapshot.kind === 'partial' ? 'Parcial (martes 20:00)' : 'Final (miércoles 19:00)';

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
  <p class="subtitle">${kindLabel} · generado ${escape(snapshot.generatedAt)}</p>
  <table>
    <thead><tr><th>Familia</th><th>Tamaño</th><th>Planificado</th><th>Real</th><th>Delta</th><th>Excepciones</th></tr></thead>
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
  <p class="total">Total: ${totalUnits} unidades</p>
</body>
</html>`;
}
