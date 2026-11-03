import { useEffect, useState } from 'react';

import { apiRequest } from '../lib/api.js';
import {
  confirmationDraft,
  confirmationMessage,
  fillConfirmationDraft,
  missingConfirmationFacts,
  type ConfirmationOrder,
} from '../lib/confirmationMessage.js';
import { errorMessage } from '../lib/operations.js';
import { showToast } from '../lib/toast.js';

const WINDOW_KEY = 'verdeo.confirmacion.franja';
const DEFAULT_WINDOW = 'de 11 a 14h';

function storedWindow(): string {
  try {
    return window.localStorage.getItem(WINDOW_KEY) ?? DEFAULT_WINDOW;
  } catch {
    return DEFAULT_WINDOW;
  }
}

/** Copia al portapapeles; si el navegador no deja usar la API moderna, con el método viejo. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

/**
 * El mensaje de confirmación del pedido, listo para pegar en WhatsApp.
 *
 * Se escribía a mano en cada pedido. La franja horaria no sale del pedido (es la general de la
 * semana), así que se escribe acá y se recuerda en este navegador para el próximo.
 *
 * Con permiso de IA, Hera escribe otras versiones. A Hera le llega el mensaje con {nombre} y
 * {direccion} en lugar de los datos del cliente: se completan acá, al mostrarlo, y una versión que
 * cambió el importe o el día se descarta en vez de ofrecerse para copiar.
 */
export function ConfirmationMessageCard({
  canUseHera = false,
  order,
}: {
  canUseHera?: boolean;
  order: ConfirmationOrder;
}) {
  const [timeWindow, setTimeWindow] = useState(storedWindow);
  const [copied, setCopied] = useState(false);
  const [heraDraft, setHeraDraft] = useState<string | null>(null);
  const [indication, setIndication] = useState('');
  const [asking, setAsking] = useState(false);
  const [failure, setFailure] = useState('');
  const message = heraDraft
    ? fillConfirmationDraft(heraDraft, order, timeWindow)
    : confirmationMessage(order, timeWindow);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 2_500);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      window.localStorage.setItem(WINDOW_KEY, timeWindow);
    } catch {
      // Sin almacenamiento se copia igual; sólo no se recuerda la franja.
    }
    if (await copyText(message)) {
      setCopied(true);
      showToast('Mensaje de confirmación copiado al portapapeles.');
    } else {
      showToast('No se pudo copiar: seleccioná el texto y copialo a mano.', 'error');
    }
  }

  async function askHera() {
    setAsking(true);
    setFailure('');
    const note = indication.trim();
    const response = await apiRequest('/api/v1/ai/assistant/messages', {
      body: JSON.stringify({
        message: [
          'Escribí otra versión de este mensaje de confirmación de un pedido, para WhatsApp.',
          'Dejá {nombre}, {direccion} y {franja} tal cual, y no cambies lo pedido, el importe ni el día.',
          'No agregues datos que no estén. Devolvé sólo el mensaje.',
          note ? `Indicación: ${note}` : '',
          `Mensaje:\n${heraDraft ?? confirmationDraft(order)}`,
        ]
          .filter(Boolean)
          .join('\n'),
        mode: 'buho_mejorar_texto',
      }),
      method: 'POST',
      notify: false,
    }).catch(() => null);
    setAsking(false);
    if (!response?.ok) {
      setFailure(response ? await errorMessage(response) : 'No hubo conexión con el servidor.');
      return;
    }
    const draft = ((await response.json()) as { reply: string }).reply.trim();
    const missing = missingConfirmationFacts(draft, order);
    if (missing.length > 0) {
      setFailure(`Hera dejó afuera ${missing.join(', ')}. Pedile otra versión.`);
      return;
    }
    setHeraDraft(draft);
  }

  return (
    <section className="confirmation-card">
      <h2 className="text-sm font-bold text-forest">Mensaje de confirmación</h2>
      <label className="field">
        Franja horaria
        <input
          onChange={(event) => setTimeWindow(event.target.value)}
          placeholder={DEFAULT_WINDOW}
          value={timeWindow}
        />
      </label>
      <p className="confirmation-text">{message}</p>
      {failure ? (
        <p className="confirmation-failure" role="alert">
          {failure}
        </p>
      ) : null}
      <div className="confirmation-actions">
        <button
          aria-live="polite"
          className={`button ${copied ? 'button-secondary' : 'button-primary'}`}
          onClick={() => void copy()}
          type="button"
        >
          {copied ? '✓ Copiado' : 'Copiar confirmación'}
        </button>
        {canUseHera ? (
          <button
            className="button button-secondary"
            disabled={asking}
            onClick={() => void askHera()}
            type="button"
          >
            {asking ? 'Hera está escribiendo…' : 'Pedirle otra versión a Hera'}
          </button>
        ) : null}
        {heraDraft ? (
          <button
            className="button button-secondary"
            onClick={() => {
              setHeraDraft(null);
              setFailure('');
            }}
            type="button"
          >
            Volver al original
          </button>
        ) : null}
      </div>
      {canUseHera ? (
        <label className="field">
          Indicación para Hera (opcional)
          <input
            maxLength={200}
            onChange={(event) => setIndication(event.target.value)}
            placeholder="Ej.: más corto, más cordial"
            value={indication}
          />
        </label>
      ) : null}
    </section>
  );
}
