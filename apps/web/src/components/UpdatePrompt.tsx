import { useRegisterSW } from 'virtual:pwa-register/react';

/** Cada cuánto se pregunta si hay un deploy nuevo, para quien deja la app abierta todo el día. */
const UPDATE_CHECK_MS = 30 * 60 * 1000;

/**
 * El aviso de versión nueva.
 *
 * Antes la app se actualizaba sola y en silencio: el service worker nuevo se instalaba, pero la
 * pestaña abierta seguía con el código viejo hasta cerrarla del todo —en el teléfono, a veces dos
 * veces—. Después de cada deploy alguien veía la pantalla anterior y no había forma de saberlo.
 *
 * Ahora la versión nueva espera y se avisa. "Actualizar" la activa y recarga; "Después" la deja
 * para la próxima vez que se abra la app, así nadie pierde un pedido a medio cargar por un deploy.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      window.setInterval(() => {
        // Sin conexión no hay nada que buscar, y el intento fallido sólo ensucia la consola.
        if (navigator.onLine) void registration.update();
      }, UPDATE_CHECK_MS);
    },
  });

  if (!needRefresh) return null;

  return (
    <div aria-live="polite" className="update-prompt" role="status">
      <p>Hay una versión nueva de Verdeo.</p>
      <div className="update-prompt-actions">
        <button className="update-prompt-later" onClick={() => setNeedRefresh(false)} type="button">
          Después
        </button>
        <button
          className="update-prompt-go"
          onClick={() => void updateServiceWorker(true)}
          type="button"
        >
          Actualizar
        </button>
      </div>
    </div>
  );
}
