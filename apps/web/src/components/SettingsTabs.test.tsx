import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SETTINGS_SECTIONS } from '../lib/settingsCatalog.js';
import { SettingsTabs } from './SettingsTabs.js';

/** jsdom no trae `matchMedia`: se simula una pantalla angosta (true) o ancha (false). */
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

const EVERYTHING = [
  'settings.access',
  ...SETTINGS_SECTIONS.flatMap((section) => (section.permission ? [section.permission] : [])),
];

function show(path: string, permissions: string[] = EVERYTHING) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<SettingsTabs permissions={permissions} />} path="*" />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  document.documentElement.style.overflow = '';
});
afterEach(() => vi.restoreAllMocks());

describe('SettingsTabs en pantalla angosta', () => {
  beforeEach(() => simulateScreen(true));

  it('muestra cómo volver y cómo cambiar de sección, a la vista', () => {
    show('/app/ajustes/correo');

    expect(screen.getByRole('link', { name: /Panel de control/ }).getAttribute('href')).toBe(
      '/app/ajustes',
    );
    const switcher = screen.getByRole('button', { name: /Cambiar de sección/ });
    expect(switcher.getAttribute('aria-haspopup')).toBe('dialog');
    expect(switcher.getAttribute('aria-expanded')).toBe('false');
  });

  it('ofrece las secciones del mismo grupo como fichas, con la actual marcada', () => {
    show('/app/ajustes/correo');

    const fichas = within(screen.getByRole('navigation', { name: 'Más de Integraciones' }));
    expect(fichas.getByRole('link', { name: 'Correo' }).getAttribute('aria-current')).toBe('page');
    expect(fichas.getByRole('link', { name: 'Cuentas de WhatsApp' })).toBeTruthy();
    // Las de otros grupos no van acá: están en la hoja.
    expect(fichas.queryByRole('link', { name: 'Respaldos' })).toBeNull();
  });

  it('una sección sin hermanas no muestra fichas', () => {
    show('/app/usuarios');

    expect(screen.queryByRole('navigation', { name: /Más de/ })).toBeNull();
  });

  it('la hoja abre con todo agrupado, marca la actual y se cierra con Escape devolviendo el foco', () => {
    show('/app/ajustes/correo');
    const switcher = screen.getByRole('button', { name: /Cambiar de sección/ });

    fireEvent.click(switcher);

    const hoja = screen.getByRole('dialog', { name: 'Cambiar de sección' });
    expect(switcher.getAttribute('aria-expanded')).toBe('true');
    const dentro = within(hoja);
    expect(dentro.getByText('Operación')).toBeTruthy();
    expect(dentro.getByText('Sistema')).toBeTruthy();
    expect(dentro.getByRole('link', { name: /Correo/ }).getAttribute('aria-current')).toBe('page');
    // Cada renglón explica qué se hace ahí.
    expect(dentro.getByText('Descargar una copia de todos los datos y restaurarla.')).toBeTruthy();
    // La página de atrás no se desplaza mientras está abierta.
    expect(document.documentElement.style.overflow).toBe('hidden');
    // El foco entra a la hoja.
    expect(document.activeElement).toBe(dentro.getByRole('button', { name: 'Cerrar' }));

    fireEvent.keyDown(hoja, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.documentElement.style.overflow).toBe('');
    expect(document.activeElement).toBe(switcher);
  });

  it('tocar afuera de la hoja la cierra; tocar adentro no', () => {
    show('/app/ajustes/correo');
    fireEvent.click(screen.getByRole('button', { name: /Cambiar de sección/ }));

    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.getByRole('dialog')).toBeTruthy();

    const fondo = screen.getByRole('dialog').parentElement as HTMLElement;
    fireEvent.click(fondo);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('el foco no se escapa de la hoja con Tab', () => {
    show('/app/ajustes/correo');
    fireEvent.click(screen.getByRole('button', { name: /Cambiar de sección/ }));
    const hoja = screen.getByRole('dialog');
    const enlaces = within(hoja).getAllByRole('link');
    const ultimo = enlaces.at(-1) as HTMLElement;

    ultimo.focus();
    fireEvent.keyDown(hoja.parentElement as HTMLElement, { key: 'Tab' });

    expect(document.activeElement).toBe(within(hoja).getByRole('button', { name: 'Cerrar' }));
  });

  it('sólo ofrece lo que la persona puede ver', () => {
    show('/app/ajustes/zonas', ['settings.access', 'sites.read']);
    fireEvent.click(screen.getByRole('button', { name: /Cambiar de sección/ }));

    const hoja = within(screen.getByRole('dialog'));
    expect(hoja.getByRole('link', { name: /Zonas geográficas/ })).toBeTruthy();
    expect(hoja.queryByRole('link', { name: /Respaldos/ })).toBeNull();
  });

  it('con una sola sección visible no hay menú', () => {
    const { container } = show('/app/ajustes/apariencia', ['sites.read']);

    expect(container.querySelector('.settings-nav')).toBeNull();
  });
});

describe('SettingsTabs en escritorio', () => {
  beforeEach(() => simulateScreen(false));

  it('es la columna de siempre, con los grupos y sin hoja', () => {
    show('/app/ajustes/correo');

    const menu = within(screen.getByRole('navigation', { name: 'Secciones del panel de control' }));
    expect(menu.getByText('Integraciones')).toBeTruthy();
    expect(menu.getByRole('link', { name: 'Correo' }).getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('button', { name: /Cambiar de sección/ })).toBeNull();
  });

  it('recuerda la sección abierta para que "Panel de control" vuelva a ella', () => {
    show('/app/ajustes/pagos');

    expect(window.localStorage.getItem('verdeo.panel.ultimaSeccion')).toBe('/app/ajustes/pagos');
  });
});
