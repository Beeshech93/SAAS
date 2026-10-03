import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { decrypt, encrypt } from '../../lib/crypto';
import { AppError, conflict } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { assertSafeServerUrl } from '../../lib/url-guard';
import { EvolutionApiProvider, WhatsAppProviderError } from '../../integrations/whatsapp/provider';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';

const status = z.enum(['ACTIVE', 'DISABLED']).default('ACTIVE');
const displayPhoneNumber = z.string().trim().max(30).nullable().optional();

const cloudSchema = z
  .object({
    provider: z.literal('CLOUD_API'),
    phoneNumberId: z.string().trim().regex(/^\d{5,30}$/, 'Digits only'),
    accessToken: z.string().trim().min(10).max(1000),
    displayPhoneNumber,
    status,
  })
  .strict();

const evolutionSchema = z
  .object({
    provider: z.literal('EVOLUTION'),
    baseUrl: z.string().trim().url().max(300),
    instanceName: z.string().trim().regex(/^[\w.-]{1,100}$/, 'Letters, digits, . _ - only'),
    // Optional when re-saving an existing Evolution connection (the stored key is kept).
    apiKey: z.string().trim().min(8).max(500).optional(),
    // Create the instance on the server first (apiKey is then the server's global key).
    createInstance: z.boolean().default(false),
    displayPhoneNumber,
    status,
  })
  .strict();

// `provider` defaults to CLOUD_API so existing clients keep working.
const upsertSchema = z.preprocess(
  (b) => (b && typeof b === 'object' && !('provider' in b) ? { provider: 'CLOUD_API', ...b } : b),
  z.discriminatedUnion('provider', [cloudSchema, evolutionSchema]),
);

export const whatsappRouter = Router();
whatsappRouter.use(authenticate);

type Row = {
  id: string;
  provider: 'CLOUD_API' | 'EVOLUTION';
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  status: string;
  baseUrl: string | null;
  instanceName: string | null;
  webhookSecret: string | null;
  updatedAt: Date;
};

const appUrl = () => env.APP_URL.replace(/\/$/, '');
const evolutionWebhookUrl = (i: Pick<Row, 'id' | 'webhookSecret'>) => `${appUrl()}/api/webhooks/evolution/${i.id}/${i.webhookSecret}`;

/** Never returns tokens/keys. The Evolution webhook URL embeds a secret, so only owners get it. */
const view = (i: Row | null, extra: { webhookRegistered?: boolean; connectionState?: string } = {}, owner = false) => ({
  connected: !!i,
  integration: i && {
    provider: i.provider,
    phoneNumberId: i.phoneNumberId,
    displayPhoneNumber: i.displayPhoneNumber,
    status: i.status,
    baseUrl: i.baseUrl,
    instanceName: i.instanceName,
    updatedAt: i.updatedAt,
  },
  webhookUrl: i?.provider === 'EVOLUTION' ? (owner ? evolutionWebhookUrl(i) : null) : `${appUrl()}/api/webhooks/whatsapp`,
  webhookConfigured: i?.provider === 'EVOLUTION' ? true : !!(env.WHATSAPP_VERIFY_TOKEN && env.WHATSAPP_APP_SECRET),
  ...extra,
});

whatsappRouter.get('/', requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const i = await prisma.whatsAppIntegration.findFirst({ where: { businessId: req.auth!.businessId } });
    res.json({ success: true, data: view(i, {}, req.auth!.role === 'OWNER') });
  } catch (e) {
    next(e);
  }
});

