import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { DashboardProfile } from '../components/DashboardShell.js';
import { apiRequest } from './api.js';

/**
 * La sesión, cacheada mientras dure la pestaña.
 *
 * Cada una de las 35 pantallas arrancaba con el perfil en `null`, dibujaba el cargador a pantalla
 * completa y recién entonces pedía `/api/v1/me`. Como todas hacían lo mismo, cada navegación era un
 * fundido a blanco y una petición de más, aunque la sesión fuera exactamente la misma que un segundo
 * antes. Guardándola acá, la segunda pantalla y las que siguen la tienen desde el primer render: no
 * hay cargador que mostrar porque no hay nada que esperar.
 *
 * Igual se revalida en segundo plano, para que un cambio de permisos llegue sin recargar la pestaña.
 * Eso no puede blanquear la pantalla: reemplaza el valor cuando llega, y nada más.
 */
let cached: DashboardProfile | null = null;
let inFlight: Promise<DashboardProfile | null> | null = null;

/** Al salir, la caché se va con la sesión: otra persona no puede heredar estos permisos. */
export function forgetCachedProfile(): void {
  cached = null;
  inFlight = null;
}

/**
 * Para las pantallas que traen la sesión por su cuenta.
 *
 * Cinco pantallas tienen su propia copia de este fetch, con lógica extra encima (redirecciones por
 * permiso). En vez de reescribirlas, leen y alimentan la misma caché: arrancan con lo que ya se
 * sabe, así que tampoco parpadean.
 */
export function cachedProfile(): DashboardProfile | null {
  return cached;
}

export function rememberProfile(profile: DashboardProfile): void {
  cached = profile;
}

function fetchProfile(): Promise<DashboardProfile | null> {
  // Una sola petición aunque varias pantallas la pidan a la vez (montaje inicial con widgets).
  inFlight ??= apiRequest('/api/v1/me')
    .then(async (response) => {
      if (response.status === 401) return null;
      if (!response.ok) throw new Error('No pudimos cargar tu sesión.');
      const body = (await response.json()) as DashboardProfile;
      cached = body;
      return body;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export function useDashboardProfile() {
  const navigate = useNavigate();
  // Arranca con lo que ya se sabe: si hay caché, esta pantalla nunca pasa por el estado de carga.
  const [profile, setProfile] = useState<DashboardProfile | null>(cached);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchProfile()
      .then(async (body) => {
        if (!body) {
          forgetCachedProfile();
          await navigate('/login', { replace: true });
          return;
        }
        if (active) setProfile(body);
      })
      .catch(() => {
        // Con una sesión ya cacheada, un fallo de red no tira abajo la pantalla: se sigue usando lo
        // que hay. El error sólo manda cuando no había nada que mostrar.
        if (active && !cached) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function logout() {
    await apiRequest('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    forgetCachedProfile();
    await navigate('/login', { replace: true });
  }

  return { failed, logout, profile };
}
