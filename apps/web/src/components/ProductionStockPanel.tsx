import { useCallback, useEffect, useState } from 'react';

import { apiRequest } from '../lib/api.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { formatDay } from '../lib/dates.js';
import { errorMessage, type MenuOffering, type SurplusItem } from '../lib/operations.js';
import type { StockLot } from '../lib/stockLots.js';

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
  // El stock de períodos anteriores (STOCK_LOTS_PLAN.md): lotes ya cocinados, por ciudad.
  const [lots, setLots] = useState<StockLot[]>([]);
  const [writingOff, setWritingOff] = useState<StockLot | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await apiRequest(`/api/v1/production/${cycleId}/stock`);
    if (response.ok) setStock(((await response.json()) as { items: StockRow[] }).items);
    const stockLots = await apiRequest('/api/v1/stock-lots', { notify: false });
    if (stockLots.ok) setLots(((await stockLots.json()) as { items: StockLot[] }).items);
  }, [cycleId]);

  /** Corregir un lote: una vianda más o menos, o dar de baja lo que queda. Se guarda en el acto. */
  async function patchLot(lot: StockLot, body: Record<string, unknown>) {
    setSaving(true);
    setMessage('');
    const response = await apiRequest(`/api/v1/stock-lots/${lot.id}`, {
      body: JSON.stringify(body),
      method: 'PATCH',
    });
    setSaving(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    await load();
    onSaved();
  }

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

  // Los lotes con algo para vender o dar de baja (los agotados ya no dicen nada).
  const liveLots = lots.filter((lot) => lot.available > 0);
  const lotsTotal = liveLots
    .filter((lot) => !lot.expired)
    .reduce((sum, lot) => sum + lot.available, 0);

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
      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-semibold text-forest">Stock de períodos anteriores</h4>
        <span className="text-sm text-ink-muted">
          {lotsTotal === 0
            ? 'Sin stock de períodos anteriores.'
            : `${String(lotsTotal)} ${lotsTotal === 1 ? 'vianda' : 'viandas'} para vender`}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        Lo que sobró al cerrar cada período pasa solo acá, con su período y su ciudad. Ya está
        cocinado: se vende desde Nuevo pedido, a precio normal, hasta un mes después de su período,
        y no suma a lo que hay que cocinar. Si contaste distinto, corregilo con − y +.
      </p>
      {liveLots.length > 0 ? (
        <ul className="stock-steppers mt-3" aria-busy={saving}>
          {liveLots.map((lot) => {
            const name = `${lot.familyName} ${lot.variantName}`;
            return (
              <li key={lot.id}>
                <span className="stock-steppers-name">
                  {name} · <strong>{lot.cycleAlias}</strong>
                  <small>
                    {lot.operatingSiteName} · quedan {lot.available}
                    {lot.soldUnits > 0 ? ` · vendidas ${String(lot.soldUnits)}` : ''}
                    {lot.expired ? ' · vencido' : ` · hasta el ${formatDay(lot.expiresAt)}`}
                  </small>
                </span>
                <span className="stock-steppers-control">
                  <button
                    aria-label={`Una menos en el stock de ${name} de ${lot.cycleAlias}`}
                    className="button button-secondary"
                    disabled={!canEdit || saving}
                    onClick={() => void patchLot(lot, { quantityUnits: lot.quantityUnits - 1 })}
                    type="button"
                  >
                    −
                  </button>
                  <strong aria-live="polite">{lot.available}</strong>
                  <button
                    aria-label={`Una más en el stock de ${name} de ${lot.cycleAlias}`}
                    className="button button-secondary"
                    disabled={!canEdit || saving}
                    onClick={() => void patchLot(lot, { quantityUnits: lot.quantityUnits + 1 })}
                    type="button"
                  >
                    +
                  </button>
                  {canEdit ? (
                    <button
                      className="link-button"
                      disabled={saving}
                      onClick={() => setWritingOff(lot)}
                      type="button"
                    >
                      Dar de baja
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {writingOff ? (
        <ConfirmDialog
          confirmLabel="Dar de baja"
          detail={`Las ${String(writingOff.available)} viandas de ${writingOff.familyName} ${writingOff.variantName} de ${writingOff.cycleAlias} que quedan dejan de estar a la venta.`}
          onCancel={() => setWritingOff(null)}
          onConfirm={async () => {
            await patchLot(writingOff, { writeOffRemaining: true });
            setWritingOff(null);
          }}
          title="¿Dar de baja este stock?"
          tone="destructivo"
        />
      ) : null}
    </section>
  );
}
