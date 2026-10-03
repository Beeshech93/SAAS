import { PlanCode } from '@prisma/client';
import { RequestHandler } from 'express';
import { AppError } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { FeatureFlags, PLAN_DEFAULTS, TRIAL_DAYS } from './plans';

export const periodOf = (d = new Date()) => d.toISOString().slice(0, 7); // "YYYY-MM" UTC

/** Finds a plan, creating it from the code defaults the first time. Database values win afterwards. */
export async function getPlan(code: PlanCode) {
  const existing = await prisma.plan.findFirst({ where: { code } });
  if (existing) return existing;
  const d = PLAN_DEFAULTS[code];
  return prisma.plan.create({ data: { code, name: d.name, priceCents: d.priceCents, messageLimit: d.messageLimit, userLimit: d.userLimit, featureFlags: d.featureFlags as object } });
}

export async function ensurePlans() {
  for (const code of Object.keys(PLAN_DEFAULTS) as PlanCode[]) await getPlan(code);
}

/** Every business has a subscription; older ones get a trial lazily on first access. */
export async function ensureSubscription(businessId: string) {
  const existing = await prisma.subscription.findFirst({ where: { businessId } });
  if (existing) return existing;
  const plan = await getPlan('STARTER');
  return prisma.subscription.create({
    data: { businessId, planId: plan.id, status: 'TRIALING', trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000) },
  });
}

export async function getEntitlements(businessId: string) {
  const subscription = await ensureSubscription(businessId);
  const plan = (await prisma.plan.findFirst({ where: { id: subscription.planId } }))!;
  const now = new Date();
  const active =
    subscription.status === 'ACTIVE' ||
    (subscription.status === 'TRIALING' && !!subscription.trialEndsAt && subscription.trialEndsAt > now);

  const [usage, members, pending] = await Promise.all([
    prisma.usage.findFirst({ where: { businessId, period: periodOf() } }),
    prisma.businessMember.count({ where: { businessId } }),
    prisma.invitation.findMany({ where: { businessId, acceptedAt: null } }),
  ]);
  const pendingInvites = pending.filter((i) => i.expiresAt > now).length;

  return {
    subscription,
    plan,
    active,
    flags: plan.featureFlags as unknown as FeatureFlags,
    limits: { messages: plan.messageLimit, users: plan.userLimit },
    usage: { messages: usage?.messages ?? 0, users: members, pendingInvites },
  };
}

export type SendDecision = { ok: true } | { ok: false; reason: 'SUBSCRIPTION_INACTIVE' | 'MESSAGE_LIMIT_REACHED' };

/** May this business send one more AI/agent message right now? */
export async function canSend(businessId: string): Promise<SendDecision> {
  const e = await getEntitlements(businessId);
  if (!e.active) return { ok: false, reason: 'SUBSCRIPTION_INACTIVE' };
  if (e.usage.messages >= e.limits.messages) return { ok: false, reason: 'MESSAGE_LIMIT_REACHED' };
  return { ok: true };
}

export const planLimitError = (reason: string) =>
  new AppError(402, 'PLAN_LIMIT', reason === 'SUBSCRIPTION_INACTIVE' ? 'Subscription is not active' : 'Plan limit reached', { reason });

export async function recordOutboundMessage(businessId: string) {
  const period = periodOf();
  await prisma.usage.upsert({
    where: { businessId_period: { businessId, period } },
    create: { businessId, period, messages: 1 },
    update: { messages: { increment: 1 } }, // atomic
  });
}

export async function assertCanAddUser(businessId: string) {
  const e = await getEntitlements(businessId);
  if (!e.active) throw planLimitError('SUBSCRIPTION_INACTIVE');
  if (e.usage.users + e.usage.pendingInvites >= e.limits.users) throw planLimitError('USER_LIMIT_REACHED');
}

export const requireFeature = (flag: keyof FeatureFlags): RequestHandler => async (req, _res, next) => {
  try {
    const e = await getEntitlements(req.auth!.businessId);
    if (!e.flags[flag]) throw new AppError(402, 'PLAN_LIMIT', 'Feature not included in your plan', { reason: 'FEATURE_NOT_IN_PLAN', feature: flag });
    next();
  } catch (err) {
    next(err);
  }
};

/** At acceptance time the invitation itself already holds a seat, so only real members count. */
export async function assertSeatAvailable(businessId: string) {
  const e = await getEntitlements(businessId);
  if (!e.active) throw planLimitError('SUBSCRIPTION_INACTIVE');
  if (e.usage.users >= e.limits.users) throw planLimitError('USER_LIMIT_REACHED');
}
