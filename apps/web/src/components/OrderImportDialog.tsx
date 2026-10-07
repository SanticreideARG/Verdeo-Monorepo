import { useState, type ChangeEvent } from 'react';

import { apiRequest } from '../lib/api.js';
import { formatDay } from '../lib/dates.js';
import { errorMessage } from '../lib/operations.js';
import { whatsappHref } from '../lib/phone.js';
import { showToast } from '../lib/toast.js';

interface Candidate {
  customerId: string;
  displayName: string;
}

interface PreviewItem {
  dishes: string[];
  offeringId: string | null;
  quantityUnits: number;
  size: string | null;
  variety: string | null;
}

interface PreviewRow {
  customerMatch: {
    candidates: Candidate[];
    customerId: string | null;
    displayName: string | null;
    kind: 'email' | 'nombre' | 'nuevo' | 'parecidos' | 'telefono';
  };
  customerName: string;
  deliveryAddress: string | null;
  duplicateOf: string | null;
  email: string | null;
  items: PreviewItem[];
  kind: 'email' | 'spreadsheet_import';
  locality: string | null;
  notes: string | null;
  paymentExpectation: string | null;
  phone: string | null;
  receivedOn: string | null;
  rowNumber: number;
  warnings: string[];
}

interface Inquiry {
  customerName: string;
  email: string | null;
  message: string;
  phone: string | null;
  receivedOn: string | null;
  rowNumber: number;
}

interface Preview {
  inquiries: Inquiry[];
  items: PreviewRow[];
  offerings: { id: string; label: string }[];
  unreadable: number;
}

function matchLabel(kind: PreviewRow['customerMatch']['kind']): string {
  switch (kind) {
    case 'telefono':
      return 'Coincide por celular';
    case 'email':
      return 'Coincide por email';
    case 'nombre':
      return 'Coincide por nombre';
    case 'parecidos':
      return 'Elegir: hay nombres parecidos';
    case 'nuevo':
      return 'Sin coincidencias: se crea el cliente';
  }
}

/**
 * Importar pedidos desde una planilla o desde los emails del formulario del sitio.
 *
 * Son dos formas de entrada y una sola revisión, que es la parte que importa. Importar a ciegas crea
 * clientes duplicados —la misma persona escrita "Ana Vega" en el email y "Ana Isabel Vega" en la
 * base quedan como dos registros, y el día que hay que llamarla nadie sabe cuál mirar—, así que acá
 * se ve pedido por pedido con qué coincide y se resuelve antes de escribir nada.
 *
 * Lo que se reconoce solo viene resuelto; lo que no, se elige a mano. Una variedad que no se
 * reconoce no se adivina: elegir la equivocada es cargar el pedido de otra variedad sin que nadie lo
 * note. Y los nombres parecidos no se dan por buenos solos, porque unir dos clientes es lo único de
 * todo esto que no tiene vuelta atrás.
 */
