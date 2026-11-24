import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { atMostEvery, CHAT_POLL_MS, PRESENCE_REFRESH_MS, pollWhileVisible } from './chat.js';

let visibility: DocumentVisibilityState = 'visible';

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/*
 * Cada consulta es una invocación que se paga (2026-11-20: la cuenta pasó el plan gratis de Vercel).
 * Estas pruebas fijan que no se consulte de más.
 */
describe('pollWhileVisible', () => {
  it('consulta cada 30 segundos con la pestaña a la vista', async () => {
    const poll = vi.fn(() => Promise.resolve());
    const stop = pollWhileVisible(poll);

    await vi.advanceTimersByTimeAsync(CHAT_POLL_MS - 1);
    expect(poll).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(CHAT_POLL_MS);
    expect(poll).toHaveBeenCalledTimes(2);
    stop();
  });

  it('no consulta con la pestaña escondida y se pone al día al volver', async () => {
    const poll = vi.fn(() => Promise.resolve());
    const stop = pollWhileVisible(poll);

    setVisibility('hidden');
    await vi.advanceTimersByTimeAsync(CHAT_POLL_MS * 10);
    expect(poll).not.toHaveBeenCalled();

    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(1);
    stop();
  });

  it('deja de consultar al detenerlo', async () => {
    const poll = vi.fn(() => Promise.resolve());
    pollWhileVisible(poll)();

    await vi.advanceTimersByTimeAsync(CHAT_POLL_MS * 3);
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(poll).not.toHaveBeenCalled();
  });

  it('sigue consultando aunque una consulta falle', async () => {
    const poll = vi.fn(() => Promise.reject(new Error('sin red')));
    const stop = pollWhileVisible(poll);

    await vi.advanceTimersByTimeAsync(CHAT_POLL_MS * 2);
    expect(poll).toHaveBeenCalledTimes(2);
    stop();
  });
});

describe('atMostEvery', () => {
  it('corre la primera vez y no de nuevo antes del intervalo', async () => {
    const run = vi.fn(() => Promise.resolve());
    const throttled = atMostEvery(run, PRESENCE_REFRESH_MS);

    await throttled();
    await vi.advanceTimersByTimeAsync(CHAT_POLL_MS);
    await throttled();
    expect(run).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(PRESENCE_REFRESH_MS);
    await throttled();
    expect(run).toHaveBeenCalledTimes(2);
  });
});
