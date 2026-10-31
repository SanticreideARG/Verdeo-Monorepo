import { findAssistantMode } from '@verdeo/ai';
import { describe, expect, it, vi } from 'vitest';

import { buildAssistantContext, clean, relevantArticles } from './assistant-context.js';

describe('los datos del búho', () => {
  it('saca nombres, contactos e identificadores, y pasa los importes a pesos', () => {
    expect(
      clean({
        cancelled: [
          { customerName: 'Ana', deliveryAddressSnapshot: 'Calle 1', totalMinor: 850_000 },
        ],
        id: 'x',
        operatingSiteId: 'y',
        totals: { orderCount: 3, paidMinor: 1_000_000 },
      }),
    ).toEqual({ cancelled: [{ total: 8_500 }], totals: { orderCount: 3, paid: 10_000 } });
  });

  it('elige los artículos de ayuda que hablan de lo que se pregunta', () => {
    const articles = [
      { body: 'Para pasar un pedido a stock…', category: 'Pedidos', title: 'Stock' },
      { body: 'Las etiquetas se imprimen…', category: 'Cocina', title: 'Etiquetas' },
    ];
    expect(relevantArticles(articles, '¿cómo imprimo las etiquetas?').map((a) => a.titulo)).toEqual(
      ['Etiquetas'],
    );
  });

  it('sin permiso de estadísticas no manda la comparación y lo dice', async () => {
    const getStatsPeriods = vi.fn();
    const context = await buildAssistantContext({
      mode: findAssistantMode('buho_tendencias')!,
      now: new Date('2026-10-30T12:00:00.000Z'),
      permissions: ['ai.use'],
      port: {
        cycleReport: vi.fn(),
        getStatsPeriods,
        kitchenSummary: vi.fn(),
        listHelp: vi.fn(),
        listMenus: () => Promise.resolve([]),
        listReceivables: vi.fn(),
        listStockLots: vi.fn(),
      },
      question: '¿cómo vienen las semanas?',
      siteId: null,
      today: '2026-10-30',
    });
    expect(getStatsPeriods).not.toHaveBeenCalled();
    expect(context.omitted).toContain('la comparación con otros períodos');
    expect(context.text).toContain('Todas las ciudades');
  });
});
