import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiRequest } from './api.js';
import { getToasts } from './toast.js';

function respondWith(status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('{}', { status }))),
  );
}

/** El aviso automático llega con retraso, así que hay que correr el reloj para verlo. */
async function letTheNoticeFire() {
  await vi.advanceTimersByTimeAsync(1_500);
}

function messages(): string[] {
  return getToasts().map((toast) => toast.message);
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('aviso automático de cambios', () => {
  it('avisa cuando algo se guardó', async () => {
    respondWith();

    await apiRequest('/api/v1/customers', { body: '{}', method: 'POST' });
    await letTheNoticeFire();

    expect(messages()).toEqual(['Guardado.']);
  });

  it('no avisa al leer', async () => {
    respondWith();

    await apiRequest('/api/v1/customers');
    await letTheNoticeFire();

    expect(messages()).toEqual([]);
  });

  /** Un fallo va al mensaje de la pantalla, que se queda mientras la persona corrige. */
  it('no avisa cuando la petición falló', async () => {
    respondWith(409);

    await apiRequest('/api/v1/customers', { body: '{}', method: 'POST' });
    await letTheNoticeFire();

    expect(messages()).toEqual([]);
  });

  /**
   * La propiedad que hace que esto no moleste: cuando la pantalla tiene algo mejor que decir, lo
   * dice ella y el genérico se calla. Sin esto habría dos carteles por cada guardado en las trece
   * pantallas que ya avisaban.
   */
  it('se calla si la pantalla ya dijo lo suyo', async () => {
    respondWith();
    const { showToast } = await import('./toast.js');

    await apiRequest('/api/v1/customers', { body: '{}', method: 'POST' });
    showToast('Cliente creado.');
    await letTheNoticeFire();

    expect(messages()).toEqual(['Cliente creado.']);
  });

  it('acepta un texto propio en vez del genérico', async () => {
    respondWith();

    await apiRequest('/api/v1/orders', {
      body: '{}',
      method: 'POST',
      notify: 'Pedido registrado.',
    });

    expect(messages()).toEqual(['Pedido registrado.']);
  });

  it('se puede apagar por completo', async () => {
    respondWith();

    await apiRequest('/api/v1/orders', { body: '{}', method: 'POST', notify: false });
    await letTheNoticeFire();

    expect(messages()).toEqual([]);
  });

  /**
   * El latido de presencia corre por intervalo y la apariencia se guarda a cada clic: un aviso por
   * cada uno taparía la pantalla de carteles que nadie pidió.
   */
  it('calla las rutas de alta frecuencia y las de sesión', async () => {
    respondWith();

    for (const path of [
      '/api/v1/chat/presence/heartbeat',
      '/api/v1/me/appearance',
      '/api/v1/dashboard/layout',
      '/api/v1/auth/login',
    ]) {
      await apiRequest(path, { body: '{}', method: 'POST' });
    }
    await letTheNoticeFire();

    expect(messages()).toEqual([]);
  });

  it('ignora la query al decidir si una ruta es silenciosa', async () => {
    respondWith();

    await apiRequest('/api/v1/me/appearance?x=1', { body: '{}', method: 'PATCH' });
    await letTheNoticeFire();

    expect(messages()).toEqual([]);
  });
});
