/**
 * Presence keeps two independent facts apart.
 *
 * Whether someone is **connected** is derived from a heartbeat, and the server decides how fresh a
 * beat has to be. What they are **declaring** — available, away, busy — is chosen by the person and
 * persisted. The effective status is `offline` while the heartbeat is stale, and the declared status
 * otherwise.
 *
 * The declared values are a catalog rather than a union type: a business that wants "en ruta" for
 * drivers adds a row. Only the offline derivation is code, because only it is a rule.
 */

/** Three missed beats. Tolerant enough that a slow request does not blink a colleague offline. */
export const PRESENCE_STALE_AFTER_MS = 90_000;
export const PRESENCE_HEARTBEAT_MS = 30_000;

export const OFFLINE_STATUS = 'offline';

export interface PresenceRecord {
  lastSeenAt: Date | null;
  status: string;
  statusMessage?: string | null;
}

export interface EffectivePresence {
  connected: boolean;
  status: string;
  statusMessage: string | null;
}

export function isConnected(
  lastSeenAt: Date | null,
  now: Date,
  staleAfterMs: number = PRESENCE_STALE_AFTER_MS,
): boolean {
  if (!lastSeenAt) return false;
  const elapsed = now.getTime() - lastSeenAt.getTime();
  // A clock skewed into the future is still a beat that arrived, not a reason to hide someone.
  return elapsed <= staleAfterMs;
}

export function effectivePresence(
  record: PresenceRecord | null,
  now: Date,
  staleAfterMs: number = PRESENCE_STALE_AFTER_MS,
): EffectivePresence {
  if (!record) return { connected: false, status: OFFLINE_STATUS, statusMessage: null };

  const connected = isConnected(record.lastSeenAt, now, staleAfterMs);
  return {
    connected,
    // Someone who declared "busy" and then closed the tab reads as offline, not busy.
    status: connected ? record.status : OFFLINE_STATUS,
    statusMessage: connected ? (record.statusMessage ?? null) : null,
  };
}
