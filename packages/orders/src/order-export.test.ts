import { describe, expect, it } from 'vitest';

import { buildOrdersCsv } from './order-export.js';

describe('order CSV export', () => {
  it('escapes quotes and delimiters and includes an Excel-compatible BOM', () => {
    const csv = buildOrdersCsv([
      {
        createdAt: new Date('2026-08-19T10:00:00.000Z'),
        currency: 'ARS',
        customerDisplayName: 'Pérez, "María"',
        deliveryAddress: 'Calle 1, piso 2',
        deliveryDate: '2026-08-20',
        deliveryZone: 'Centro',
        paymentExpectation: 'transferencia',
        publicNumber: 'N00001',
        source: 'whatsapp',
        status: 'CONFIRMED',
        totalMinor: 25_000,
      },
    ]);

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Pérez, ""María"""');
    expect(csv).toContain('"25000"');
  });

  it('neutralizes spreadsheet formulas in textual cells', () => {
    const csv = buildOrdersCsv([
      {
        createdAt: '2026-08-19T10:00:00.000Z',
        currency: 'ARS',
        customerDisplayName: '=HYPERLINK("bad")',
        deliveryAddress: '@unsafe',
        deliveryDate: '2026-08-20',
        deliveryZone: null,
        paymentExpectation: 'cash',
        publicNumber: 'N00002',
        source: 'manual',
        status: 'DRAFT',
        totalMinor: 0,
      },
    ]);

    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"\'@unsafe"');
  });
});
