import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { hasPersistedState, usePersistedState } from './usePersistedState.js';

interface Variety {
  dishes: string;
  familyName: string;
}

/** Mirrors the menu builder: an array of rows whose contents are the expensive thing to lose. */
function Harness({
  enabled = true,
  storageKey = 'varieties',
}: {
  enabled?: boolean;
  storageKey?: string;
}) {
  const [varieties, setVarieties, clear] = usePersistedState<Variety[]>(
    storageKey,
    [{ dishes: '', familyName: '' }],
    enabled,
  );

  return (
    <div>
      <p data-testid="count">{varieties.length}</p>
      <p data-testid="dishes">{varieties.map((variety) => variety.dishes).join('|')}</p>
      <button
        onClick={() => setVarieties((current) => [...current, { dishes: '', familyName: '' }])}
        type="button"
      >
        Agregar
      </button>
      <button
        onClick={() =>
          setVarieties((current) =>
            current.map((variety, index) =>
              index === 0 ? { ...variety, dishes: 'Lomo\nSuprema' } : variety,
            ),
          )
        }
        type="button"
      >
        Escribir
      </button>
      <button onClick={clear} type="button">
        Limpiar
      </button>
    </div>
  );
}

describe('usePersistedState', () => {
  it('restores array state across unmount, rows and contents alike', () => {
    const first = render(<Harness />);
    act(() => screen.getByText('Agregar').click());
    act(() => screen.getByText('Escribir').click());
    expect(screen.getByTestId('count').textContent).toBe('2');
    first.unmount();

    render(<Harness />);

    expect(screen.getByTestId('count').textContent).toBe('2');
    expect(screen.getByTestId('dishes').textContent).toBe('Lomo\nSuprema|');
  });

  it('clears the stored draft and reports it is gone', () => {
    const first = render(<Harness />);
    act(() => screen.getByText('Escribir').click());
    expect(hasPersistedState('varieties')).toBe(true);

    act(() => screen.getByText('Limpiar').click());
    expect(hasPersistedState('varieties')).toBe(false);
    first.unmount();

    render(<Harness />);
    expect(screen.getByTestId('dishes').textContent).toBe('');
  });

  // While editing an existing menu, the loaded values are the source of truth — a leftover draft
  // from a different week must never overwrite them.
  it('ignores storage entirely when disabled', () => {
    const first = render(<Harness />);
    act(() => screen.getByText('Escribir').click());
    first.unmount();

    render(<Harness enabled={false} />);

    expect(screen.getByTestId('dishes').textContent).toBe('');
  });

  it('does not report a draft for a key that was never written', () => {
    expect(hasPersistedState('nunca-usada')).toBe(false);
  });

  it('falls back to the initial value when the stored draft is corrupt', () => {
    window.sessionStorage.setItem('verdeo-draft:varieties', '{no es json');

    render(<Harness />);

    expect(screen.getByTestId('count').textContent).toBe('1');
  });
});
