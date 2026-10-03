import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { encrypt } from '../../lib/crypto';
import { AppError, conflict } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';

const upsertSchema = z
  .object({
    phoneNumberId: z.string().trim().regex(/^\d{5,30}$/, 'Digits only'),
    accessToken: z.string().trim().min(10).max(1000),
    displayPhoneNumber: z.string().trim().max(30).nullable().optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).default('ACTIVE'),
  })
  .strict();

export const whatsappRouter = Router();
whatsappRouter.use(authenticate);

/** Never returns the token. */
const view = (i: { phoneNumberId: string; displayPhoneNumber: string | null; status: string; updatedAt: Date } | null) => ({
  connected: !!i,
  integration: i && { phoneNumberId: i.phoneNumberId, displayPhoneNumber: i.displayPhoneNumber, status: i.status, updatedAt: i.updatedAt },
  webhookUrl: `${env.APP_URL.replace(/\/$/, '')}/api/webhooks/whatsapp`,
  webhookConfigured: !!(env.WHATSAPP_VERIFY_TOKEN && env.WHATSAPP_APP_SECRET),
});

whatsappRouter.get('/', requireRole('OWNER', 'ADMIN'), async (req, res, next) => {
  try {
    const i = await prisma.whatsAppIntegration.findFirst({ where: { businessId: req.auth!.businessId } });
    res.json({ success: true, data: view(i) });
  } catch (e) {
    next(e);
  }
});

whatsappRouter.put('/', requireRole('OWNER'), validateBody(upsertSchema), async (req, res, next) => {
  try {
    const { businessId, userId } = req.auth!;
    if (!env.ENCRYPTION_KEY) throw new AppError(503, 'INTERNAL_ERROR', 'Server encryption key is not configured');
    const { phoneNumberId, accessToken, displayPhoneNumber, status } = req.body;

    // A number can belong to one business only (prevents claiming another tenant's webhook traffic).
    const taken = await prisma.whatsAppIntegration.findFirst({ where: { phoneNumberId } });
    if (taken && taken.businessId !== businessId) throw conflict('This WhatsApp number is already connected to another business');

    const data = { phoneNumberId, displayPhoneNumber: displayPhoneNumber ?? null, accessTokenEnc: encrypt(accessToken), status };
    const existing = await prisma.whatsAppIntegration.findFirst({ where: { businessId } });
    const saved = existing
      ? await prisma.whatsAppIntegration.update({ where: { id: existing.id }, data })
      : await prisma.whatsAppIntegration.create({ data: { ...data, businessId } });
    logger.info({ event: 'whatsapp_integration_saved', businessId, userId }, 'WhatsApp integration saved');
    res.json({ success: true, data: view(saved) });
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
