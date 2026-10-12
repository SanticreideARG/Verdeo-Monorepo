import { useEffect, useState } from 'react';

import { confirmationMessage } from '../lib/confirmationMessage.js';
import type { OrderSummary } from '../lib/operations.js';
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
 */
export function ConfirmationMessageCard({
  order,
}: {
  order: Pick<
    OrderSummary,
    'customer' | 'deliveryAddress' | 'deliveryDate' | 'items' | 'totalMinor'
  >;
}) {
  const [timeWindow, setTimeWindow] = useState(storedWindow);
  const [copied, setCopied] = useState(false);
  const message = confirmationMessage(order, timeWindow);

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
      <button
        aria-live="polite"
        className={`button ${copied ? 'button-secondary' : 'button-primary'}`}
        onClick={() => void copy()}
        type="button"
      >
        {copied ? '✓ Copiado' : 'Copiar confirmación'}
      </button>
    </section>
  );
}
