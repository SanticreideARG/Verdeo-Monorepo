import { describe, expect, it, vi } from 'vitest';

import { createLogger } from '@verdeo/observability';

import { createApp, SITE_SCOPE_HEADER } from './app.js';

const SEDE = '90000000-0000-4000-8000-000000000001';
const CLIENTE = 'c0000000-0000-4000-8000-000000000001';
const MENU = 'e0000000-0000-4000-8000-000000000001';
const OFERTA = 'f3000000-0000-4000-8000-000000000001';
const cookie = 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars';
const headers = { 'content-type': 'application/json', cookie, [SITE_SCOPE_HEADER]: SEDE };

function buildApp(extra: { aiTasks?: unknown; createOrder?: unknown }, permissions: string[]) {
  return createApp({
    appOrigin: 'http://localhost:5173',
    ...(extra.aiTasks ? { aiTasks: extra.aiTasks as never } : {}),
    cookieSameSite: 'Lax',
    credentials: { login: () => Promise.resolve(null) },
    geography: {
      createSite: vi.fn(),
      createZone: vi.fn(),
      listActiveZones: vi.fn(() => Promise.resolve([])),
      listSites: vi.fn(() => Promise.resolve([])),
      listZones: vi.fn(() => Promise.resolve([])),
      resolveScope: vi.fn(() =>
        Promise.resolve({ canSelectGlobal: true, defaultSiteId: SEDE, sites: [{ id: SEDE }] }),
      ),
      updateSite: vi.fn(),
      updateZone: vi.fn(),
    },
    logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
    operations: { createOrder: extra.createOrder ?? vi.fn() } as never,
    secureCookies: false,
    sessions: {
      authenticate: () =>
        Promise.resolve({
          expiresAt: new Date('2026-12-31T12:00:00.000Z'),
          permissions,
          sessionId: '4c35a5ce-5c11-47b3-b31a-41a7d2983354',
          userId: '55276601-ec66-4f63-9f2f-edf73904ede0',
        }),
      listForUser: () => Promise.resolve([]),
      revoke: () => Promise.resolve(),
      revokeOwned: () => Promise.resolve(false),
    },
    users: {
      findById: (id: string) => Promise.resolve({ displayName: 'Santiago', id }),
      findProfileById: (id: string) =>
        Promise.resolve({ avatarUrl: null, displayName: 'Santiago', email: null, id }),
      list: () => Promise.resolve({ items: [], nextCursor: null }),
      updateProfile: (id: string) =>
        Promise.resolve({ avatarUrl: null, displayName: 'Santiago', email: null, id }),
    },
    version: 'test',
  });
}

const pedido = {
  customerId: CLIENTE,
  deliveryAddress: 'Julián Álvarez 1010',
  deliveryDate: '2026-10-17',
  items: [{ offeringId: OFERTA, quantityUnits: 1 }],
  menuId: MENU,
  paymentExpectation: 'Transferencia',
  source: 'whatsapp',
};

describe('guardar y confirmar en un paso', () => {
  it('crea el pedido ya confirmado cuando se pide y hay permiso', async () => {
    const createOrder = vi.fn<(input: unknown) => Promise<unknown>>(() => Promise.resolve(null));
    await buildApp({ createOrder }, ['orders.create', 'orders.confirm']).request('/api/v1/orders', {
      body: JSON.stringify({ ...pedido, confirm: true }),
      headers,
      method: 'POST',
    });

    expect(createOrder.mock.calls[0]?.[0]).toMatchObject({ initialStatus: 'CONFIRMED' });
    expect(createOrder.mock.calls[0]?.[0]).not.toHaveProperty('confirm');
  });

  it('sin confirmar, nace como borrador como siempre', async () => {
    const createOrder = vi.fn<(input: unknown) => Promise<unknown>>(() => Promise.resolve(null));
    await buildApp({ createOrder }, ['orders.create', 'orders.confirm']).request('/api/v1/orders', {
      body: JSON.stringify(pedido),
      headers,
      method: 'POST',
    });

    expect(createOrder.mock.calls[0]?.[0]).not.toHaveProperty('initialStatus');
  });

  // Crear ya confirmado no puede ser un atajo para quien no puede confirmar.
  it('sin permiso de confirmar no deja crear el pedido confirmado', async () => {
    const createOrder = vi.fn();
    const response = await buildApp({ createOrder }, ['orders.create']).request('/api/v1/orders', {
      body: JSON.stringify({ ...pedido, confirm: true }),
      headers,
      method: 'POST',
    });

    expect(response.status).toBe(403);
    expect(createOrder).not.toHaveBeenCalled();
  });
});

describe('pegar el mensaje del cliente', () => {
  const aiTasks = (output: unknown) => ({
    runTask: vi.fn(() => Promise.resolve({ output })),
  });
  const propuesta = {
    confidence: 0.9,
    dishes: [],
    familyName: 'Menú Keto',
    quantityUnits: 2,
    sizeName: '400',
    variantName: null,
  };

  it('devuelve la propuesta de la IA y el teléfono del mensaje en forma canónica', async () => {
    const tasks = aiTasks(propuesta);
    const response = await buildApp({ aiTasks: tasks }, ['orders.create']).request(
      '/api/v1/orders/extract',
      {
        body: JSON.stringify({
          menu: [{ familyName: 'Menú Keto', sizes: ['250', '400'] }],
          text: 'Hola! Quiero 2 keto de 400 para esta semana. Mi cel (011) 15 5555-0101',
        }),
        headers,
        method: 'POST',
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      candidate: {
        confidence: 0.9,
        dishes: [],
        familyName: 'Menú Keto',
        quantityUnits: 2,
        sizeName: '400',
      },
      phone: '+5491155550101',
    });
    // La IA recibe los nombres del menú, para responder con esos y no con los suyos.
    expect(tasks.runTask).toHaveBeenCalledWith(
      'extract_order',
      expect.objectContaining({ menu: 'Menú Keto (250, 400)' }),
      expect.anything(),
    );
  });

  it('sin teléfono en el mensaje no inventa uno', async () => {
    const response = await buildApp({ aiTasks: aiTasks(propuesta) }, ['orders.create']).request(
      '/api/v1/orders/extract',
      {
        body: JSON.stringify({ menu: [], text: 'quiero dos keto' }),
        headers,
        method: 'POST',
      },
    );
    expect(((await response.json()) as { phone: string | null }).phone).toBeNull();
  });

  // Encendido para todo el que carga pedidos, no sólo para quien tiene permisos de IA.
  it('pide permiso de cargar pedidos, no de usar la IA', async () => {
    const tasks = aiTasks(propuesta);
    const denied = await buildApp({ aiTasks: tasks }, ['ai.use']).request(
      '/api/v1/orders/extract',
      { body: JSON.stringify({ menu: [], text: 'quiero dos keto' }), headers, method: 'POST' },
    );
    expect(denied.status).toBe(403);
    expect(tasks.runTask).not.toHaveBeenCalled();
  });
});
