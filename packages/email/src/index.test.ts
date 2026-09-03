import { afterEach, describe, expect, it, vi } from 'vitest';

import { NullEmailSender, renderEmail, ResendEmailSender } from './index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Stubs fetch and captures the outgoing request body.
 *
 * Reading the body back off `mock.calls` means asserting against a loosely-typed BodyInit;
 * capturing it here keeps each assertion about what was actually sent, already parsed.
 */
function stubFetch(
  response: { jsonValue?: unknown; ok?: boolean; status?: number; textValue?: string } = {},
) {
  const captured: { body: Record<string, unknown> | null } = { body: null };
  vi.stubGlobal('fetch', (_input: unknown, init?: { body?: unknown }) => {
    captured.body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    return Promise.resolve({
      json: () => Promise.resolve(response.jsonValue ?? {}),
      ok: response.ok ?? true,
      status: response.status ?? 200,
      text: () => Promise.resolve(response.textValue ?? ''),
    } as Response);
  });
  return captured;
}

const MESSAGE = {
  html: '<p>Hola</p>',
  subject: 'Confirmá tu correo',
  text: 'Hola',
  to: 'cliente@ejemplo.com',
};

describe('ResendEmailSender', () => {
  it('sends and reports the provider message id', async () => {
    const captured = stubFetch({ jsonValue: { id: 'msg_123' } });

    const result = await new ResendEmailSender('re_test', 'Verdeo <hola@verdeo.com.ar>').send(
      MESSAGE,
    );

    expect(result).toEqual({ providerMessageId: 'msg_123', sent: true });
    expect(captured.body).toMatchObject({
      from: 'Verdeo <hola@verdeo.com.ar>',
      subject: 'Confirmá tu correo',
      to: ['cliente@ejemplo.com'],
    });
    // A text alternative always goes out: some clients treat HTML-only mail as spam.
    expect(captured.body?.text).toBe('Hola');
  });

  it('only sends reply_to when one is configured', async () => {
    const withoutReply = stubFetch();
    await new ResendEmailSender('re_test', 'a@b.com').send(MESSAGE);
    expect(withoutReply.body).not.toHaveProperty('reply_to');

    const withReply = stubFetch();
    await new ResendEmailSender('re_test', 'a@b.com', 'info@verdeo.com.ar').send(MESSAGE);
    expect(withReply.body).toMatchObject({ reply_to: 'info@verdeo.com.ar' });
  });

  /**
   * A rejected send must not throw: a customer's order cannot fail because a confirmation mail
   * bounced. The provider's own explanation is carried through — "domain not verified" is something
   * an operator can act on, a bare 403 is not.
   */
  it('reports a rejection with the provider detail instead of throwing', async () => {
    stubFetch({ ok: false, status: 403, textValue: 'The verdeo.com.ar domain is not verified' });

    const result = await new ResendEmailSender('re_bad', 'hola@verdeo.com.ar').send(MESSAGE);

    expect(result.sent).toBe(false);
    expect(result.reason).toContain('not verified');
    expect(result.reason).toContain('403');
  });

  it('reports a network failure the same way', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('getaddrinfo ENOTFOUND')));

    const result = await new ResendEmailSender('re_test', 'a@b.com').send(MESSAGE);

    expect(result).toMatchObject({ sent: false });
    expect(result.reason).toContain('ENOTFOUND');
  });
});

describe('NullEmailSender', () => {
  // Lets every caller send unconditionally instead of branching on whether email is configured.
  it('never sends and explains why', async () => {
    const result = await new NullEmailSender().send();

    expect(result).toMatchObject({ providerMessageId: null, sent: false });
    expect(result.reason).toBe('No hay un proveedor de correo configurado.');
  });
});

describe('renderEmail', () => {
  it('produces both an HTML and a plain-text version', () => {
    const { html, text } = renderEmail({
      action: { href: 'https://verdeo.com.ar/acceso?token=abc', label: 'Entrar' },
      bodyHtml: '<p>Confirmá tu correo para entrar.</p>',
      bodyText: 'Confirmá tu correo para entrar.',
      heading: 'Tu acceso a Verdeo',
    });

    expect(html).toContain('Tu acceso a Verdeo');
    expect(html).toContain('https://verdeo.com.ar/acceso?token=abc');
    expect(text).toContain('Entrar: https://verdeo.com.ar/acceso?token=abc');
    // The link is repeated as text because buttons do not survive every client.
    expect(html).toContain('Si el botón no funciona');
  });

  it('escapes content so a crafted name cannot inject markup', () => {
    const { html } = renderEmail({
      bodyHtml: '<p>ok</p>',
      bodyText: 'ok',
      heading: '<script>alert(1)</script>',
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('omits the button entirely when there is no action', () => {
    const { html, text } = renderEmail({
      bodyHtml: '<p>Tu pedido fue recibido.</p>',
      bodyText: 'Tu pedido fue recibido.',
      heading: 'Pedido recibido',
    });

    expect(html).not.toContain('Si el botón no funciona');
    expect(text.trim().endsWith('Verdeo · Comidas saludables')).toBe(true);
  });
});
