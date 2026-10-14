import { describe, expect, it } from 'vitest';

import { deliveryOptions, resolveDeliveryDate, weekdayOf } from './delivery-date.js';

// Domingo 18 de octubre de 2026, 23:15 en Argentina (lunes 19, 02:15 en UTC).
const CIERRE = '2026-10-19T02:15:00Z';

describe('deliveryOptions', () => {
  it('sin días configurados, el reparto es el día del cierre', () => {
    expect(deliveryOptions(CIERRE, [])).toEqual([{ date: '2026-10-18', weekday: 0 }]);
  });

  it('cada día configurado da su primera fecha desde el cierre, inclusive', () => {
    // Lunes y miércoles; el domingo del cierre cuenta si está marcado.
    expect(deliveryOptions(CIERRE, [1, 3])).toEqual([
      { date: '2026-10-19', weekday: 1 },
      { date: '2026-10-21', weekday: 3 },
    ]);
    expect(deliveryOptions(CIERRE, [0, 6]).map((option) => option.date)).toEqual([
      '2026-10-18',
      '2026-10-24',
    ]);
  });

  it('no se corre de día por la zona horaria', () => {
    expect(weekdayOf('2026-10-18')).toBe(0);
  });
});

describe('resolveDeliveryDate', () => {
  const opciones = deliveryOptions(CIERRE, [1, 3]);

  it('respeta la fecha pedida si es un día de reparto', () => {
    expect(resolveDeliveryDate(opciones, '2026-10-21', 1)).toBe('2026-10-21');
  });

  it('si no, usa el día por defecto, y si no hay, el primero', () => {
    expect(resolveDeliveryDate(opciones, '2026-10-20', 3)).toBe('2026-10-21');
    expect(resolveDeliveryDate(opciones, null, null)).toBe('2026-10-19');
  });
});
