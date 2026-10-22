import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  LABELS_PER_SHEET,
  PRODUCTION_PAPER,
  productionSheetCount,
  renderProductionSheets,
  type LabelData,
  type ProductionLabel,
} from '@verdeo/labels';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { PeriodPicker } from '../components/PeriodPicker.js';
import { RunFilter } from '../components/RunFilter.js';
import { apiRequest } from '../lib/api.js';
import { todayInOperation } from '../lib/dates.js';
import { errorMessage, type WeeklyMenu } from '../lib/operations.js';
import { currentPeriod, periodsFromMenus, type Period } from '../lib/periods.js';
import {
  looseLabels,
  menuGroups,
  plateGroups,
  type KitchenLabelRow,
  type LabelGroup,
} from '../lib/productionLabels.js';
import { showToast } from '../lib/toast.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

interface PrintedLabel {
  key: string;
  lastPrintedAt: string;
  printCount: number;
}

/** Una etiqueta suelta agregada a mano: qué etiqueta y cuántas. */
interface LooseEntry {
  id: string;
  labels: ProductionLabel[];
  title: string;
}

/** Las sueltas son reposiciones a propósito: no se anotan ni se avisa si se repiten. */
const isLoose = (label: ProductionLabel) => label.key.startsWith('suelta:');

/**
 * Imprimir desde un marco oculto de la misma página: no abre ventanas, así que el bloqueador de
 * ventanas emergentes no la frena. Espera a las tipografías: sin ellas, la hoja sale con las de
 * reemplazo y los nombres cortan distinto.
 */
function printInFrame(html: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  frame.srcdoc = html;
  frame.onload = () => {
    const view = frame.contentWindow;
    if (!view) return;
    void view.document.fonts.ready.then(() => {
      view.focus();
      view.print();
      // El diálogo de impresión frena la página hasta cerrarse; después, el marco sobra.
      window.setTimeout(() => frame.remove(), 1_000);
    });
  };
  document.body.append(frame);
}

/**
 * Etiquetas 2.0 (LABELS_2_PLAN.md): las etiquetas de producción sobre el papel Husares H34124.
 *
 * Sin opciones de hoja ni de formato. Se arma la tanda —grupos enteros del período más etiquetas
 * sueltas—, se ve tal cual sale y se imprime. Lo impreso queda anotado: si la tanda repite
 * etiquetas, se avisa antes.
 */
