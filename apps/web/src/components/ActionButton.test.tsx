import { act, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';

import { ActionButton } from './ActionButton.js';

describe('ActionButton', () => {
  it('dice la espera mientras corre y vuelve a su texto al terminar', async () => {
    let finish: () => void = () => undefined;
    render(
      <ActionButton
        onClick={() => new Promise<void>((resolve) => (finish = resolve))}
        pendingLabel="Preparando…"
      >
        Imprimir
      </ActionButton>,
    );

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button').textContent).toBe('Preparando…');

    await act(() => Promise.resolve(finish()));
    expect(screen.getByRole('button').textContent).toBe('Imprimir');
  });

  it('en modo estricto (montar, desmontar y volver a montar) no se queda trabado', async () => {
    let finish: () => void = () => undefined;
    render(
      <StrictMode>
        <ActionButton
          onClick={() => new Promise<void>((resolve) => (finish = resolve))}
          pendingLabel="Preparando…"
        >
          Imprimir
        </ActionButton>
      </StrictMode>,
    );

    fireEvent.click(screen.getByRole('button'));
    await act(() => Promise.resolve(finish()));

    expect(screen.getByRole('button').textContent).toBe('Imprimir');
  });

  it('no deja tocar dos veces mientras corre', async () => {
    let calls = 0;
    let finish: () => void = () => undefined;
    render(
      <ActionButton
        onClick={() => {
          calls += 1;
          return new Promise<void>((resolve) => (finish = resolve));
        }}
      >
        Guardar
      </ActionButton>,
    );

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button'));
    await act(() => Promise.resolve(finish()));

    expect(calls).toBe(1);
  });
});
