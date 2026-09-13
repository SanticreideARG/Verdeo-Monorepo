import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';

import { ActionButton } from '../components/ActionButton.js';
import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { PeriodPicker } from '../components/PeriodPicker.js';
import { apiRequest } from '../lib/api.js';
import { labelCanvas, SHEET_PRESETS } from '../lib/labelSheet.js';
import { errorMessage, type LabelSettings, type WeeklyMenu } from '../lib/operations.js';
import { currentPeriod, periodsFromMenus, type Period } from '../lib/periods.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface Label {
  customerDisplayName: string;
  deliveryDate: string;
  deliveryZone: string | null;
  dietaryInstructions: string[];
  familyName: string;
  orderPublicNumber: string;
  unitIndex: number;
  unitTotal: number;
  variantName: string;
}

const LABELS_PER_PAGE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** Familias de sistema: la etiqueta se imprime sin depender de descargar una fuente. */
const FONT_OPTIONS = [
  { key: 'system', label: 'Del sistema' },
  { key: 'rounded', label: 'Redondeada' },
  { key: 'serif', label: 'Con serifa' },
  { key: 'condensed', label: 'Condensada' },
  { key: 'mono', label: 'Monoespaciada' },
] as const;

const FONT_STACKS: Record<LabelSettings['fontFamily'], string> = {
  condensed: '"Arial Narrow", sans-serif',
  mono: 'ui-monospace, monospace',
  rounded: '"Nunito", system-ui, sans-serif',
  serif: 'Georgia, serif',
  system: 'system-ui, sans-serif',
};

/**
 * Qué puede llevar una etiqueta además del nombre.
 *
 * El nombre no está en la lista y no se puede apagar: es lo único que responde de quién es la
 * vianda, que es la pregunta que la etiqueta existe para contestar.
 */
const FIELD_OPTIONS = [
  { key: 'tamano', label: 'Tamaño (250 / 400)' },
  { key: 'variedad', label: 'Variedad' },
  { key: 'unidad', label: 'Unidad (1 de 3)' },
  { key: 'numero', label: 'N° de pedido' },
  { key: 'zona', label: 'Zona de entrega' },
  { key: 'entrega', label: 'Fecha de entrega' },
  { key: 'restricciones', label: 'Indicaciones alimentarias' },
] as const;

type LabelField = (typeof FIELD_OPTIONS)[number]['key'];

/** El renglón que se ve grande junto al nombre; el resto va chico, igual que al imprimir. */
const EMPHASISED = new Set<LabelField>(['tamano', 'variedad', 'restricciones']);

/** Con qué se dibuja la vista previa cuando la tanda todavía no tiene etiquetas. */
const SAMPLE: Label = {
  customerDisplayName: 'Ana Isabella Vega',
  deliveryDate: '2026-09-13',
  deliveryZone: 'Centro',
  dietaryInstructions: ['Sin cebolla'],
  familyName: 'Keto',
  orderPublicNumber: 'NQN-00090',
  unitIndex: 1,
  unitTotal: 3,
  variantName: '250',
};

function fieldValue(label: Label, field: LabelField): string | null {
  switch (field) {
    case 'entrega':
      return `${label.deliveryDate.slice(8, 10)}/${label.deliveryDate.slice(5, 7)}`;
    case 'numero':
      return label.orderPublicNumber;
    case 'restricciones':
      return label.dietaryInstructions.length > 0 ? label.dietaryInstructions.join(' · ') : null;
    case 'tamano':
      return label.variantName;
    case 'unidad':
      return `${String(label.unitIndex)} de ${String(label.unitTotal)}`;
    case 'variedad':
      return label.familyName;
    case 'zona':
      return label.deliveryZone;
  }
}

