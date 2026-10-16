import { useEffect, useState } from 'react';

import { apiRequest } from '../lib/api.js';
import type { SurplusItem } from '../lib/operations.js';

/**
 * "Sale del stock" en la carga de pedidos (STOCK_PLAN.md, fase 2).
 *
 * Marcada, el pedido es una venta de oportunidad: a precio normal, descuenta de lo disponible del
 * período (el stock cargado en Cocina y lo que sobró de lo cocinado) y no vuelve a sumar a lo que
 * hay que cocinar. Desde ahí es un pedido como cualquiera: cuenta en ventas, va a su reparto, tiene
 * su etiqueta con cliente y entra a las rutas. El servidor rechaza pedir más de lo disponible.
 */
export function StockSaleOption({
  checked,
  cycleId,
  onChange,
}: {
  checked: boolean;
  cycleId: string | null;
  onChange: (checked: boolean) => void;
}) {
  const [available, setAvailable] = useState<SurplusItem[] | null>(null);

  useEffect(() => {
    if (!checked || !cycleId) return;
    let active = true;
    setAvailable(null);
    void apiRequest(`/api/v1/production/${cycleId}/surplus`, { notify: false })
      .then(async (response) => {
        if (!response.ok || !active) return;
        const report = (await response.json()) as { items: SurplusItem[] };
        if (active) setAvailable(report.items.filter((item) => item.disponible > 0));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [checked, cycleId]);

  return (
    <div className="stock-sale field-wide">
      <label className="stock-sale-toggle">
        <input
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span>
          <strong>Sale del stock</strong>
          <small>
            Se vende de lo que ya está cocinado, a precio normal, y descuenta de lo disponible.
          </small>
        </span>
      </label>
      {checked ? (
        available === null ? (
          <p className="stock-sale-list">Mirando qué hay disponible…</p>
        ) : available.length === 0 ? (
          <p className="stock-sale-list stock-sale-empty">
            No hay nada disponible en el stock de este período. Se carga en Cocina → Stock del
            período.
          </p>
        ) : (
          <p className="stock-sale-list">
            Disponible:{' '}
            {available
              .map((item) => `${item.familyName} ${item.variantName}: ${String(item.disponible)}`)
              .join(' · ')}
          </p>
        )
      ) : null}
    </div>
  );
}
