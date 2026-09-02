import { act, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useFormDraft } from './useFormDraft.js';

/**
 * A stand-in for the real intake forms: uncontrolled fields read with FormData on submit, which is
 * the shape 18 of the dashboard's 24 forms actually have.
 */
function Harness({
  enabled = true,
  storageKey = 'test',
}: {
  enabled?: boolean;
  storageKey?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const draft = useFormDraft(formRef, storageKey, enabled);
  return (
    <form ref={formRef}>
      <input aria-label="Nombre" defaultValue="" name="displayName" />
      <input aria-label="Teléfono" name="phone" />
      <input aria-label="Clave" name="secret" type="password" />
      <input aria-label="Urgente" name="urgent" type="checkbox" />
      <textarea aria-label="Notas" name="notes" />
      <select aria-label="Ciudad" name="city">
        <option value="">—</option>
        <option value="neuquen">Neuquén</option>
      </select>
      {draft.restored ? <p>restaurado</p> : null}
      <button onClick={draft.clear} type="button">
        Limpiar
      </button>
      <button onClick={draft.discard} type="button">
        Descartar
      </button>
    </form>
  );
}

/** The hook debounces writes; tests drive that clock rather than waiting on it. */
function typeInto(label: string, value: string) {
  const field = screen.getByLabelText<HTMLInputElement>(label);
  act(() => {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    vi.advanceTimersByTime(500);
  });
}

function storedDraft(key = 'test'): Record<string, unknown> | null {
  const raw = window.sessionStorage.getItem(`verdeo-draft:${key}`);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

describe('useFormDraft', () => {
  it('restores what was typed after the form unmounts and mounts again', () => {
    vi.useFakeTimers();
    const first = render(<Harness />);
    typeInto('Nombre', 'Sofía Ibáñez');
    typeInto('Teléfono', '+5492995550000');
    first.unmount();

    render(<Harness />);

    expect(screen.getByLabelText<HTMLInputElement>('Nombre').value).toBe('Sofía Ibáñez');
    expect(screen.getByLabelText<HTMLInputElement>('Teléfono').value).toBe('+5492995550000');
    // The notice is what keeps a self-filling form from reading as a bug.
    expect(screen.getByText('restaurado')).toBeDefined();
    vi.useRealTimers();
  });

  // The whole point of discarding on submit rather than unmount: "I switched screens and came
  // back" restores, but "I already saved this" must not come back as a ghost.
  it('does not restore after the draft is discarded on a successful save', () => {
    vi.useFakeTimers();
    const first = render(<Harness />);
    typeInto('Nombre', 'Ya guardado');
    act(() => screen.getByText('Descartar').click());
    first.unmount();

    render(<Harness />);

    expect(screen.getByLabelText<HTMLInputElement>('Nombre').value).toBe('');
    expect(screen.queryByText('restaurado')).toBeNull();
    vi.useRealTimers();
  });

  it('clears both the fields and the stored draft', () => {
    vi.useFakeTimers();
    render(<Harness />);
    typeInto('Nombre', 'Se va a borrar');
    expect(storedDraft()).not.toBeNull();

    act(() => screen.getByText('Limpiar').click());

    expect(screen.getByLabelText<HTMLInputElement>('Nombre').value).toBe('');
    expect(storedDraft()).toBeNull();
    vi.useRealTimers();
  });

  // These forms carry customer PII on shared machines; a password must never reach storage even
  // for the moment between typing and submitting.
  it('never writes a password field to storage', () => {
    vi.useFakeTimers();
    render(<Harness />);
    typeInto('Nombre', 'Con clave');
    typeInto('Clave', 'sup3rs3cret');

    const draft = storedDraft();
    expect(draft).toMatchObject({ displayName: 'Con clave' });
    expect(draft).not.toHaveProperty('secret');
    vi.useRealTimers();
  });

  it('round-trips checkboxes, selects and textareas, not just text inputs', () => {
    vi.useFakeTimers();
    const first = render(<Harness />);
    typeInto('Notas', 'Sin cebolla');
    const checkbox = screen.getByLabelText<HTMLInputElement>('Urgente');
    const select = screen.getByLabelText<HTMLSelectElement>('Ciudad');
    act(() => {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      select.value = 'neuquen';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      vi.advanceTimersByTime(500);
    });
    first.unmount();

    render(<Harness />);

    expect(screen.getByLabelText<HTMLTextAreaElement>('Notas').value).toBe('Sin cebolla');
    expect(screen.getByLabelText<HTMLInputElement>('Urgente').checked).toBe(true);
    expect(screen.getByLabelText<HTMLSelectElement>('Ciudad').value).toBe('neuquen');
    vi.useRealTimers();
  });

  // Editing an existing record must not resurrect an unrelated draft into the loaded values.
  it('does nothing at all when disabled', () => {
    vi.useFakeTimers();
    render(<Harness enabled={false} />);
    typeInto('Nombre', 'No se guarda');

    expect(storedDraft()).toBeNull();
    vi.useRealTimers();
  });

  it('keeps drafts of different forms apart', () => {
    vi.useFakeTimers();
    const first = render(<Harness storageKey="pedidos" />);
    typeInto('Nombre', 'Del formulario de pedidos');
    first.unmount();

    render(<Harness storageKey="clientes" />);

    expect(screen.getByLabelText<HTMLInputElement>('Nombre').value).toBe('');
    expect(storedDraft('pedidos')).toMatchObject({ displayName: 'Del formulario de pedidos' });
    vi.useRealTimers();
  });
});

/**
 * A controlled form: React owns the value, so a naive `element.value = x` restore would fill the
 * box visually while React's state stayed empty — and the stale state is what gets submitted.
 */
function ControlledHarness() {
  const formRef = useRef<HTMLFormElement>(null);
  // The harness only needs the hook mounted; its handle is exercised in the other suites.
  useFormDraft(formRef, 'controlled');
  const [name, setName] = useState('');
  return (
    <form ref={formRef}>
      <input
        aria-label="Nombre"
        name="displayName"
        onChange={(event) => setName(event.target.value)}
        value={name}
      />
      {/* Renders React state, not the DOM node — the only honest way to assert state updated. */}
      <p data-testid="state">{name}</p>
    </form>
  );
}

describe('useFormDraft with controlled inputs', () => {
  it("restores into React's state, not just the DOM node", () => {
    vi.useFakeTimers();
    const first = render(<ControlledHarness />);
    const field = screen.getByLabelText<HTMLInputElement>('Nombre');
    act(() => {
      // React tracks its own value on the node, so a plain assignment is swallowed as "no change";
      // going through the native setter is what makes the synthetic onChange fire.
      // eslint-disable-next-line @typescript-eslint/unbound-method -- see nativeSetter()
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(field, 'Camila Rojas');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('state').textContent).toBe('Camila Rojas');
    first.unmount();

    render(<ControlledHarness />);

    expect(screen.getByLabelText<HTMLInputElement>('Nombre').value).toBe('Camila Rojas');
    // The assertion that matters: without the native-setter restore this reads empty, and the
    // form would silently submit nothing while looking full.
    expect(screen.getByTestId('state').textContent).toBe('Camila Rojas');
    vi.useRealTimers();
  });
});
