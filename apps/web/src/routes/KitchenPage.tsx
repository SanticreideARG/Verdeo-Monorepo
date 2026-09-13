import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { DataTable, type DataColumn } from '../components/DataTable.js';
import { apiRequest, storedOperatingSiteId } from '../lib/api.js';
import {
  errorMessage,
  menusForAmbientScope,
  type KitchenSummary,
  type ProductionSnapshot,
  type SurplusItem,
  type SurplusReport,
  type WeeklyMenu,
} from '../lib/operations.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

function formText(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

/**
 * Ocho columnas, declaradas una sola vez para las dos formas — tabla en escritorio, tarjetas en
 * teléfono. `disponible` es la que se destaca: las otras siete explican cómo se llegó a ese número,
 * pero el que decide qué hacer con el excedente es ése.
 */
const SURPLUS_COLUMNS: readonly DataColumn<SurplusItem>[] = [
  {
    key: 'variedad',
    label: 'Variedad',
    primary: true,
    render: (item) => `${item.familyName} ${item.variantName}`,
  },
  { key: 'demanda', label: 'Demanda', render: (item) => item.demandaConfirmada },
  { key: 'real', label: 'Real', render: (item) => item.produccionReal ?? '—' },
  { key: 'efectivo', label: 'Efectivo', render: (item) => item.excedenteEfectivo },
  { key: 'oportunidad', label: 'Vendido oport.', render: (item) => item.vendidoOportunidad },
  { key: 'baja', label: 'Baja', render: (item) => item.bajaMerma },
  { emphasis: true, key: 'disponible', label: 'Disponible', render: (item) => item.disponible },
];

async function downloadExport(cycleId: string, kind: 'final' | 'partial', format: 'pdf' | 'xlsx') {
  const response = await apiRequest(
    `/api/v1/production/${cycleId}/snapshots/export?kind=${kind}&format=${format}`,
  );
  if (!response.ok) throw new Error(await errorMessage(response));
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  if (format === 'pdf') {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    const link = document.createElement('a');
    link.href = url;
    link.download = `produccion-${kind}.xlsx`;
    link.click();
  }
  URL.revokeObjectURL(url);
}

async function copyWhatsAppText(cycleId: string, kind: 'final' | 'partial') {
  const response = await apiRequest(
    `/api/v1/production/${cycleId}/snapshots/export?kind=${kind}&format=whatsapp`,
  );
  if (!response.ok) throw new Error(await errorMessage(response));
  const text = await response.text();
  await navigator.clipboard.writeText(text);
}

export function KitchenPage() {
  const { failed, logout, profile } = useDashboardProfile();
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
    setMessage('Producción copiada. Pegala en el chat de cocina.');
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
  }

  async function generate() {
    if (!selectedMenu) return;
    setMessage('');
    try {
      const response = await apiRequest(`/api/v1/production/${selectedMenu.cycle.id}`);
      if (!response.ok) throw new Error(await errorMessage(response));
      setKitchen((await response.json()) as KitchenSummary);
      await loadSnapshots(selectedMenu.cycle.id);
      await loadSurplus(selectedMenu.cycle.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos generar el consolidado.');
    }
  }

  async function reportProduction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kitchen || !selectedMenu) return;
    const form = new FormData(event.currentTarget);
    const entries = kitchen.base
      .map((line) => {
        const raw = formText(form, `${line.familyName}::${line.variantName}`);
        if (!raw.trim()) return null;
        const quantityUnits = Number(raw);
        if (!Number.isFinite(quantityUnits) || quantityUnits < 0) return null;
        return { familyName: line.familyName, quantityUnits, variantName: line.variantName };
      })
      .filter(
        (entry): entry is { familyName: string; quantityUnits: number; variantName: string } =>
          Boolean(entry),
      );
    if (entries.length === 0) {
      setMessage('Cargá al menos una cantidad producida.');
      return;
    }
    setMessage('');
    const response = await apiRequest(`/api/v1/production/${selectedMenu.cycle.id}/actuals`, {
      body: JSON.stringify({ entries }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setMessage('Producción real informada.');
    await loadSurplus(selectedMenu.cycle.id);
  }

  async function takeSnapshot(kind: 'final' | 'partial') {
    if (!selectedMenu) return;
    setMessage('');
    const response = await apiRequest(`/api/v1/production/${selectedMenu.cycle.id}/snapshots`, {
      body: JSON.stringify({ kind }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setMessage(kind === 'partial' ? 'Snapshot parcial generado.' : 'Snapshot final generado.');
    await loadSnapshots(selectedMenu.cycle.id);
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

  const partialSnapshot = snapshots.find((snapshot) => snapshot.kind === 'partial') ?? null;
  const finalSnapshot = snapshots.find((snapshot) => snapshot.kind === 'final') ?? null;

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Cocina</p>
          <h1 className="text-2xl font-semibold text-forest">Cierre de pedidos</h1>
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando menús…</p>
        ) : (
          <>
            <div className="operation-card mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="field grow">
                Ciclo
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
              <button
                className="button button-primary"
                disabled={!selectedMenu}
                onClick={() => void generate()}
              >
                Generar salida
              </button>
              {/* Las etiquetas tienen su propia sección: ahí se elige la tanda, se ve cómo van a
                  salir y recién entonces se imprime. Acá quedaba un botón que mandaba a la
                  impresora sin mostrar nada. */}
              <Link className="button button-secondary" to="/app/etiquetas">
                Etiquetas
              </Link>
              {/*
               * Los tres formatos del consolidado que está en pantalla. Existían sólo para
               * snapshots ya tomados, así que pasarle la producción a cocina obligaba a congelar
               * uno antes — un acto con significado propio que no debería hacer falta sólo para
               * mandar un mensaje.
               */}
              {kitchen ? (
                <>
                  <button
                    className="button button-secondary"
                    onClick={() => void copyProduction()}
                    type="button"
                  >
                    Copiar para WhatsApp
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={() => void downloadProduction('xlsx')}
                    type="button"
                  >
                    Descargar planilla
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={() => void downloadProduction('pdf')}
                    type="button"
                  >
                    Imprimir
                  </button>
                </>
              ) : null}
              {/* Cerrar es lo último de la semana, así que va al final y separado del resto. */}
              {canGenerate && selectedMenu && selectedMenu.cycle.status !== 'CLOSED' ? (
                <button
                  className="button button-secondary"
                  onClick={() => void closeCycle()}
                  type="button"
                >
                  Cerrar período
                </button>
              ) : null}
              {selectedMenu?.cycle.status === 'CLOSED' ? (
                <span className="status-chip">Período cerrado</span>
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
                            {item.dishSelections.map((dish, index) => (
                              <li key={`${dish}-${String(index)}`}>{dish}</li>
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
                          <div key={entry.dishName}>
                            <span>{entry.dishName}</span>
                            <strong>{entry.portions}</strong>
                          </div>
                        ))}
                      </div>
                    </article>
                  ) : null}

                  <p className="text-right font-bold text-forest lg:col-span-2">
                    Total: {kitchen.totalUnits} unidades en {kitchen.totalOrders}{' '}
                    {kitchen.totalOrders === 1 ? 'pedido' : 'pedidos'}
                  </p>
                </div>

                {canReport ? (
                  <form
                    className="operation-card mt-6"
                    onSubmit={(event) => void reportProduction(event)}
                  >
                    <h3 className="text-xl font-semibold text-forest">Informar producción real</h3>
                    <p className="mt-1 text-sm text-ink-muted">
                      Cargá cuánto salió efectivamente de cada variedad y tamaño.
                    </p>
                    <div className="form-grid mt-4">
                      {kitchen.base.map((item) => (
                        <label className="field" key={`${item.familyName}-${item.variantName}`}>
                          {item.familyName} {item.variantName}
                          <input
                            defaultValue={item.quantityUnits}
                            min="0"
                            name={`${item.familyName}::${item.variantName}`}
                            type="number"
                          />
                        </label>
                      ))}
                    </div>
                    <button className="button button-primary mt-4" type="submit">
                      Guardar producción real
                    </button>
                  </form>
                ) : null}

                <div className="operation-card mt-6">
                  <h3 className="text-xl font-semibold text-forest">Snapshots</h3>
                  {canGenerate ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="button button-secondary"
                        onClick={() => void takeSnapshot('partial')}
                      >
                        Tomar snapshot parcial (martes 20:00)
                      </button>
                      <button
                        className="button button-secondary"
                        onClick={() => void takeSnapshot('final')}
                      >
                        Tomar snapshot final (miércoles 19:00)
                      </button>
                    </div>
                  ) : null}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {[
                      { kind: 'partial' as const, label: 'Parcial', snapshot: partialSnapshot },
                      { kind: 'final' as const, label: 'Final', snapshot: finalSnapshot },
                    ].map(({ kind, label, snapshot }) => (
                      <div className="rounded-xl border border-forest/10 p-3" key={kind}>
                        <p className="font-semibold">{label}</p>
                        {snapshot ? (
                          <>
                            <p className="text-sm text-ink-muted">
                              Total {snapshot.payload.totalUnits} unidades
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <button
                                className="button button-secondary"
                                onClick={() =>
                                  void downloadExport(selectedMenu?.cycle.id ?? '', kind, 'xlsx')
                                }
                                type="button"
                              >
                                Excel
                              </button>
                              <button
                                className="button button-secondary"
                                onClick={() =>
                                  void downloadExport(selectedMenu?.cycle.id ?? '', kind, 'pdf')
                                }
                                type="button"
                              >
                                PDF
                              </button>
                              <button
                                className="button button-secondary"
                                onClick={() =>
                                  void copyWhatsAppText(selectedMenu?.cycle.id ?? '', kind).then(
                                    () => setMessage('Texto copiado al portapapeles.'),
                                  )
                                }
                                type="button"
                              >
                                Copiar texto WhatsApp
                              </button>
                            </div>
                          </>
                        ) : (
                          <p className="text-sm text-ink-muted">Todavía no se generó.</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {surplus ? (
                  <div className="operation-card mt-6">
                    <h3 className="text-xl font-semibold text-forest">Excedente</h3>
                    <div className="mt-4">
                      <DataTable
                        caption="Excedente por variedad"
                        columns={SURPLUS_COLUMNS}
                        empty="Sin datos todavía."
                        rowKey={(item) => `${item.familyName}-${item.variantName}`}
                        rows={surplus.items}
                      />
                    </div>

                    {/*
                     * Ni coeficiente ni baja manual.
                     *
                     * El coeficiente calculaba una producción sugerida sobre la demanda; en la
                     * práctica cocina produce lo que decide y después informa lo real, así que era
                     * un número que nadie miraba. Y dar de baja el remanente a mano era un paso
                     * que había que acordarse de hacer: ahora lo hace el cierre del período.
                     */}
                    <p className="mt-4 text-sm text-ink-muted">
                      <strong>Disponible</strong> es lo producido que todavía no está asignado a
                      ningún pedido. Al cerrar el período, lo que quede se da de baja solo.
                    </p>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="empty-state mt-6">
                Elegí un ciclo para calcular la producción desde pedidos confirmados.
              </p>
            )}
          </>
        )}
      </section>
    </DashboardShell>
  );
}