/**
 * "Etiquetas": armar la tanda y ver cómo va a salir, en la misma pantalla.
 *
 * Estaba partida en dos —el formato en Ajustes, la generación en Cocina—, así que para saber si un
 * fondo entraba había que configurarlo en un lado, ir al otro, imprimir y volver. Acá se elige qué
 * imprimir (el ciclo entero o una zona), se ajusta el formato, y la vista previa de la derecha
 * muestra la hoja y una etiqueta **a tamaño real**: el lienzo sale de la misma cuenta que hace la
 * impresión —hoja menos márgenes, dividido por la grilla—, así que lo que se ve es lo que sale.
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
  const [showBorders, setShowBorders] = useState(true);
  const [sheetWidthMm, setSheetWidthMm] = useState(210);
  const [sheetHeightMm, setSheetHeightMm] = useState(297);
  const [sheetMarginMm, setSheetMarginMm] = useState(12);
  const [labelGapMm, setLabelGapMm] = useState(4);

  const [periods, setPeriods] = useState<Period[]>([]);
  const [cycleId, setCycleId] = useState('');
  const [zone, setZone] = useState('');
  const [labels, setLabels] = useState<Label[]>([]);
  const [labelsLoading, setLabelsLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      setShowBorders(body.showBorders);
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
    void apiRequest(`/api/v1/production/${cycleId}/labels`)
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          setLabels([]);
          return;
        }
        setLabels(((await response.json()) as { items: Label[] }).items);
      })
      .finally(() => {
        if (active) setLabelsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canRead, cycleId]);

  async function save(backgroundImageUrl?: string | null) {
    setMessage('');
    const response = await apiRequest('/api/v1/label-settings', {
      body: JSON.stringify({
        ...(backgroundImageUrl !== undefined ? { backgroundImageUrl } : {}),
        alignment,
        fields,
        fontFamily,
        fontScale,
        labelGapMm,
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
    setMessage('Formato guardado.');
  }

  async function uploadBackground(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setMessage('');
    const response = await apiRequest('/api/v1/label-settings/background', {
      body: file,
      headers: { 'content-type': file.type },
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const { url } = (await response.json()) as { url: string };
    await save(url);
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
    const query = zone ? `?zone=${encodeURIComponent(zone)}` : '';
    const response = await apiRequest(`/api/v1/production/${cycleId}/labels/export${query}`);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    // Revocar en el mismo turno corre carrera con la pestaña que recién se abre.
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
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

  const canvas = labelCanvas(
    { gapMm: labelGapMm, heightMm: sheetHeightMm, marginMm: sheetMarginMm, widthMm: sheetWidthMm },
    labelsPerPage,
  );
  const zones = [...new Set(labels.map((label) => label.deliveryZone ?? 'Sin zona'))].sort(
    (left, right) => left.localeCompare(right, 'es-AR'),
  );
  const selected = zone
    ? labels.filter((label) => (label.deliveryZone ?? 'Sin zona') === zone)
    : labels;
  const sheets = Math.ceil(selected.length / labelsPerPage);
  const sample = selected[0] ?? SAMPLE;

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header>
          <p className="dashboard-kicker">Producción</p>
          <h1 className="text-2xl font-semibold text-forest">Etiquetas</h1>
          <p className="mt-2 max-w-3xl text-sm text-ink-muted">
            Una etiqueta por vianda. Elegí qué tanda imprimir y cómo se ve; a la derecha está la
            hoja completa y una etiqueta a tamaño real, con el mismo lienzo que sale impreso.
          </p>
        </header>

        {message ? (
          <p className="mt-5 rounded-xl bg-forest/5 px-4 py-3 text-sm text-forest" role="status">
            {message}
          </p>
        ) : null}

        {loading ? (
          <p className="mt-6 text-ink-muted">Cargando…</p>
        ) : (
          <div className="labels-layout mt-6">
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
                <p className="text-sm text-ink-muted" role="status">
                  {labelsLoading
                    ? 'Contando etiquetas…'
                    : `${String(selected.length)} etiquetas · ${String(sheets)} ${sheets === 1 ? 'hoja' : 'hojas'}`}
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
                  Se abre la hoja lista para imprimir. Para guardarla, elegí «Guardar como PDF» en
                  el destino del diálogo de impresión.
                </p>
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
                      {FONT_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>
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
                  Recuadro de corte
                </label>

                <div>
                  <p className="text-sm font-semibold text-forest">Fondo de etiqueta</p>
                  {settings?.backgroundImageUrl ? (
                    <img
                      alt="Fondo actual de la etiqueta"
                      className="mt-2 h-24 w-24 rounded-lg border border-forest/10 object-cover"
                      src={settings.backgroundImageUrl}
                    />
                  ) : (
                    <p className="mt-2 text-sm text-ink-muted">Sin fondo (etiqueta lisa).</p>
                  )}
                  {canWrite ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <input
                        accept="image/jpeg,image/png"
                        className="sr-only"
                        onChange={(event) => void uploadBackground(event)}
                        ref={fileInputRef}
                        type="file"
                      />
                      <button
                        className="button button-secondary"
                        onClick={() => fileInputRef.current?.click()}
                        type="button"
                      >
                        Subir fondo (PNG o JPG)
                      </button>
                      {settings?.backgroundImageUrl ? (
                        <button
                          className="button button-secondary"
                          onClick={() => void save(null)}
                          type="button"
                        >
                          Quitar fondo
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {canWrite ? (
                  <button
                    className="button button-primary justify-self-start"
                    onClick={() => void save()}
                    type="button"
                  >
                    Guardar formato
                  </button>
                ) : null}
              </div>
            </div>

            {/*
             * La vista previa, con dos cosas distintas que las dos hacen falta: la hoja entera dice
             * cuántas entran y cómo quedan repartidas, y la etiqueta a tamaño real dice si el
             * nombre, los campos y el fondo entran de verdad en el papel.
             */}
            <aside className="labels-preview">
              <div className="labels-preview-card">
                <p className="labels-preview-title">La hoja</p>
                <p className="field-hint">
                  {sheetWidthMm} × {sheetHeightMm} mm · {canvas.columns} × {canvas.rows} etiquetas
                </p>
                <div
                  className="labels-sheet"
                  style={{
                    aspectRatio: `${String(sheetWidthMm)} / ${String(sheetHeightMm)}`,
                    gap: `${String((labelGapMm / sheetWidthMm) * 100)}%`,
                    gridTemplateColumns: `repeat(${String(canvas.columns)}, 1fr)`,
                    gridTemplateRows: `repeat(${String(canvas.rows)}, 1fr)`,
                    padding: `${String((sheetMarginMm / sheetHeightMm) * 100)}% ${String((sheetMarginMm / sheetWidthMm) * 100)}%`,
                  }}
                >
                  {Array.from({ length: canvas.columns * canvas.rows }, (_, index) => (
                    <div
                      className={`labels-sheet-cell ${selected.length === 0 || index < selected.length ? 'is-used' : ''}`}
                      key={index}
                      style={
                        settings?.backgroundImageUrl
                          ? { backgroundImage: `url(${settings.backgroundImageUrl})` }
                          : {}
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="labels-preview-card">
                <p className="labels-preview-title">Una etiqueta, a tamaño real</p>
                <p className="field-hint">
                  {canvas.widthMm.toFixed(1)} × {canvas.heightMm.toFixed(1)} mm ·{' '}
                  {canvas.orientation === 'horizontal' ? 'apaisada' : 'vertical'}
                </p>
                <div className="labels-real-scale">
                  <div
                    className="label-preview"
                    style={{
                      alignItems: alignment === 'left' ? 'flex-start' : 'center',
                      border: showBorders ? '1px dashed #999' : '1px solid transparent',
                      fontFamily: FONT_STACKS[fontFamily],
                      height: `${canvas.heightMm.toFixed(2)}mm`,
                      textAlign: alignment,
                      width: `${canvas.widthMm.toFixed(2)}mm`,
                      ...(settings?.backgroundImageUrl
                        ? { backgroundImage: `url(${settings.backgroundImageUrl})` }
                        : {}),
                    }}
                  >
                    <p
                      style={{
                        fontSize: `${String(20 * (fontScale / 100))}px`,
                        fontWeight: 700,
                        textTransform: uppercaseName ? 'uppercase' : 'none',
                      }}
                    >
                      {sample.customerDisplayName}
                    </p>
                    {fields.map((field) => {
                      const value = fieldValue(sample, field);
                      if (value === null) return null;
                      return (
                        <p
                          key={field}
                          style={
                            EMPHASISED.has(field)
                              ? { fontSize: `${String(15 * (fontScale / 100))}px`, fontWeight: 600 }
                              : { color: '#555', fontSize: `${String(10 * (fontScale / 100))}px` }
                          }
                        >
                          {value}
                        </p>
                      );
                    })}
                  </div>
                </div>
                <p className="field-hint">
                  {selected.length > 0
                    ? 'Con los datos del primer pedido de la tanda.'
                    : 'Con datos de ejemplo: esta tanda todavía no tiene etiquetas.'}
                </p>
              </div>
            </aside>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
