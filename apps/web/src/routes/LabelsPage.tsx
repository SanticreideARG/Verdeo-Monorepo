import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  FONT_STACKS,
  LAYOUT_OPTIONS,
  SHEET_PRESETS,
  type LabelData,
  type LabelField,
  type LabelRenderSettings,
} from '@verdeo/labels';

import { ActionButton } from '../components/ActionButton.js';
import { KitchenLabelsPanel } from '../components/KitchenLabelsPanel.js';
import { LabelViewer } from '../components/LabelViewer.js';
import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { PeriodPicker } from '../components/PeriodPicker.js';
import { RunFilter } from '../components/RunFilter.js';
import { openPrintable } from '../lib/openPrintable.js';
import { apiRequest } from '../lib/api.js';
import { errorMessage, type LabelSettings, type WeeklyMenu } from '../lib/operations.js';
import { currentPeriod, periodsFromMenus, type Period } from '../lib/periods.js';
import { todayInOperation } from '../lib/dates.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';
import { showToast } from '../lib/toast.js';

interface OrderHit {
  customer: { displayName: string };
  id: string;
  publicNumber: string;
  status: string;
}

// 24 es la hoja de stickers troquelados de 3 × 8 que usa cocina.
const LABELS_PER_PAGE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 18, 21, 24];

/** Familias de sistema: la etiqueta se imprime sin depender de descargar una fuente. */
const FONT_OPTIONS = [
  { key: 'system', label: 'Del sistema' },
  { key: 'humanist', label: 'Legible (Verdana)' },
  { key: 'grotesque', label: 'Neutra (Trebuchet)' },
  { key: 'rounded', label: 'Redondeada' },
  { key: 'condensed', label: 'Condensada · entra más texto' },
  { key: 'titular', label: 'Titular · bien gruesa' },
  { key: 'serif', label: 'Con serifa (Georgia)' },
  { key: 'clasica', label: 'Clásica (Times)' },
  { key: 'elegante', label: 'Elegante (Garamond)' },
  { key: 'manuscrita', label: 'Manuscrita' },
  { key: 'maquina', label: 'Máquina de escribir' },
  { key: 'mono', label: 'Monoespaciada' },
] as const;

/**
 * Qué puede llevar una etiqueta además del nombre, en el orden en que se imprime.
 *
 * El nombre no está en la lista y no se puede apagar: es lo único que responde de quién es la
 * vianda, que es la pregunta que la etiqueta existe para contestar. Las claves son las del catálogo
 * del paquete de etiquetas, el mismo que valida la base.
 */
const FIELD_OPTIONS = [
  // Sólo dice algo con 'Una etiqueta por plato' activado; sin eso la etiqueta es de la vianda
  // entera y este campo sale vacío.
  { key: 'plato', label: 'Plato (con etiqueta por plato)' },
  { key: 'tamano', label: 'Tamaño (250 / 400)' },
  { key: 'variedad', label: 'Variedad' },
  { key: 'platos', label: 'Platos de la vianda (la lista)' },
  { key: 'unidad', label: 'Unidad (1 de 3)' },
  { key: 'numero', label: 'N° de pedido' },
  { key: 'zona', label: 'Zona de entrega' },
  { key: 'entrega', label: 'Fecha de entrega' },
  { key: 'produccion', label: 'Fecha de producción' },
  { key: 'restricciones', label: 'Indicaciones alimentarias' },
  { key: 'frase', label: 'Frase personalizada' },
] as const satisfies readonly { key: LabelField; label: string }[];

/**
 * "Etiquetas": armar la tanda y ver cómo va a salir, en la misma pantalla.
 *
 * Se elige qué imprimir (el ciclo entero, una zona o un reparto), se ajusta el formato, y el visor
 * de la derecha dibuja las etiquetas **con el mismo motor que la impresión**: lo que se ve es lo que
 * sale, y se actualiza con cada cambio, sin guardar.
 */
