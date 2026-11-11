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
    recordRejection: vi.fn<(reason: string) => Promise<void>>(() => Promise.resolve()),
    recordRun: vi.fn<(input: unknown) => Promise<void>>(() => Promise.resolve()),
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
  options: {
    operations?: unknown;
    permissions?: string[];
    secret?: string | null;
    sites?: { displayName: string; id: string }[];
  } = {},
) {
  return createApp({
    appOrigin: 'http://localhost:5173',
    cookieSameSite: 'Lax',
    credentials: { login: () => Promise.resolve(null) },
    geography: {
      resolveScope: vi.fn(() =>
        Promise.resolve({
          canSelectGlobal: true,
          defaultSiteId: SEDE,
          sites: options.sites ?? [{ id: SEDE }],
        }),
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

describe('importar con "Todas las ciudades" arriba', () => {
  const CABA = '90000000-0000-4000-8000-00000000000a';
  const NQN = '90000000-0000-4000-8000-00000000000b';
  const OFERTA_CABA = 'f3000000-0000-4000-8000-00000000000a';
  const OFERTA_NQN = 'f3000000-0000-4000-8000-00000000000b';
  const MENU_CABA = 'e0000000-0000-4000-8000-00000000000a';
  const MENU_NQN = 'e0000000-0000-4000-8000-00000000000b';
  const sites = [
    { displayName: 'Capital Federal', id: CABA },
    { displayName: 'Neuquén', id: NQN },
  ];
  // Sin el encabezado de ciudad: es la vista global.
  const global = { 'content-type': 'application/json', cookie };

  const previewOrderImport = vi.fn((rows: readonly { rowNumber: number }[], siteId: string) =>
    Promise.resolve({
      matches: rows.map(({ rowNumber }) => ({
        customerMatch: { candidates: [], customerId: null, displayName: null, kind: 'nuevo' },
        duplicateOf: null,
        itemMatches: [siteId === CABA ? OFERTA_CABA : OFERTA_NQN],
        rowNumber,
      })),
      menuId: siteId === CABA ? MENU_CABA : MENU_NQN,
      offerings: [{ id: siteId === CABA ? OFERTA_CABA : OFERTA_NQN, label: 'Menú Real 400' }],
    }),
  );
  const pedidoDe = (subject: string) =>
    [
      'From: Ana Prueba ana@example.com',
      `Subject: ${subject}`,
      '',
      'Celular: 1155550101',
      'Dirección de entrega: Calle Falsa 123',
      '',
      'Pedido',
      'Menú Real 400 2',
      '',
      'Message Body:',
      '',
    ].join('\n');
  type Vista = {
    items: {
      bySite: Record<string, { items: { offeringId: string }[] }>;
      items: { offeringId: string | null }[];
      notices: string[];
      operatingSiteId: string | null;
    }[];
    sites: { deliveryOptions: unknown[]; id: string; name: string }[];
  };
  const leer = async (subject: string) => {
    const app = buildApp(inboundStore(), {
      operations: {
        deliveryOptionsForMenu: vi.fn(() =>
          Promise.resolve({
            defaultDate: '2026-11-07',
            options: [{ date: '2026-11-07', weekday: 6 }],
          }),
        ),
        previewOrderImport,
      },
      sites,
    });
    const response = await app.request('/api/v1/orders/import/preview-email', {
      body: JSON.stringify({ text: pedidoDe(subject) }),
      headers: global,
      method: 'POST',
    });
    expect(response.status).toBe(200);
    return (await response.json()) as Vista;
  };

  it('sugiere la ciudad que dice el mail, con el menú de esa ciudad', async () => {
    const vista = await leer('Pedido online Capital Federal');

    expect(vista.items[0]?.operatingSiteId).toBe(CABA);
    expect(vista.items[0]?.items[0]?.offeringId).toBe(OFERTA_CABA);
    expect(vista.sites.map((site) => site.name)).toEqual(['Capital Federal', 'Neuquén']);
    expect(vista.sites[0]?.deliveryOptions).toHaveLength(1);
  });

  it('una ciudad que no se reconoce queda para elegir, con lo de cada una a mano', async () => {
    const vista = await leer('Pedido online Rosario');
    const fila = vista.items[0];

    expect(fila?.operatingSiteId).toBeNull();
    expect(fila?.items[0]?.offeringId).toBeNull();
    expect(fila?.notices.join(' ')).toContain('Rosario');
    expect(fila?.bySite[NQN]?.items[0]?.offeringId).toBe(OFERTA_NQN);
    expect(fila?.bySite[CABA]?.items[0]?.offeringId).toBe(OFERTA_CABA);
  });

  const fila = (operatingSiteId?: string) => ({
    customerId: null,
    customerName: 'Ana Prueba',
    deliveryAddress: 'Calle Falsa 123',
    email: null,
    items: [{ dishes: [], offeringId: OFERTA_NQN, quantityUnits: 1 }],
    kind: 'email',
    notes: null,
    ...(operatingSiteId ? { operatingSiteId } : {}),
    paymentExpectation: 'Transferencia',
    phone: '+5491155550101',
    rowNumber: 1,
  });
  const importar = (row: unknown, operations: unknown, permitidas = sites) =>
    buildApp(inboundStore(), { operations, sites: permitidas }).request('/api/v1/orders/import', {
      body: JSON.stringify({ rows: [row] }),
      headers: global,
      method: 'POST',
    });
  const operaciones = () => ({
    createCustomer: vi.fn(() => Promise.resolve({ id: 'c0000000-0000-4000-8000-000000000001' })),
    createOrder: vi.fn(() => Promise.resolve({ id: '0a000000-0000-4000-8000-000000000009' })),
    currentPublishedMenu: vi.fn((siteId: string) =>
      Promise.resolve({
        cycle: { closeAt: '2026-10-14T22:00:00Z' },
        id: siteId === NQN ? MENU_NQN : MENU_CABA,
      }),
    ),
  });

  // Era el error: "Un cliente necesita una ciudad", sin forma de elegirla.
  it('crea el cliente y el pedido en la ciudad elegida para esa fila, con su menú', async () => {
    const operations = operaciones();
    const response = await importar(fila(NQN), operations);

    expect(response.status).toBe(201);
    expect(operations.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ operatingSiteId: NQN }),
      expect.anything(),
    );
    expect(operations.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ menuId: MENU_NQN, operatingSiteId: NQN }),
      expect.anything(),
    );
  });

  it('una ciudad que la sesión no alcanza no entra', async () => {
    const operations = operaciones();
    const response = await importar(fila(NQN), operations, [sites[0] as (typeof sites)[number]]);
    const body = (await response.json()) as { created: number; failed: { reason: string }[] };

    expect(body.created).toBe(0);
    expect(body.failed[0]?.reason).toContain('acceso');
    expect(operations.createOrder).not.toHaveBeenCalled();
  });

  // Una ciudad sin menú no frena las otras de la misma tanda.
  it('sin menú en esa ciudad falla esa fila y lo dice', async () => {
    const operations = {
      ...operaciones(),
      currentPublishedMenu: vi.fn(() => Promise.resolve(null)),
    };
    const response = await importar(fila(NQN), operations);
    const body = (await response.json()) as { failed: { reason: string }[] };

    expect(body.failed[0]?.reason).toContain('menú publicado');
  });
});

describe('reporte de las corridas del script', () => {
  const OTRO = 'otro-secreto-cualquiera-largo';
  const report = {
    duplicates: 1,
    durationMs: 900,
    error: null,
    failed: 0,
    found: 2,
    quietRuns: 5,
    ranAt: '2026-11-11T12:00:00.000Z',
    scriptVersion: '2026-11-11',
    sentNew: 1,
  };

  it('guarda la corrida firmada', async () => {
    const inbound = inboundStore();
    const response = await buildApp(inbound).request('/api/v1/inbound/run', signed(report));
    expect(response.status).toBe(200);
    expect(inbound.recordRun).toHaveBeenCalledWith({
      ...report,
      ranAt: new Date('2026-11-11T12:00:00.000Z'),
    });
  });

  it('una firma que no coincide se rechaza y se cuenta, en el reporte y en los mails', async () => {
    const inbound = inboundStore();
    const app = buildApp(inbound);
    expect((await app.request('/api/v1/inbound/run', signed(report, OTRO))).status).toBe(403);
    expect((await app.request('/api/v1/inbound/email', signed(mail, OTRO))).status).toBe(403);
    expect(inbound.recordRun).not.toHaveBeenCalled();
    expect(inbound.recordRejection.mock.calls).toEqual([['firma'], ['firma']]);
  });

  it('un reporte con otro formato se rechaza y se cuenta como formato', async () => {
    const inbound = inboundStore();
    const response = await buildApp(inbound).request(
      '/api/v1/inbound/run',
      signed({ ...report, found: -1 }),
    );
    expect(response.status).toBe(400);
    expect(inbound.recordRejection).toHaveBeenCalledWith('formato');
  });

  it('sin secreto configurado rechaza sin contar: no hay con qué comparar', async () => {
    const inbound = inboundStore();
    const response = await buildApp(inbound, { secret: null }).request(
      '/api/v1/inbound/run',
      signed(report),
    );
    expect(response.status).toBe(403);
    expect(inbound.recordRejection).not.toHaveBeenCalled();
  });
});
