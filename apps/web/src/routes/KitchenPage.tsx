import { useCallback, useEffect, useState, type FormEvent } from 'react';

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
  { key: 'planificada', label: 'Planificada', render: (item) => item.produccionPlanificada },
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

async function printLabels(cycleId: string): Promise<string | null> {
  const response = await apiRequest(`/api/v1/production/${cycleId}/labels/export`);
  if (!response.ok) return errorMessage(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  URL.revokeObjectURL(url);
  return null;
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
  const [coefficientInput, setCoefficientInput] = useState('0');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const permissions = profile?.permissions ?? [];
  const canReport = permissions.includes('production.report');
  const canGenerate = permissions.includes('production.generate');
  const canAdjustSurplus = permissions.includes('production.adjust_surplus');

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
      setCoefficientInput(String(report.coefficientPercent));
    }
  }, []);

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

  async function saveCoefficient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const coefficientPercent = Number(coefficientInput);
    if (
      !Number.isFinite(coefficientPercent) ||
      coefficientPercent < 0 ||
      coefficientPercent > 100
    ) {
      setMessage('El coeficiente debe estar entre 0 y 100.');
      return;
    }
    setMessage('');
    const response = await apiRequest('/api/v1/surplus/config', {
      body: JSON.stringify({ coefficientPercent }),
      method: 'PATCH',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setMessage('Coeficiente actualizado.');
    if (selectedMenu) await loadSurplus(selectedMenu.cycle.id);
  }

  async function writeOff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMenu) return;
    const form = new FormData(event.currentTarget);
    const familyName = formText(form, 'familyName');
    const variantName = formText(form, 'variantName');
    const quantityUnits = Number(formText(form, 'quantityUnits'));
    const reason = formText(form, 'reason').trim();
    if (!familyName || !variantName || !quantityUnits || !reason) return;
    setMessage('');
    const response = await apiRequest(
      `/api/v1/production/${selectedMenu.cycle.id}/surplus/writeoffs`,
      {
        body: JSON.stringify({ entries: [{ familyName, quantityUnits, reason, variantName }] }),
        method: 'POST',
      },
    );
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setMessage('Baja registrada.');
    event.currentTarget.reset();
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
              <button
                className="button button-secondary"
                disabled={!selectedMenu}
                onClick={() =>
                  selectedMenu &&
                  void printLabels(selectedMenu.cycle.id).then(
                    (error) => error && setMessage(error),
                  )
                }
                type="button"
              >
                Generar etiquetas
              </button>
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
                          <div className="flex justify-between">
                            <span>
                              {item.familyName} {item.variantName}
                            </span>
                            <strong>{item.quantityUnits}</strong>
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
                          <p className="mt-1 text-sm text-ink-muted">
                            {item.dishSelections.join(' · ')}
                          </p>
                          {item.dietaryInstructions.length ? (
                            <p className="mt-2 text-sm font-semibold text-red-800">
                              {item.dietaryInstructions.join(' · ')}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </article>
                  <p className="text-right font-bold text-forest lg:col-span-2">
                    Total: {kitchen.totalUnits} unidades
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

                    {canAdjustSurplus ? (
                      <div className="mt-5 grid gap-4 sm:grid-cols-2">
                        <form
                          className="rounded-xl border border-forest/10 p-3"
                          onSubmit={(event) => void saveCoefficient(event)}
                        >
                          <label className="field">
                            Coeficiente global (%)
                            <input
                              max="100"
                              min="0"
                              onChange={(event) => setCoefficientInput(event.target.value)}
                              step="0.01"
                              type="number"
                              value={coefficientInput}
                            />
                          </label>
                          <button className="button button-secondary mt-3" type="submit">
                            Guardar coeficiente
                          </button>
                        </form>
                        <form
                          className="rounded-xl border border-forest/10 p-3"
                          onSubmit={(event) => void writeOff(event)}
                        >
                          <p className="mb-2 text-sm font-semibold text-forest">
                            Dar de baja remanente
                          </p>
                          <div className="form-grid">
                            <label className="field">
                              Variedad
                              <input name="familyName" required />
                            </label>
                            <label className="field">
                              Tamaño
                              <input name="variantName" required />
                            </label>
                            <label className="field">
                              Unidades
                              <input min="1" name="quantityUnits" required type="number" />
                            </label>
                            <label className="field field-wide">
                              Motivo
                              <input name="reason" required />
                            </label>
                          </div>
                          <button className="button button-secondary mt-3" type="submit">
                            Registrar baja
                          </button>
                        </form>
                      </div>
                    ) : null}
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
