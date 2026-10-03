import { Router } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { ensurePlans, getEntitlements, getPlan } from './billing.service';
import { PLAN_ORDER } from './plans';

const publicPlan = (p: { code: string; name: string; priceCents: number; currency: string; messageLimit: number; userLimit: number; featureFlags: unknown }) => ({
  code: p.code, name: p.name, priceCents: p.priceCents, currency: p.currency, messageLimit: p.messageLimit, userLimit: p.userLimit, featureFlags: p.featureFlags,
});

async function catalog() {
  await ensurePlans();
  const plans = await prisma.plan.findMany({ where: { active: true } });
  return plans.sort((a, b) => PLAN_ORDER.indexOf(a.code) - PLAN_ORDER.indexOf(b.code)).map(publicPlan);
}

/** Public: used by the landing page pricing section. */
export const plansRouter = Router();
plansRouter.get('/', async (_req, res, next) => {
  try {
    res.json({ success: true, data: await catalog() });
  } catch (e) {
    next(e);
  }
});

export const subscriptionRouter = Router();
subscriptionRouter.use(authenticate, requireRole('OWNER'));

subscriptionRouter.get('/', async (req, res, next) => {
  try {
    const e = await getEntitlements(req.auth!.businessId);
    res.json({
      success: true,
      data: {
        plan: publicPlan(e.plan),
        status: e.subscription.status,
        active: e.active,
        trialEndsAt: e.subscription.trialEndsAt,
        currentPeriodEnd: e.subscription.currentPeriodEnd,
        limits: e.limits,
        usage: e.usage,
        plans: await catalog(),
        selfService: env.BILLING_SELF_SERVICE,
      },
    });
  } catch (e) {
    next(e);
  }
});

const changeSchema = z.object({ plan: z.enum(['STARTER', 'BUSINESS', 'PRO']) }).strict();

// Without a payment provider this is only available when BILLING_SELF_SERVICE=true (dev/staging).
subscriptionRouter.post('/change-plan', validateBody(changeSchema), async (req, res, next) => {
  try {
    if (!env.BILLING_SELF_SERVICE) throw new AppError(501, 'NOT_IMPLEMENTED', 'Online payments are not configured yet');
    const { businessId, userId } = req.auth!;
    const target = await getPlan(req.body.plan);
    const e = await getEntitlements(businessId);
    if (e.usage.users + e.usage.pendingInvites > target.userLimit) {
      throw new AppError(409, 'CONFLICT', 'Remove team members or invitations before moving to this plan');
    }
    await prisma.subscription.updateMany({
      where: { id: e.subscription.id, businessId },
      data: { planId: target.id, status: 'ACTIVE', trialEndsAt: null },
    });
    logger.info({ event: 'plan_changed', businessId, userId, plan: target.code }, 'Plan changed');
    res.json({ success: true, data: null });
  } catch (e) {
    next(e);
  }
});
