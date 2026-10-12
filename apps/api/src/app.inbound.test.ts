import { createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { createLogger } from '@verdeo/observability';

import { createApp, SITE_SCOPE_HEADER } from './app.js';

/*
 * Un mail del formulario del sitio, tal como lo entrega Gmail (`getPlainBody`). Nombres, teléfonos
 * y direcciones inventados: los pedidos reales son de clientes y no van al repositorio.
 */
const BODY = [
  'From: Ana Prueba <ana@example.com>',
  'Subject: [your-subject]',
  '',
  'Celular: 1155550101',
  'Dirección de entrega: Calle Falsa 123',
  'Barrio : Palermo',
  '',
  'Pedido',
  'Menú Paleo & Keto  400 2',
  'Menú Vegan 250 0',
  '',
  'Message Body:',
  '',
  '--',
  'This e-mail was sent from a contact form on Verdeo (https://verdeo.com.ar)',
].join('\n');

const SECRET = 'un-secreto-de-prueba-largo-de-verdad';
const SEDE = '90000000-0000-4000-8000-000000000001';
const cookie = 'verdeo_session=a-valid-opaque-session-token-longer-than-32-chars';

function inboundStore() {
  return {
    claim: vi.fn(() => Promise.resolve()),
    get: vi.fn(),
    list: vi.fn(() => Promise.resolve([])),
    overview: vi.fn(() => Promise.resolve({ lastReceivedAt: null, pending: 0 })),
    release: vi.fn(() => Promise.resolve()),
    resolve: vi.fn(() => Promise.resolve()),
    store: vi.fn<
      (
        input: unknown,
        parsed: unknown,
        status: string,
      ) => Promise<{ id: string | null; stored: boolean }>
    >(() => Promise.resolve({ id: 'i-1', stored: true })),
  };
}

function buildApp(
  inbound: ReturnType<typeof inboundStore>,
  options: { operations?: unknown; permissions?: string[]; secret?: string | null } = {},
) {
  return createApp({
    appOrigin: 'http://localhost:5173',
    cookieSameSite: 'Lax',
    credentials: { login: () => Promise.resolve(null) },
    geography: {
      resolveScope: vi.fn(() =>
        Promise.resolve({ canSelectGlobal: true, defaultSiteId: SEDE, sites: [{ id: SEDE }] }),
      ),
    } as never,
    ...(options.secret === null ? {} : { inboundEmailSecret: options.secret ?? SECRET }),
    inboundEmails: inbound,
    logger: createLogger({ level: 'silent', service: 'verdeo-api-test' }),
    operations: (options.operations ?? {}) as never,
    secureCookies: false,
    sessions: {
      authenticate: () =>
        Promise.resolve({
          expiresAt: new Date('2026-12-31T12:00:00.000Z'),
          permissions: options.permissions ?? ['orders.create'],
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

function signed(payload: unknown, secret = SECRET) {
  const raw = JSON.stringify(payload);
  return {
    body: raw,
    headers: {
      'content-type': 'application/json',
      'x-verdeo-signature': `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`,
    },
    method: 'POST',
  };
}

const mail = {
  body: BODY,
  date: 'Mon, 12 Oct 2026 10:15:00 -0300',
  from: 'Verdeo Comida Saludable <info@verdeo.com.ar>',
  messageId: '18f2a9c0d1e2',
  subject: 'Pedido online Capital Federal',
};

describe('correo entrante', () => {
  it('guarda el mail firmado como pedido pendiente, leído con el lector de emails', async () => {
    const inbound = inboundStore();
    const response = await buildApp(inbound).request('/api/v1/inbound/email', signed(mail));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: 'i-1', status: 'pending' });
    const [input, parsed, status] = inbound.store.mock.calls[0] as unknown as [
      { gmailMessageId: string },
      { rows: { customerName: string; items: { quantityUnits: number }[] }[] },
      string,
    ];
    expect(input.gmailMessageId).toBe('18f2a9c0d1e2');
    expect(status).toBe('pending');
    // El cliente es el del cuerpo, no el remitente del formulario.
    expect(parsed.rows[0]?.customerName).toBe('Ana Prueba');
    expect(parsed.rows[0]?.items.map((item) => item.quantityUnits)).toEqual([2]);
  });

  // Un endpoint sin firma dejaría a cualquiera inyectar pedidos falsos.
  it('rechaza un mail sin firma o con la firma de otro secreto', async () => {
    const inbound = inboundStore();
    const app = buildApp(inbound);

    const sinFirma = await app.request('/api/v1/inbound/email', {
      body: JSON.stringify(mail),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    const otraFirma = await app.request(
      '/api/v1/inbound/email',
      signed(mail, 'otro-secreto-cualquiera-largo'),
    );

    expect(sinFirma.status).toBe(403);
    expect(otraFirma.status).toBe(403);
    expect(inbound.store).not.toHaveBeenCalled();
  });

  it('sin el secreto configurado rechaza todo', async () => {
    const inbound = inboundStore();
    const response = await buildApp(inbound, { secret: null }).request(
      '/api/v1/inbound/email',
      signed(mail),
    );
    expect(response.status).toBe(403);
  });

  // El script reintenta si no tuvo respuesta: un reintento se reconoce y no duplica.
  it('un mail repetido responde "duplicado" sin volver a guardarlo', async () => {
    const inbound = inboundStore();
    inbound.store.mockResolvedValueOnce({ id: null, stored: false });
    const response = await buildApp(inbound).request('/api/v1/inbound/email', signed(mail));
    expect(await response.json()).toEqual({ id: null, status: 'duplicate' });
  });

  it('un formulario todo en cero queda como consulta, no como pedido', async () => {
    const inbound = inboundStore();
    await buildApp(inbound).request(
      '/api/v1/inbound/email',
      signed({
        ...mail,
        body: BODY.replace('Menú Paleo & Keto  400 2', 'Menú Paleo & Keto  400 0').replace(
          'Message Body:\n',
          'Message Body:\n¿Hacen envíos a Quilmes?\n',
        ),
      }),
    );
    expect(inbound.store.mock.calls[0]?.[2]).toBe('inquiry');
  });
});

describe('aprobar un pedido que llegó por correo', () => {
  const fila = {
    customerId: null,
    customerName: 'Ana Prueba',
    deliveryAddress: 'Calle Falsa 123',
    email: 'ana@example.com',
    items: [{ dishes: [], offeringId: 'f3000000-0000-4000-8000-000000000001', quantityUnits: 2 }],
    kind: 'email',
    notes: null,
    paymentExpectation: 'Transferencia',
    phone: '+5491155550101',
    rowNumber: 1,
  };
  const operations = (createOrder: unknown) => ({
    createCustomer: vi.fn(() => Promise.resolve({ id: 'c0000000-0000-4000-8000-000000000001' })),
    createOrder,
    currentPublishedMenu: vi.fn(() =>
      Promise.resolve({
        cycle: { closeAt: '2026-10-14T22:00:00Z' },
        id: 'e0000000-0000-4000-8000-000000000001',
      }),
    ),
  });
  const pedir = (app: ReturnType<typeof buildApp>) =>
    app.request('/api/v1/inbound-emails/0b000000-0000-4000-8000-000000000001/approve', {
      body: JSON.stringify({ rows: [fila] }),
      headers: { 'content-type': 'application/json', cookie, [SITE_SCOPE_HEADER]: SEDE },
      method: 'POST',
    });

  it('crea el pedido y marca el mail como aprobado con su pedido', async () => {
    const inbound = inboundStore();
    const createOrder = vi.fn(() =>
      Promise.resolve({ id: '0a000000-0000-4000-8000-000000000009' }),
    );
    const response = await pedir(buildApp(inbound, { operations: operations(createOrder) }));

    expect(response.status).toBe(201);
    expect(inbound.claim).toHaveBeenCalledOnce();
    expect(inbound.resolve).toHaveBeenCalledWith(
      '0b000000-0000-4000-8000-000000000001',
      'approved',
      ['0a000000-0000-4000-8000-000000000009'],
      '55276601-ec66-4f63-9f2f-edf73904ede0',
    );
  });

  // Si no se pudo crear, el mail no puede quedar "en proceso" para siempre.
  it('si el pedido no se pudo crear, el mail vuelve a pendiente', async () => {
    const inbound = inboundStore();
    const createOrder = vi.fn(() => Promise.reject(new Error('El menú ya cerró')));
    const response = await pedir(buildApp(inbound, { operations: operations(createOrder) }));

    expect(response.status).toBe(200);
    expect(inbound.release).toHaveBeenCalledOnce();
    expect(inbound.resolve).not.toHaveBeenCalled();
  });

  it('si otra persona ya lo estaba aprobando, avisa en lugar de crear el pedido otra vez', async () => {
    const inbound = inboundStore();
    const conflicto = Object.assign(new Error('Este pedido ya lo revisó otra persona.'), {
      name: 'InboundEmailConflictError',
    });
    inbound.claim.mockRejectedValueOnce(conflicto);
    const createOrder = vi.fn();
    const response = await pedir(buildApp(inbound, { operations: operations(createOrder) }));

    expect(response.status).toBe(409);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('pide permiso de cargar pedidos', async () => {
    const inbound = inboundStore();
    const response = await pedir(buildApp(inbound, { permissions: ['orders.read'] }));
    expect(response.status).toBe(403);
    expect(inbound.claim).not.toHaveBeenCalled();
  });
});
