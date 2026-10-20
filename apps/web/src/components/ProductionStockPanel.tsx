import { useCallback, useEffect, useState } from 'react';

import { apiRequest } from '../lib/api.js';
import { errorMessage, type MenuOffering, type SurplusItem } from '../lib/operations.js';

interface StockRow {
  familyName: string;
  quantityUnits: number;
  variantName: string;
}

const keyOf = (row: { familyName: string; variantName: string }) =>
  `${row.familyName}::${row.variantName}`;

/**
 * "Stock del período" en Cocina (STOCK_PLAN.md, fase 1).
 *
 * El stock es comida que se cocina para tener a mano y venderla después: no es un pedido ni tiene
 * cliente, así que no suma a ventas, ni a la lista de pedidos, ni a repartos. Sí suma a lo que hay
 * que cocinar y a lo disponible para vender. Es sólo de su período.
 *
 * Una casilla por variedad y tamaño del menú (sin Intuitivo, que se arma por cliente). Guardar
 * reemplaza el stock entero del período; vaciar una casilla lo saca.
 */
export function ProductionStockPanel({
  canEdit,
  cycleId,
  offerings,
  onSaved,
  surplus,
}: {
  canEdit: boolean;
  cycleId: string;
  offerings: readonly MenuOffering[];
  onSaved: () => void;
  surplus: readonly SurplusItem[];
}) {
  const [stock, setStock] = useState<StockRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await apiRequest(`/api/v1/production/${cycleId}/stock`);
    if (response.ok) setStock(((await response.json()) as { items: StockRow[] }).items);
  }, [cycleId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Las variedades del menú, más las que tienen stock y ya no están en él (no se pierden al guardar).
  const rows: StockRow[] = [];
  const seen = new Set<string>();
  for (const offering of offerings) {
    if (offering.composable) continue;
    const key = keyOf(offering);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      familyName: offering.familyName,
      quantityUnits: stock.find((item) => keyOf(item) === key)?.quantityUnits ?? 0,
      variantName: offering.variantName,
    });
  }
  for (const item of stock) {
    if (!seen.has(keyOf(item))) rows.push(item);
  }

  const total = stock.reduce((sum, item) => sum + item.quantityUnits, 0);

  /**
   * Sumar o restar uno, y guardar en el acto.
   *
   * Era un formulario con casillas y un "Guardar stock" aparte, más "Informar producción real" y la
   * tabla de excedente debajo: tres herramientas para contestar "¿cuántos hago de más?". Ahora es
   * un contador por menú, y cada toque queda guardado.
   */
  async function change(row: StockRow, delta: number) {
    const next = Math.max(0, row.quantityUnits + delta);
    if (next === row.quantityUnits) return;
    const entries = rows
      .map((item) => (keyOf(item) === keyOf(row) ? { ...item, quantityUnits: next } : item))
      .filter((item) => item.quantityUnits > 0);
    setSaving(true);
    setMessage('');
    const response = await apiRequest(`/api/v1/production/${cycleId}/stock`, {
      body: JSON.stringify({ entries }),
      method: 'PUT',
    });
    setSaving(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setStock(((await response.json()) as { items: StockRow[] }).items);
    onSaved();
  }

  return (
    <section className="operation-card mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xl font-semibold text-forest">Stock para el cierre</h3>
        <span className="text-sm text-ink-muted">
          {total === 0
            ? 'Sin stock pedido.'
            : `${String(total)} ${total === 1 ? 'menú' : 'menús'} de stock`}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        Los menús que se piden para tener a mano y vender después. Se cocinan con el resto y salen
        en la planilla, pero no cuentan como ventas. Los Intuitivos no van acá.
      </p>
      {message ? (
        <p className="screen-notice mt-3" role="alert">
          {message}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="empty-state mt-4">El menú de este período no tiene variedades fijas.</p>
      ) : (
        <ul className="stock-steppers mt-4" aria-busy={saving}>
          {rows.map((row) => {
            const line = surplus.find((item) => keyOf(item) === keyOf(row));
            const name = `${row.familyName} ${row.variantName}`;
            return (
              <li key={keyOf(row)}>
                <span className="stock-steppers-name">
                  {name}
                  {line && line.vendidoOportunidad > 0 ? (
                    <small>
                      Vendidos {line.vendidoOportunidad} · quedan {line.disponible}
                    </small>
                  ) : null}
                </span>
                <span className="stock-steppers-control">
                  <button
                    aria-label={`Quitar uno de ${name}`}
                    className="button button-secondary"
                    disabled={!canEdit || saving || row.quantityUnits === 0}
                    onClick={() => void change(row, -1)}
                    type="button"
                  >
                    −
                  </button>
                  <strong aria-live="polite">{row.quantityUnits}</strong>
                  <button
                    aria-label={`Agregar uno de ${name}`}
                    className="button button-secondary"
                    disabled={!canEdit || saving}
                    onClick={() => void change(row, 1)}
                    type="button"
                  >
                    +
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
