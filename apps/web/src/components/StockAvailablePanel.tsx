import { useEffect, useState } from 'react';

import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import type { SurplusItem, SurplusReport, WeeklyMenu } from '../lib/operations.js';
import { lotsForMenu, offeringForStock, type StockLot } from '../lib/stockLots.js';

/** Lo que se eligió vender desde el panel: la página abre "Nuevo pedido" con eso cargado. */
export type StockSale =
  | { familyName: string; kind: 'period'; menuId: string; offeringId: string; variantName: string }
  | { kind: 'lot'; lot: StockLot; menuId: string };

interface PeriodStock extends SurplusItem {
  alias: string;
  cycleId: string;
  menuId: string | null;
  offeringId: string | null;
}

const OPEN_KEY = 'verdeo-orders-stock-open';

function storedOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

const shortFamily = (value: string) => value.replace(/^men[uú]\s+/i, '');
const countMenus = (count: number) => `${String(count)} ${count === 1 ? 'menú' : 'menús'}`;

/** "18/11", sin pasar por la zona horaria del navegador. */
function shortDate(value: string): string {
  const [, month, day] = value.slice(0, 10).split('-');
  return `${day ?? ''}/${month ?? ''}`;
}

/** Vence en tres días o menos: va primero y resaltado, es lo que hay que vender ya. */
function expiresSoon(value: string): boolean {
  return new Date(value).getTime() - Date.now() < 3 * 24 * 60 * 60 * 1000;
}

/**
 * "Stock disponible" en Pedidos (2026-10-30): lo que se puede vender ya cocinado, en la ciudad
 * elegida arriba, sin tener que ir a Cocina. Dos grupos: lo que queda del período (el mismo número
 * que "Sale del stock") y los lotes de períodos anteriores, los que vencen antes primero.
 *
 * Cargar sigue siendo de Cocina. "Vender" abre Nuevo pedido con la variedad y "Sale del stock" (o
 * el lote) ya elegidos. "Quitar" (2026-11-14) da de baja lo que queda de ese renglón, con su
 * motivo en el historial: no se borra, para que lo vendido y las cuentas del período sigan
 * cerrando. Cerrado es un renglón; se recuerda si se dejó abierto.
 */
