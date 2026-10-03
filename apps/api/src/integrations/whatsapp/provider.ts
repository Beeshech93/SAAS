import { env } from '../../config/env';

export interface SendResult {
  messageId: string;
}

/**
 * The rest of the app only depends on this interface, so another official
 * provider (e.g. a BSP) can be added without touching business logic.
 * `to` is a normalized phone number ("+50937001234").
 */
export interface WhatsAppProvider {
  sendTextMessage(to: string, text: string): Promise<SendResult>;
  sendTemplateMessage(to: string, template: { name: string; languageCode: string; components?: unknown[] }): Promise<SendResult>;
  sendImageMessage(to: string, image: { url: string; caption?: string }): Promise<SendResult>;
  sendDocumentMessage(to: string, doc: { url: string; filename?: string; caption?: string }): Promise<SendResult>;
  markAsRead(messageId: string): Promise<void>;
}

export interface ProviderCredentials {
  phoneNumberId: string;
  accessToken: string;
}

export class WhatsAppProviderError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
  }
}

/** Official WhatsApp Business Cloud API (Meta). */
export class CloudApiProvider implements WhatsAppProvider {
  constructor(private readonly creds: ProviderCredentials) {}

  private async post(body: Record<string, unknown>): Promise<any> {
    const url = `${env.WHATSAPP_GRAPH_URL}/${env.WHATSAPP_API_VERSION}/${this.creds.phoneNumberId}/messages`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.creds.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new WhatsAppProviderError('WhatsApp API unreachable');
    }
    const json: any = await res.json().catch(() => null);
    if (!res.ok) {
      // Only the API's error message is surfaced; never the request (it contains the token).
      throw new WhatsAppProviderError(json?.error?.message ?? `WhatsApp API error ${res.status}`, res.status);
    }
    return json;
  }

  private static to = (phone: string) => phone.replace(/^\+/, '');

  private async send(body: Record<string, unknown>): Promise<SendResult> {
    const json = await this.post({ recipient_type: 'individual', ...body });
    const messageId = json?.messages?.[0]?.id;
    if (!messageId) throw new WhatsAppProviderError('WhatsApp API returned no message id');
    return { messageId };
  }

  sendTextMessage(to: string, text: string) {
    return this.send({ to: CloudApiProvider.to(to), type: 'text', text: { body: text, preview_url: false } });
  }

  sendTemplateMessage(to: string, t: { name: string; languageCode: string; components?: unknown[] }) {
    return this.send({
      to: CloudApiProvider.to(to),
      type: 'template',
      template: { name: t.name, language: { code: t.languageCode }, ...(t.components ? { components: t.components } : {}) },
    });
  }

  sendImageMessage(to: string, i: { url: string; caption?: string }) {
    return this.send({ to: CloudApiProvider.to(to), type: 'image', image: { link: i.url, caption: i.caption } });
  }

  sendDocumentMessage(to: string, d: { url: string; filename?: string; caption?: string }) {
    return this.send({ to: CloudApiProvider.to(to), type: 'document', document: { link: d.url, filename: d.filename, caption: d.caption } });
  }

  async markAsRead(messageId: string) {
    await this.post({ status: 'read', message_id: messageId });
  }
}

type Factory = (creds: ProviderCredentials) => WhatsAppProvider;
let factory: Factory = (creds) => new CloudApiProvider(creds);

export const getProvider = (creds: ProviderCredentials) => factory(creds);
/** Test seam / alternative-provider hook. */
export const setProviderFactory = (f: Factory) => {
  factory = f;
};
