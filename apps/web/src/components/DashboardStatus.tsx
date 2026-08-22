/** The loading/failed states every dashboard screen shows before its own content is ready. */

export function DashboardLoading() {
  return (
    <main className="dashboard-loading" aria-live="polite">
      <img src="/brand/verdeo-icon.png" alt="" width="54" height="54" />
      <p>Cargando tu espacio…</p>
    </main>
  );
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
