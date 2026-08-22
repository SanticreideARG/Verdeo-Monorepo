import { describe, expect, it } from 'vitest';

import {
  effectivePresence,
  isConnected,
  OFFLINE_STATUS,
  PRESENCE_STALE_AFTER_MS,
} from './presence.js';

const now = new Date('2026-08-22T12:00:00.000Z');
const secondsAgo = (seconds: number) => new Date(now.getTime() - seconds * 1_000);

describe('presence', () => {
  it('treats a recent heartbeat as connected', () => {
    expect(isConnected(secondsAgo(20), now)).toBe(true);
  });

  it('treats a stale heartbeat as disconnected', () => {
    expect(isConnected(secondsAgo(120), now)).toBe(false);
  });

  it('tolerates a beat right at the threshold', () => {
    // Three missed beats is the boundary; landing exactly on it should not blink someone offline.
    expect(isConnected(new Date(now.getTime() - PRESENCE_STALE_AFTER_MS), now)).toBe(true);
  });

  it('treats a user who never beat as disconnected', () => {
    expect(isConnected(null, now)).toBe(false);
  });

  it('keeps the declared status while connected', () => {
    expect(effectivePresence({ lastSeenAt: secondsAgo(10), status: 'busy' }, now)).toEqual({
      connected: true,
      status: 'busy',
      statusMessage: null,
    });
  });

  it('reports offline for someone who declared busy and then left', () => {
    // Otherwise a colleague who closed the tab would read as busy forever.
    expect(effectivePresence({ lastSeenAt: secondsAgo(600), status: 'busy' }, now)).toEqual({
      connected: false,
      status: OFFLINE_STATUS,
      statusMessage: null,
    });
  });

  it('hides the status message once the person is gone', () => {
    const record = { lastSeenAt: secondsAgo(600), status: 'away', statusMessage: 'En reparto' };

    expect(effectivePresence(record, now).statusMessage).toBeNull();
  });

  it('carries the status message while connected', () => {
    const record = { lastSeenAt: secondsAgo(5), status: 'away', statusMessage: 'En reparto' };

    expect(effectivePresence(record, now).statusMessage).toBe('En reparto');
  });

  it('reports offline for someone with no presence record at all', () => {
    expect(effectivePresence(null, now)).toEqual({
      connected: false,
      status: OFFLINE_STATUS,
      statusMessage: null,
    });
  });

  it('does not hide someone whose clock ran ahead', () => {
    // A skewed client still proved it was there; treating it as stale would be worse.
    expect(isConnected(new Date(now.getTime() + 5_000), now)).toBe(true);
  });

  it('accepts a status the code has never heard of', () => {
    // The declared values are a catalog, so a new one must flow through untouched.
    expect(effectivePresence({ lastSeenAt: secondsAgo(5), status: 'en-ruta' }, now).status).toBe(
      'en-ruta',
    );
  });
});
