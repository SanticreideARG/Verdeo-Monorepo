import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';

import { DashboardShell } from '../components/DashboardShell.js';
import { DashboardFailed, DashboardLoading } from '../components/DashboardStatus.js';
import { lastSettingsSection } from '../components/SettingsTabs.js';
import { SETTINGS_ACCESS_PERMISSION } from '../components/SettingsGate.js';
import {
  searchSettings,
  SETTINGS_SECTIONS,
  visibleSettingsGroups,
} from '../lib/settingsCatalog.js';
import { useMediaQuery } from '../lib/useNarrowViewport.js';
import { useDashboardProfile } from '../lib/useDashboardProfile.js';

/**
 * El inicio del Panel de control: todas las secciones, de un vistazo.
 *
 * En el teléfono es **la entrada** al panel. Antes "Panel de control" abría una sección cualquiera
 * ("Zonas geográficas") con las otras quince escondidas en una pastilla que parecía un título; acá se
 * ve qué hay, cada cosa con una línea que dice qué se hace ahí, y un buscador que entiende las
 * palabras con que se pregunta ("resend", "radio", "contraseña"), no sólo los títulos.
 *
 * En escritorio el menú lateral ya muestra todo y está siempre a la vista, así que acá no hay nada
 * que mostrar: vuelve a la última sección que se abrió, que es a donde se quería ir.
 */
export function SettingsHomePage() {
  const { failed, logout, profile } = useDashboardProfile();
  // El mismo corte que el menú de secciones: son una sola decisión escrita en dos lugares.
  const stacked = useMediaQuery('(max-width: 74.99rem)');
  const [query, setQuery] = useState('');

  if (failed) return <DashboardFailed label="el panel de control" />;
  if (!profile) return <DashboardLoading />;

  const groups = visibleSettingsGroups(
    profile.permissions,
    profile.permissions.includes(SETTINGS_ACCESS_PERMISSION),
  );

  if (!stacked) {
    const visible = groups.flatMap((group) => group.sections);
    const remembered = lastSettingsSection();
    const target =
      visible.find((section) => section.href === remembered)?.href ??
      visible[0]?.href ??
      SETTINGS_SECTIONS[0]?.href ??
      '/app';
    return <Navigate replace to={target} />;
  }

  const results = searchSettings(groups, query);
  const total = results.reduce((sum, group) => sum + group.sections.length, 0);

  return (
    <DashboardShell profile={profile} onLogout={() => void logout()}>
      <section className="dashboard-panel settings-home">
        <header>
          <p className="dashboard-kicker">Panel de control</p>
          <h1 className="text-2xl font-semibold text-forest">Ajustes y administración</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Elegí qué querés configurar, o buscalo por lo que hace.
          </p>
        </header>

        <label className="settings-search">
          <span className="sr-only">Buscar un ajuste</span>
          <svg
            aria-hidden="true"
            fill="none"
            height="18"
            stroke="currentColor"
            viewBox="0 0 24 24"
            width="18"
          >
            <circle cx="11" cy="11" r="6.5" strokeWidth="2" />
            <path d="m16 16 4.5 4.5" strokeLinecap="round" strokeWidth="2" />
          </svg>
          <input
            autoComplete="off"
            enterKeyHint="search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar un ajuste…"
            type="search"
            value={query}
          />
        </label>

        {total === 0 ? (
          <p className="settings-empty" role="status">
            No encontré ningún ajuste con «{query.trim()}». Probá con otra palabra, o borrá la
            búsqueda para ver todo.
          </p>
        ) : (
          <>
            <p aria-live="polite" className="sr-only" role="status">
              {query.trim() ? `${String(total)} resultados` : ''}
            </p>
            {results.map((group) => (
              <section aria-label={group.label} className="settings-group" key={group.label}>
                <h2 className="settings-nav-label">{group.label}</h2>
                <ul className="settings-cards">
                  {group.sections.map((section) => (
                    <li key={section.href}>
                      <Link className="settings-card" to={section.href}>
                        <span>
                          <strong>{section.label}</strong>
                          <small>{section.description}</small>
                        </span>
                        <svg
                          aria-hidden="true"
                          fill="none"
                          height="18"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          width="18"
                        >
                          <path
                            d="m9 6 6 6-6 6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2.2"
                          />
                        </svg>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </section>
    </DashboardShell>
  );
}
