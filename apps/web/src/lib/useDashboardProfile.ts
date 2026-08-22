import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { DashboardProfile } from '../components/DashboardShell.js';
import { apiRequest } from './api.js';

/**
 * The session/permissions fetch every dashboard screen needs before it can render anything.
 * Redirects to /login on 401; callers only handle the loading, failed and ready states.
 */
export function useDashboardProfile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<DashboardProfile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void apiRequest('/api/v1/me')
      .then(async (response) => {
        if (response.status === 401) {
          await navigate('/login', { replace: true });
          return;
        }
        if (!response.ok) throw new Error('No pudimos cargar tu sesión.');
        const body = (await response.json()) as DashboardProfile;
        if (active) setProfile(body);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [navigate]);

  async function logout() {
    await apiRequest('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined);
    await navigate('/login', { replace: true });
  }

  return { failed, logout, profile };
}
