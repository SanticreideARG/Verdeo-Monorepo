import { useEffect, useState, type ChangeEvent } from 'react';

import { apiRequest } from '../lib/api.js';
import { DeliveryDayPicker, useDeliveryOptions, weekdayName } from './DeliveryDayPicker.js';
import { formatDay } from '../lib/dates.js';
import { errorMessage } from '../lib/operations.js';
import { whatsappHref } from '../lib/phone.js';
import { isParametrized, paymentSelectValue, usePaymentMethods } from '../lib/paymentMethods.js';
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
  /** El detalle de la dirección, separado de la línea 1 al leer el mail o la planilla. */
  deliveryAddressLine2?: string | null;
  duplicateOf: string | null;
  email: string | null;
  /** Lo que el cliente ya tiene en el período, igual o no. */
  existingOrders?: { publicNumber: string; summary: string }[];
  items: PreviewItem[];
  kind: 'email' | 'spreadsheet_import';
  locality: string | null;
  notes: string | null;
  paymentExpectation: string | null;
  phone: string | null;
  receivedOn: string | null;
  rowNumber: number;
  warnings: string[];
  /** Lo que el lector interpretó y conviene mirar, sin que sea un problema. */
  notices?: string[];
}

/** Cómo quedó cada fila después de importar. */
interface ImportOutcome {
  customerName: string;
  publicNumber: string | null;
  reason: string | null;
  rowNumber: number;
  status: 'created' | 'failed' | 'skipped';
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

const FIELD_LABELS: Record<string, string> = {
  customerName: 'el nombre del cliente',
  deliveryAddress: 'la dirección',
  dishes: 'los platos',
  email: 'el correo',
  items: 'las variedades',
  notes: 'las notas',
  offeringId: 'la variedad',
  paymentExpectation: 'el medio de pago',
  phone: 'el teléfono',
  quantityUnits: 'la cantidad',
};

/**
 * El error de importar, dicho por pedido: "Ana Prueba (fila 4): revisá la dirección".
 *
 * La API contesta "Revisá las filas." con el detalle de cada campo; mostrar sólo eso obligaba a
 * adivinar cuál de los pedidos estaba mal.
 */
async function importErrorText(
  response: Response,
  sent: readonly { customerName: string; rowNumber: number }[],
): Promise<string> {
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as {
    error?: { details?: { message?: string; path?: (string | number)[] }[]; message?: string };
  } | null;
  const issues = Array.isArray(body?.error?.details) ? body.error.details : [];
  const porPedido = issues
    .map((issue) => {
      const [scope, index, ...rest] = issue.path ?? [];
      if (scope !== 'rows' || typeof index !== 'number') return null;
      const row = sent[index];
      const field = rest.filter((part): part is string => typeof part === 'string').at(-1);
      return `${row?.customerName ?? 'Un pedido'} (fila ${String(row?.rowNumber ?? index + 1)}): revisá ${
        (field && FIELD_LABELS[field]) ?? 'los datos'
      }`;
    })
    .filter((text): text is string => text !== null);
  if (porPedido.length > 0) return [...new Set(porPedido)].slice(0, 5).join('. ') + '.';
  return errorMessage(response);
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
/** Un pedido que llegó solo por correo y espera revisión. */
export interface InboundEmailDetail {
  body: string;
  fromAddress: string;
  id: string;
  preview: Preview | null;
  receivedAt: string;
  status: string;
  subject: string;
}

export function OrderImportDialog({
  canConfirm = false,
  inbound,
  onClose,
  onImported,
}: {
  /** Quien puede confirmar ve "Aprobar y confirmar" como acción principal. */
  canConfirm?: boolean;
  /**
   * Revisar un pedido que llegó por correo en lugar de importar.
   *
   * Es la misma revisión —cliente, variedad, duplicados—, pero hecha al abrir el pedido y no al
   * cargar el mail, y con el correo original al lado para comparar lo que entendió el lector con
   * lo que escribió el cliente.
   */
  inbound?: InboundEmailDetail | undefined;
  onClose: () => void;
  onImported: () => void;
}) {
  const [mode, setMode] = useState<'email' | 'planilla'>('email');
  const [text, setText] = useState('');
  // Con un correo, la revisión arranca con su vista previa: sin esto el primer instante decía
  // "no se reconoció un pedido" hasta que corría el efecto de abajo.
  const [preview, setPreview] = useState<Preview | null>(() => inbound?.preview ?? null);
  const [decisions, setDecisions] = useState<Record<number, string>>({});
  // Las variedades que se eligieron a mano, por pedido y posición.
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [included, setIncluded] = useState<Record<number, boolean>>({});
  /*
   * Las correcciones a mano, por pedido: lo que se cambia acá es lo que se importa. Una planilla
   * cargada a mano trae errores (una dirección incompleta, una cantidad de más) y corregirlos acá
   * es más rápido que volver al Excel y subirla de nuevo.
   */
  const [edits, setEdits] = useState<
    Record<
      number,
      {
        customerName?: string;
        deliveryAddress?: string;
        deliveryAddressLine2?: string;
        deliveryDate?: string;
        paymentExpectation?: string;
      }
    >
  >({});
  /*
   * El día de reparto: uno para todos, que se puede cambiar pedido por pedido. Las opciones son
   * los días de reparto de la ciudad para el menú publicado; con uno solo no se elige nada.
   */
  const deliveryChoices = useDeliveryOptions(null);
  const [deliveryForAll, setDeliveryForAll] = useState('');
  const defaultDelivery = deliveryForAll || deliveryChoices.defaultDate;
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  // La conciliación después de importar: qué pedido quedó de cada fila.
  const [outcome, setOutcome] = useState<ImportOutcome[] | null>(null);
  /*
   * La tanda de esta importación. Se arma al leer la planilla y viaja con cada intento: si se toca
   * "Importar" dos veces o se reintenta después de un corte, el servidor reconoce las filas que ya
   * creó y no las duplica.
   */
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const paymentMethods = usePaymentMethods();
  /*
   * El medio de pago de los pedidos que no lo traen.
   *
   * Un email del sitio no dice cómo va a pagar el cliente, y esto se guardaba como "A confirmar",
   * que no es un medio de pago y rompía los filtros y las hojas de ruta. Se elige acá, de los
   * parametrizados, y se puede cambiar pedido por pedido en la lista después.
   */
  const [payment, setPayment] = useState('');
  /*
   * Ubicar las direcciones apenas se importa, para que los pedidos lleguen listos para la hoja de
   * ruta: un pedido de email trae la dirección como texto, sin ubicación, y quedaba afuera de la
   * ruta sin aviso. Encendido por defecto; si no hay claves configuradas simplemente no encuentra
   * nada y los pedidos quedan como estaban.
   */
  const [locateAfter, setLocateAfter] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // El avance de ubicar las direcciones después de importar.
  const [locating, setLocating] = useState('');

  useEffect(() => {
    if (inbound?.preview) load(inbound.preview);
    // Sólo al abrir: la vista previa del correo llega armada y no cambia mientras se revisa.
  }, []);

  function load(next: Preview) {
    setPreview(next);
    setBatchId(crypto.randomUUID());
    setDecisions(
      Object.fromEntries(
        next.items.map((row) => [row.rowNumber, row.customerMatch.customerId ?? 'nuevo']),
      ),
    );
    setChoices({});
    setEdits({});
    setQuantities({});
    setOutcome(null);
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

  const itemKey = (row: PreviewRow, index: number) => `${String(row.rowNumber)}:${String(index)}`;
  const offeringFor = (row: PreviewRow, index: number): string | null =>
    choices[itemKey(row, index)] ?? row.items[index]?.offeringId ?? null;
  const quantityFor = (row: PreviewRow, index: number): number =>
    quantities[itemKey(row, index)] ?? row.items[index]?.quantityUnits ?? 1;
  const edited = (row: PreviewRow) => ({
    customerName: edits[row.rowNumber]?.customerName ?? row.customerName,
    deliveryAddress: edits[row.rowNumber]?.deliveryAddress ?? row.deliveryAddress,
    deliveryAddressLine2:
      edits[row.rowNumber]?.deliveryAddressLine2 ?? row.deliveryAddressLine2 ?? null,
  });
  const editRow = (
    row: PreviewRow,
    change: {
      customerName?: string;
      deliveryAddress?: string;
      deliveryAddressLine2?: string;
      deliveryDate?: string;
      paymentExpectation?: string;
    },
  ) =>
    setEdits((current) => ({
      ...current,
      [row.rowNumber]: { ...current[row.rowNumber], ...change },
    }));
  const resolved = (row: PreviewRow) => row.items.every((_, index) => offeringFor(row, index));

  const rows = preview?.items ?? [];
  const selected = rows.filter((row) => included[row.rowNumber]);
  const ready = selected.filter(resolved);
  const blocking = selected.length - ready.length;
  /** Lo que trae la planilla si es un medio parametrizado; si no, el que se eligió arriba. */
  const paymentFor = (row: PreviewRow): string =>
    edits[row.rowNumber]?.paymentExpectation ||
    (row.paymentExpectation && isParametrized(row.paymentExpectation, paymentMethods)
      ? paymentSelectValue(row.paymentExpectation, paymentMethods)
      : payment);
  const missingPayment = ready.some((row) => paymentFor(row) === '');

  async function confirm(confirmNow = false) {
    if (ready.length === 0 || blocking > 0 || missingPayment) return;
    setBusy(true);
    setMessage('');
    const path = inbound ? `/api/v1/inbound-emails/${inbound.id}/approve` : '/api/v1/orders/import';
    const response = await apiRequest(path, {
      body: JSON.stringify({
        batchId,
        ...(confirmNow ? { confirm: true } : {}),
        rows: ready.map((row) => {
          const decision = decisions[row.rowNumber] ?? 'nuevo';
          return {
            customerId: decision === 'nuevo' ? null : decision,
            customerName: edited(row).customerName.trim() || row.customerName,
            deliveryAddress: edited(row).deliveryAddress?.trim() || null,
            deliveryAddressLine2: edited(row).deliveryAddressLine2?.trim() || null,
            ...((edits[row.rowNumber]?.deliveryDate ?? defaultDelivery)
              ? { deliveryDate: edits[row.rowNumber]?.deliveryDate ?? defaultDelivery }
              : {}),
            email: row.email,
            items: row.items.map((item, index) => ({
              // Los platos van con la variedad que los trajo: si se eligió otra, no aplican.
              dishes: offeringFor(row, index) === item.offeringId ? item.dishes : [],
              offeringId: offeringFor(row, index),
              quantityUnits: quantityFor(row, index),
            })),
            kind: row.kind,
            notes: row.notes,
            paymentExpectation: paymentFor(row),
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
      setMessage(await importErrorText(response, ready));
      return;
    }
    const payload = (await response.json()) as {
      created: number;
      failed: { reason: string; rowNumber: number }[];
      orderIds?: string[];
      results?: { orderId: string; publicNumber: string; rowNumber: number }[];
    };
    onImported();
    if (inbound && payload.failed.length > 0) {
      setMessage(payload.failed.map((fail) => fail.reason).join('; '));
      return;
    }
    if (inbound) {
      showToast(confirmNow ? 'Pedido aprobado y confirmado.' : 'Pedido aprobado como borrador.');
      void locateOrders(payload.orderIds ?? []);
      onClose();
      return;
    }
    /*
     * La conciliación aparece apenas se crean los pedidos: qué pedido quedó de cada fila, cuáles no
     * entraron y por qué, y cuáles se dejaron afuera. Antes se esperaba a terminar de ubicar las
     * direcciones, que con varios pedidos tarda, y mientras tanto parecía que no pasaba nada.
     */
    setOutcome(
      rows.map((row) => {
        const result = payload.results?.find((item) => item.rowNumber === row.rowNumber);
        const fail = payload.failed.find((item) => item.rowNumber === row.rowNumber);
        return {
          customerName: edited(row).customerName,
          publicNumber: result?.publicNumber ?? null,
          reason: fail?.reason ?? null,
          rowNumber: row.rowNumber,
          status: result ? 'created' : fail ? 'failed' : 'skipped',
        };
      }),
    );
    setMessage('');
    showToast(
      `${String(payload.created)} pedido${payload.created === 1 ? '' : 's'} importado${
        payload.created === 1 ? '' : 's'
      } como ${confirmNow ? 'confirmado' : 'borrador'}.`,
    );
    void locateOrders(payload.orderIds ?? []);
  }

  /** Ubica las direcciones de los pedidos recién creados, de a cinco, con el avance a la vista. */
  async function locateOrders(ids: readonly string[]) {
    if (!locateAfter || ids.length === 0) return;
    let located = 0;
    let toReview = 0;
    try {
      for (let start = 0; start < ids.length; start += 5) {
        setLocating(`Ubicando las direcciones: ${String(start)} de ${String(ids.length)}…`);
        const response = await apiRequest('/api/v1/orders/locate', {
          body: JSON.stringify({ orderIds: ids.slice(start, start + 5) }),
          method: 'POST',
          notify: false,
        });
        if (!response.ok) break;
        for (const result of ((await response.json()) as { results: { status: string }[] })
          .results) {
          if (result.status === 'located' || result.status === 'already_located') located += 1;
          else toReview += 1;
        }
      }
    } catch {
      // Sin conexión a mitad de camino: lo que no se ubicó queda para Rutas.
    }
    setLocating(
      toReview > 0
        ? `${String(located)} con ubicación; ${String(toReview)} para revisar desde Rutas o el pedido.`
        : `${String(located)} con ubicación.`,
    );
  }

  /** Descartar el correo: no es un pedido (spam, prueba, uno que ya se cargó a mano). */
  async function discard() {
    if (!inbound) return;
    setBusy(true);
    const response = await apiRequest(`/api/v1/inbound-emails/${inbound.id}/discard`, {
      method: 'POST',
      notify: false,
    });
    setBusy(false);
    if (!response.ok) {
      setMessage(await errorMessage(response));
      return;
    }
    onImported();
    showToast('Correo descartado.');
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
            <h2>{inbound ? 'Pedido por correo' : 'Importar pedidos'}</h2>
            <p>
              {inbound
                ? `${inbound.fromAddress} · ${new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(inbound.receivedAt))}`
                : summary}
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

          {inbound && preview === null ? (
            <p className="text-sm text-ink-muted">
              El lector no reconoció un pedido en este correo. Revisá el texto original abajo: si es
              un pedido, cargalo a mano; si no, descartalo.
            </p>
          ) : preview === null ? (
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
                  <p>
                    También entiende la planilla armada por viandas: el tamaño en «Pedido» (250 o
                    400) y una columna por plato con la variedad. Las filas seguidas del mismo
                    cliente van al mismo pedido, una vianda con variedades mezcladas se carga como
                    Intuitivo, y la forma de pago pegada a la dirección y la venta se toman solas.
                  </p>
                </div>
              )}
              <p className="order-import-hint">
                Los pedidos entran como borradores y después se confirman desde la cola, igual que
                los que se cargan a mano.
              </p>
            </>
          ) : outcome ? (
            <section className="order-import-outcome" aria-live="polite">
              <p>
                <strong>
                  Se importaron {outcome.filter((item) => item.status === 'created').length} de{' '}
                  {outcome.length}.
                </strong>{' '}
                Revisá que cada fila haya quedado en su pedido.
              </p>
              <ul className="order-import-rows">
                {outcome.map((item) => (
                  <li className={`order-import-outcome-row is-${item.status}`} key={item.rowNumber}>
                    <div className="order-import-row-head">
                      <strong>{item.customerName}</strong>
                      <span>fila {item.rowNumber}</span>
                    </div>
                    <p>
                      {item.status === 'created'
                        ? 'Pedido creado.'
                        : item.status === 'failed'
                          ? `No entró: ${item.reason ?? 'error desconocido'}`
                          : 'No se importó (quedó destildado).'}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
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
                        <strong>{edited(row).customerName}</strong>
                      </label>
                      <span>
                        {row.kind === 'email'
                          ? `pedido ${String(row.rowNumber)}`
                          : `fila ${String(row.rowNumber)}`}
                        {row.receivedOn ? ` · ${formatDay(row.receivedOn)}` : ''}
                      </span>
                    </div>

                    <p className="order-import-row-order">
                      {[row.phone, row.email].filter(Boolean).join(' · ')}
                      {row.locality ? ` · ${row.locality}` : ''}
                    </p>
                    <div className="order-import-edit">
                      {(decisions[row.rowNumber] ?? 'nuevo') === 'nuevo' ? (
                        <label className="field">
                          Nombre del cliente nuevo
                          <input
                            onChange={(event) => editRow(row, { customerName: event.target.value })}
                            value={edited(row).customerName}
                          />
                        </label>
                      ) : null}
                      <label className="field">
                        Dirección
                        <input
                          onChange={(event) =>
                            editRow(row, { deliveryAddress: event.target.value })
                          }
                          value={edited(row).deliveryAddress ?? ''}
                        />
                      </label>
                      <label className="field">
                        Piso, depto, barrio
                        <input
                          onChange={(event) =>
                            editRow(row, { deliveryAddressLine2: event.target.value })
                          }
                          placeholder="Detalle de la dirección"
                          value={edited(row).deliveryAddressLine2 ?? ''}
                        />
                      </label>
                      {deliveryChoices.options.length > 1 ? (
                        <label className="field">
                          Día de reparto
                          <select
                            onChange={(event) => editRow(row, { deliveryDate: event.target.value })}
                            value={edits[row.rowNumber]?.deliveryDate ?? defaultDelivery}
                          >
                            {deliveryChoices.options.map((option) => (
                              <option key={option.date} value={option.date}>
                                {weekdayName(option.weekday)} {option.date.slice(8, 10)}/
                                {option.date.slice(5, 7)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <label className="field">
                        Medio de pago
                        <select
                          onChange={(event) =>
                            editRow(row, { paymentExpectation: event.target.value })
                          }
                          value={paymentFor(row)}
                        >
                          <option value="">El de abajo para todos</option>
                          {paymentMethods.map((method) => (
                            <option key={method.code} value={method.displayName}>
                              {method.displayName}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <ul className="order-import-items">
                      {row.items.map((item, index) => {
                        const offeringId = offeringFor(row, index);
                        return (
                          <li key={`${String(row.rowNumber)}-${String(index)}`}>
                            <span>
                              {[item.variety, item.size].filter(Boolean).join(' ') ||
                                'Sin variedad'}
                              {item.dishes.length > 0 ? ` (${item.dishes.join(', ')})` : ''}
                            </span>
                            <label className="order-import-qty">
                              ×
                              <input
                                aria-label="Cantidad"
                                max={99}
                                min={1}
                                onChange={(event) =>
                                  setQuantities((current) => ({
                                    ...current,
                                    [itemKey(row, index)]: Math.max(
                                      1,
                                      Math.min(99, Number(event.target.value) || 1),
                                    ),
                                  }))
                                }
                                type="number"
                                value={quantityFor(row, index)}
                              />
                            </label>
                            {item.offeringId === null || choices[itemKey(row, index)] ? (
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
                              <button
                                className="order-import-change"
                                onClick={() =>
                                  setChoices((current) => ({
                                    ...current,
                                    [itemKey(row, index)]: item.offeringId ?? '',
                                  }))
                                }
                                type="button"
                              >
                                en el menú · cambiar
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>

                    {row.notes ? <p className="order-import-note">«{row.notes}»</p> : null}

                    {row.duplicateOf ? (
                      <p className="order-import-row-blocked">
                        Ya hay un pedido igual de este cliente: {row.duplicateOf}. Por eso arranca
                        destildado.
                      </p>
                    ) : null}
                    {row.warnings.map((warning) => (
                      <p className="order-import-row-blocked" key={warning}>
                        {warning}
                      </p>
                    ))}
                    {(row.existingOrders ?? []).length > 0 && !row.duplicateOf ? (
                      <p className="order-import-row-existing">
                        Ya tiene en este período:{' '}
                        {(row.existingOrders ?? []).map((order) => order.summary).join('; ')}.
                      </p>
                    ) : null}
                    {(row.notices ?? []).map((notice) => (
                      <p className="order-import-row-notice" key={notice}>
                        {notice}
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
          {inbound ? (
            <details className="inbound-original" open>
              <summary>Correo original</summary>
              <p className="text-sm text-ink-muted">
                {inbound.subject} · lo que escribió el cliente, para comparar con lo de arriba.
              </p>
              <pre>{inbound.body}</pre>
            </details>
          ) : null}
        </div>

        <footer className="order-import-foot">
          {/*
           * El aviso va acá, al lado del botón: arriba de la lista quedaba fuera de la vista cuando
           * la lista era larga, y al tocar "Importar" parecía que no pasaba nada.
           */}
          {message ? (
            <p className="screen-notice order-import-foot-message" role="alert">
              {message}
            </p>
          ) : null}
          {locating ? <p className="order-import-foot-message">{locating}</p> : null}
          {outcome ? null : inbound && preview === null ? null : preview === null ? (
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
                  accept=".csv,.tsv,.txt,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  disabled={busy}
                  onChange={(event) => void readSheet(event)}
                  type="file"
                />
                {busy ? 'Leyendo la planilla…' : 'Elegir planilla'}
              </label>
            )
          ) : (
            <>
              <label className="order-import-payment">
                <input
                  checked={locateAfter}
                  onChange={(event) => setLocateAfter(event.target.checked)}
                  type="checkbox"
                />
                <span>Ubicar las direcciones</span>
              </label>
              {deliveryChoices.options.length > 1 ? (
                <div className="order-import-foot-message">
                  <DeliveryDayPicker
                    label="Día de reparto para todos"
                    onChange={setDeliveryForAll}
                    options={deliveryChoices.options}
                    value={defaultDelivery}
                  />
                </div>
              ) : null}
              <label className="order-import-payment">
                <span>Medio de pago</span>
                <select onChange={(event) => setPayment(event.target.value)} value={payment}>
                  <option disabled value="">
                    Elegir…
                  </option>
                  {paymentMethods.map((method) => (
                    <option key={method.code} value={method.displayName}>
                      {method.displayName}
                    </option>
                  ))}
                </select>
              </label>
              {blocking > 0 ? (
                <span className="order-import-foot-note">
                  Elegí la variedad de{' '}
                  {blocking === 1 ? 'un pedido' : `${String(blocking)} pedidos`} o destildalos.
                </span>
              ) : null}
              {inbound ? (
                <>
                  {canConfirm ? (
                    <button
                      className="button button-primary"
                      disabled={busy || ready.length === 0 || blocking > 0 || missingPayment}
                      onClick={() => void confirm(true)}
                      type="button"
                    >
                      {busy ? 'Aprobando…' : 'Aprobar y confirmar'}
                    </button>
                  ) : null}
                  <button
                    className={`button ${canConfirm ? 'button-secondary' : 'button-primary'}`}
                    disabled={busy || ready.length === 0 || blocking > 0 || missingPayment}
                    onClick={() => void confirm(false)}
                    type="button"
                  >
                    Aprobar como borrador
                  </button>
                </>
              ) : (
                <button
                  className="button button-primary"
                  disabled={busy || ready.length === 0 || blocking > 0 || missingPayment}
                  onClick={() => void confirm()}
                  type="button"
                >
                  {busy
                    ? 'Importando…'
                    : `Importar ${String(ready.length)} pedido${ready.length === 1 ? '' : 's'}`}
                </button>
              )}
            </>
          )}
          {inbound ? (
            <button
              className="button button-secondary"
              disabled={busy}
              onClick={() => void discard()}
              type="button"
            >
              Descartar correo
            </button>
          ) : null}
          <button className="button button-secondary" onClick={onClose} type="button">
            Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}
