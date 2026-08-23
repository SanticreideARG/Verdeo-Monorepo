import { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';

import { CmsSection, type PageSection } from '../components/CmsSections.js';
import { apiRequest } from '../lib/api.js';
import { AIProvidersPage } from './AIProvidersPage.js';
import { AIWorkbenchPage } from './AIWorkbenchPage.js';
import { CmsPagesAdminPage } from './CmsPagesAdminPage.js';
import { DashboardPage } from './DashboardPage.js';
import { ChatLinksPage } from './ChatLinksPage.js';
import { ChatPage } from './ChatPage.js';
import { CustomersPage } from './CustomersPage.js';
import { DeliveryAppPage } from './DeliveryAppPage.js';
import { GeographySettingsPage } from './GeographySettingsPage.js';
import { KitchenPage } from './KitchenPage.js';
import { LoginPage } from './LoginPage.js';
import { MenuBuilderPage } from './MenuBuilderPage.js';
import { MenusPage } from './MenusPage.js';
import { MessagingAccountsPage } from './MessagingAccountsPage.js';
import { MessagingInboxPage } from './MessagingInboxPage.js';
import { OAuthCallbackPage } from './OAuthCallbackPage.js';
import { OrderDetailPage } from './OrderDetailPage.js';
import { OrderIntakePage } from './OrderIntakePage.js';
import { OrdersPage } from './OrdersPage.js';
import { PaymentsPage } from './PaymentsPage.js';
import { ProfilePage } from './ProfilePage.js';
import { PublicOrderPage } from './PublicOrderPage.js';
import { RoutesPage } from './RoutesPage.js';
import { TrackOrderPage } from './TrackOrderPage.js';
import { UsersAdminPage } from './UsersAdminPage.js';

function BrandMark() {
  return (
    <Link className="brand" to="/" aria-label="Verdeo, inicio">
      <img className="brand-icon" src="/brand/verdeo-icon.png" alt="" width="36" height="36" />
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
          <Link className="nav-link hidden sm:inline-flex" to="/seguimiento">
            Seguir mi pedido
          </Link>
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

/** The original hand-built landing content — kept as the fallback for when nobody has published a
 * CMS "home" page yet, so shipping the CMS never blanks the live site. Once an admin creates and
 * publishes /app/contenidos → "home", CmsHomePage renders that instead. */
function DefaultHomeContent() {
  return (
    <>
      <section className="mx-auto grid w-full max-w-6xl gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">
        <div>
          <p className="eyebrow">Comidas listas para tu semana</p>
          <h1 className="mt-5 max-w-2xl text-5xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-7xl">
            Comer rico y bien puede ser simple.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-ink-muted">
            Elegí tu variedad, armá tu semana y recibí cinco comidas prácticas, cuidadas y llenas de
            sabor.
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
            ['02', 'Coordinamos', 'Confirmamos tu pedido, dirección y disponibilidad de entrega.'],
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
    </>
  );
}

function HomePage() {
  const [sections, setSections] = useState<PageSection[] | null>(null);

  useEffect(() => {
    let active = true;
    void apiRequest('/api/v1/public/pages/home')
      .then(async (response) => {
        if (!response.ok || !active) return;
        const body = (await response.json()) as { sections: PageSection[] };
        if (active) setSections(body.sections);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <PublicLayout>
      <main>
        {sections && sections.length > 0 ? (
          sections.map((section) => <CmsSection key={section.id} section={section} />)
        ) : (
          <DefaultHomeContent />
        )}
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
      <Route path="/pedido" element={<PublicOrderPage />} />
      <Route path="/seguimiento" element={<TrackOrderPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<OAuthCallbackPage />} />
      <Route path="/app" element={<DashboardPage />} />
      <Route path="/app/clientes" element={<CustomersPage />} />
      <Route path="/app/pedidos/nuevo" element={<OrderIntakePage />} />
      <Route path="/app/pedidos/:id" element={<OrderDetailPage />} />
      <Route path="/app/pedidos" element={<OrdersPage />} />
      <Route path="/app/menus/nuevo" element={<MenuBuilderPage />} />
      <Route path="/app/menus" element={<MenusPage />} />
      <Route path="/app/cocina" element={<KitchenPage />} />
      <Route path="/app/ia" element={<AIProvidersPage />} />
      <Route path="/app/ia/workbench" element={<AIWorkbenchPage />} />
      <Route path="/app/chat" element={<ChatPage />} />
      <Route path="/app/mensajes" element={<MessagingInboxPage />} />
      <Route path="/app/ajustes/mensajes" element={<MessagingAccountsPage />} />
      <Route path="/app/reparto/rutas" element={<RoutesPage />} />
      <Route path="/app/pagos" element={<PaymentsPage />} />
      <Route path="/delivery" element={<DeliveryAppPage />} />
      <Route path="/app/perfil" element={<ProfilePage />} />
      <Route path="/app/usuarios" element={<UsersAdminPage />} />
      <Route path="/app/contenidos" element={<CmsPagesAdminPage />} />
      <Route path="/app/ajustes/zonas" element={<GeographySettingsPage />} />
      <Route path="/app/ajustes/chat" element={<ChatLinksPage />} />
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
