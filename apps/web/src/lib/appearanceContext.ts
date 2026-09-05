import { createContext, useContext } from 'react';

export interface AppearanceState {
  font: string;
  scale: string;
  setFont: (value: string) => void;
  setScale: (value: string) => void;
  setTheme: (value: string) => void;
  theme: string;
}

/**
 * Tema, fuente y tamaño de texto, compartidos entre la barra y la pantalla de Ajustes.
 *
 * El estado vive en `DashboardShell` porque es quien pinta el `data-theme` y persiste contra
 * `/api/v1/me/appearance`. Sin este contexto, Ajustes tendría que llevar su propia copia y las dos
 * pantallas terminarían discrepando sobre qué tema está puesto.
 */
export const AppearanceContext = createContext<AppearanceState | null>(null);

export function useAppearance(): AppearanceState {
  const value = useContext(AppearanceContext);
  if (!value) {
    throw new Error('useAppearance necesita estar dentro de DashboardShell.');
  }
  return value;
}
