import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { apiRequest } from '../lib/api.js';
import { errorMessage, type MenuOffering, type SurplusItem } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';

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

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const entries = rows
      .map((row) => {
        const raw = form.get(keyOf(row));
        const quantityUnits = Number(typeof raw === 'string' && raw.trim() ? raw : 0);
        return { ...row, quantityUnits };
      })
      .filter((row) => Number.isInteger(row.quantityUnits) && row.quantityUnits > 0);
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
    showToast('Stock del período guardado.');
    onSaved();
  }

  return (
    <form className="operation-card mt-6" onSubmit={(event) => void save(event)}>
      <h3 className="text-xl font-semibold text-forest">Stock del período</h3>
      <p className="mt-1 text-sm text-ink-muted">
        Lo que se cocina de más para vender después. Suma a lo que hay que producir y a lo
        disponible, pero no a las ventas: recién cuenta cuando se vende en un pedido. Es sólo de
        este período.
      </p>
      {message ? (
        <p className="screen-notice mt-3" role="alert">
          {message}
        </p>
      ) : null}
      {rows.length === 0 ? (
        <p className="empty-state mt-4">El menú de este período no tiene variedades fijas.</p>
      ) : (
        <div
          className="form-grid mt-4"
          // Remontar al llegar el stock: las casillas usan defaultValue.
          key={stock.map((item) => keyOf(item) + String(item.quantityUnits)).join('|')}
        >
          {rows.map((row) => {
            const line = surplus.find((item) => keyOf(item) === keyOf(row));
            return (
              <label className="field" key={keyOf(row)}>
                {row.familyName} {row.variantName}
                <input
                  defaultValue={row.quantityUnits || ''}
                  disabled={!canEdit}
                  inputMode="numeric"
                  min="0"
                  name={keyOf(row)}
                  placeholder="0"
                  type="number"
                />
                {line && (line.vendidoOportunidad > 0 || row.quantityUnits > 0) ? (
                  <small className="text-ink-muted">
                    Vendido {line.vendidoOportunidad} · disponible {line.disponible}
                  </small>
                ) : null}
              </label>
            );
          })}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {canEdit && rows.length > 0 ? (
          <button className="button button-primary" disabled={saving} type="submit">
            {saving ? 'Guardando…' : 'Guardar stock'}
          </button>
        ) : null}
        <span className="text-sm text-ink-muted">
          {total === 0 ? 'Sin stock cargado.' : `${String(total)} unidades de stock.`}
        </span>
      </div>
    </form>
  );
}
