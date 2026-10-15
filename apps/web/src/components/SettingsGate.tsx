import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';

import { useDashboardProfile } from '../lib/useDashboardProfile.js';
import { DashboardLoading } from './DashboardStatus.js';

/** El permiso de entrar al Panel de control. Lo trae el superadmin; el operador, no. */
export const SETTINGS_ACCESS_PERMISSION = 'settings.access';

/**
 * La puerta del Panel de control: sin `settings.access`, de vuelta al inicio.
 *
 * Cada pantalla del panel ya pedía su propio permiso, pero varios de esos los tiene el operador
 * porque los usa para trabajar (ver zonas, días de reparto, métodos de pago, el catálogo del menú).
 * Con eso entraba al panel y veía la configuración general, aunque no pudiera cambiarla: la API
 * pide para guardar permisos que el operador no tiene. La configuración general es de quien
 * administra el sistema, así que entrar pide además este permiso, en un solo lugar.
 *
 * No cambia lo que la API devuelve: el operador sigue leyendo zonas, días y métodos de pago desde
 * las pantallas donde los usa (pedidos, rutas, cocina).
 */
export function SettingsGate({ children }: { children: ReactNode }) {
  const { profile } = useDashboardProfile();
  if (!profile) return <DashboardLoading />;
  if (!profile.permissions.includes(SETTINGS_ACCESS_PERMISSION)) {
    return <Navigate replace to="/app" />;
  }
  return <>{children}</>;
}
