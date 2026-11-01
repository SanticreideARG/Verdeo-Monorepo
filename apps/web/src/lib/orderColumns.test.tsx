import { describe, expect, it } from 'vitest';

import type { OrderSummary } from './operations.js';
import { buildOrderColumns, zoneOf } from './orderColumns.js';

const order = (fields: Pick<OrderSummary, 'deliveryDayText' | 'deliveryZone'>) =>
  fields as OrderSummary;

describe('columna Zona', () => {
  const zona = buildOrderColumns().find((column) => column.key === 'zona');

  it('muestra la zona escrita en el pedido', () => {
    const conZona = order({ deliveryDayText: 'Centro', deliveryZone: null });
    expect(zona?.render(conZona)).toBe('Centro');
    expect(zona?.sortValue?.(conZona)).toBe('Centro');
  });

  it('sin zona escrita usa la del domicilio, y si no hay ninguna, un guión', () => {
    expect(zoneOf(order({ deliveryDayText: '  ', deliveryZone: 'Norte' }))).toBe('Norte');
    expect(zona?.render(order({ deliveryDayText: null, deliveryZone: null }))).toBe('—');
  });
});
