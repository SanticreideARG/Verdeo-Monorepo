import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';

import {
  latencyPercent,
  overallTone,
  probeTone,
  toneLabel,
  type SystemProbe,
} from '../lib/system.js';
import { useSystemStatus } from '../lib/useSystemStatus.js';

/** Un medidor por servidor: el estado, cuánto tardó y el detalle si algo falló. */
export function ProbeGauge({ probe }: { probe: SystemProbe }) {
  const tone = probeTone(probe);
  return (
    <li className="system-probe">
      <div className="system-probe-head">
        <span aria-hidden="true" className={`system-dot system-dot-${tone}`} />
        <strong>{probe.label}</strong>
        <span className="system-probe-ms">
          {probe.latencyMs === null ? '—' : `${String(probe.latencyMs)} ms`}
        </span>
      </div>
      <div
        aria-label={`Latencia de ${probe.label}`}
        aria-valuemax={1500}
        aria-valuemin={0}
        aria-valuenow={probe.latencyMs ?? 0}
        className="system-gauge"
        role="meter"
      >
        <span
          className={`system-gauge-fill system-gauge-${tone}`}
          style={{ width: `${String(latencyPercent(probe.latencyMs))}%` }}
        />
      </div>
      <small className="system-probe-detail">
        {probe.ok ? (tone === 'lento' ? 'Responde, pero lento' : 'Responde') : probe.detail}
      </small>
    </li>
  );
}

/**
 * El indicador de la barra y su ventana de estado.
 *
 * La ventana se monta dentro de `.dashboard-shell` y no donde está el botón: la barra tiene
 * `backdrop-filter`, y un elemento `fixed` dentro de un ancestro con esa propiedad se posiciona
 * contra el ancestro, no contra la pantalla (le pasó al chat). Además los colores del tema viven
 * en `.dashboard-shell`.
 */
export function SystemStatusButton() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Cargada la primera vez para pintar el punto; refrescada sólo con la ventana abierta.
  const { failed, loading, reload, status } = useSystemStatus(true, open ? 30_000 : 0);

  useEffect(() => {
    setTarget(triggerRef.current?.closest<HTMLElement>('.dashboard-shell') ?? null);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const tone = failed ? 'mal' : status ? overallTone(status.probes) : 'sin-dato';

  const modal: ReactNode = open ? (
    <div
      aria-label="Estado de los servidores"
      aria-modal="true"
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
      role="dialog"
    >
      <div className="modal-panel system-modal">
        <div className="system-modal-head">
          <h2 className="text-xl font-semibold text-forest">Estado de los servidores</h2>
          <span className={`system-pill system-pill-${tone}`}>{toneLabel(tone)}</span>
        </div>
        {failed ? (
          <p className="mt-3 text-sm text-ink-muted">
            No se pudo consultar el estado. Si esto sigue pasando, el servidor no está contestando.
          </p>
        ) : null}
        {status ? (
          <>
            <ul className="system-probes">
              {status.probes.map((probe) => (
                <ProbeGauge key={probe.key} probe={probe} />
              ))}
            </ul>
            <p className="system-modal-meta">
              Servidor de la aplicación:{' '}
              {status.api.latency.p50 === null
                ? 'sin peticiones todavía'
                : `${String(status.api.latency.p50)} ms típico · ${String(status.api.latency.p95 ?? 0)} ms en los casos lentos`}
              . Errores en las últimas 24 h: <strong>{status.errors.last24h}</strong>.
            </p>
          </>
        ) : failed ? null : (
          <p className="mt-3 text-sm text-ink-muted">Midiendo…</p>
        )}
        <div className="form-actions mt-5">
          <button
            className="button button-primary"
            disabled={loading}
            onClick={() => void reload()}
            type="button"
          >
            {loading ? 'Midiendo…' : 'Volver a medir'}
          </button>
          <Link className="button" onClick={() => setOpen(false)} to="/app/sistema">
            Ver detalle
          </Link>
          <button className="button" onClick={() => setOpen(false)} type="button">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        aria-label={`Estado de los servidores: ${toneLabel(tone)}`}
        className="dashboard-topbar-icon system-trigger"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        title={`Servidores: ${toneLabel(tone)}`}
        type="button"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="18"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          viewBox="0 0 24 24"
          width="18"
        >
          <rect height="6" rx="1.5" width="18" x="3" y="4" />
          <rect height="6" rx="1.5" width="18" x="3" y="14" />
          <path d="M7 7h.01M7 17h.01" />
        </svg>
        <span aria-hidden="true" className={`system-dot system-dot-${tone} system-trigger-dot`} />
      </button>
      {modal ? (target ? createPortal(modal, target) : modal) : null}
    </>
  );
}
