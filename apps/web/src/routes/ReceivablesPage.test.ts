import { describe, expect, it } from 'vitest';

import { debtAge, reminderText, type Receivable } from './ReceivablesPage.js';

describe('Por cobrar', () => {
  it('dice desde cuándo se debe', () => {
    expect(debtAge('2026-10-20', '2026-10-21')).toBe('desde esta semana');
    expect(debtAge('2026-10-16', '2026-10-21')).toBe('hace 5 días');
    expect(debtAge('2026-10-07', '2026-10-21')).toBe('hace 2 semanas');
    expect(debtAge(null, '2026-10-21')).toBe('');
  });

  it('arma el aviso con cada pedido y el total', () => {
    const receivable: Receivable = {
      customer: { displayName: 'Ana Pérez', id: 'c', phone: null, whatsapp: '2994000000' },
      oldestDeliveryDate: '2026-10-07',
      orders: [
        {
          currency: 'ARS',
          cycleAlias: 'Octubre 2',
          cycleCloseAt: '2026-10-05T02:00:00.000Z',
          deliveryDate: '2026-10-07',
          id: 'o',
          items: 'Keto 400 × 1',
          paymentExpectation: 'Transferencia',
          publicNumber: 'NQN-00012',
          status: 'DELIVERED',
          totalMinor: 8_500_000,
        },
      ],
      totalMinor: 8_500_000,
    };

    const text = reminderText(receivable);

    expect(text).toContain('¡Hola Ana!');
    expect(text).toContain('NQN-00012');
    expect(text).toContain('Keto 400 × 1');
    expect(text).toMatch(/Total: \$\s?85\.000/);
  });
});
