import { describe, expect, it } from 'vitest';

import { deliveryDateFor } from './delivery-date.js';

describe('deliveryDateFor', () => {
  it('toma el día del cierre en hora argentina, no en UTC', () => {
    // El ciclo de septiembre: cierra el domingo 13 a las 23:15, que en UTC ya es lunes 14.
    expect(deliveryDateFor('2026-09-14T02:15:00Z')).toBe('2026-09-13');
    expect(deliveryDateFor(new Date('2026-09-14T02:15:00Z'))).toBe('2026-09-13');
  });

  it('no cambia el día de un cierre temprano', () => {
    expect(deliveryDateFor('2026-08-30T14:30:00Z')).toBe('2026-08-30');
  });

  it('respeta otra zona horaria si se la pide', () => {
    expect(deliveryDateFor('2026-09-14T02:15:00Z', 'UTC')).toBe('2026-09-14');
  });
});
