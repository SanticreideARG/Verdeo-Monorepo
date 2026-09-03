/**
 * Transactional email, behind an adapter — same pattern as `RouteOptimizer` and `AIProvider`.
 *
 * Callers know `EmailSender` and nothing else, so swapping Resend for SES later is a wiring change
 * in the API's runtime rather than an edit to every place that sends mail.
 */

export interface EmailMessage {
  /** Plain-text alternative. Always send one: some clients refuse HTML-only mail as spam. */
  text: string;
  html: string;
  subject: string;
  to: string;
}

export interface EmailSendResult {
  /** The provider's own id for the message, when it gives one — useful for tracing a complaint. */
  providerMessageId: string | null;
  /** Why it did not send. Present only when `sent` is false. */
  reason?: string;
  sent: boolean;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export class EmailNotConfiguredError extends Error {
  public constructor(message = 'El envío de correo no está configurado.') {
    super(message);
    this.name = 'EmailNotConfiguredError';
  }
}

/**
 * Never sends anything and says so.
 *
 * Used when no key is configured, so the rest of the app can call `send` unconditionally instead of
 * branching on whether email exists. A failed send is reported as `sent: false`, not thrown — a
 * customer's order must not fail because a confirmation mail could not go out.
 */
export class NullEmailSender implements EmailSender {
  public send(): Promise<EmailSendResult> {
    return Promise.resolve({
      providerMessageId: null,
      reason: 'No hay un proveedor de correo configurado.',
      sent: false,
    });
  }
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export class ResendEmailSender implements EmailSender {
  public constructor(
    private readonly apiKey: string,
    /** Must be an address on a domain verified in Resend, or every send is rejected. */
    private readonly from: string,
    private readonly replyTo?: string | undefined,
  ) {}

  public async send(message: EmailMessage): Promise<EmailSendResult> {
    try {
      const response = await fetch(RESEND_ENDPOINT, {
        body: JSON.stringify({
          from: this.from,
          html: message.html,
          ...(this.replyTo ? { reply_to: this.replyTo } : {}),
          subject: message.subject,
          text: message.text,
          to: [message.to],
        }),
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      });

      if (!response.ok) {
        // Resend puts the useful part in the body ("domain not verified", "invalid to"), so it is
        // carried through rather than reduced to a status code an operator cannot act on.
        const detail = await response.text().catch(() => '');
        return {
          providerMessageId: null,
          reason: `Resend rechazó el envío (${response.status}): ${detail.slice(0, 300)}`,
          sent: false,
        };
      }

      const payload = (await response.json().catch(() => ({}))) as { id?: string };
      return { providerMessageId: payload.id ?? null, sent: true };
    } catch (error) {
      return {
        providerMessageId: null,
        reason: error instanceof Error ? error.message : 'No pudimos contactar a Resend.',
        sent: false,
      };
    }
  }
}

/**
 * Wraps a subject and body in Verdeo's shell.
 *
 * Kept deliberately plain: transactional mail is read in a hundred clients that support a fraction
 * of CSS each, so this is a table-free single column with inline styles, which is the only thing
 * that renders consistently. The plain-text alternative is generated alongside, never omitted.
 */
export function renderEmail(input: {
  bodyHtml: string;
  bodyText: string;
  heading: string;
  /** Optional single call to action. */
  action?: { href: string; label: string } | undefined;
}): { html: string; text: string } {
  const action = input.action;
  const button = action
    ? `<p style="margin:32px 0;"><a href="${escapeHtml(action.href)}" style="background:#174c3c;border-radius:8px;color:#ffffff;display:inline-block;font-weight:600;padding:14px 28px;text-decoration:none;">${escapeHtml(action.label)}</a></p>`
    : '';

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="background:#f5f2e8;margin:0;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#183129;">
  <div style="background:#ffffff;border-radius:16px;margin:0 auto;max-width:560px;padding:40px 32px;">
    <p style="color:#5d6f68;font-size:12px;letter-spacing:.14em;margin:0 0 8px;text-transform:uppercase;">Verdeo</p>
    <h1 style="font-size:24px;line-height:1.25;margin:0 0 20px;">${escapeHtml(input.heading)}</h1>
    <div style="color:#3c4d46;font-size:15px;line-height:1.65;">${input.bodyHtml}</div>
    ${button}
    ${action ? `<p style="color:#8b968d;font-size:12px;line-height:1.6;margin:24px 0 0;word-break:break-all;">Si el botón no funciona, copiá este enlace:<br>${escapeHtml(action.href)}</p>` : ''}
  </div>
  <p style="color:#8b968d;font-size:12px;margin:24px auto 0;max-width:560px;text-align:center;">Verdeo · Comidas saludables</p>
</body></html>`;

  const text = [
    input.heading,
    '',
    input.bodyText,
    ...(action ? ['', `${action.label}: ${action.href}`] : []),
    '',
    'Verdeo · Comidas saludables',
  ].join('\n');

  return { html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
