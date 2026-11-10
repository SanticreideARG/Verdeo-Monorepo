import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { DashboardShell } from '../components/DashboardShell.js';
import { ProductionStockPanel } from '../components/ProductionStockPanel.js';
import { KitchenSheetsPanel } from '../components/KitchenSheetsPanel.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { apiRequest, storedOperatingSiteId } from '../lib/api.js';
import {
  errorMessage,
  menusForAmbientScope,
  type KitchenSummary,
  type ProductionSnapshot,
  type SurplusReport,
  type WeeklyMenu,
  dishLabel,
  pickedDishes,
} from '../lib/operations.js';
import { formatMoment } from '../lib/dates.js';
import { currentPeriod, periodsFromMenus } from '../lib/periods.js';
import {
  chooseWorkingPeriod,
  parseWorkingPeriod,
  useReturnToCurrentPeriod,
  workingPeriodSnapshot,
} from '../lib/workingPeriod.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

function stockUnits(kitchen: KitchenSummary): number {
  return (kitchen.stock ?? []).reduce((sum, item) => sum + item.quantityUnits, 0);
}

export function KitchenPage() {
  const { failed, logout, profile } = useDashboardProfile();
  // Un reparto: lo que hay que cocinar para esa salida.
  const [menus, setMenus] = useState<WeeklyMenu[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState('');
  const [kitchen, setKitchen] = useState<KitchenSummary | null>(null);
  const [snapshots, setSnapshots] = useState<ProductionSnapshot[]>([]);
  // Cada exportación anota una planilla: el aviso de cambios se vuelve a pedir (2026-10-28).
  const [sheetsKey, setSheetsKey] = useState(0);
  const [surplus, setSurplus] = useState<SurplusReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [closing, setClosing] = useState(false);

  const permissions = profile?.permissions ?? [];
  const canReport = permissions.includes('production.report');
  const canGenerate = permissions.includes('production.generate');
  // El informe del período muestra plata: lo ve quien ve los cobros.
  const canSeeMoney = permissions.includes('payments.read');

  const loadMenus = useCallback(async () => {
    if (!profile?.permissions.includes('production.read')) {
      setLoading(false);
      return;
    }
    const response = await apiRequest('/api/v1/menus');
    if (response.ok) {
      const loadedMenus = menusForAmbientScope(
        ((await response.json()) as { items: WeeklyMenu[] }).items,
        storedOperatingSiteId(),
      );
      setMenus(loadedMenus);
      const periods = periodsFromMenus(loadedMenus);
      const stored = parseWorkingPeriod(workingPeriodSnapshot());
      setSelectedMenuId(
        (current) =>
          current ||
          (stored && loadedMenus.find((menu) => menu.cycle.id === stored.id)?.id) ||
          loadedMenus.find((menu) => menu.cycle.id === currentPeriod(periods)?.id)?.id ||
          loadedMenus[0]?.id ||
          '',
      );
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    void loadMenus();
  }, [loadMenus]);

  useReturnToCurrentPeriod(() => {
    const current = currentPeriod(periodsFromMenus(menus));
    setSelectedMenuId(menus.find((menu) => menu.cycle.id === current?.id)?.id ?? '');
  });

  const selectedMenu = menus.find((menu) => menu.id === selectedMenuId) ?? null;

  const loadSnapshots = useCallback(async (cycleId: string) => {
    const response = await apiRequest(`/api/v1/production/${cycleId}/snapshots`);
    if (response.ok) {
      setSnapshots(((await response.json()) as { items: ProductionSnapshot[] }).items);
    }
  }, []);

  const loadSurplus = useCallback(async (cycleId: string) => {
    const response = await apiRequest(`/api/v1/production/${cycleId}/surplus`);
    if (response.ok) {
      const report = (await response.json()) as SurplusReport;
      setSurplus(report);
    }
  }, []);

  /** El informe del período: lo vendido, la plata por medio de pago, quién debe y el stock. */
  async function downloadReport() {
    if (!selectedMenu) return;
    setMessage('');
    const response = await apiRequest(`/api/v1/production/${selectedMenu.cycle.id}/report`);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = `informe-${selectedMenu.cycle.alias}.xlsx`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  /*
   * Sólo la planilla (2026-11-01): "Imprimir", "Copiar para WhatsApp" y el atajo a Etiquetas se
   * sacaron de Cierre de pedidos. Las etiquetas siguen en su sección del menú.
   */
  async function downloadProduction() {
    if (!selectedMenu) return;
    setMessage('');
    const response = await apiRequest(
      `/api/v1/production/${selectedMenu.cycle.id}/export?format=xlsx`,
    );
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = `produccion-${selectedMenu.cycle.alias}.xlsx`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    await loadSnapshots(selectedMenu.cycle.id);
    setSheetsKey((key) => key + 1);
  }

  /*
   * Entrar a Cocina ya muestra lo de ahora: el consolidado se calcula solo al elegir el período o el
   * reparto. "Generar salida" era un paso que había que acordarse de dar para ver algo.
   */
  useEffect(() => {
    if (selectedMenu) void generate();
  }, [selectedMenu?.cycle.id]);

  async function generate() {
    if (!selectedMenu) return;
    setMessage('');
    try {
      const response = await apiRequest(`/api/v1/production/${selectedMenu.cycle.id}`);
      if (!response.ok) throw new Error(await errorMessage(response));
      setKitchen((await response.json()) as KitchenSummary);
      await loadSnapshots(selectedMenu.cycle.id);
      setSheetsKey((key) => key + 1);
      await loadSurplus(selectedMenu.cycle.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos generar el consolidado.');
    }
  }

  /**
   * Cerrar el período.
   *
   * A mano y no por fecha: una semana puede seguir necesitando ajustes después de su cierre —un
   * pedido que se reprograma, una entrega que se rehace— y que el sistema la trabe sola dejaría a
   * alguien sin poder arreglar algo real.
   *
   * Al cerrar, el remanente que no se colocó se da de baja solo: terminada la semana, el excedente
   * no se arrastra a la siguiente.
   */
  /*
   * Cerrar el período. Lo que quedó sin vender pasa solo al stock de períodos anteriores
   * (STOCK_LOTS_PLAN.md): no hay que elegir nada, sólo se avisa.
   */
  async function closeCycle() {
    if (!selectedMenu) return;
    setClosing(false);
    setMessage('');
    const response = await apiRequest(`/api/v1/production/${selectedMenu.cycle.id}/closed`, {
      body: JSON.stringify({ closed: true }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const closed = (await response.json()) as {
      stockLots: {
        familyName: string;
        operatingSiteName: string;
        quantityUnits: number;
        variantName: string;
      }[];
    };
    setMessage(
      closed.stockLots.length > 0
        ? `Período cerrado. Pasó al stock de períodos anteriores: ${closed.stockLots
            .map(
              (lot) =>
                `${String(lot.quantityUnits)} ${lot.familyName} ${lot.variantName} (${lot.operatingSiteName})`,
            )
            .join(', ')}. Se corrige en Cocina → Stock.`
        : 'Período cerrado. No quedaba nada sin vender.',
    );
    await loadMenus();
    await loadSurplus(selectedMenu.cycle.id);
  }

  if (failed) return <DashboardFailed label="la producción" />;
  if (!profile) return <DashboardLoading />;

  if (!profile.permissions.includes('production.read')) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Cocina</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver producción.</p>
        </section>
      </DashboardShell>
    );
  }

  // El último consolidado exportado: cada descarga de la planilla lo vuelve a guardar.
  const lastExport = snapshots.find((snapshot) => snapshot.kind === 'final') ?? null;

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="kitchen-head">
          <div>
            <p className="dashboard-kicker">Cocina</p>
            <h1 className="text-2xl font-semibold text-forest">Cierre de pedidos</h1>
          </div>
          {selectedMenu?.cycle.status === 'CLOSED' ? (
            <span className="status-chip">Período cerrado</span>
          ) : null}
        </header>

        {message ? (
          <p className="screen-notice mt-5" role="alert">
            {message}
          </p>
        ) : null}

        {loading && menus.length === 0 ? (
          <p className="mt-6 text-ink-muted">Cargando menús…</p>
        ) : (
          // Cambiar de ciclo atenúa lo que hay en vez de vaciarlo.
          <div className={loading ? 'is-refreshing' : undefined}>
            {/*
             * Un solo renglón (2026-11-01): el período y lo que se hace con él. Sin elegir reparto:
             * la planilla de producción es siempre la de todos los repartos del período.
             */}
            <div className="operation-card kitchen-toolbar mt-6">
              <div className="kitchen-toolbar-row">
                <label className="field kitchen-period">
                  Período
                  <select
                    onChange={(event) => {
                      setSelectedMenuId(event.target.value);
                      const chosen = menus.find((menu) => menu.id === event.target.value);
                      chooseWorkingPeriod(chosen?.cycle.id ?? '', periodsFromMenus(menus));
                    }}
                    value={selectedMenuId}
                  >
                    <option value="">Seleccionar</option>
                    {menus.map((menu) => (
                      <option key={menu.id} value={menu.id}>
                        {menu.cycle.alias}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="kitchen-toolbar-actions">
                  <button
                    className="button button-primary"
                    disabled={!kitchen}
                    onClick={() => void downloadProduction()}
                    type="button"
                  >
                    Descargar planilla
                  </button>
                  {canSeeMoney ? (
                    <button
                      className="button button-secondary"
                      disabled={!selectedMenu}
                      onClick={() => void downloadReport()}
                      type="button"
                    >
                      Informe del período
                    </button>
                  ) : null}
                  {/* Cerrar es lo último de la semana: separado del resto, al final. */}
                  {canGenerate && selectedMenu && selectedMenu.cycle.status !== 'CLOSED' ? (
                    <button
                      className="button button-secondary kitchen-close"
                      onClick={() => setClosing(true)}
                      type="button"
                    >
                      Cerrar período
                    </button>
                  ) : null}
                </div>
              </div>
              {lastExport ? (
                <p className="kitchen-toolbar-note">
                  Última exportación: {formatMoment(lastExport.generatedAt)} ·{' '}
                  {lastExport.payload.totalUnits} unidades
                </p>
              ) : null}
            </div>

            {selectedMenu ? (
              <KitchenSheetsPanel cycleId={selectedMenu.cycle.id} refreshKey={sheetsKey} />
            ) : null}

            {kitchen ? (
              <>
                {/*
                 * Intuitivos con platos que no saben de qué menú vienen: en la planilla salen en
                 * "SIN MENÚ DE ORIGEN". Se corrigen editando el pedido y eligiendo el plato de su menú.
                 */}
                {(() => {
                  const pending = kitchen.custom.filter((item) =>
                    item.dishSelections.some((_, index) => !item.dishSources?.[index]),
                  );
                  if (pending.length === 0) return null;
                  return (
                    <div className="screen-notice mt-6" role="status">
                      <p>
                        <strong>
                          {pending.length === 1
                            ? '1 Menú especial tiene platos sin menú de origen.'
                            : `${String(pending.length)} Menús especiales tienen platos sin menú de origen.`}
                        </strong>{' '}
                        En la planilla salen en "SIN MENÚ DE ORIGEN". Abrí cada pedido, editá los
                        platos y elegilos de nuevo desde su menú.
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {pending.map((item) => (
                          <li key={`${item.orderPublicNumber}-${String(item.sequence)}`}>
                            {item.orderId ? (
                              <Link
                                className="button button-secondary"
                                to={`/app/pedidos/${item.orderId}`}
                              >
                                {item.customerDisplayName}
                              </Link>
                            ) : (
                              <span>{item.customerDisplayName}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <article className="operation-card">
                    <h3 className="text-xl font-semibold text-forest">Producción base</h3>
                    <div className="mt-4 grid gap-3">
                      {kitchen.base.map((item) => (
                        <div
                          className="border-b border-forest/10 pb-3"
                          key={`${item.familyName}-${item.variantName}`}
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <span>
                              {item.familyName} {item.variantName}
                            </span>
                            {/* Unidades y pedidos: ocho unidades pueden ser ocho pedidos de una o
                                dos de cuatro, y eso cambia cuántos paquetes se arman. */}
                            <span className="whitespace-nowrap">
                              <strong>{item.quantityUnits}</strong>{' '}
                              <span className="text-sm text-ink-muted">
                                en {item.orderCount} {item.orderCount === 1 ? 'pedido' : 'pedidos'}
                              </span>
                            </span>
                          </div>
                          {item.exceptions.map((exception) => (
                            <p
                              className="mt-2 text-sm font-semibold text-red-800"
                              key={`${exception.orderPublicNumber}-${exception.dietaryInstructions.join('-')}`}
                            >
                              {exception.quantityUnits} ({exception.customerDisplayName}):{' '}
                              {exception.dietaryInstructions.join(' · ')}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  </article>
                  <article className="operation-card">
                    <h3 className="text-xl font-semibold text-forest">Especiales</h3>
                    {/*
                     * El formato que usa cocina (pedido 2026-11-09): de título el tamaño y el
                     * cliente, abajo un plato por renglón, y un renglón en blanco antes del
                     * siguiente. Sin número. La cantidad se dice sólo si son dos o más.
                     */}
                    <div className="kitchen-specials mt-4">
                      {kitchen.custom.map((item) => (
                        <div key={`${item.orderPublicNumber}-${item.sequence}`}>
                          <strong>
                            {item.variantName} {item.customerDisplayName}
                            {item.quantityUnits > 1 ? ` × ${String(item.quantityUnits)}` : ''}
                          </strong>
                          {/* Uno por línea: en cocina esto se lee de reojo mientras se arma, y una
                              tira de cinco platos separados por puntos obliga a leerla entera. */}
                          <ul>
                            {pickedDishes(item).map((dish, index) => (
                              <li key={`${dishLabel(dish)}-${String(index)}`}>{dishLabel(dish)}</li>
                            ))}
                          </ul>
                          {item.dietaryInstructions.length ? (
                            <p className="mt-2 text-sm font-semibold text-red-800">
                              {item.dietaryInstructions.join(' · ')}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </article>
                  {/*
                   * Cuántas porciones de cada plato, sumando todos los Intuitivos.
                   *
                   * Es la pregunta que cocina se hace antes de comprar, y hasta ahora se contestaba
                   * recorriendo una por una las tarjetas de Intuitivo llevando la cuenta a mano.
                   */}
                  {kitchen.dishTally.length > 0 ? (
                    <article className="operation-card lg:col-span-2">
                      <h3 className="text-xl font-semibold text-forest">
                        Platos a preparar (Menús especiales)
                      </h3>
                      <div className="dish-tally mt-4">
                        {kitchen.dishTally.map((entry) => (
                          <div key={`${entry.familyName ?? ''}-${entry.dishName}`}>
                            {/* El mismo nombre en dos menús son dos platos: van aparte, con su menú. */}
                            <span>
                              {dishLabel({
                                dishName: entry.dishName,
                                familyName: entry.familyName ?? '',
                              })}
                            </span>
                            <strong>{entry.portions}</strong>
                          </div>
                        ))}
                      </div>
                    </article>
                  ) : null}

                  <p className="text-right font-bold text-forest lg:col-span-2">
                    Total: {kitchen.totalUnits} unidades en {kitchen.totalOrders}{' '}
                    {kitchen.totalOrders === 1 ? 'pedido' : 'pedidos'}
                    {stockUnits(kitchen) > 0
                      ? ` + ${String(stockUnits(kitchen))} de stock = ${String(kitchen.totalUnits + stockUnits(kitchen))} a cocinar`
                      : ''}
                  </p>
                </div>

                {selectedMenu ? (
                  <ProductionStockPanel
                    canEdit={canReport}
                    cycleId={selectedMenu.cycle.id}
                    offerings={selectedMenu.offerings}
                    onSaved={() => void generate()}
                    surplus={surplus?.items ?? []}
                  />
                ) : null}
              </>
            ) : (
              <p className="empty-state mt-6">Elegí un período para ver lo que hay que cocinar.</p>
            )}
          </div>
        )}
      </section>
      {closing && selectedMenu ? (
        <div
          aria-label={`Cerrar ${selectedMenu.cycle.alias}`}
          aria-modal="true"
          className="modal-backdrop"
          role="dialog"
        >
          <div className="modal-panel grid gap-3">
            <h2 className="text-lg font-semibold text-forest">
              ¿Cerrar {selectedMenu.cycle.alias}?
            </h2>
            <p className="text-sm text-ink-muted">Sus pedidos dejan de poder editarse.</p>
            {(() => {
              const remnant = (surplus?.items ?? []).filter((item) => item.disponible > 0);
              if (remnant.length === 0) return <p className="text-sm">No queda nada sin vender.</p>;
              return (
                <>
                  <p className="text-sm">Quedó sin vender:</p>
                  <ul className="close-remnant">
                    {remnant.map((item) => (
                      <li key={`${item.familyName}-${item.variantName}`}>
                        {item.familyName} {item.variantName} · <strong>{item.disponible}</strong>
                      </li>
                    ))}
                  </ul>
                  <small className="text-ink-muted">
                    Pasa solo al stock de períodos anteriores, con este período y su ciudad: se
                    vende desde Nuevo pedido hasta un mes después y se corrige en Cocina → Stock.
                  </small>
                </>
              );
            })()}
            <div className="form-actions justify-end">
              <button
                className="button button-secondary"
                onClick={() => setClosing(false)}
                type="button"
              >
                Volver
              </button>
              <button
                className="button button-primary"
                onClick={() => void closeCycle()}
                type="button"
              >
                Cerrar período
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}
