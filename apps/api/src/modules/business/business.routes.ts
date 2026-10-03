import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { logger } from '../../lib/logger';
import { updateBusinessSchema } from './business.schemas';

export const businessRouter = Router();

businessRouter.use(authenticate);

// Every query is scoped by req.auth.businessId (tenant isolation).
businessRouter.get('/', async (req, res, next) => {
  try {
    const business = await prisma.business.findUnique({ where: { id: req.auth!.businessId } });
    if (!business) throw notFound('Business not found');
    res.json({ success: true, data: business });
  } catch (e) {
    next(e);
  }
});

businessRouter.patch('/', requireRole('OWNER'), validateBody(updateBusinessSchema), async (req, res, next) => {
  try {
    const business = await prisma.business.update({ where: { id: req.auth!.businessId }, data: req.body });
    logger.info({ event: 'business_updated', userId: req.auth!.userId, businessId: business.id }, 'Business updated');
    res.json({ success: true, data: business });
  } catch (e) {
    next(e);
  }
});

// Marks the onboarding wizard as finished (or skipped) so the owner is not sent back to it.
businessRouter.post('/onboarding/complete', requireRole('OWNER'), async (req, res, next) => {
  try {
    const current = await prisma.business.findUnique({ where: { id: req.auth!.businessId } });
    if (!current) throw notFound('Business not found');
    const business = current.onboardedAt
      ? current
      : await prisma.business.update({ where: { id: current.id }, data: { onboardedAt: new Date() } });
    res.json({ success: true, data: business });
  } catch (e) {
    next(e);
  }
});
