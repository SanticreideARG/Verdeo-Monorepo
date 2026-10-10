import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Lo que se ve cuando una pantalla se rompe al dibujarse.
 *
 * Sin esto, un error de React en cualquier pantalla desmonta la aplicación entera y deja la
 * página en blanco, sin menú ni forma de salir: le pasó a Etiquetas, y lo único que veía quien la
 * abría era una pantalla vacía. Acá se avisa qué pasó, se ofrece reintentar o volver al inicio, y
 * el resto de la aplicación sigue en pie.
 *
 * Se reinicia al cambiar de pantalla (quien la monta le pasa la ruta como `key`): un error en
 * Etiquetas no puede dejar rota también la pantalla a la que uno se va.
 */
export class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  public override state: { error: Error | null } = { error: null };

  public static getDerivedStateFromError(error: Error) {
    return { error };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Pantalla rota', error, info.componentStack);
  }

  public override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="route-crash" role="alert">
        <h1 className="text-xl font-semibold">Esta pantalla se rompió</h1>
        <p className="text-sm">
          Algo falló al mostrarla. Probá de nuevo; si vuelve a pasar, avisá qué estabas haciendo.
        </p>
        <div className="form-actions">
          <button
            className="button button-primary"
            onClick={() => window.location.reload()}
            type="button"
          >
            Volver a intentar
          </button>
          <a className="button" href="/app">
            Ir al inicio
          </a>
        </div>
      </div>
    );
  }
}
