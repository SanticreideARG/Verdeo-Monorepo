import { useEffect, useState } from 'react';

import { ActionButton } from './ActionButton.js';
import { apiRequest } from '../lib/api.js';
import { todayInOperation } from '../lib/dates.js';
import { errorMessage } from '../lib/operations.js';

/**
 * Imprimir las etiquetas de cocina: una por plato, para pegar en cada recipiente.
 *
 * La fecha de elaboración va en el pie ("KETO ELAB # 24-09") y arranca en hoy: casi siempre se
 * imprime el día que se cocina, pero se puede cambiar si se imprime el día anterior. La vista previa
 * es la misma hoja que se imprime (la que arma el servidor), achicada: lo que se ve es lo que sale.
 */
export function KitchenLabelsPanel({
  cycleId,
  labelsPerPage,
  zone,
}: {
  cycleId: string;
  labelsPerPage: number;
  zone: string;
}) {
  const [elaboratedOn, setElaboratedOn] = useState(todayInOperation());
  const [count, setCount] = useState<number | null>(null);
  const [previewHtml, setPreviewHtml] = useState('');
  const [message, setMessage] = useState('');

  const query = () => {
    const params = new URLSearchParams({ elab: elaboratedOn });
    if (zone) params.set('zone', zone);
    return params.toString();
  };

  useEffect(() => {
    if (!cycleId) return;
    let active = true;
    setCount(null);
    const params = new URLSearchParams(zone ? { zone } : {});
    void Promise.all([
      apiRequest(`/api/v1/production/${cycleId}/kitchen-labels?${params.toString()}`, {
        notify: false,
      }),
      apiRequest(`/api/v1/production/${cycleId}/kitchen-labels/export?${query()}`, {
        notify: false,
      }),
    ]).then(async ([labels, sheet]) => {
      if (!active) return;
      if (labels.ok) setCount(((await labels.json()) as { items: unknown[] }).items.length);
      else setMessage(await errorMessage(labels));
      if (sheet.ok) setPreviewHtml(await sheet.text());
    });
    return () => {
      active = false;
    };
    // `query` sale de estos mismos valores.
  }, [cycleId, elaboratedOn, zone]);

  async function print() {
    setMessage('');
    const response = await apiRequest(
      `/api/v1/production/${cycleId}/kitchen-labels/export?${query()}`,
    );
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    window.open(url, '_blank', 'noopener,noreferrer');
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  const sheets = count === null ? 0 : Math.ceil(count / labelsPerPage);

  return (
    <div className="kitchen-labels grid gap-3">
      <label className="field max-w-xs">
        Fecha de elaboración
        <input
          onChange={(event) => setElaboratedOn(event.target.value || todayInOperation())}
          type="date"
          value={elaboratedOn}
        />
      </label>
      <p className="text-sm text-ink-muted" role="status">
        {count === null
          ? 'Contando etiquetas…'
          : `${String(count)} etiquetas de cocina · ${String(sheets)} ${sheets === 1 ? 'hoja' : 'hojas'}`}
      </p>
      {message ? <p className="text-sm text-ink-muted">{message}</p> : null}
      <ActionButton
        className="button button-primary justify-self-start"
        disabled={!count}
        onClick={print}
        pendingLabel="Preparando…"
      >
        Imprimir o guardar como PDF
      </ActionButton>
      {previewHtml ? (
        <div className="kitchen-labels-preview">
          <iframe sandbox="" srcDoc={previewHtml} title="Vista previa de las etiquetas de cocina" />
        </div>
      ) : null}
    </div>
  );
}