whatsappRouter.put('/', requireRole('OWNER'), validateBody(upsertSchema), async (req, res, next) => {
  try {
    const { businessId, userId } = req.auth!;
    if (!env.ENCRYPTION_KEY) throw new AppError(503, 'INTERNAL_ERROR', 'Server encryption key is not configured');
    const body = req.body as z.infer<typeof cloudSchema> | z.infer<typeof evolutionSchema>;
    const existing = await prisma.whatsAppIntegration.findFirst({ where: { businessId } });
    const extra: { webhookRegistered?: boolean; connectionState?: string } = {};
    let data: Record<string, unknown>;

    if (body.provider === 'CLOUD_API') {
      data = {
        provider: 'CLOUD_API',
        phoneNumberId: body.phoneNumberId,
        displayPhoneNumber: body.displayPhoneNumber ?? null,
        accessTokenEnc: encrypt(body.accessToken),
        status: body.status,
        baseUrl: null,
        instanceName: null,
        webhookSecret: null,
      };
    } else {
      let baseUrl: string;
      try {
        baseUrl = assertSafeServerUrl(body.baseUrl);
      } catch (e) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request', { baseUrl: [(e as Error).message] });
      }
      const keeping = existing?.provider === 'EVOLUTION';
      const apiKey = body.apiKey ?? (keeping ? decrypt(existing!.accessTokenEnc) : undefined);
      if (!apiKey) throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request', { apiKey: ['Required'] });

      let apiKeyToStore = apiKey;
      if (body.createInstance) {
        try {
          const created = await new EvolutionApiProvider({ baseUrl, instanceName: body.instanceName, apiKey }).createInstance();
          if (created.instanceApiKey) apiKeyToStore = created.instanceApiKey; // keep only the narrower per-instance key
        } catch (err) {
          const message = err instanceof WhatsAppProviderError ? err.message : 'unknown error';
          throw new AppError(502, 'INTERNAL_ERROR', `Could not create the instance: ${message}`);
        }
      }

      // A key not yet in the database can never receive traffic, so the secret exists before the URL is shown.
      const webhookSecret = (keeping && existing!.webhookSecret) || crypto.randomBytes(24).toString('base64url');
      const host = new URL(baseUrl).host;
      const phoneNumberId = `evo:${body.instanceName}@${host}`;
      data = {
        provider: 'EVOLUTION',
        phoneNumberId,
        displayPhoneNumber: body.displayPhoneNumber ?? null,
        accessTokenEnc: encrypt(apiKeyToStore),
        status: body.status,
        baseUrl,
        instanceName: body.instanceName,
        webhookSecret,
      };
    }

    // A number/instance can belong to one business only (prevents claiming another tenant's webhook traffic).
    const taken = await prisma.whatsAppIntegration.findFirst({ where: { phoneNumberId: data.phoneNumberId as string } });
    if (taken && taken.businessId !== businessId) throw conflict('This WhatsApp number is already connected to another business');

    const saved = existing
      ? await prisma.whatsAppIntegration.update({ where: { id: existing.id }, data })
      : await prisma.whatsAppIntegration.create({ data: { ...data, businessId } as any });

    if (body.provider === 'EVOLUTION') {
      // Verify the server/key and register our webhook. Failures are reported, not fatal: the
      // connection is saved and the owner can fix the Evolution side and save again.
      const evo = new EvolutionApiProvider({ baseUrl: saved.baseUrl!, instanceName: saved.instanceName!, apiKey: decrypt(saved.accessTokenEnc) });
      try {
        extra.connectionState = await evo.connectionState();
        await evo.registerWebhook(evolutionWebhookUrl(saved));
        extra.webhookRegistered = true;
      } catch (err) {
        extra.webhookRegistered = false;
        const message = err instanceof WhatsAppProviderError ? err.message : 'unknown error';
        logger.warn({ event: 'evolution_setup_failed', businessId, error: message }, 'Evolution setup incomplete');
        throw new AppError(502, 'INTERNAL_ERROR', `Saved, but Evolution API did not answer correctly: ${message}`);
      }
    }
    logger.info({ event: 'whatsapp_integration_saved', businessId, userId, provider: body.provider }, 'WhatsApp integration saved');
    res.json({ success: true, data: view(saved, extra, true) });
  } catch (e) {
    next(e);
  }
});

whatsappRouter.delete('/', requireRole('OWNER'), async (req, res, next) => {
  try {
    await prisma.whatsAppIntegration.deleteMany({ where: { businessId: req.auth!.businessId } });
    logger.info({ event: 'whatsapp_integration_removed', businessId: req.auth!.businessId, userId: req.auth!.userId }, 'WhatsApp integration removed');
    res.json({ success: true, data: view(null) });
  } catch (e) {
    next(e);
  }
});

async function evolutionOf(businessId: string) {
  const i = await prisma.whatsAppIntegration.findFirst({ where: { businessId, provider: 'EVOLUTION' } });
  if (!i?.baseUrl || !i.instanceName) throw new AppError(409, 'CONFLICT', 'Evolution API is not configured');
  return new EvolutionApiProvider({ baseUrl: i.baseUrl, instanceName: i.instanceName, apiKey: decrypt(i.accessTokenEnc) });
}

const noStore = (res: import('express').Response) => res.setHeader('Cache-Control', 'no-store');

/** Session state of the Evolution instance: 'open' = WhatsApp connected, 'connecting'/'close' = scan the QR. */
whatsappRouter.get('/status', requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const state = await (await evolutionOf(req.auth!.businessId)).connectionState().catch((e: Error) => {
      throw new AppError(502, 'INTERNAL_ERROR', e instanceof WhatsAppProviderError ? e.message : 'Evolution API unreachable');
    });
    noStore(res);
    res.json({ success: true, data: { state } });
  } catch (e) {
    next(e);
  }
});

/** The QR links a WhatsApp account to this business: owner only, never cached, never logged. */
whatsappRouter.post('/qr', requireRole('OWNER'), async (req, res, next) => {
  try {
    const evo = await evolutionOf(req.auth!.businessId);
    const data = await evo.connect().catch((e: Error) => {
      throw new AppError(502, 'INTERNAL_ERROR', e instanceof WhatsAppProviderError ? e.message : 'Evolution API unreachable');
    });
    logger.info({ event: 'whatsapp_qr_requested', businessId: req.auth!.businessId, userId: req.auth!.userId, state: data.state }, 'WhatsApp QR requested');
    noStore(res);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});
