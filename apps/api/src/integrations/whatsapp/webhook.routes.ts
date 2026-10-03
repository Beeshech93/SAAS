import crypto from 'crypto';
import { Router } from 'express';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { securityLog } from '../../lib/logger';
import { handleWebhookPayload } from './webhook.service';

export const whatsappWebhookRouter = Router();

const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

// Meta's one-time endpoint verification handshake.
whatsappWebhookRouter.get('/', (req, res, next) => {
  if (!env.WHATSAPP_VERIFY_TOKEN) return next(new AppError(503, 'INTERNAL_ERROR', 'WhatsApp webhook not configured'));
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query as Record<string, string>;
  if (mode === 'subscribe' && typeof token === 'string' && safeEqual(token, env.WHATSAPP_VERIFY_TOKEN) && challenge) {
    return res.status(200).type('text/plain').send(String(challenge));
  }
  securityLog.warn({ event: 'whatsapp_verify_failed' }, 'Webhook verification failed');
  next(new AppError(403, 'FORBIDDEN', 'Verification failed'));
});

// Every delivery is signed by Meta: X-Hub-Signature-256 = sha256 HMAC of the raw body with the app secret.
whatsappWebhookRouter.post('/', async (req, res, next) => {
  try {
    if (!env.WHATSAPP_APP_SECRET) throw new AppError(503, 'INTERNAL_ERROR', 'WhatsApp webhook not configured');
    const raw: Buffer | undefined = (req as unknown as { rawBody?: Buffer }).rawBody;
    const header = req.get('x-hub-signature-256') ?? '';
    const expected = 'sha256=' + crypto.createHmac('sha256', env.WHATSAPP_APP_SECRET).update(raw ?? Buffer.alloc(0)).digest('hex');
    if (!raw || !safeEqual(header, expected)) {
      securityLog.warn({ event: 'whatsapp_invalid_signature' }, 'Webhook signature rejected');
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid signature');
    }
    await handleWebhookPayload(req.body);
    res.status(200).json({ success: true, data: null });
  } catch (e) {
    next(e);
  }
});