export function LabelsPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const [settings, setSettings] = useState<LabelSettings | null>(null);
  const [labelsPerPage, setLabelsPerPage] = useState(8);
  const [fontFamily, setFontFamily] = useState<LabelSettings['fontFamily']>('system');
  const [fontScale, setFontScale] = useState(100);
  const [fields, setFields] = useState<LabelField[]>(['tamano', 'numero']);
  const [alignment, setAlignment] = useState<'center' | 'left'>('center');
  const [uppercaseName, setUppercaseName] = useState(false);
  const [onePerDish, setOnePerDish] = useState(false);
  const [kitchenMode, setKitchenMode] = useState(false);
  const [showSize, setShowSize] = useState(false);
  const [intuitivoCustomerName, setIntuitivoCustomerName] = useState(true);
  const [showLogo, setShowLogo] = useState(false);
  const [showBorders, setShowBorders] = useState(true);
  const [showCutLines, setShowCutLines] = useState(true);
  const [layout, setLayout] = useState<LabelRenderSettings['layout']>('clasica');
  const [logoHeightMm, setLogoHeightMm] = useState(10);
  const [logoPaddingBottomMm, setLogoPaddingBottomMm] = useState(2);
  const [customPhrase, setCustomPhrase] = useState('');
  // La fecha de elaboración no se guarda: cambia en cada tanda, y arranca en hoy.
  const [productionDate, setProductionDate] = useState(() => todayInOperation());
  const [hideSurname, setHideSurname] = useState(false);
  const [showCustomerName, setShowCustomerName] = useState(true);
  const [nameScale, setNameScale] = useState(100);
  const [namePosition, setNamePosition] = useState<'arriba' | 'abajo'>('arriba');
  const [nameOnlyForComposable, setNameOnlyForComposable] = useState(false);
  const [sheetWidthMm, setSheetWidthMm] = useState(210);
  const [sheetHeightMm, setSheetHeightMm] = useState(297);
  const [sheetMarginMm, setSheetMarginMm] = useState(12);
  const [labelGapMm, setLabelGapMm] = useState(4);

  const [periods, setPeriods] = useState<Period[]>([]);
  const [cycleId, setCycleId] = useState('');
  const [zone, setZone] = useState('');
  // Un reparto: las etiquetas de esa salida, no las del período entero.
  const [runId, setRunId] = useState('');
  const [labels, setLabels] = useState<LabelData[]>([]);
  /*
   * Reimprimir un pedido suelto.
   *
   * Vivía sólo en la ficha del pedido, que es donde se lo busca cuando ya se lo tiene delante. Acá
   * hace falta por lo contrario: cuando se rompió una etiqueta en la cocina y lo único que se sabe
   * es el número.
   */
  const [orderQuery, setOrderQuery] = useState('');
  const [orderHits, setOrderHits] = useState<OrderHit[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  /*
   * Lo que el visor dibuja: los ajustes tal como están en pantalla, guardados o no. Es el mismo
   * objeto que el servidor arma al imprimir, así que el visor y la hoja no pueden discrepar.
   */
  const renderSettings = useMemo<LabelRenderSettings>(
    () => ({
      alignment,
      customPhrase: customPhrase.trim() || null,
      fields,
      fontFamily,
      fontScale,
      hideSurname,
      labelGapMm,
      labelsPerPage,
      layout,
      logoHeightMm,
      logoPaddingBottomMm,
      nameOnlyForComposable,
      namePosition,
      nameScale,
      showCustomerName,
      sheetHeightMm,
      sheetMarginMm,
      sheetWidthMm,
      showBorders,
      showCutLines,
      showLogo,
      uppercaseName,
    }),
    [
      alignment,
      customPhrase,
      fields,
      fontFamily,
      fontScale,
      hideSurname,
      labelGapMm,
      labelsPerPage,
      layout,
      logoHeightMm,
      logoPaddingBottomMm,
      nameOnlyForComposable,
      namePosition,
      nameScale,
      showCustomerName,
      sheetHeightMm,
      sheetMarginMm,
      sheetWidthMm,
      showBorders,
      showCutLines,
      showLogo,
      uppercaseName,
    ],
  );

  const canRead = profile?.permissions.includes('production.read') ?? false;
  const canWrite = profile?.permissions.includes('production.generate') ?? false;

  const load = useCallback(async () => {
    setLoading(true);
    const [settingsResponse, menusResponse] = await Promise.all([
      apiRequest('/api/v1/label-settings'),
      apiRequest('/api/v1/menus'),
    ]);
    if (settingsResponse.ok) {
      const body = (await settingsResponse.json()) as LabelSettings;
      setSettings(body);
      setLabelsPerPage(body.labelsPerPage);
      setFontFamily(body.fontFamily);
      setFontScale(body.fontScale);
      setFields(body.fields);
      setAlignment(body.alignment);
      setUppercaseName(body.uppercaseName);
      setOnePerDish(body.onePerDish);
      setKitchenMode(body.kitchenMode);
      setShowSize(body.showSize);
      setIntuitivoCustomerName(body.intuitivoCustomerName);
      setShowLogo(body.showLogo);
      setShowBorders(body.showBorders);
      setShowCutLines(body.showCutLines);
      setLayout(body.layout);
      setLogoHeightMm(body.logoHeightMm);
      setLogoPaddingBottomMm(body.logoPaddingBottomMm);
      setCustomPhrase(body.customPhrase ?? '');
      setHideSurname(body.hideSurname);
      setShowCustomerName(body.showCustomerName);
      setNameScale(body.nameScale);
      setNamePosition(body.namePosition);
      setNameOnlyForComposable(body.nameOnlyForComposable);
      setSheetWidthMm(body.sheetWidthMm);
      setSheetHeightMm(body.sheetHeightMm);
      setSheetMarginMm(body.sheetMarginMm);
      setLabelGapMm(body.labelGapMm);
    }
    if (menusResponse.ok) {
      const list = periodsFromMenus(
        ((await menusResponse.json()) as { items: WeeklyMenu[] }).items,
      );
      setPeriods(list);
      setCycleId((current) => current || (currentPeriod(list)?.id ?? ''));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (canRead) void load();
    else setLoading(false);
  }, [canRead, load]);

  // Las etiquetas de la semana elegida: de acá salen las zonas, el conteo y los datos de la vista
  // previa. Se piden sin imprimir nada, que es lo que permite decidir antes de gastar papel.
  useEffect(() => {
    if (!canRead || !cycleId) {
      setLabels([]);
      return;
    }
    let active = true;
    setLabelsLoading(true);
    void apiRequest(`/api/v1/production/${cycleId}/labels${runId ? `?reparto=${runId}` : ''}`)
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          setLabels([]);
          return;
        }
        setLabels(((await response.json()) as { items: LabelData[] }).items);
      })
      .finally(() => {
        if (active) setLabelsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canRead, cycleId, settings?.onePerDish, runId]);

  // Busca a los 350 ms de dejar de tipear, y desde dos caracteres: con uno, la lista no dice nada.
  useEffect(() => {
    const trimmed = orderQuery.trim();
    if (!canRead || trimmed.length < 2) {
      setOrderHits([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void apiRequest(`/api/v1/orders?search=${encodeURIComponent(trimmed)}&limit=5`).then(
        async (response) => {
          if (!active || !response.ok) return;
          setOrderHits(((await response.json()) as { items: OrderHit[] }).items);
        },
      );
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [canRead, orderQuery]);

  /** La hoja de un pedido solo: las etiquetas de sus unidades, con el mismo formato. */
  async function printOrder(orderId: string) {
    setMessage('');
    const problem = await openPrintable(() =>
      apiRequest(
        `/api/v1/orders/${orderId}/labels/export${
          fields.includes('produccion') && productionDate
            ? `?produccion=${encodeURIComponent(productionDate)}`
            : ''
        }`,
      ),
    );
    if (problem) setMessage(problem);
  }

  async function save() {
    setMessage('');
    const response = await apiRequest('/api/v1/label-settings', {
      body: JSON.stringify({
        alignment,
        customPhrase: customPhrase.trim() || null,
        layout,
        logoHeightMm,
        logoPaddingBottomMm,
        showCutLines,
        fields,
        fontFamily,
        fontScale,
        hideSurname,
        labelGapMm,
        nameOnlyForComposable,
        namePosition,
        nameScale,
        showCustomerName,
        onePerDish,
        kitchenMode,
        showSize,
        intuitivoCustomerName,
        showLogo,
        labelsPerPage,
        sheetHeightMm,
        sheetMarginMm,
        sheetWidthMm,
        showBorders,
        uppercaseName,
      }),
      method: 'PATCH',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    setSettings((await response.json()) as LabelSettings);
    showToast('Formato guardado.');
  }

  /**
   * Abre la hoja lista para imprimir.
   *
   * Es la misma página que el navegador manda a la impresora o guarda como PDF desde su propio
   * diálogo: no se genera un PDF en el servidor —eso metería una librería de PDF en la función—, y
   * por eso el botón nombra las dos salidas en vez de prometer un archivo.
   */
  async function print() {
    setMessage('');
    const params = new URLSearchParams();
    if (zone) params.set('zone', zone);
    if (runId) params.set('reparto', runId);
    // La fecha de producción sale de lo que se ve en el visor, no de la que haya guardada.
    if (fields.includes('produccion') && productionDate) params.set('produccion', productionDate);
    const query = params.size > 0 ? `?${params.toString()}` : '';
    const problem = await openPrintable(() =>
      apiRequest(`/api/v1/production/${cycleId}/labels/export${query}`),
    );
    if (problem) setMessage(problem);
  }

  if (failed) return <DashboardFailed label="las etiquetas" />;
  if (!profile) return <DashboardLoading />;

  if (!canRead) {
    return (
      <DashboardShell profile={profile} onLogout={() => void logout()}>
        <section className="dashboard-panel">
          <h1 className="text-2xl font-semibold text-forest">Etiquetas</h1>
          <p className="mt-3 text-ink-muted">Tu usuario no tiene permiso para ver esto.</p>
        </section>
      </DashboardShell>
    );
  }

  const zones = [...new Set(labels.map((label) => label.deliveryZone ?? 'Sin zona'))].sort(
    (left, right) => left.localeCompare(right, 'es-AR'),
  );
  const selected = zone
    ? labels.filter((label) => (label.deliveryZone ?? 'Sin zona') === zone)
    : labels;
  const sheets = Math.ceil(selected.length / labelsPerPage);

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="dashboard-kicker">Producción · versión anterior</p>
            <h1 className="text-2xl font-semibold text-forest">Etiquetas (clásico)</h1>
            <p className="mt-2 max-w-3xl text-sm text-ink-muted">
              El generador anterior, archivado: sigue andando con sus ajustes de hoja y formato. Las
              etiquetas de producción se imprimen desde Etiquetas.
            </p>
          </div>
          <Link className="button button-secondary" to="/app/etiquetas">
            Ir a Etiquetas
          </Link>
        </header>

        {message ? (
          <p className="screen-notice mt-5" role="alert">
            {message}
          </p>
        ) : null}

        {loading && !settings ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : (
          <div className={`labels-layout mt-6 ${loading ? 'is-refreshing' : ''}`}>
            <div className="grid content-start gap-5">
              <div className="operation-card grid gap-4">
                <p className="text-sm font-semibold text-forest">Qué imprimir</p>
                <PeriodPicker onChange={setCycleId} periods={periods} value={cycleId} />
                <label className="field">
                  Zona
                  {/* Cocina termina por zona: imprimir esa tanda es lo que hace falta, no las
                      ciento cincuenta del ciclo entero. */}
                  <select onChange={(event) => setZone(event.target.value)} value={zone}>
                    <option value="">Todas las zonas</option>
                    {zones.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <RunFilter onChange={setRunId} value={runId} />
                {settings?.kitchenMode ? (
                  <KitchenLabelsPanel
                    cycleId={cycleId}
                    labelsPerPage={settings.labelsPerPage}
                    runId={runId}
                    zone={zone}
                  />
                ) : (
                  <>
                    <p className="text-sm text-ink-muted" role="status">
                      {labelsLoading
                        ? 'Contando etiquetas…'
                        : `${String(selected.length)} etiquetas · ${String(sheets)} ${sheets === 1 ? 'hoja' : 'hojas'}${settings?.onePerDish ? ' · una por plato' : ''}`}
                    </p>
                    <ActionButton
                      className="button button-primary justify-self-start"
                      disabled={selected.length === 0}
                      onClick={print}
                      pendingLabel="Preparando…"
                    >
                      Imprimir o guardar como PDF
                    </ActionButton>
                    <p className="field-hint">
                      Se abre la hoja lista para imprimir. Para guardarla, elegí «Guardar como PDF»
                      en el destino del diálogo de impresión.
                    </p>
                  </>
                )}

                <label className="field">
                  O un pedido suelto
                  <input
                    onChange={(event) => setOrderQuery(event.target.value)}
                    placeholder="N° de pedido o cliente"
                    value={orderQuery}
                  />
                </label>
                {orderHits.length > 0 ? (
                  <ul className="grid gap-1">
                    {orderHits.map((hit) => (
                      <li key={hit.id}>
                        <button
                          className="helpbot-row"
                          onClick={() => void printOrder(hit.id)}
                          type="button"
                        >
                          <span>
                            <strong>{hit.publicNumber}</strong>
                            <small>{hit.customer.displayName}</small>
                          </span>
                          <span aria-hidden="true">Imprimir</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="operation-card grid gap-4">
                <p className="text-sm font-semibold text-forest">La hoja</p>
                <label className="field">
                  Tamaño de hoja
                  <select
                    disabled={!canWrite}
                    onChange={(event) => {
                      const preset = SHEET_PRESETS.find((item) => item.key === event.target.value);
                      if (!preset) return;
                      setSheetWidthMm(preset.widthMm);
                      setSheetHeightMm(preset.heightMm);
                    }}
                    value={
                      SHEET_PRESETS.find(
                        (preset) =>
                          preset.widthMm === sheetWidthMm && preset.heightMm === sheetHeightMm,
                      )?.key ?? ''
                    }
                  >
                    <option value="">A medida</option>
                    {SHEET_PRESETS.map((preset) => (
                      <option key={preset.key} value={preset.key}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-grid">
                  <label className="field">
                    Ancho (mm)
                    <input
                      disabled={!canWrite}
                      max={420}
                      min={80}
                      onChange={(event) => setSheetWidthMm(Number(event.target.value))}
                      type="number"
                      value={sheetWidthMm}
                    />
                  </label>
                  <label className="field">
                    Alto (mm)
                    <input
                      disabled={!canWrite}
                      max={600}
                      min={80}
                      onChange={(event) => setSheetHeightMm(Number(event.target.value))}
                      type="number"
                      value={sheetHeightMm}
                    />
                  </label>
                  <label className="field">
                    Margen (mm)
                    <input
                      disabled={!canWrite}
                      max={40}
                      min={0}
                      onChange={(event) => setSheetMarginMm(Number(event.target.value))}
                      type="number"
                      value={sheetMarginMm}
                    />
                  </label>
                  <label className="field">
                    Separación (mm)
                    <input
                      disabled={!canWrite}
                      max={20}
                      min={0}
                      onChange={(event) => setLabelGapMm(Number(event.target.value))}
                      type="number"
                      value={labelGapMm}
                    />
                  </label>
                  <label className="field">
                    Etiquetas por hoja
                    <select
                      disabled={!canWrite}
                      onChange={(event) => setLabelsPerPage(Number(event.target.value))}
                      value={labelsPerPage}
                    >
                      {LABELS_PER_PAGE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>

              <div className="operation-card grid gap-4">
                <p className="text-sm font-semibold text-forest">Qué muestra cada etiqueta</p>
                <fieldset className="label-fields">
                  <legend className="sr-only">Campos de la etiqueta</legend>
                  <p className="text-sm text-ink-muted">
                    El nombre del cliente va siempre y no se puede quitar. Los campos se imprimen en
                    este orden.
                  </p>
                  {FIELD_OPTIONS.map((option) => (
                    <label key={option.key}>
                      <input
                        checked={fields.includes(option.key)}
                        disabled={!canWrite}
                        onChange={() =>
                          // Se guarda en el orden del catálogo y no en el de los clics: si no, los
                          // renglones bailan de lugar cada vez que se apaga y se enciende uno.
                          setFields((current) =>
                            current.includes(option.key)
                              ? current.filter((field) => field !== option.key)
                              : FIELD_OPTIONS.filter(
                                  (candidate) =>
                                    candidate.key === option.key || current.includes(candidate.key),
                                ).map((candidate) => candidate.key),
                          )
                        }
                        type="checkbox"
                      />
                      {option.label}
                    </label>
                  ))}
                </fieldset>

                {fields.includes('produccion') ? (
                  <label className="field">
                    Fecha de producción
                    <input
                      onChange={(event) => setProductionDate(event.target.value)}
                      type="date"
                      value={productionDate}
                    />
                    <small className="field-hint">
                      No se guarda: se elige en cada tanda y arranca en hoy.
                    </small>
                  </label>
                ) : null}
                {fields.includes('frase') ? (
                  <label className="field">
                    Frase personalizada
                    <input
                      disabled={!canWrite}
                      maxLength={120}
                      onChange={(event) => setCustomPhrase(event.target.value)}
                      placeholder="Por ejemplo: Calentar 3 minutos"
                      value={customPhrase}
                    />
                    <small className="field-hint">
                      La misma en todas las etiquetas. {String(customPhrase.length)} de 120.
                    </small>
                  </label>
                ) : null}

                <label className="field">
                  Diseño
                  <select
                    disabled={!canWrite}
                    onChange={(event) => setLayout(event.target.value as typeof layout)}
                    value={layout}
                  >
                    {LAYOUT_OPTIONS.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label} — {option.description}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="form-grid">
                  <label className="field">
                    Alineación
                    <select
                      disabled={!canWrite}
                      onChange={(event) => setAlignment(event.target.value as 'center' | 'left')}
                      value={alignment}
                    >
                      <option value="center">Centrada</option>
                      <option value="left">A la izquierda</option>
                    </select>
                  </label>
                  <label className="field">
                    Tipografía
                    <select
                      disabled={!canWrite}
                      onChange={(event) =>
                        setFontFamily(event.target.value as LabelSettings['fontFamily'])
                      }
                      value={fontFamily}
                    >
                      {/* Cada opción escrita con su propia fuente: elegir "Elegante" sin verla es
                          adivinar, y la vista previa recién la muestra después de elegir. */}
                      {FONT_OPTIONS.map((option) => (
                        <option
                          key={option.key}
                          style={{ fontFamily: FONT_STACKS[option.key] }}
                          value={option.key}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="field">
                  Tamaño de letra — {fontScale}%
                  <input
                    disabled={!canWrite}
                    max={200}
                    min={60}
                    onChange={(event) => setFontScale(Number(event.target.value))}
                    step={10}
                    type="range"
                    value={fontScale}
                  />
                </label>

                <label className="label-switch">
                  <input
                    checked={showCustomerName}
                    disabled={!canWrite}
                    onChange={(event) => setShowCustomerName(event.target.checked)}
                    type="checkbox"
                  />
                  Imprimir el nombre del cliente
                </label>
                {showCustomerName ? (
                  <div className="form-grid">
                    <label className="field">
                      Tamaño del nombre — {nameScale}%
                      <input
                        disabled={!canWrite}
                        max={200}
                        min={50}
                        onChange={(event) => setNameScale(Number(event.target.value))}
                        step={10}
                        type="range"
                        value={nameScale}
                      />
                    </label>
                    <label className="field">
                      Posición del nombre
                      <select
                        disabled={!canWrite}
                        onChange={(event) =>
                          setNamePosition(event.target.value === 'abajo' ? 'abajo' : 'arriba')
                        }
                        value={namePosition}
                      >
                        <option value="arriba">Arriba, antes de los datos</option>
                        <option value="abajo">Abajo, después de los datos</option>
                      </select>
                    </label>
                  </div>
                ) : null}
                <label className="label-switch">
                  <input
                    checked={uppercaseName}
                    disabled={!canWrite}
                    onChange={(event) => setUppercaseName(event.target.checked)}
                    type="checkbox"
                  />
                  Nombre en mayúsculas
                </label>
                <label className="label-switch">
                  <input
                    checked={showBorders}
                    disabled={!canWrite}
                    onChange={(event) => setShowBorders(event.target.checked)}
                    type="checkbox"
                  />
                  Borde alrededor de cada etiqueta
                </label>
                <label className="label-switch">
                  <input
                    checked={showCutLines}
                    disabled={!canWrite}
                    onChange={(event) => setShowCutLines(event.target.checked)}
                    type="checkbox"
                  />
                  Líneas de recorte (marcas en las esquinas)
                </label>
                <label className="label-switch">
                  <input
                    checked={hideSurname}
                    disabled={!canWrite}
                    onChange={(event) => setHideSurname(event.target.checked)}
                    type="checkbox"
                  />
                  Sin apellido (nombre e iniciales)
                </label>
                {/*
                 * Una etiqueta por plato.
                 *
                 * La de la vianda se pega en la tapa y dice de quién es; ésta va en cada
                 * recipiente de adentro, para que diga qué tiene sin abrirlo. Multiplica la
                 * cantidad de etiquetas, así que el conteo de arriba lo refleja antes de imprimir.
                 */}
                {/*
                 * Etiquetas de cocina: la hoja de producción. Una por plato, sin cliente, con el
                 * plato, su acompañamiento y "KETO ELAB # 24-09". Cambia qué se imprime abajo.
                 */}
                <label className="label-switch">
                  <input
                    checked={kitchenMode}
                    disabled={!canWrite}
                    onChange={(event) => setKitchenMode(event.target.checked)}
                    type="checkbox"
                  />{' '}
                  Etiquetas de cocina (una por plato, sin cliente)
                </label>
                {kitchenMode ? (
                  <>
                    <label className="label-switch">
                      <input
                        checked={showSize}
                        disabled={!canWrite}
                        onChange={(event) => setShowSize(event.target.checked)}
                        type="checkbox"
                      />{' '}
                      Mostrar el tamaño
                    </label>
                    <label className="label-switch">
                      <input
                        checked={intuitivoCustomerName}
                        disabled={!canWrite}
                        onChange={(event) => setIntuitivoCustomerName(event.target.checked)}
                        type="checkbox"
                      />{' '}
                      Nombre del cliente en los Intuitivo
                    </label>
                  </>
                ) : null}
                <label className="label-switch">
                  <input
                    checked={onePerDish}
                    disabled={!canWrite}
                    onChange={(event) => setOnePerDish(event.target.checked)}
                    type="checkbox"
                  />{' '}
                  Una etiqueta por plato
                </label>
                <label className="label-switch">
                  <input
                    checked={showLogo}
                    disabled={!canWrite}
                    onChange={(event) => setShowLogo(event.target.checked)}
                    type="checkbox"
                  />{' '}
                  Logo de Verdeo arriba, centrado
                </label>
                {showLogo ? (
                  <div className="form-grid">
                    <label className="field">
                      Alto del logo (mm)
                      <input
                        disabled={!canWrite}
                        max={40}
                        min={3}
                        onChange={(event) => setLogoHeightMm(Number(event.target.value))}
                        type="number"
                        value={logoHeightMm}
                      />
                    </label>
                    <label className="field">
                      Espacio debajo (mm)
                      <input
                        disabled={!canWrite}
                        max={20}
                        min={0}
                        onChange={(event) => setLogoPaddingBottomMm(Number(event.target.value))}
                        type="number"
                        value={logoPaddingBottomMm}
                      />
                    </label>
                  </div>
                ) : null}
                <label className="label-switch">
                  <input
                    checked={nameOnlyForComposable}
                    disabled={!canWrite}
                    onChange={(event) => setNameOnlyForComposable(event.target.checked)}
                    type="checkbox"
                  />
                  Nombre sólo en las Intuitivo
                </label>
                <p className="field-hint">
                  {/* Dos interruptores que se combinan, y la combinación no es obvia: conviene
                      decir qué va a salir en vez de dejar que se descubra imprimiendo. */}
                  {nameOnlyForComposable
                    ? hideSurname
                      ? 'Las Intuitivo salen con nombre e iniciales; el resto, sin nombre.'
                      : 'Las Intuitivo salen con el nombre completo; el resto, sin nombre.'
                    : hideSurname
                      ? 'Todas salen con nombre e iniciales.'
                      : 'Todas salen con el nombre completo.'}
                </p>

                {canWrite ? (
                  <ActionButton
                    className="button button-primary justify-self-start"
                    onClick={() => save()}
                    pendingLabel="Guardando…"
                  >
                    Guardar formato
                  </ActionButton>
                ) : null}
              </div>
            </div>

            {/*
             * El visor: el mismo dibujo que la impresión, con los ajustes que se están tocando.
             * Una etiqueta o la hoja, con Anterior y Siguiente para recorrer la serie.
             */}
            <aside className="labels-preview">
              <LabelViewer
                labels={selected}
                productionDate={fields.includes('produccion') ? productionDate : null}
                settings={renderSettings}
              />
            </aside>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
