import type { AppError } from '../lib/errors.js';

/**
 * El error de una pantalla, con su salida.
 *
 * Tres cosas que antes no se distinguían: qué pasó, qué hacer, y —cuando la acción tiene sentido—
 * el botón que lo hace. Sin permiso no hay nada que reintentar; sin conexión, reintentar es
 * exactamente lo que hay que hacer, así que el botón aparece sólo donde sirve.
 *
 * Visualmente separado de una confirmación a propósito. Las dos cosas compartían el mismo renglón
 * gris —"Pedido actualizado" y "No pudimos guardar" en el mismo lugar y con el mismo peso— y eso
 * enseña a ignorarlo, que es la peor cosa que le puede pasar a un mensaje de error.
 */
export function ErrorNotice({
  error,
  onRetry,
}: {
  error: AppError;
  /** Sólo tiene sentido cuando reintentar puede cambiar el resultado. */
  onRetry?: () => void;
}) {
  const retryable = error.kind === 'conexion' || error.kind === 'servidor';

  return (
    <div className="error-notice" role="alert">
      <div>
        <p className="error-notice-message">{error.message}</p>
        {error.hint ? <p className="error-notice-hint">{error.hint}</p> : null}
        {/* El identificador sólo cuando sirve para algo: en un fallo nuestro, para poder buscarlo. */}
        {error.requestId && (error.kind === 'servidor' || error.kind === 'regla') ? (
          <p className="error-notice-id">Solicitud {error.requestId}</p>
        ) : null}
      </div>
      {onRetry && retryable ? (
        <button className="button button-secondary" onClick={onRetry} type="button">
          Reintentar
        </button>
      ) : null}
      {error.kind === 'sesion' ? (
        <a className="button button-secondary" href="/login">
          Iniciar sesión
        </a>
      ) : null}
    </div>
  );
}
