import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The WhatsApp side of the Meta Cloud API, behind an adapter (same reasoning as avatar-storage.ts:
 * app.ts only knows this interface, never the concrete class). Two things live here that are
 * genuinely Meta-App-level rather than per-account: verifying the GET subscription challenge and
 * the POST signature. Sending is per-account, since each `messaging_accounts` row carries its own
 * `phoneNumberId`/`accessToken` (see packages/db/src/schema/messaging.ts for why those live in the
 * DB and not env).
 */
export interface WhatsAppProvider {
  /** Answers Meta's `GET .../webhooks?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`
   * handshake. Returns the challenge to echo back, or null if verification failed/is unconfigured. */
  verifyChallenge(
    mode: string | null,
    token: string | null,
    challenge: string | null,
  ): string | null;
  /** Constant-time check of Meta's `X-Hub-Signature-256` header against the raw request body.
   * Always false when WHATSAPP_APP_SECRET is unset — deny-by-default. */
  verifySignature(rawBody: string, signatureHeader: string | null): boolean;
  sendText(input: {
    accessToken: string;
    body: string;
    phoneNumberId: string;
    to: string;
  }): Promise<{ externalId: string }>;
}

export class MetaWhatsAppProvider implements WhatsAppProvider {
  public constructor(
    private readonly appSecret: string | undefined,
    private readonly verifyToken: string | undefined,
  ) {}

  public verifyChallenge(
    mode: string | null,
    token: string | null,
    challenge: string | null,
  ): string | null {
    if (!this.verifyToken) return null;
    if (mode !== 'subscribe' || token !== this.verifyToken || !challenge) return null;
    return challenge;
  }

  public verifySignature(rawBody: string, signatureHeader: string | null): boolean {
    if (!this.appSecret || !signatureHeader) return false;
    const expected = `sha256=${createHmac('sha256', this.appSecret).update(rawBody).digest('hex')}`;
    const expectedBytes = Buffer.from(expected);
    const actualBytes = Buffer.from(signatureHeader);
    if (expectedBytes.length !== actualBytes.length) return false;
    return timingSafeEqual(expectedBytes, actualBytes);
  }

  public async sendText(input: {
    accessToken: string;
    body: string;
    phoneNumberId: string;
    to: string;
  }): Promise<{ externalId: string }> {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${input.phoneNumberId}/messages`,
      {
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          text: { body: input.body },
          to: input.to,
          type: 'text',
        }),
        headers: {
          authorization: `Bearer ${input.accessToken}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`WhatsApp send failed (${response.status}): ${detail}`);
    }
    const payload = (await response.json()) as { messages?: { id: string }[] };
    const externalId = payload.messages?.[0]?.id;
    if (!externalId) throw new Error('WhatsApp send response did not include a message id');
    return { externalId };
  }
}
