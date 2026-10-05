import { useState, type ChangeEvent } from 'react';

import { apiRequest } from '../lib/api.js';
import { errorMessage } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';

interface Candidate {
  customerId: string;
  displayName: string;
}

interface PreviewRow {
  customerMatch: {
    candidates: Candidate[];
    customerId: string | null;
    displayName: string | null;
    kind: 'nombre' | 'nuevo' | 'parecidos' | 'telefono';
  };
  customerName: string;
  deliveryAddress: string | null;
  dishes: string[];
  notes: string | null;
  offeringId: string | null;
  paymentExpectation: string | null;
  phone: string | null;
  quantityUnits: number;
  rowNumber: number;
  size: string | null;
  variety: string | null;
}

/** A qué cliente va una fila: el id elegido, o `nuevo` para crearlo con lo que trae la planilla. */
type Decision = string;

function matchLabel(kind: PreviewRow['customerMatch']['kind']): string {
  switch (kind) {
    case 'telefono':
      return 'Coincide por teléfono';
    case 'nombre':
      return 'Coincide por nombre';
    case 'parecidos':
      return 'Elegir: hay nombres parecidos';
    case 'nuevo':
      return 'Sin coincidencias: se crea el cliente';
  }
}

/**
 * Importar pedidos desde una planilla, en dos pasos.
 *
 * El segundo paso es el que importa de verdad. Importar a ciegas crea clientes duplicados —la misma
 * persona escrita "Ana Vega" en la planilla y "Ana Isabel Vega" en la base quedan como dos
 * registros, y el día que hay que llamarla nadie sabe cuál mirar—, así que acá se ve fila por fila
 * con qué coincide y se resuelve antes de escribir nada.
 *
 * Las coincidencias por teléfono y por nombre exacto vienen resueltas; los nombres parecidos se
 * dejan abiertos, porque dos clientes pueden llamarse igual y unirlos es lo único de todo esto que
 * no tiene vuelta atrás.
 */
