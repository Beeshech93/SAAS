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
  /** Evolution API only: `accessToken` is then the instance apikey. */
  provider?: 'CLOUD_API' | 'EVOLUTION';
  baseUrl?: string | null;
  instanceName?: string | null;
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

/** Evolution API (v2): a self-hosted gateway that drives a WhatsApp session. Text and media only (no templates). */
export class EvolutionApiProvider implements WhatsAppProvider {
  constructor(private readonly creds: { baseUrl: string; instanceName: string; apiKey: string }) {}

  private async request(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>, perInstance = true): Promise<any> {
    const url = `${this.creds.baseUrl}${path}${perInstance ? `/${encodeURIComponent(this.creds.instanceName)}` : ''}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { apikey: this.creds.apiKey, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10_000),
        redirect: 'error',
      });
    } catch {
      throw new WhatsAppProviderError('Evolution API unreachable');
    }
    const json: any = await res.json().catch(() => null);
    if (!res.ok) {
      // Only the API's message is surfaced; never the request (it carries the apikey).
      const m = json?.response?.message ?? json?.message ?? json?.error;
      throw new WhatsAppProviderError(typeof m === 'string' ? m : Array.isArray(m) ? m.join(', ') : `Evolution API error ${res.status}`, res.status);
    }
    return json;
  }

  private static number = (phone: string) => phone.replace(/^\+/, '');

  private async send(path: string, body: Record<string, unknown>): Promise<SendResult> {
    const json = await this.request('POST', path, body);
    const messageId = json?.key?.id;
    if (!messageId) throw new WhatsAppProviderError('Evolution API returned no message id');
    return { messageId };
  }

  sendTextMessage(to: string, text: string) {
    return this.send('/message/sendText', { number: EvolutionApiProvider.number(to), text });
  }

  sendTemplateMessage(): Promise<SendResult> {
    return Promise.reject(new WhatsAppProviderError('Template messages are not supported with Evolution API'));
  }

  sendImageMessage(to: string, i: { url: string; caption?: string }) {
    return this.send('/message/sendMedia', { number: EvolutionApiProvider.number(to), mediatype: 'image', media: i.url, caption: i.caption });
  }

  sendDocumentMessage(to: string, d: { url: string; filename?: string; caption?: string }) {
    return this.send('/message/sendMedia', { number: EvolutionApiProvider.number(to), mediatype: 'document', media: d.url, fileName: d.filename, caption: d.caption });
  }

  /** Evolution needs the chat JID to mark as read; we only keep the message id, so this is a no-op. */
  async markAsRead() {}

  /** Instance state: 'open' means the WhatsApp session is connected. */
  async connectionState(): Promise<string> {
    const json = await this.request('GET', '/instance/connectionState');
    return String(json?.instance?.state ?? json?.state ?? 'unknown');
  }

  /**
   * Creates the instance (WhatsApp Web session) on the server. `apiKey` must then be the server's
   * global key; the instance's own key is returned so only that, narrower key needs to be stored.
   */
  async createInstance(): Promise<{ instanceApiKey: string | null }> {
    const json = await this.request('POST', '/instance/create', { instanceName: this.creds.instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }, false);
    const hash = json?.hash;
    const key = typeof hash === 'string' ? hash : hash?.apikey;
    return { instanceApiKey: typeof key === 'string' && key ? key : null };
  }

  /** Current QR to scan (a PNG data URL), or none when the session is already connected. */
  async connect(): Promise<{ state: string; qr: string | null; pairingCode: string | null }> {
    const state = await this.connectionState();
    if (state === 'open') return { state, qr: null, pairingCode: null };
    const json = await this.request('GET', '/instance/connect');
    const raw: unknown = json?.base64 ?? json?.qrcode?.base64;
    const qr = typeof raw === 'string' && raw ? (raw.startsWith('data:image/') ? raw : `data:image/png;base64,${raw}`) : null;
    const pairing = json?.pairingCode ?? json?.qrcode?.pairingCode;
    return { state, qr, pairingCode: typeof pairing === 'string' && pairing ? pairing : null };
  }

  /** Points the instance's webhook at us (Evolution v2 payload), for incoming messages only. */
  async registerWebhook(url: string): Promise<void> {
    await this.request('POST', '/webhook/set', {
      webhook: { enabled: true, url, byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] },
    });
  }
}

type Factory = (creds: ProviderCredentials) => WhatsAppProvider;
let factory: Factory = (creds) =>
  creds.provider === 'EVOLUTION'
    ? new EvolutionApiProvider({ baseUrl: creds.baseUrl ?? '', instanceName: creds.instanceName ?? '', apiKey: creds.accessToken })
    : new CloudApiProvider(creds);

export const getProvider = (creds: ProviderCredentials) => factory(creds);
/** Test seam / alternative-provider hook. */
export const setProviderFactory = (f: Factory) => {
  factory = f;
};
