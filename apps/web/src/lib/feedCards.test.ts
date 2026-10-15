import { describe, expect, it, vi } from 'vitest';

import { addDaysIso, todayInOperation } from './dates.js';

const responses: Record<string, unknown> = {};

vi.mock('./api.js', () => ({
  apiRequest: (path: string) => {
    const key = Object.keys(responses).find((prefix) => path.startsWith(prefix));
    const body = key ? responses[key] : null;
    return Promise.resolve({
      json: () => Promise.resolve(body),
      ok: body !== null,
    });
  },
}));

const { loadFeedCards } = await import('./feedCards.js');

describe('loadFeedCards', () => {
  it('arma alertas, agenda y mensajes, cada una con su permiso y una clave por lo que dice', async () => {
    const today = todayInOperation();
    responses['/api/v1/orders/duplicates'] = { groups: [{}, {}] };
    responses['/api/v1/inbound-emails'] = { items: [] };
    responses['/api/v1/orders?status=DRAFT'] = { items: [{}] };
    responses['/api/v1/calendar'] = {
      items: [
        { day: today, done: false, id: 'r1', kind: 'reminder', title: 'Llamar al proveedor' },
        { day: addDaysIso(today, 1), done: false, id: 'c1', kind: 'cycle_close', title: 'Oct 2' },
        { day: today, done: true, id: 'r2', kind: 'reminder', title: 'Ya hecho' },
      ],
    };
    responses['/api/v1/chat/conversations'] = {
      items: [
        { id: 'k1', participants: [{ displayName: 'Ana' }], title: null, unreadCount: 3 },
        { id: 'k2', participants: [{ displayName: 'Beto' }], title: null, unreadCount: 0 },
      ],
    };

    const cards = await loadFeedCards([
      'orders.read',
      'orders.create',
      'orders.confirm',
      'calendar.use',
      'chat.use',
    ]);

    expect(cards.map((card) => [card.kind, card.key, card.text])).toEqual([
      ['alerta', 'duplicados:2', 'clientes con pedidos repetidos en el período'],
      ['alerta', 'borradores:1', 'pedido en borrador sin confirmar'],
      ['agenda', `agenda:r1:${today}`, 'Hoy: Llamar al proveedor'],
      ['agenda', `agenda:c1:${addDaysIso(today, 1)}`, 'Mañana, cierra el período: Oct 2'],
      ['mensajes', 'chat:k1:3', 'mensajes sin leer de Ana'],
    ]);
  });

  it('sin permisos no pide nada ni muestra nada', async () => {
    expect(await loadFeedCards([])).toEqual([]);
  });
});
