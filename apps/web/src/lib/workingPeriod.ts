import { useEffect } from 'react';

import { currentPeriod, type Period } from './periods.js';

/**
 * El período sobre el que se está trabajando, compartido entre pantallas (pedido 2026-11-09).
 *
 * Cada pantalla abría siempre en el período corriente: elegir uno anterior duraba hasta cambiar de
 * pantalla. Sólo se guarda el que **no** es el corriente: así, sin haber elegido nada, cada semana
 * se abre sola en la semana nueva. Se recuerda por navegador, como la ciudad elegida.
 */
const STORAGE_KEY = 'verdeo-periodo-de-trabajo';

export interface WorkingPeriod {
  alias: string;
  id: string;
}

const changeListeners = new Set<() => void>();
const returnListeners = new Set<() => void>();

function notifyChange() {
  for (const listener of changeListeners) listener();
}

/** El texto guardado, tal cual. Lo que lee `useSyncExternalStore`: tiene que ser comparable. */
export function workingPeriodSnapshot(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function parseWorkingPeriod(raw: string | null): WorkingPeriod | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WorkingPeriod>;
    return typeof parsed.id === 'string' && typeof parsed.alias === 'string'
      ? { alias: parsed.alias, id: parsed.id }
      : null;
  } catch {
    return null;
  }
}

function store(period: WorkingPeriod | null) {
  try {
    if (period) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(period));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sin almacenamiento la elección vale hasta cambiar de pantalla, como antes.
  }
  notifyChange();
}

export function subscribeToWorkingPeriod(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

/**
 * Se eligió un período en una pantalla. El corriente, o "Todos los períodos" (una búsqueda, no un
 * lugar de trabajo), borran lo guardado.
 */
export function chooseWorkingPeriod(cycleId: string, periods: readonly Period[]): void {
  const chosen = periods.find((period) => period.id === cycleId);
  store(
    chosen && chosen.id !== currentPeriod(periods)?.id
      ? { alias: chosen.alias, id: chosen.id }
      : null,
  );
}

/**
 * Sobre cuál período abre una pantalla: el elegido, si esta pantalla lo tiene; si no, el corriente.
 * Uno guardado que con el tiempo pasó a ser el corriente deja de contar como "no corriente".
 */
export function startingPeriod(periods: readonly Period[]): Period | null {
  const stored = parseWorkingPeriod(workingPeriodSnapshot());
  const current = currentPeriod(periods);
  if (!stored) return current;
  if (stored.id === current?.id) {
    store(null);
    return current;
  }
  return periods.find((period) => period.id === stored.id) ?? current;
}

/** "Volver al corriente", desde el aviso: borra lo guardado y le avisa a la pantalla abierta. */
export function returnToCurrentPeriod(): void {
  store(null);
  for (const listener of returnListeners) listener();
}

/** La pantalla abierta se mueve al período corriente cuando se toca "Volver al corriente". */
export function useReturnToCurrentPeriod(apply: () => void): void {
  useEffect(() => {
    returnListeners.add(apply);
    return () => {
      returnListeners.delete(apply);
    };
  }, [apply]);
}
