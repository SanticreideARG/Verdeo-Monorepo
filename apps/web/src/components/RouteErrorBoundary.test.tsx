import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RouteErrorBoundary } from './RouteErrorBoundary.js';

function Rota(): never {
  throw new Error('se rompió');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RouteErrorBoundary', () => {
  it('muestra la pantalla de error en lugar de dejar la página en blanco', () => {
    // React y el componente registran el error en consola; acá no interesa verlo.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <RouteErrorBoundary>
        <Rota />
      </RouteErrorBoundary>,
    );

    expect(screen.getByRole('alert').textContent).toContain('Esta pantalla se rompió');
    expect(screen.getByRole('button', { name: 'Volver a intentar' })).toBeTruthy();
  });

  it('sin errores muestra la pantalla normal', () => {
    render(
      <RouteErrorBoundary>
        <p>todo bien</p>
      </RouteErrorBoundary>,
    );
    expect(screen.getByText('todo bien')).toBeTruthy();
  });
});
