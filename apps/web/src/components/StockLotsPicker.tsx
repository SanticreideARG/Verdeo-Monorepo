import { useEffect, useState } from 'react';

import { apiRequest } from '../lib/api.js';
import type { WeeklyMenu } from '../lib/operations.js';
import { lotsForMenu, type StockLot, type StockPicks } from '../lib/stockLots.js';

/**
 * "Stock de períodos anteriores" en la carga de pedidos (STOCK_LOTS_PLAN.md), debajo de "Sale del
 * stock": los lotes de la ciudad del menú elegido que se pueden vender con ese menú, con lo que
 * queda de cada uno. Se elige cuántas de cada lote; van al pedido como viandas ya cocinadas, a
 * precio normal, y dicen de qué período son.
 */
export function StockLotsPicker({
  menu,
  onChange,
  onLots,
  picks,
}: {
  menu: WeeklyMenu | null;
  onChange: (picks: StockPicks) => void;
  /** Los lotes que se pueden vender con este menú, para armar los ítems al guardar. */
  onLots: (lots: (StockLot & { offeringId: string })[]) => void;
  picks: StockPicks;
}) {
  const [lots, setLots] = useState<(StockLot & { offeringId: string })[]>([]);

  useEffect(() => {
    if (!menu) {
      setLots([]);
      onLots([]);
      return;
    }
    let active = true;
    const city = menu.operatingSiteId ? `&ciudad=${menu.operatingSiteId}` : '';
    void apiRequest(`/api/v1/stock-lots?disponibles=1${city}`, { notify: false })
      .then(async (response) => {
        if (!active || !response.ok) return;
        const items = ((await response.json()) as { items: StockLot[] }).items;
        const usable = lotsForMenu(items, menu.offerings);
        setLots(usable);
        onLots(usable);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
    // `onLots` lo define la página en cada render; lo que cambia lo que se pide es el menú.
  }, [menu]);

  if (lots.length === 0) return null;

  function set(lotId: string, quantity: number) {
    const next = new Map(picks);
    if (quantity > 0) next.set(lotId, quantity);
    else next.delete(lotId);
    onChange(next);
  }

  return (
    <div className="stock-lots field-wide">
      <p className="stock-lots-title">
        <strong>Stock de períodos anteriores</strong>
        <small>Ya cocinado, a precio normal. Se vende hasta un mes después de su período.</small>
      </p>
      <ul>
        {lots.map((lot) => {
          const quantity = picks.get(lot.id) ?? 0;
          return (
            <li key={lot.id}>
              <span>
                {lot.familyName.replace(/^men[uú]\s+/i, '')} {lot.variantName} ·{' '}
                <strong>{lot.cycleAlias}</strong>{' '}
                <small>
                  · {lot.available === 1 ? 'queda 1' : `quedan ${String(lot.available)}`}
                </small>
                {lot.dishes.length > 0 ? (
                  <small className="stock-lot-dishes">
                    {lot.dishes.map((dish) => dish.dishName).join(' · ')}
                  </small>
                ) : null}
              </span>
              <span className="studio-stepper">
                <button
                  aria-label={`Una menos del stock de ${lot.cycleAlias}`}
                  disabled={quantity === 0}
                  onClick={() => set(lot.id, quantity - 1)}
                  type="button"
                >
                  −
                </button>
                <span className="studio-group-count">{quantity}</span>
                <button
                  aria-label={`Una más del stock de ${lot.cycleAlias}`}
                  disabled={quantity >= lot.available}
                  onClick={() => set(lot.id, quantity + 1)}
                  type="button"
                >
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
