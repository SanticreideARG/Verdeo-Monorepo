import { Link, Route, Routes } from 'react-router-dom';

function BrandMark() {
  return (
    <Link className="brand" to="/" aria-label="Verdeo, inicio">
      verdeo<span>.</span>
    </Link>
  );
}

function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <BrandMark />
        <nav className="flex items-center gap-2" aria-label="Navegación principal">
          <Link className="nav-link hidden sm:inline-flex" to="/login">
            Ingresar
          </Link>
          <Link className="button button-primary" to="/pedido">
            Hacer un pedido
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}

function HomePage() {
  return (
    <PublicLayout>
      <main>
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
          <div>
            <p className="eyebrow">Comidas listas para tu semana</p>
            <h1 className="mt-5 max-w-2xl text-5xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-7xl">
              Comer rico y bien puede ser simple.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-ink-muted">
              Elegí tu variedad, armá tu semana y recibí cinco comidas prácticas, cuidadas y llenas
              de sabor.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link className="button button-primary button-large" to="/pedido">
                Ver menú semanal
              </Link>
              <a className="button button-secondary button-large" href="#como-funciona">
                Cómo funciona
              </a>
            </div>
          </div>

          <div className="food-card" role="img" aria-label="Plato saludable de Verdeo">
            <div className="food-card-glow" />
            <div className="plate">
              <div className="plate-leaf plate-leaf-one" />
              <div className="plate-leaf plate-leaf-two" />
              <div className="plate-center">5</div>
            </div>
            <div className="food-caption">
              <span>Una unidad</span>
              <strong>Cinco comidas</strong>
            </div>
          </div>
        </section>

        <section id="como-funciona" className="border-y border-forest/10 bg-white/60">
          <div className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-14 sm:grid-cols-3 sm:px-8">
            {[
              ['01', 'Elegí', 'Encontrá la variedad y el tamaño que mejor acompañan tu semana.'],
              [
                '02',
                'Coordinamos',
                'Confirmamos tu pedido, dirección y disponibilidad de entrega.',
              ],
              ['03', 'Disfrutá', 'Recibí cinco comidas listas para resolver tus días.'],
            ].map(([number, title, copy]) => (
              <article key={number} className="step-card">
                <span>{number}</span>
                <h2>{title}</h2>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}

function PlaceholderPage({ title, copy }: { title: string; copy: string }) {
  return (
    <PublicLayout>
      <main className="mx-auto w-full max-w-3xl px-5 py-20 text-center sm:px-8">
        <p className="eyebrow">Verdeo SCA</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-ink-muted">{copy}</p>
        <Link className="button button-secondary button-large mt-8" to="/">
          Volver al inicio
        </Link>
      </main>
    </PublicLayout>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route
        path="/pedido"
        element={
          <PlaceholderPage
            title="El pedido web está en preparación"
            copy="La base del sistema ya está funcionando. El próximo módulo conectará el menú semanal con el pedido de invitado."
          />
        }
      />
      <Route
        path="/login"
        element={
          <PlaceholderPage
            title="Acceso seguro"
            copy="La autenticación se habilitará junto con los roles y permisos configurables del equipo."
          />
        }
      />
      <Route
        path="*"
        element={
          <PlaceholderPage
            title="No encontramos esa página"
            copy="Revisá el enlace o volvé al inicio."
          />
        }
      />
    </Routes>
  );
}