export function OrderImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}) {
  const [mode, setMode] = useState<'email' | 'planilla'>('email');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [decisions, setDecisions] = useState<Record<number, string>>({});
  // Las variedades que se eligieron a mano, por pedido y posición.
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [included, setIncluded] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  function load(next: Preview) {
    setPreview(next);
    setDecisions(
      Object.fromEntries(
        next.items.map((row) => [row.rowNumber, row.customerMatch.customerId ?? 'nuevo']),
      ),
    );
    setChoices({});
    /*
     * Un pedido que ya existe igual, o con una línea que no se leyó, arranca destildado.
     *
     * Pegar dos veces los mismos emails es lo más probable que va a pasar, y destildarlo por defecto
     * hace que el segundo pegado no duplique nada sin que nadie lo decida. Se puede volver a tildar:
     * dos pedidos iguales son legítimos si pidió dos veces.
     */
    setIncluded(
      Object.fromEntries(
        next.items.map((row) => [
          row.rowNumber,
          row.duplicateOf === null && row.warnings.length === 0,
        ]),
      ),
    );
  }

  async function readSheet(event: ChangeEvent<HTMLInputElement>) {
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
    load((await response.json()) as Preview);
  }

  async function readEmails() {
    setBusy(true);
    setMessage('');
    const response = await apiRequest('/api/v1/orders/import/preview-email', {
      body: JSON.stringify({ text }),
      method: 'POST',
      notify: false,
    });
    setBusy(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    load((await response.json()) as Preview);
  }

  const offeringFor = (row: PreviewRow, index: number): string | null =>
    choices[`${String(row.rowNumber)}:${String(index)}`] ?? row.items[index]?.offeringId ?? null;
  const resolved = (row: PreviewRow) => row.items.every((_, index) => offeringFor(row, index));

  const rows = preview?.items ?? [];
  const selected = rows.filter((row) => included[row.rowNumber]);
  const ready = selected.filter(resolved);
  const blocking = selected.length - ready.length;

  async function confirm() {
    if (ready.length === 0 || blocking > 0) return;
    setBusy(true);
    setMessage('');
    const response = await apiRequest('/api/v1/orders/import', {
      body: JSON.stringify({
        rows: ready.map((row) => {
          const decision = decisions[row.rowNumber] ?? 'nuevo';
          return {
            customerId: decision === 'nuevo' ? null : decision,
            customerName: row.customerName,
            deliveryAddress: row.deliveryAddress,
            email: row.email,
            items: row.items.map((item, index) => ({
              dishes: item.dishes,
              offeringId: offeringFor(row, index),
              quantityUnits: item.quantityUnits,
            })),
            kind: row.kind,
            notes: row.notes,
            paymentExpectation: row.paymentExpectation ?? 'A confirmar',
            phone: row.phone,
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
       * cerrarlo con un cartel de tres segundos obliga a adivinar qué pedidos hay que volver a cargar.
       */
      setMessage(
        `Entraron ${String(payload.created)}. No entraron ${String(payload.failed.length)}: ${payload.failed
          .map((fail) => `pedido ${String(fail.rowNumber)} (${fail.reason})`)
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

  const summary =
    preview === null
      ? mode === 'email'
        ? 'Desde los emails del formulario del sitio.'
        : 'Desde una planilla de Excel o CSV.'
      : `${String(rows.length)} pedido${rows.length === 1 ? '' : 's'}${
          preview.inquiries.length > 0
            ? ` · ${String(preview.inquiries.length)} consulta${preview.inquiries.length === 1 ? '' : 's'}`
            : ''
        }`;

  return (
    <div aria-label="Importar pedidos" aria-modal="true" className="modal-backdrop" role="dialog">
      <div className="modal-panel order-import">
        <header className="order-import-head">
          <div>
            <h2>Importar pedidos</h2>
            <p>{summary}</p>
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

          {preview === null ? (
            <>
              <div className="order-import-tabs" role="tablist">
                <button
                  aria-selected={mode === 'email'}
                  className={mode === 'email' ? 'is-active' : ''}
                  onClick={() => setMode('email')}
                  role="tab"
                  type="button"
                >
                  Pegar emails
                </button>
                <button
                  aria-selected={mode === 'planilla'}
                  className={mode === 'planilla' ? 'is-active' : ''}
                  onClick={() => setMode('planilla')}
                  role="tab"
                  type="button"
                >
                  Subir planilla
                </button>
              </div>

              {mode === 'email' ? (
                <div className="order-import-intro">
                  <p>
                    Pegá los emails de pedido tal como llegan —reenviados, con el encabezado y
                    todo—, de a uno o de a muchos. Se lee el celular, la dirección, el barrio, las
                    cantidades y el mensaje del cliente.
                  </p>
                  <label className="field">
                    Emails
                    <textarea
                      onChange={(event) => setText(event.target.value)}
                      placeholder="Pegá acá uno o varios emails…"
                      rows={9}
                      value={text}
                    />
                  </label>
                </div>
              ) : (
                <div className="order-import-intro">
                  <p>
                    La planilla necesita una columna de cliente. Si además trae cantidad, teléfono,
                    email, variedad, tamaño, medio de pago, domicilio, platos o notas, se usan.
                  </p>
                  <p>
                    Los nombres de columna se reconocen en varias formas —«Cliente» o «Nombre»,
                    «Teléfono» o «WhatsApp», «Tamaño» o «Tamano»—, así que no hace falta rearmar el
                    archivo.
                  </p>
                </div>
              )}
              <p className="order-import-hint">
                Los pedidos entran como borradores y después se confirman desde la cola, igual que
                los que se cargan a mano.
              </p>
            </>
          ) : (
            <>
              {preview.unreadable > 0 ? (
                <p className="screen-notice" role="alert">
                  {preview.unreadable === 1
                    ? 'Un bloque de lo que pegaste no se pudo leer como un pedido.'
                    : `${String(preview.unreadable)} bloques de lo que pegaste no se pudieron leer como un pedido.`}{' '}
                  Revisalo contra el email original.
                </p>
              ) : null}

              <ul className="order-import-rows">
                {rows.map((row) => (
                  <li className={!included[row.rowNumber] ? 'is-blocked' : ''} key={row.rowNumber}>
                    <div className="order-import-row-head">
                      <label className="order-import-include">
                        <input
                          checked={included[row.rowNumber] ?? false}
                          onChange={(event) =>
                            setIncluded((current) => ({
                              ...current,
                              [row.rowNumber]: event.target.checked,
                            }))
                          }
                          type="checkbox"
                        />
                        <strong>{row.customerName}</strong>
                      </label>
                      <span>
                        {row.kind === 'email'
                          ? `pedido ${String(row.rowNumber)}`
                          : `fila ${String(row.rowNumber)}`}
                        {row.receivedOn ? ` · ${formatDay(row.receivedOn)}` : ''}
                      </span>
                    </div>

                    <p className="order-import-row-order">
                      {[row.phone, row.email, row.deliveryAddress].filter(Boolean).join(' · ')}
                      {row.locality ? ` · ${row.locality}` : ''}
                    </p>

                    <ul className="order-import-items">
                      {row.items.map((item, index) => {
                        const offeringId = offeringFor(row, index);
                        return (
                          <li key={`${String(row.rowNumber)}-${String(index)}`}>
                            <span>
                              {[item.variety, item.size].filter(Boolean).join(' ') ||
                                'Sin variedad'}{' '}
                              × {item.quantityUnits}
                            </span>
                            {item.offeringId === null ? (
                              /*
                               * Una variedad que no se reconoce se elige a mano, y es obligatorio.
                               * No se adivina: elegir la equivocada es cargar el pedido de otra
                               * variedad sin que nadie lo note.
                               */
                              <select
                                aria-label="Elegir la variedad del menú"
                                onChange={(event) =>
                                  setChoices((current) => ({
                                    ...current,
                                    [`${String(row.rowNumber)}:${String(index)}`]:
                                      event.target.value,
                                  }))
                                }
                                value={offeringId ?? ''}
                              >
                                <option value="">No está en el menú: elegir…</option>
                                {preview.offerings.map((oferta) => (
                                  <option key={oferta.id} value={oferta.id}>
                                    {oferta.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <small>en el menú</small>
                            )}
                          </li>
                        );
                      })}
                    </ul>

                    {row.notes ? <p className="order-import-note">«{row.notes}»</p> : null}

                    {row.duplicateOf ? (
                      <p className="order-import-row-blocked">
                        Este cliente ya tiene un pedido igual en este período ({row.duplicateOf}).
                        Por eso arranca destildado.
                      </p>
                    ) : null}
                    {row.warnings.map((warning) => (
                      <p className="order-import-row-blocked" key={warning}>
                        {warning}
                      </p>
                    ))}

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
                  </li>
                ))}
              </ul>

              {preview.inquiries.length > 0 ? (
                <section className="order-import-inquiries">
                  <h3>Consultas</h3>
                  <p>
                    Estos mensajes llegaron por el formulario sin ninguna cantidad: no son pedidos,
                    son preguntas. No se importan, y quedan acá para contestarlos.
                  </p>
                  <ul>
                    {preview.inquiries.map((inquiry) => (
                      <li key={inquiry.rowNumber}>
                        <div className="order-import-row-head">
                          <strong>{inquiry.customerName}</strong>
                          <span>{inquiry.receivedOn ? formatDay(inquiry.receivedOn) : ''}</span>
                        </div>
                        <p className="order-import-note">
                          {inquiry.message ? `«${inquiry.message}»` : 'Sin mensaje.'}
                        </p>
                        <div className="order-import-inquiry-actions">
                          {inquiry.phone ? (
                            <a
                              className="button button-secondary"
                              href={whatsappHref(inquiry.phone)}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              Abrir WhatsApp
                            </a>
                          ) : null}
                          {inquiry.email ? <small>{inquiry.email}</small> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>

        <footer className="order-import-foot">
          {preview === null ? (
            mode === 'email' ? (
              <button
                className="button button-primary"
                disabled={busy || text.trim().length === 0}
                onClick={() => void readEmails()}
                type="button"
              >
                {busy ? 'Leyendo…' : 'Leer los pedidos'}
              </button>
            ) : (
              <label className="button button-primary order-import-file">
                <input
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  disabled={busy}
                  onChange={(event) => void readSheet(event)}
                  type="file"
                />
                {busy ? 'Leyendo la planilla…' : 'Elegir planilla'}
              </label>
            )
          ) : (
            <>
              {blocking > 0 ? (
                <span className="order-import-foot-note">
                  Elegí la variedad de{' '}
                  {blocking === 1 ? 'un pedido' : `${String(blocking)} pedidos`} o destildalos.
                </span>
              ) : null}
              <button
                className="button button-primary"
                disabled={busy || ready.length === 0 || blocking > 0}
                onClick={() => void confirm()}
                type="button"
              >
                {busy
                  ? 'Importando…'
                  : `Importar ${String(ready.length)} pedido${ready.length === 1 ? '' : 's'}`}
              </button>
            </>
          )}
          <button className="button button-secondary" onClick={onClose} type="button">
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}
