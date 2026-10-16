import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SETTINGS_SECTIONS } from '../lib/settingsCatalog.js';
import { SettingsHomePage } from './SettingsHomePage.js';

const permissions = [
  'settings.access',
  ...SETTINGS_SECTIONS.flatMap((section) => (section.permission ? [section.permission] : [])),
];

vi.mock('../lib/useDashboardProfile.js', () => ({
  useDashboardProfile: () => ({
    failed: false,
    logout: () => undefined,
    profile: {
      permissions,
      session: { expiresAt: '2030-01-01T00:00:00.000Z', id: 's' },
      user: { avatarUrl: null, displayName: 'Prueba', email: null, id: 'u' },
    },
  }),
}));

// El marco de la aplicación (menú, barra, sesión) no es lo que se prueba acá.
vi.mock('../components/DashboardShell.js', () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

function simulateScreen(narrow: boolean) {
  window.matchMedia = (query: string) => ({
    addEventListener: () => undefined,
    addListener: () => undefined,
    dispatchEvent: () => false,
    matches: narrow,
    media: query,
    onchange: null,
    removeEventListener: () => undefined,
    removeListener: () => undefined,
  });
}

function show() {
  return render(
    <MemoryRouter initialEntries={['/app/ajustes']}>
      <Routes>
        <Route element={<SettingsHomePage />} path="/app/ajustes" />
        <Route element={<p>Estás en pagos</p>} path="/app/ajustes/pagos" />
        <Route element={<p>Estás en zonas</p>} path="/app/ajustes/zonas" />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => window.localStorage.clear());

describe('el inicio del Panel de control en el teléfono', () => {
  beforeEach(() => simulateScreen(true));

  it('muestra todas las secciones como tarjetas, agrupadas y con su descripción', () => {
    show();

    for (const section of SETTINGS_SECTIONS) {
      const tarjeta = screen.getByRole('link', { name: new RegExp(section.label) });
      expect(tarjeta.getAttribute('href')).toBe(section.href);
      expect(within(tarjeta).getByText(section.description)).toBeTruthy();
    }
    expect(screen.getByRole('region', { name: 'Integraciones' })).toBeTruthy();
  });

  it('el buscador filtra por lo que hace cada cosa', () => {
    show();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'resend' } });

    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Correo/ })).toBeTruthy();
  });

  it('sin resultados lo dice y sugiere qué hacer', () => {
    show();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ballena' } });

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByRole('status', { name: '' }).textContent).toContain('«ballena»');
    expect(screen.getByText(/Probá con otra palabra/)).toBeTruthy();
  });
});

describe('el inicio del Panel de control en escritorio', () => {
  beforeEach(() => simulateScreen(false));

  it('vuelve a la última sección que se abrió', () => {
    window.localStorage.setItem('verdeo.panel.ultimaSeccion', '/app/ajustes/pagos');

    show();

    expect(screen.getByText('Estás en pagos')).toBeTruthy();
  });

  it('sin una recordada, va a la primera que se ve', () => {
    show();

    expect(screen.getByText('Estás en zonas')).toBeTruthy();
  });
});
