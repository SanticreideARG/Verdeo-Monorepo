import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { DashboardShell } from '../components/DashboardShell.js';
import { ProductionStockPanel } from '../components/ProductionStockPanel.js';
import { RunFilter } from '../components/RunFilter.js';
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
import { useDashboardProfile } from '../lib/useDashboardProfile.js';
import { showToast } from '../lib/toast.js';

function stockUnits(kitchen: KitchenSummary): number {
  return (kitchen.stock ?? []).reduce((sum, item) => sum + item.quantityUnits, 0);
}

export function KitchenPage() {
  const { failed, logout, profile } = useDashboardProfile();
  // Un reparto: lo que hay que cocinar para esa salida.
  const [runId, setRunId] = useState('');
  const [menus, setMenus] = useState<WeeklyMenu[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState('');
  const [kitchen, setKitchen] = useState<KitchenSummary | null>(null);
  const [snapshots, setSnapshots] = useState<ProductionSnapshot[]>([]);
  const [surplus, setSurplus] = useState<SurplusReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const permissions = profile?.permissions ?? [];
  const canReport = permissions.includes('production.report');
  const canGenerate = permissions.includes('production.generate');

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
      setSelectedMenuId((current) => current || loadedMenus[0]?.id || '');
    }
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    void loadMenus();
  }, [loadMenus]);

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

  /**
   * El consolidado en vivo, listo para pegar en un chat.
   *
   * Se copia al portapapeles en vez de descargar un archivo: lo que se hace con esto es mandárselo
   * a cocina por WhatsApp, y un .txt adjunto obliga a abrirlo, copiarlo y recién ahí pegarlo.
   */
  async function copyProduction() {
    if (!selectedMenu) return;
    setMessage('');
    const response = await apiRequest(
      `/api/v1/production/${selectedMenu.cycle.id}/export?format=whatsapp`,
    );
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    await navigator.clipboard.writeText(await response.text());
    showToast('Producción copiada. Pegala en el chat de cocina.');
    await loadSnapshots(selectedMenu.cycle.id);
  }

  async function downloadProduction(format: 'pdf' | 'xlsx') {
    if (!selectedMenu) return;
    setMessage('');
    const response = await apiRequest(
      `/api/v1/production/${selectedMenu.cycle.id}/export?format=${format}`,
    );
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    if (format === 'pdf') {
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      const link = document.createElement('a');
      link.href = url;
      link.download = `produccion-${selectedMenu.cycle.alias}.xlsx`;
      link.click();
    }
    // Revocar en el mismo turno corre carrera con la pestaña que recién se abre.
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    await loadSnapshots(selectedMenu.cycle.id);
  }

  /*
   * Entrar a Cocina ya muestra lo de ahora: el consolidado se calcula solo al elegir el período o el
   * reparto. "Generar salida" era un paso que había que acordarse de dar para ver algo.
   */
  useEffect(() => {
    if (selectedMenu) void generate();
  }, [selectedMenu?.cycle.id, runId]);

  async function generate() {
    if (!selectedMenu) return;
    setMessage('');
    try {
      const response = await apiRequest(
        `/api/v1/production/${selectedMenu.cycle.id}${runId ? `?reparto=${runId}` : ''}`,
      );
      if (!response.ok) throw new Error(await errorMessage(response));
      setKitchen((await response.json()) as KitchenSummary);
      await loadSnapshots(selectedMenu.cycle.id);
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
  async function closeCycle() {
    if (!selectedMenu) return;
    if (
      !window.confirm(
        `¿Cerrar ${selectedMenu.cycle.alias}? Sus pedidos dejan de poder editarse y el remanente sin vender se da de baja.`,
      )
    ) {
      return;
    }
    setMessage('');
    const response = await apiRequest(`/api/v1/production/${selectedMenu.cycle.id}/closed`, {
      body: JSON.stringify({ closed: true }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const closed = (await response.json()) as { writtenOffUnits: number };
    setMessage(
      closed.writtenOffUnits > 0
        ? `Período cerrado. Se dieron de baja ${String(closed.writtenOffUnits)} unidades sin vender.`
        : 'Período cerrado. No quedaba remanente sin vender.',
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

  // El último consolidado exportado: cada descarga, impresión o copia lo vuelve a guardar.
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
             * La cabecera en dos renglones: qué se mira (período y reparto) y qué se hace con eso.
             * Eran siete botones del mismo peso en una fila que se partía en cualquier lado.
             */}
            <div className="operation-card kitchen-toolbar mt-6">
              <div className="kitchen-toolbar-filters">
                <label className="field">
                  Período
                  <select
                    onChange={(event) => setSelectedMenuId(event.target.value)}
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
                {/* Un reparto: lo que hay que cocinar para esa salida, no para el período entero. */}
                <RunFilter onChange={setRunId} value={runId} />
              </div>
              <div className="kitchen-toolbar-actions">
                <button
                  className="button button-primary"
                  disabled={!kitchen}
                  onClick={() => void downloadProduction('xlsx')}
                  type="button"
                >
                  Descargar planilla
                </button>
                <button
                  className="button button-secondary"
                  disabled={!kitchen}
                  onClick={() => void downloadProduction('pdf')}
                  type="button"
                >
                  Imprimir
                </button>
                <button
                  className="button button-secondary"
                  disabled={!kitchen}
                  onClick={() => void copyProduction()}
                  type="button"
                >
                  Copiar para WhatsApp
                </button>
                {/* Las etiquetas tienen su propia sección: ahí se elige la tanda y se ve cómo salen. */}
                <Link className="button button-secondary" to="/app/etiquetas">
                  Etiquetas
                </Link>
                {/* Cerrar es lo último de la semana: separado del resto, al final. */}
                {canGenerate && selectedMenu && selectedMenu.cycle.status !== 'CLOSED' ? (
                  <button
                    className="button button-secondary kitchen-close"
                    onClick={() => void closeCycle()}
                    type="button"
                  >
                    Cerrar período
                  </button>
                ) : null}
              </div>
              {lastExport ? (
                <p className="kitchen-toolbar-note">
                  Última exportación: {formatMoment(lastExport.generatedAt)} ·{' '}
                  {lastExport.payload.totalUnits} unidades
                </p>
              ) : null}
            </div>

            {kitchen ? (
              <>
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
                              {exception.quantityUnits} ({exception.customerDisplayName} ·{' '}
                              {exception.orderPublicNumber}):{' '}
                              {exception.dietaryInstructions.join(' · ')}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  </article>
                  <article className="operation-card">
                    <h3 className="text-xl font-semibold text-forest">Intuitivos</h3>
                    <div className="mt-4 grid gap-4">
                      {kitchen.custom.map((item) => (
                        <div
                          className="border-b border-forest/10 pb-4"
                          key={`${item.orderPublicNumber}-${item.sequence}`}
                        >
                          <strong>
                            #{item.sequence} · {item.variantName} × {item.quantityUnits}
                          </strong>
                          <p className="mt-1 text-sm">
                            {item.customerDisplayName} ({item.orderPublicNumber})
                          </p>
                          {/* Uno por línea: en cocina esto se lee de reojo mientras se arma, y una
                              tira de cinco platos separados por puntos obliga a leerla entera. */}
                          <ul className="dish-selections mt-1">
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
                        Platos a preparar (Intuitivos)
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

                {selectedMenu && !runId ? (
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
    </DashboardShell>
  );
}
