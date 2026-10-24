import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import {
  labelDisplayName,
  labelDocumentSize,
  labelPageCount,
  renderLabelDocument,
  SAMPLE_LABELS,
  type LabelData,
  type LabelRenderSettings,
} from '@verdeo/labels';

/** Píxeles de CSS por milímetro (96 por pulgada): el mismo que usa el navegador al imprimir. */
const PX_PER_MM = 96 / 25.4;

type View = 'etiqueta' | 'hoja';
type Zoom = '100' | '200' | 'ajustar';

const ZOOMS: readonly { key: Zoom; label: string }[] = [
  { key: 'ajustar', label: 'Ajustar' },
  { key: '100', label: '100 %' },
  { key: '200', label: '200 %' },
];

/**
 * El visor de etiquetas: lo que se va a imprimir, dibujado en el momento.
 *
 * Es **el mismo dibujo que la impresión**: llama a `renderLabelDocument` —el motor del paquete de
 * etiquetas— con los ajustes que se están tocando en pantalla (guardados o no) y muestra el HTML
 * resultante dentro de un marco. No hay una versión "de pantalla" que imite a la impresa: la hoja
 * que el servidor manda a la impresora sale de la misma función con los mismos datos.
 *
 * Se puede ver una etiqueta o la hoja entera, pasar de una a otra con Anterior y Siguiente (o las
 * flechas del teclado) para revisar el resto de la serie, y acercar: a 100 % la etiqueta mide en
 * pantalla lo mismo que en el papel, para apoyar una impresa contra la pantalla.
 */
