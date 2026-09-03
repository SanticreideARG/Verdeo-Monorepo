/** The loading/failed states every dashboard screen shows before its own content is ready. */
import { BrandLoading } from './BrandLoading.js';

export function DashboardLoading() {
  return <BrandLoading message="Cargando tu espacio…" />;
}

export function DashboardFailed({ label }: { label: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-cream px-5 text-center">
      <div>
        <p className="eyebrow">Verdeo SCA</p>
        <h1 className="mt-4 text-3xl font-semibold text-forest">No pudimos cargar {label}.</h1>
        <button className="button button-primary mt-7" onClick={() => window.location.reload()}>
          Reintentar
        </button>
      </div>
    </main>
  );
}