export function StockAvailablePanel({
  canRemoveLots = false,
  canRemovePeriod = false,
  canSell,
  menus,
  onSell,
  version,
}: {
  /** Quitar lo enviado a stock y lo de períodos anteriores: el permiso de Cocina → Stock. */
  canRemoveLots?: boolean;
  /** Quitar el stock del período: el permiso de dar de baja el excedente. */
  canRemovePeriod?: boolean;
  canSell: boolean;
  /** Los menús publicados de la ciudad: de ahí sale el período y con qué opción se vende. */
  menus: readonly WeeklyMenu[];
  onSell: (sale: StockSale) => void;
  /** Cambia cuando se guarda un pedido, para volver a pedir lo disponible. */
  version: number;
}) {
  const [open, setOpen] = useState(storedOpen);
  const [period, setPeriod] = useState<PeriodStock[] | null>(null);
  const [lots, setLots] = useState<StockLot[] | null>(null);
  const [removing, setRemoving] = useState<
    { item: PeriodStock; kind: 'period' } | { kind: 'lot'; lot: StockLot } | null
  >(null);
  const [reloads, setReloads] = useState(0);

  const cycles = [...new Map(menus.map((menu) => [menu.cycle.id, menu] as const)).values()];
  const cyclesKey = cycles.map((menu) => menu.id).join(',');

  useEffect(() => {
    let active = true;
    void Promise.all(
      cycles.map(async (menu) => {
        const response = await apiRequest(`/api/v1/production/${menu.cycle.id}/surplus`, {
          notify: false,
        });
        if (!response.ok) return [];
        const report = (await response.json()) as SurplusReport;
        return report.items
          .filter((item) => item.disponible > 0)
          .map((item): PeriodStock => {
            const offering = offeringForStock(menu.offerings, item.familyName, item.variantName);
            return {
              ...item,
              alias: menu.cycle.alias,
              cycleId: menu.cycle.id,
              menuId: offering ? menu.id : null,
              offeringId: offering?.id ?? null,
            };
          });
      }),
    )
      .then((groups) => {
        if (active) setPeriod(groups.flat());
      })
      .catch(() => {
        if (active) setPeriod([]);
      });
    void apiRequest('/api/v1/stock-lots?disponibles=1', { notify: false })
      .then(async (response) => {
        const items = response.ok ? ((await response.json()) as { items: StockLot[] }).items : [];
        if (!active) return;
        setLots(
          items
            .filter((lot) => lot.available > 0 && !lot.expired)
            .sort((left, right) => left.expiresAt.localeCompare(right.expiresAt)),
        );
      })
      .catch(() => {
        if (active) setLots([]);
      });
    return () => {
      active = false;
    };
    // Lo que cambia lo que se pide son los períodos publicados, cada pedido guardado y lo quitado.
  }, [cyclesKey, version, reloads]);

  async function remove() {
    const target = removing;
    setRemoving(null);
    if (!target) return;
    const reason = 'Quitado del stock desde Pedidos.';
    const response =
      target.kind === 'lot'
        ? await apiRequest(`/api/v1/stock-lots/${target.lot.id}`, {
            body: JSON.stringify({ writeOffRemaining: true }),
            method: 'PATCH',
          })
        : await apiRequest(`/api/v1/production/${target.item.cycleId}/surplus/writeoffs`, {
            body: JSON.stringify({
              entries: [
                {
                  familyName: target.item.familyName,
                  quantityUnits: target.item.disponible,
                  reason,
                  variantName: target.item.variantName,
                },
              ],
            }),
            method: 'POST',
          });
    if (!response.ok) {
      showToast(await errorMessage(response));
      return;
    }
    showToast('Quitado del stock.');
    setReloads((count) => count + 1);
  }

  if (period === null || lots === null) return null;

  function toggle() {
    setOpen((current) => {
      try {
        window.localStorage.setItem(OPEN_KEY, current ? '0' : '1');
      } catch {
        // Sin almacenamiento, vale hasta recargar.
      }
      return !current;
    });
  }

  /** Con qué menú se vende un lote: uno de su ciudad que tenga esa variedad y tamaño. */
  const menuForLot = (lot: StockLot) =>
    menus.find(
      (menu) =>
        (menu.operatingSiteId === null || menu.operatingSiteId === lot.operatingSiteId) &&
        lotsForMenu([lot], menu.offerings).length > 0,
    );

  const total =
    period.reduce((sum, item) => sum + item.disponible, 0) +
    lots.reduce((sum, lot) => sum + lot.available, 0);
  const cities = new Set(lots.map((lot) => lot.operatingSiteId));

  return (
    <section className={`stock-available${open ? ' is-open' : ''}`}>
      <button aria-expanded={open} className="stock-available-head" onClick={toggle} type="button">
        <strong>Stock disponible</strong>
        <span>{total === 0 ? 'sin stock' : countMenus(total)}</span>
        <span aria-hidden="true" className="stock-available-caret">
          ▸
        </span>
      </button>
      {open ? (
        <div className="stock-available-body">
          {total === 0 ? (
            <p className="stock-available-empty">
              No queda stock del período ni de períodos anteriores. El stock se carga en Cocina.
            </p>
          ) : null}
          {period.length > 0 ? (
            <div className="stock-available-group">
              <h3>Del período</h3>
              <ul>
                {period.map((item) => {
                  const sale =
                    item.menuId && item.offeringId
                      ? ({
                          familyName: item.familyName,
                          kind: 'period',
                          menuId: item.menuId,
                          offeringId: item.offeringId,
                          variantName: item.variantName,
                        } as const)
                      : null;
                  return (
                    <li key={`${item.alias}-${item.familyName}-${item.variantName}`}>
                      <span>
                        {shortFamily(item.familyName)} {item.variantName}
                        {cycles.length > 1 ? <small> · {item.alias}</small> : null}
                      </span>
                      <strong>{item.disponible}</strong>
                      {canSell ? (
                        <button
                          className="button button-secondary"
                          disabled={!sale}
                          onClick={() => sale && onSell(sale)}
                          title={
                            sale ? undefined : 'El menú de esta semana no tiene esta variedad.'
                          }
                          type="button"
                        >
                          Vender
                        </button>
                      ) : null}
                      {canRemovePeriod ? (
                        <button
                          className="link-button"
                          onClick={() => setRemoving({ item, kind: 'period' })}
                          type="button"
                        >
                          Quitar
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          {lots.length > 0 ? (
            <div className="stock-available-group">
              <h3>Enviado a stock y de períodos anteriores</h3>
              <ul>
                {lots.map((lot) => {
                  const menu = menuForLot(lot);
                  const soon = expiresSoon(lot.expiresAt);
                  return (
                    <li className={soon ? 'is-soon' : undefined} key={lot.id}>
                      <span>
                        {lot.notes ? `${lot.notes} · ` : ''}
                        {shortFamily(lot.familyName)} {lot.variantName}
                        <small>
                          {' '}
                          · {lot.cycleAlias}
                          {cities.size > 1 ? ` · ${lot.operatingSiteName}` : ''} · vence{' '}
                          {shortDate(lot.expiresAt)}
                        </small>
                      </span>
                      <strong>{lot.available}</strong>
                      {canSell ? (
                        <button
                          className="button button-secondary"
                          disabled={!menu}
                          onClick={() => menu && onSell({ kind: 'lot', lot, menuId: menu.id })}
                          title={
                            menu
                              ? undefined
                              : 'Ningún menú publicado de su ciudad tiene esta variedad.'
                          }
                          type="button"
                        >
                          Vender
                        </button>
                      ) : null}
                      {canRemoveLots ? (
                        <button
                          className="link-button"
                          onClick={() => setRemoving({ kind: 'lot', lot })}
                          type="button"
                        >
                          Quitar
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {removing ? (
        <ConfirmDialog
          confirmLabel="Quitar"
          detail={
            removing.kind === 'lot'
              ? `${shortFamily(removing.lot.familyName)} ${removing.lot.variantName} · ${removing.lot.cycleAlias}: se dan de baja las ${String(removing.lot.available)} que quedan. Lo ya vendido no cambia, y queda en el historial.`
              : `${shortFamily(removing.item.familyName)} ${removing.item.variantName} · ${removing.item.alias}: se dan de baja las ${String(removing.item.disponible)} que quedan. Lo ya vendido no cambia, y queda en el historial.`
          }
          onCancel={() => setRemoving(null)}
          onConfirm={remove}
          tone="destructivo"
          title="¿Quitar del stock?"
        />
      ) : null}
    </section>
  );
}
