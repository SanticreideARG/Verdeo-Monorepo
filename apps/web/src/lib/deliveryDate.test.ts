import { describe, expect, it } from 'vitest';

import { deliveryDateFor, deliveryDateLabel } from './deliveryDate.js';

describe('deliveryDateFor', () => {
  it('devuelve el día argentino de un cierre que en UTC ya es el día siguiente', () => {
    /*
     * El caso real: la semana "Septiembre 2" cierra el domingo 13 a las 23:15 de Argentina, que se
     * guarda como 2026-09-14T02:15:00Z. Recortar el ISO daba "2026-09-14", así que el selector de
     * período decía "07-sept al 13-sept" y los sesenta pedidos de esa semana salían con entrega el
     * 14. El mismo período decía dos fechas distintas según dónde se lo mirara.
     */
    expect(deliveryDateFor('2026-09-14T02:15:00.000Z')).toBe('2026-09-13');
  });

  it('no corre la fecha cuando el cierre es de día', () => {
    expect(deliveryDateFor('2026-09-13T15:00:00.000Z')).toBe('2026-09-13');
  });

  it('devuelve el formato que el contrato espera para una fecha sin hora', () => {
    expect(deliveryDateFor('2026-01-05T12:00:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('deliveryDateLabel', () => {
  it('escribe el mismo día que devuelve deliveryDateFor', () => {
    // Si se separaran, el formulario mostraría un día y guardaría otro.
    expect(deliveryDateLabel('2026-09-14T02:15:00.000Z')).toContain('13');
    expect(deliveryDateLabel('2026-09-14T02:15:00.000Z')).toContain('septiembre');
  });
});
