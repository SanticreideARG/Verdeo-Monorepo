import { useCallback, useEffect, useState } from 'react';

import { apiRequest } from '../lib/api.js';

interface PresenceStatus {
  displayName: string;
  key: string;
  reachable: boolean;
}

/** Matches the server's staleness window: three beats missed before a colleague reads as offline. */
const HEARTBEAT_MS = 30_000;

/**
 * The user's own presence: a heartbeat while the tab is open, plus the status they declare.
 *
 * Only the beat is automatic. `away` is never guessed here — the person chooses it — because a
 * status the system invents is a status colleagues cannot trust.
 */
export function PresenceControl({ enabled }: { enabled: boolean }) {
  const [statuses, setStatuses] = useState<PresenceStatus[]>([]);
  const [current, setCurrent] = useState('available');

  const beat = useCallback(async (status?: string) => {
    const response = await apiRequest('/api/v1/chat/presence/heartbeat', {
      body: JSON.stringify(status ? { status } : {}),
      method: 'POST',
    });
    if (!response.ok) return;
    const body = (await response.json()) as { status: string };
    setCurrent(body.status);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void apiRequest('/api/v1/chat/presence/statuses')
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { items: PresenceStatus[] };
        setStatuses(body.items);
      })
      .catch(() => setStatuses([]));
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void beat();
    // Beating while hidden keeps a minimised window reachable, which is the point of presence.
    const timer = window.setInterval(() => void beat(), HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [beat, enabled]);

  if (!enabled || statuses.length === 0) return null;

  return (
    <label className="dashboard-presence">
      <span>Estado</span>
      <select onChange={(event) => void beat(event.target.value)} value={current}>
        {statuses.map((status) => (
          <option key={status.key} value={status.key}>
            {status.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}
