/**
 * The one loading screen, shared by the dashboard and the public site.
 *
 * It was three different things before: a dark pulsing screen on the dashboard, bare "Cargando…"
 * text on the order and account pages, and nothing at all on the landing — which is what made the
 * first paint feel abrupt there. One treatment means a visitor sees the same thing wherever they
 * land, and on the landing it also happens to be continuous, since the hero underneath it is the
 * same night ground.
 */
export function BrandLoading({ message = 'Cargando…' }: { message?: string }) {
  return (
    <main aria-live="polite" className="brand-loading">
      <img alt="" height="54" src="/brand/verdeo-icon.png" width="54" />
      <p>{message}</p>
    </main>
  );
}
