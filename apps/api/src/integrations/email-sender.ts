import {
  NullEmailSender,
  ResendEmailSender,
  type EmailMessage,
  type EmailSendResult,
  type EmailSender,
} from '@verdeo/email';

export interface EmailConfig {
  apiKey: string;
  settings: Record<string, string>;
}

/**
 * Resolves the mail configuration per send, the same way `ConfigurableGeocodingProvider` resolves
 * the maps key: pasting a key in Ajustes takes effect immediately, with no redeploy, and removing
 * it degrades to "not configured" rather than to a crash.
 *
 * A missing sender address is treated as "not configured" too. Resend rejects any send whose `from`
 * is not on a verified domain, so a key without an address is not a usable setup — saying so here
 * gives the operator a message they can act on instead of a rejection from the provider.
 */
export class ConfigurableEmailSender implements EmailSender {
  public constructor(private readonly loadConfig: () => Promise<EmailConfig | null>) {}

  public async send(message: EmailMessage): Promise<EmailSendResult> {
    const config = await this.loadConfig();
    if (!config) return new NullEmailSender().send();

    const from = config.settings.fromEmail?.trim();
    if (!from) {
      return {
        providerMessageId: null,
        reason: 'Falta configurar la dirección remitente en Ajustes → Correo.',
        sent: false,
      };
    }

    const fromName = config.settings.fromName?.trim();
    const replyTo = config.settings.replyTo?.trim();
    return new ResendEmailSender(
      config.apiKey,
      fromName ? `${fromName} <${from}>` : from,
      replyTo || undefined,
    ).send(message);
  }
}