export function OrderImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setMessage('');
    const body = new FormData();
    body.set('file', file);
    // `notify: false`: la vista previa no escribe nada, así que el aviso de "guardado" sería mentira.
    const response = await apiRequest('/api/v1/orders/import/preview', {
      body,
      method: 'POST',
      notify: false,
    });
    setBusy(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const payload = (await response.json()) as { items: PreviewRow[] };
    setRows(payload.items);
    // Lo que ya coincide queda elegido; el resto arranca en "crear nuevo" y se puede cambiar.
    setDecisions(
      Object.fromEntries(
        payload.items.map((row) => [row.rowNumber, row.customerMatch.customerId ?? 'nuevo']),
      ),
    );
  }

  const listas = (rows ?? []).filter((row) => row.offeringId !== null);
  const afuera = (rows ?? []).length - listas.length;

  async function confirm() {
    if (listas.length === 0) return;
    setBusy(true);
    setMessage('');
    const response = await apiRequest('/api/v1/orders/import', {
      body: JSON.stringify({
        rows: listas.map((row) => {
          const decision = decisions[row.rowNumber] ?? 'nuevo';
          return {
            customerId: decision === 'nuevo' ? null : decision,
            customerName: row.customerName,
            deliveryAddress: row.deliveryAddress,
            dishes: row.dishes,
            notes: row.notes,
            offeringId: row.offeringId,
            paymentExpectation: row.paymentExpectation ?? 'A confirmar',
            phone: row.phone,
            quantityUnits: row.quantityUnits,
            rowNumber: row.rowNumber,
          };
        }),
      }),
      method: 'POST',
      notify: false,
    });
    setBusy(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    const payload = (await response.json()) as {
      created: number;
      failed: { reason: string; rowNumber: number }[];
    };
    onImported();
    if (payload.failed.length > 0) {
      /*
       * Las que entraron ya están. El modal se queda abierto con el detalle de las que no, porque
       * cerrarlo con un cartel de tres segundos obliga a adivinar qué filas hay que volver a cargar.
       */
      setMessage(
        `Entraron ${String(payload.created)}. No entraron ${String(payload.failed.length)}: ${payload.failed
          .map((fail) => `fila ${String(fail.rowNumber)} (${fail.reason})`)
          .join('; ')}`,
      );
      return;
    }
    showToast(
      `${String(payload.created)} pedido${payload.created === 1 ? '' : 's'} importado${
        payload.created === 1 ? '' : 's'
      } como borrador.`,
    );
    onClose();
  }

  return (
    <div aria-label="Importar pedidos" aria-modal="true" className="modal-backdrop" role="dialog">
      <div className="modal-panel order-import">
        <header className="order-import-head">
          <div>
            <h2>Importar pedidos</h2>
            <p>
              {rows === null
                ? 'Desde una planilla de Excel o CSV.'
                : `${String(listas.length)} de ${String(rows.length)} filas listas${
                    afuera > 0
                      ? ` · ${String(afuera)} afuera: la variedad y el tamaño no están en el menú publicado`
                      : ''
                  }`}
            </p>
          </div>
          <button aria-label="Cerrar" onClick={onClose} type="button">
            ✕
          </button>
        </header>

        <div className="order-import-body">
          {message ? (
            <p className="screen-notice" role="alert">
              {message}
            </p>
          ) : null}

          {rows === null ? (
            <div className="order-import-intro">
              <p>
                La planilla necesita una columna de cliente y una de cantidad. Si además trae
                teléfono, variedad, tamaño, medio de pago, domicilio, platos o notas, se usan.
              </p>
              <p>
                Los nombres de columna se reconocen en varias formas —«Cliente» o «Nombre»,
                «Teléfono» o «WhatsApp», «Tamaño» o «Tamano»—, así que no hace falta rearmar el
                archivo.
              </p>
              <p>
                Los pedidos entran como borradores y después se confirman desde la cola, igual que
                los que se cargan a mano.
              </p>
            </div>
          ) : (
            <ul className="order-import-rows">
              {rows.map((row) => (
                <li className={row.offeringId === null ? 'is-blocked' : ''} key={row.rowNumber}>
                  <div className="order-import-row-head">
                    <strong>{row.customerName}</strong>
                    <span>fila {row.rowNumber}</span>
                  </div>
                  <p className="order-import-row-order">
                    {[row.variety, row.size].filter(Boolean).join(' ') || 'Sin variedad'} ×{' '}
                    {row.quantityUnits}
                    {row.phone ? ` · ${row.phone}` : ''}
                  </p>
                  {row.offeringId === null ? (
                    <p className="order-import-row-blocked">
                      Esa variedad y tamaño no están en el menú publicado de esta ciudad.
                    </p>
                  ) : (
                    <label className="field">
                      {matchLabel(row.customerMatch.kind)}
                      <select
                        onChange={(event) =>
                          setDecisions((current) => ({
                            ...current,
                            [row.rowNumber]: event.target.value,
                          }))
                        }
                        value={decisions[row.rowNumber] ?? 'nuevo'}
                      >
                        {row.customerMatch.customerId ? (
                          <option value={row.customerMatch.customerId}>
                            {row.customerMatch.displayName}
                          </option>
                        ) : null}
                        {row.customerMatch.candidates.map((candidate) => (
                          <option key={candidate.customerId} value={candidate.customerId}>
                            {candidate.displayName}
                          </option>
                        ))}
                        <option value="nuevo">Crear cliente nuevo</option>
                      </select>
                    </label>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="order-import-foot">
          {rows === null ? (
            <label className="button button-primary order-import-file">
              <input
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={busy}
                onChange={(event) => void upload(event)}
                type="file"
              />
              {busy ? 'Leyendo la planilla…' : 'Elegir planilla'}
            </label>
          ) : (
            <button
              className="button button-primary"
              disabled={busy || listas.length === 0}
              onClick={() => void confirm()}
              type="button"
            >
              {busy
                ? 'Importando…'
                : `Importar ${String(listas.length)} pedido${listas.length === 1 ? '' : 's'}`}
            </button>
          )}
          <button className="button button-secondary" onClick={onClose} type="button">
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}