export function LabelViewer({
  labels,
  productionDate,
  settings,
}: {
  labels: readonly LabelData[];
  productionDate: string | null;
  settings: LabelRenderSettings;
}) {
  const [view, setView] = useState<View>('etiqueta');
  const [zoom, setZoom] = useState<Zoom>('ajustar');
  const [index, setIndex] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageWidth, setStageWidth] = useState(0);

  // Sin pedidos en la tanda se muestran etiquetas de ejemplo: una hoja en blanco no dice si un
  // formato entra.
  const sample = labels.length === 0;
  const list = sample ? SAMPLE_LABELS : labels;
  const current = Math.min(index, list.length - 1);
  const perPage = Math.max(1, settings.labelsPerPage);
  const pageCount = labelPageCount(list.length, perPage);
  const page = Math.floor(current / perPage);

  // Si la tanda cambia y la posición queda afuera, vuelve al principio.
  useEffect(() => {
    if (index > list.length - 1) setIndex(0);
  }, [index, list.length]);

  const html = useMemo(() => {
    if (view === 'hoja') {
      const start = page * perPage;
      return renderLabelDocument({
        highlight: current - start,
        labels: list.slice(start, start + perPage),
        mode: 'page',
        page: 0,
        preview: true,
        productionDate,
        settings,
        title: 'Vista previa de la hoja',
      });
    }
    return renderLabelDocument({
      labels: [list[current] as LabelData],
      mode: 'single',
      preview: true,
      productionDate,
      settings,
      title: 'Vista previa de la etiqueta',
    });
  }, [current, list, page, perPage, productionDate, settings, view]);

  const size = labelDocumentSize({
    mode: view === 'hoja' ? 'page' : 'single',
    preview: true,
    settings,
  });
  const widthPx = size.widthMm * PX_PER_MM;
  const heightPx = size.heightMm * PX_PER_MM;

  // El ancho disponible, para "Ajustar". Con un observador: cambia al plegar el menú o rotar.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => setStageWidth(stage.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  const fit = stageWidth > 0 ? Math.min(stageWidth / widthPx, view === 'etiqueta' ? 3 : 1) : 0.4;
  const scale = zoom === 'ajustar' ? fit : Number(zoom) / 100;

  const step = view === 'hoja' ? perPage : 1;
  const go = (delta: number) =>
    setIndex((value) => {
      const base = view === 'hoja' ? page * perPage : value;
      return Math.min(Math.max(0, base + delta * step), list.length - 1);
    });

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (
      event.target instanceof HTMLElement &&
      /^(INPUT|SELECT|TEXTAREA)$/.test(event.target.tagName)
    ) {
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(1);
    }
  }

  const label = list[current] as LabelData;
  const name = labelDisplayName(label, settings) || 'Sin nombre en esta etiqueta';
  const position =
    view === 'hoja'
      ? `Hoja ${String(page + 1)} de ${String(pageCount)}`
      : `Etiqueta ${String(current + 1)} de ${String(list.length)}`;
  const atStart = view === 'hoja' ? page === 0 : current === 0;
  const atEnd = view === 'hoja' ? page >= pageCount - 1 : current >= list.length - 1;

  return (
    <section
      aria-label="Vista previa de las etiquetas"
      className="label-viewer"
      onKeyDown={onKeyDown}
    >
      <header className="label-viewer-head">
        <div className="label-viewer-tabs" role="group" aria-label="Qué ver">
          {(['etiqueta', 'hoja'] as const).map((option) => (
            <button
              aria-pressed={view === option}
              key={option}
              onClick={() => setView(option)}
              type="button"
            >
              {option === 'etiqueta' ? 'Etiqueta' : 'Hoja'}
            </button>
          ))}
        </div>
        <div className="label-viewer-tabs" role="group" aria-label="Zoom">
          {ZOOMS.map((option) => (
            <button
              aria-pressed={zoom === option.key}
              key={option.key}
              onClick={() => setZoom(option.key)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      <div className="label-viewer-stage" ref={stageRef} tabIndex={0}>
        {/*
         * Sin permisos: el HTML es de la propia aplicación y no ejecuta nada. El marco se dibuja a
         * tamaño real (en milímetros) y se achica o agranda entero con `transform`, para que el
         * zoom no cambie lo que se ve más que de tamaño.
         */}
        {/* Una caja del tamaño ya escalado: un `transform` no cambia el lugar que ocupa el marco. */}
        <div
          className="label-viewer-canvas"
          style={{
            height: `${String(Math.round(heightPx * scale))}px`,
            width: `${String(Math.round(widthPx * scale))}px`,
          }}
        >
          <iframe
            sandbox=""
            srcDoc={html}
            style={{
              height: `${String(Math.round(heightPx))}px`,
              transform: `scale(${scale.toFixed(4)})`,
              width: `${String(Math.round(widthPx))}px`,
            }}
            title={view === 'hoja' ? 'La hoja' : 'La etiqueta'}
          />
        </div>
      </div>

      <footer className="label-viewer-nav">
        <button
          aria-label={view === 'hoja' ? 'Hoja anterior' : 'Etiqueta anterior'}
          className="button button-secondary"
          disabled={atStart}
          onClick={() => go(-1)}
          type="button"
        >
          ‹ Anterior
        </button>
        <p aria-live="polite">
          <strong>{position}</strong>
          <small>{name}</small>
        </p>
        <button
          aria-label={view === 'hoja' ? 'Hoja siguiente' : 'Etiqueta siguiente'}
          className="button button-secondary"
          disabled={atEnd}
          onClick={() => go(1)}
          type="button"
        >
          Siguiente ›
        </button>
      </footer>
      <p className="field-hint">
        {sample
          ? 'Con etiquetas de ejemplo: esta tanda todavía no tiene pedidos.'
          : 'Con los pedidos de la tanda elegida.'}{' '}
        {view === 'etiqueta'
          ? `${size.widthMm.toFixed(0)} × ${size.heightMm.toFixed(0)} mm con el aire para las marcas.`
          : 'La etiqueta azul es la que estás mirando.'}{' '}
        Se actualiza con cada cambio, sin guardar.
      </p>
    </section>
  );
}
