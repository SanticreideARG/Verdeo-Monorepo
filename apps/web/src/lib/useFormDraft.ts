import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keeps what someone typed into a form when they navigate away and come back.
 *
 * Most forms in this dashboard are uncontrolled — they read their values with
 * `new FormData(event.currentTarget)` on submit, so until then the data lives only in the DOM and
 * React throws it away on unmount. That is exactly why this can be one hook instead of a rewrite:
 * it listens to the form's own `input`/`change` events and snapshots the whole `FormData`, so a
 * form opts in with a ref and one call rather than a `useState` per field.
 *
 * Storage is `sessionStorage`, not `localStorage`, on purpose: these forms carry customer names,
 * phones and addresses, and a dashboard runs on shared machines at the local. Session storage
 * survives the thing we actually want to survive — changing screens, and a refresh — and is gone
 * when the tab closes.
 */

const PREFIX = 'verdeo-draft:';
const SAVE_DEBOUNCE_MS = 400;

/**
 * Fields that must never be written to storage even for a moment. Not a type guard: it filters
 * some inputs out without narrowing the type — everything else stays a plain form element.
 */
function isPersistable(element: Element): boolean {
  if (!(element instanceof HTMLInputElement)) return true;
  // A password field is never a draft, and a file input's value can't be restored anyway.
  return element.type !== 'password' && element.type !== 'file';
}

function readForm(form: HTMLFormElement): Record<string, string | string[] | boolean> {
  const draft: Record<string, string | string[] | boolean> = {};
  for (const element of Array.from(form.elements)) {
    if (!('name' in element) || typeof element.name !== 'string' || !element.name) continue;
    if (!isPersistable(element)) continue;

    if (element instanceof HTMLInputElement && element.type === 'checkbox') {
      draft[element.name] = element.checked;
    } else if (element instanceof HTMLInputElement && element.type === 'radio') {
      if (element.checked) draft[element.name] = element.value;
    } else if (element instanceof HTMLSelectElement && element.multiple) {
      draft[element.name] = Array.from(element.selectedOptions).map((option) => option.value);
    } else if (
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
    ) {
      if (element.value) draft[element.name] = element.value;
    }
  }
  return draft;
}

function writeForm(
  form: HTMLFormElement,
  draft: Record<string, string | string[] | boolean>,
): boolean {
  let restoredAnything = false;
  for (const [name, value] of Object.entries(draft)) {
    const field = form.elements.namedItem(name);
    if (!field) continue;

    // A radio group comes back as a RadioNodeList rather than a single element.
    if (field instanceof RadioNodeList) {
      for (const radio of Array.from(field)) {
        if (radio instanceof HTMLInputElement) radio.checked = radio.value === value;
      }
      restoredAnything = true;
    } else if (field instanceof HTMLInputElement && field.type === 'checkbox') {
      field.checked = value === true;
      if (value === true) restoredAnything = true;
    } else if (field instanceof HTMLSelectElement && field.multiple && Array.isArray(value)) {
      for (const option of Array.from(field.options))
        option.selected = value.includes(option.value);
      restoredAnything = true;
    } else if (
      (field instanceof HTMLInputElement ||
        field instanceof HTMLSelectElement ||
        field instanceof HTMLTextAreaElement) &&
      typeof value === 'string'
    ) {
      field.value = value;
      restoredAnything = true;
    }
  }
  return restoredAnything;
}

export interface FormDraft {
  /** Wipes the form and its stored draft. Wire this to a "Limpiar" button. */
  clear: () => void;
  /** True once a stored draft was put back, until it is discarded or the form is submitted. */
  restored: boolean;
  /** Drops the stored draft but leaves the form as-is. Call after a successful submit. */
  discard: () => void;
  /** Puts the form back to empty and forgets the restore notice. */
  dismissNotice: () => void;
}

export function useFormDraft(
  formRef: React.RefObject<HTMLFormElement | null>,
  storageKey: string,
  /** Skip persistence entirely (e.g. while editing an existing record). */
  enabled = true,
): FormDraft {
  const [restored, setRestored] = useState(false);
  const key = `${PREFIX}${storageKey}`;
  // Kept in a ref so the save listener never needs to be torn down and re-attached.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const discard = useCallback(() => {
    setRestored(false);
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Private mode and storage-blocking browsers throw on access; a lost draft is not an error.
    }
  }, [key]);

  const clear = useCallback(() => {
    formRef.current?.reset();
    discard();
  }, [discard, formRef]);

  const dismissNotice = useCallback(() => {
    clear();
  }, [clear]);

  useEffect(() => {
    const form = formRef.current;
    if (!form || !enabled) return;

    try {
      const stored = window.sessionStorage.getItem(key);
      if (stored) {
        const draft = JSON.parse(stored) as Record<string, string | string[] | boolean>;
        // Only announce a restore that actually put something back — a draft whose fields no
        // longer exist would otherwise show a notice over an empty form.
        if (writeForm(form, draft)) setRestored(true);
      }
    } catch {
      // A malformed or unreadable draft is discarded rather than blocking the form.
    }

    let timer = 0;
    const save = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!enabledRef.current) return;
        try {
          const draft = readForm(form);
          if (Object.keys(draft).length === 0) window.sessionStorage.removeItem(key);
          else window.sessionStorage.setItem(key, JSON.stringify(draft));
        } catch {
          // Storage full or blocked: the form keeps working without a draft.
        }
      }, SAVE_DEBOUNCE_MS);
    };

    form.addEventListener('input', save);
    form.addEventListener('change', save);
    return () => {
      window.clearTimeout(timer);
      form.removeEventListener('input', save);
      form.removeEventListener('change', save);
    };
  }, [enabled, formRef, key]);

  return { clear, discard, dismissNotice, restored };
}
