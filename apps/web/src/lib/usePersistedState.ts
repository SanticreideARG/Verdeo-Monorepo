import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * `useState` that survives navigating away and back.
 *
 * The sibling of `useFormDraft`, for the other half of the problem. That hook snapshots a form's
 * DOM, which is right for plain uncontrolled fields but cannot represent state that has no single
 * input behind it — the menu builder's varieties and size prices are arrays of rows that grow and
 * shrink, and the twenty dish lines inside them are the most expensive typing in the app to lose.
 * Persisting the state value itself is both simpler and more faithful there.
 *
 * Same storage reasoning as `useFormDraft`: sessionStorage, so drafts of customer-facing data do
 * not outlive the tab on a shared machine.
 */

const PREFIX = 'verdeo-draft:';

export function usePersistedState<T>(
  storageKey: string,
  initial: T,
  enabled = true,
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const key = `${PREFIX}${storageKey}`;

  const [value, setValue] = useState<T>(() => {
    if (!enabled) return initial;
    try {
      const stored = window.sessionStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initial;
    } catch {
      // Unreadable or malformed drafts fall back to the initial value rather than breaking the page.
      return initial;
    }
  });

  // The first render already carries whatever was stored, so writing it straight back would be a
  // pointless round trip — and worse, it would overwrite a fresh draft with a stale one if `enabled`
  // flipped on later.
  const skipFirstWrite = useRef(true);

  useEffect(() => {
    if (!enabled) return;
    if (skipFirstWrite.current) {
      skipFirstWrite.current = false;
      return;
    }
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked: the form keeps working, just without a draft.
    }
  }, [enabled, key, value]);

  function clear() {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Nothing to do — a draft we cannot delete is one the browser is not keeping anyway.
    }
  }

  return [value, setValue, clear];
}

/** True when a draft is currently stored for this key — used to offer "recover" rather than assume. */
export function hasPersistedState(storageKey: string): boolean {
  try {
    return window.sessionStorage.getItem(`${PREFIX}${storageKey}`) !== null;
  } catch {
    return false;
  }
}