export function LabelsStudioPage() {
  const { failed, logout, profile } = useDashboardProfile();
  const canRead = profile?.permissions.includes('production.read') ?? false;

  const [periods, setPeriods] = useState<Period[]>([]);
  const [cycleId, setCycleId] = useState('');
  const [runId, setRunId] = useState('');
  // La fecha de elaboración va en el pie de los platos: casi siempre es hoy.
  const [productionDate, setProductionDate] = useState(() => todayInOperation());
  const [plates, setPlates] = useState<KitchenLabelRow[]>([]);
  const [units, setUnits] = useState<LabelData[]>([]);
  const [loading, setLoading] = useState(false);
  const [printed, setPrinted] = useState<Map<string, PrintedLabel>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loose, setLoose] = useState<LooseEntry[]>([]);
  const [looseChoice, setLooseChoice] = useState('');
  const [looseQuantity, setLooseQuantity] = useState(1);
  const [startAt, setStartAt] = useState(1);
  const [message, setMessage] = useState('');
  const [repeated, setRepeated] = useState<ProductionLabel[] | null>(null);

  useEffect(() => {
    if (!canRead) return;
    void apiRequest('/api/v1/menus').then(async (response) => {
      if (!response.ok) return;
      const list = periodsFromMenus(((await response.json()) as { items: WeeklyMenu[] }).items);
      setPeriods(list);
      setCycleId((current) => current || (currentPeriod(list)?.id ?? ''));
    });
  }, [canRead]);

  // Las dos series del período (o del reparto) y lo que ya se imprimió.
  useEffect(() => {
    if (!canRead || !cycleId) return;
    let active = true;
    setLoading(true);
    setMessage('');
    const reparto = runId ? `?reparto=${runId}` : '';
    void Promise.all([
      apiRequest(`/api/v1/production/${cycleId}/kitchen-labels${reparto}`, { notify: false }),
      apiRequest(`/api/v1/production/${cycleId}/labels${reparto}`, { notify: false }),
      apiRequest(`/api/v1/production/${cycleId}/printed-labels`, { notify: false }),
    ])
      .then(async ([kitchen, labels, prints]) => {
        if (!active) return;
        if (!kitchen.ok || !labels.ok) {
          setMessage(await errorMessage(kitchen.ok ? labels : kitchen));
          return;
        }
        const plateRows = ((await kitchen.json()) as { items: KitchenLabelRow[] }).items;
        const unitRows = ((await labels.json()) as { items: LabelData[] }).items;
        setPlates(plateRows);
        setUnits(unitRows);
        if (prints.ok) {
          const items = ((await prints.json()) as { items: PrintedLabel[] }).items;
          setPrinted(new Map(items.map((item) => [item.key, item])));
        }
        // Arranca con todo tildado: lo común es imprimir el período entero.
        setSelected(
          new Set([
            ...plateGroups(plateRows, productionDate).map((group) => group.id),
            ...menuGroups(unitRows).map((group) => group.id),
          ]),
        );
        setLoose([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // La fecha sólo cambia el pie: no hace falta volver a pedir nada.
  }, [canRead, cycleId, runId]);

  const platoGroups = useMemo(() => plateGroups(plates, productionDate), [plates, productionDate]);
  const menuGroupList = useMemo(() => menuGroups(units), [units]);

  // Lo que se puede agregar suelto: cada plato distinto y cada menú (variedad y tamaño, o cliente).
  const looseOptions = useMemo(() => {
    const options = new Map<string, { template: ProductionLabel; title: string }>();
    for (const group of platoGroups) {
      for (const label of group.labels) {
        if (label.kind !== 'plato') continue;
        const id = label.key.replace(/:\d+$/, '');
        if (!options.has(id)) {
          options.set(id, {
            template: label,
            title: `${label.dish}${label.side ? ` · ${label.side}` : ''} (${group.title.replace('Platos ', '')})`,
          });
        }
      }
    }
    for (const group of menuGroupList) {
      const first = group.labels[0];
      if (first) options.set(group.id, { template: first, title: `Menú ${group.title}` });
    }
    return [...options.entries()].map(([id, option]) => ({ id, ...option }));
  }, [platoGroups, menuGroupList]);

  const batch = useMemo(() => {
    const fromGroups = [...platoGroups, ...menuGroupList]
      .filter((group) => selected.has(group.id))
      .flatMap((group) => group.labels);
    return [...fromGroups, ...loose.flatMap((entry) => entry.labels)];
  }, [platoGroups, menuGroupList, selected, loose]);

  const printedKeys = useMemo(() => new Set(printed.keys()), [printed]);
  const sheetCount = productionSheetCount(batch.length, startAt);
  const freeAtEnd = sheetCount * LABELS_PER_SHEET - (startAt - 1) - batch.length;
  const previewHtml = useMemo(
    () => renderProductionSheets({ labels: batch, preview: true, printedKeys, startAt }),
    [batch, printedKeys, startAt],
  );

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setAll(groups: readonly LabelGroup[], on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const group of groups) {
        if (on) next.add(group.id);
        else next.delete(group.id);
      }
      return next;
    });
  }

  function addLoose() {
    const option = looseOptions.find((item) => item.id === looseChoice);
    if (!option || looseQuantity < 1) return;
    const already = loose.flatMap((entry) => entry.labels);
    setLoose((current) => [
      ...current,
      {
        id: `${option.id}:${String(Date.now())}`,
        labels: looseLabels(option.template, looseQuantity, already),
        title: option.title,
      },
    ]);
    setLooseQuantity(1);
  }

  /** Pedir imprimir: si la tanda repite etiquetas, primero se pregunta. */
  function requestPrint() {
    const again = batch.filter((label) => !isLoose(label) && printed.has(label.key));
    if (again.length > 0) {
      setRepeated(again);
      return;
    }
    print(batch);
  }

  function print(labels: readonly ProductionLabel[]) {
    setRepeated(null);
    if (labels.length === 0) return;
    printInFrame(renderProductionSheets({ labels, startAt, title: 'Etiquetas' }));
    void record(labels);
  }

  async function record(labels: readonly ProductionLabel[]) {
    const toRecord = labels
      .filter((label) => !isLoose(label))
      .map((label) => ({ key: label.key, kind: label.kind }));
    if (toRecord.length === 0) return;
    const response = await apiRequest(`/api/v1/production/${cycleId}/printed-labels`, {
      body: JSON.stringify({ labels: toRecord }),
      method: 'POST',
    });
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const now = new Date().toISOString();
    setPrinted((current) => {
      const next = new Map(current);
      for (const { key } of toRecord) {
        next.set(key, {
          key,
          lastPrintedAt: now,
          printCount: (current.get(key)?.printCount ?? 0) + 1,
        });
      }
      return next;
    });
    showToast(`Anotadas ${String(toRecord.length)} etiquetas como impresas.`);
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

  const groupCard = (title: string, groups: readonly LabelGroup[]) => {
    const total = groups.reduce((sum, group) => sum + group.labels.length, 0);
    const chosen = groups.filter((group) => selected.has(group.id));
    return (
      <div className="operation-card grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-semibold text-forest">
            {title} <span className="font-normal text-ink-muted">· {String(total)}</span>
          </p>
          {groups.length > 0 ? (
            <span className="flex gap-3 text-sm">
              <button className="link-button" onClick={() => setAll(groups, true)} type="button">
                Todos
              </button>
              <button className="link-button" onClick={() => setAll(groups, false)} type="button">
                Ninguno
              </button>
            </span>
          ) : null}
        </div>
        {groups.length === 0 ? (
          <p className="text-sm text-ink-muted">
            {loading ? 'Cargando…' : 'No hay en este período.'}
          </p>
        ) : (
          <ul className="studio-groups">
            {groups.map((group) => {
              const done = group.labels.filter((label) => printed.has(label.key)).length;
              return (
                <li key={group.id}>
                  <label>
                    <input
                      checked={selected.has(group.id)}
                      onChange={() => toggle(group.id)}
                      type="checkbox"
                    />
                    <span className="studio-group-title">{group.title}</span>
                    <span className="studio-group-count">{String(group.labels.length)}</span>
                    {done > 0 ? (
                      <span className="studio-printed" title="Ya impresas en este período">
                        {done === group.labels.length ? 'impreso' : `${String(done)} impresas`}
                      </span>
                    ) : null}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {groups.length > 0 ? (
          <p className="field-hint">
            {String(chosen.length)} de {String(groups.length)} grupos en la tanda.
          </p>
        ) : null}
      </div>
    );
  };

  const repeatedLast = repeated
    ?.map((label) => printed.get(label.key)?.lastPrintedAt ?? '')
    .sort()
    .at(-1);

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="dashboard-kicker">Producción</p>
            <h1 className="text-2xl font-semibold text-forest">Etiquetas</h1>
            <p className="mt-2 max-w-3xl text-sm text-ink-muted">
              Las etiquetas de producción sobre el papel {PRODUCTION_PAPER.name}. Armá la tanda con
              platos y menús —grupos enteros o sueltas— y se imprime lista, con los márgenes del
              papel.
            </p>
          </div>
          <Link className="button button-secondary" to="/app/etiquetas/clasico">
            Versión anterior
          </Link>
        </header>

        {message ? (
          <p className="screen-notice mt-5" role="alert">
            {message}
          </p>
        ) : null}

        <div className={`labels-layout studio-layout mt-6 ${loading ? 'is-refreshing' : ''}`}>
          <div className="grid content-start gap-5">
            <div className="operation-card grid gap-4">
              <p className="text-sm font-semibold text-forest">Período</p>
              <PeriodPicker onChange={setCycleId} periods={periods} value={cycleId} />
              <RunFilter onChange={setRunId} value={runId} />
              <label className="field">
                Fecha de elaboración
                <input
                  onChange={(event) => setProductionDate(event.target.value || todayInOperation())}
                  type="date"
                  value={productionDate}
                />
                <span className="field-hint">Va en el pie de los platos: «ELAB # dd-mm».</span>
              </label>
            </div>

            {groupCard('Platos', platoGroups)}
            {groupCard('Menús', menuGroupList)}

            <div className="operation-card grid gap-3">
              <p className="text-sm font-semibold text-forest">Sueltas</p>
              <p className="text-sm text-ink-muted">
                Para reponer una etiqueta o completar la hoja. No se anotan como impresas.
              </p>
              <div className="studio-loose-form">
                <label className="field">
                  Etiqueta
                  <select
                    onChange={(event) => setLooseChoice(event.target.value)}
                    value={looseChoice}
                  >
                    <option value="">Elegí un plato o menú…</option>
                    {looseOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Cantidad
                  <input
                    max={LABELS_PER_SHEET * 4}
                    min={1}
                    onChange={(event) =>
                      setLooseQuantity(Math.max(1, Number(event.target.value) || 1))
                    }
                    type="number"
                    value={looseQuantity}
                  />
                </label>
                <button
                  className="button button-secondary"
                  disabled={!looseChoice}
                  onClick={addLoose}
                  type="button"
                >
                  Agregar
                </button>
              </div>
              {freeAtEnd > 0 && batch.length > 0 ? (
                <p className="field-hint">
                  La última hoja tiene {String(freeAtEnd)}{' '}
                  {freeAtEnd === 1 ? 'lugar libre' : 'lugares libres'}.
                </p>
              ) : null}
              {loose.length > 0 ? (
                <ul className="studio-loose-list">
                  {loose.map((entry) => (
                    <li key={entry.id}>
                      <span>
                        {entry.title} <strong>× {String(entry.labels.length)}</strong>
                      </span>
                      <button
                        className="link-button"
                        onClick={() =>
                          setLoose((current) => current.filter((item) => item.id !== entry.id))
                        }
                        type="button"
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>

          <aside className="labels-preview studio-preview">
            <div className="operation-card grid gap-3">
              <label className="field">
                Empezar en la posición
                <select
                  onChange={(event) => setStartAt(Number(event.target.value))}
                  value={startAt}
                >
                  {Array.from({ length: LABELS_PER_SHEET }, (_, index) => (
                    <option key={index} value={index + 1}>
                      {index + 1}
                      {index === 0 ? ' (hoja nueva)' : ''}
                    </option>
                  ))}
                </select>
                <span className="field-hint">
                  Para aprovechar una hoja usada: las posiciones van de izquierda a derecha y de
                  arriba hacia abajo.
                </span>
              </label>
              <p className="text-sm" role="status">
                <strong>{String(batch.length)}</strong> etiquetas ·{' '}
                <strong>{String(sheetCount)}</strong> {sheetCount === 1 ? 'hoja' : 'hojas'}
              </p>
              <button
                className="button button-primary"
                disabled={batch.length === 0}
                onClick={requestPrint}
                type="button"
              >
                Imprimir
              </button>
              <p className="field-hint">
                Imprimí al 100 % («Tamaño real», sin ajustar a la página) y sin márgenes. Las
                marcadas en naranja ya se imprimieron.
              </p>
            </div>
            <SheetPreview html={previewHtml} sheets={Math.max(1, sheetCount)} />
          </aside>
        </div>
      </section>

      {repeated ? (
        <div
          aria-label="Etiquetas ya impresas"
          aria-modal="true"
          className="modal-backdrop"
          role="dialog"
        >
          <div className="modal-panel">
            <h2 className="text-xl font-semibold text-forest">
              {repeated.length === 1
                ? 'Una etiqueta ya se imprimió'
                : `${String(repeated.length)} etiquetas ya se imprimieron`}
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              De las {String(batch.length)} de la tanda, {String(repeated.length)} ya salieron en
              este período
              {repeatedLast
                ? ` (la última vez, ${new Date(repeatedLast).toLocaleString('es-AR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })})`
                : ''}
              . Podés sacarlas de la tanda o imprimirlas de nuevo.
            </p>
            <div className="form-actions mt-5">
              {repeated.length < batch.length ? (
                <button
                  className="button button-primary"
                  onClick={() => {
                    const keys = new Set(repeated.map((label) => label.key));
                    print(batch.filter((label) => !keys.has(label.key)));
                  }}
                  type="button"
                >
                  Imprimir sólo las nuevas ({String(batch.length - repeated.length)})
                </button>
              ) : null}
              <button
                className={`button ${repeated.length < batch.length ? 'button-secondary' : 'button-primary'}`}
                onClick={() => print(batch)}
                type="button"
              >
                Imprimir todas igual
              </button>
              <button
                className="button button-secondary"
                onClick={() => setRepeated(null)}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}

/** La vista previa: las hojas a tamaño real (210 mm ≈ 794 px), achicadas al ancho de la caja. */
function SheetPreview({ html, sheets }: { html: string; sheets: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setScale(element.clientWidth / 794));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Cada hoja: 297 mm (≈ 1123 px) más el respiro de 8 mm (≈ 30 px) entre una y otra.
  const height = sheets * 1153;
  return (
    <div
      className="studio-sheet"
      ref={box}
      style={{ height: `${String(Math.ceil(height * scale))}px` }}
    >
      <iframe
        srcDoc={html}
        style={{ height: `${String(height)}px`, transform: `scale(${String(scale)})` }}
        title="Vista previa de las etiquetas"
      />
    </div>
  );
}
