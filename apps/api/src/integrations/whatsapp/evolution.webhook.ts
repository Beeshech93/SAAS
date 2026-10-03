import crypto from 'crypto';
import { Router } from 'express';
import { AppError } from '../../lib/errors';
import { logger, securityLog } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { Inbound, processInbound } from './webhook.service';

export const evolutionWebhookRouter = Router();

const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

type Obj = Record<string, any>;

/** Maps an Evolution `messages.upsert` entry to the shape the Cloud API webhook already handles. */
export function fromEvolution(data: Obj): { msg: Inbound; name: string | null } | null {
  const key = data?.key;
  const jid: unknown = key?.remoteJid;
  // Own messages, groups, broadcasts and @lid (no phone number) are not customer conversations.
  if (!key?.id || key.fromMe || typeof jid !== 'string' || !jid.endsWith('@s.whatsapp.net')) return null;
  const from = jid.split('@')[0]!;
  const m: Obj = data.message ?? {};
  const base = { id: String(key.id), from };
  const name = typeof data.pushName === 'string' ? data.pushName : null;

  const text = m.conversation ?? m.extendedTextMessage?.text;
  if (typeof text === 'string') return { msg: { ...base, type: 'text', text: { body: text } }, name };
  const media = (kind: 'image' | 'video' | 'document' | 'audio', x: Obj) => ({
    msg: { ...base, type: kind, [kind]: { caption: x.caption, filename: x.fileName, mime_type: x.mimetype } } as Inbound,
    name,
  });
  if (m.imageMessage) return media('image', m.imageMessage);
  if (m.videoMessage) return media('video', m.videoMessage);
  if (m.documentMessage) return media('document', m.documentMessage);
  if (m.audioMessage) return media('audio', m.audioMessage);
  const reply = m.buttonsResponseMessage ?? m.listResponseMessage;
  if (reply) {
    const title = reply.selectedDisplayText ?? reply.title;
    return { msg: { ...base, type: 'button', button: { text: typeof title === 'string' ? title : undefined } }, name };
  }
  return { msg: { ...base, type: String(data.messageType ?? 'unknown') }, name };
}

// One URL per integration: /api/webhooks/evolution/<integrationId>/<secret>. The secret is generated
// when the integration is saved and compared in constant time (Evolution cannot sign its deliveries).
evolutionWebhookRouter.post('/:integrationId/:secret', async (req, res, next) => {
  try {
    const { integrationId, secret } = req.params as { integrationId: string; secret: string };
    const integration = /^[0-9a-f-]{36}$/i.test(integrationId)
      ? await prisma.whatsAppIntegration.findFirst({ where: { id: integrationId, provider: 'EVOLUTION' } })
      : null;
    if (!integration?.webhookSecret || !safeEqual(secret, integration.webhookSecret)) {
      securityLog.warn({ event: 'evolution_webhook_rejected' }, 'Evolution webhook rejected');
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid webhook');
    }
    // Always answer 200 below: a retry storm helps nobody and one bad message must not block the rest.
    const body = req.body as Obj;
    const event = String(body?.event ?? '').toLowerCase().replace(/_/g, '.');
    if (integration.status === 'ACTIVE' && event === 'messages.upsert') {
      const items: Obj[] = Array.isArray(body.data) ? body.data : body.data ? [body.data] : [];
      for (const item of items) {
        const parsed = fromEvolution(item);
        if (!parsed) continue;
        try {
          await processInbound(integration.businessId, parsed.msg, parsed.name);
        } catch (err) {
          logger.error({ event: 'evolution_inbound_failed', businessId: integration.businessId, error: (err as Error).message }, 'Inbound processing failed');
        }
      }
    }
    res.status(200).json({ success: true, data: null });
  } catch (e) {
    next(e);
  }
});
