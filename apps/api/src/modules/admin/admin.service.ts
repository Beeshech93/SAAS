import { BusinessStatus, PlanCode, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError, badRequest, notFound } from '../../lib/errors';
import { securityLog } from '../../lib/logger';
import { recordAudit } from '../../lib/audit';
import { env } from '../../config/env';

// ─── Overview ────────────────────────────────────────────────────────────────

export async function getOverviewStats() {
  const [
    totalBusinesses,
    activeBusinesses,
    suspendedBusinesses,
    totalUsers,
    totalCustomers,
    totalConversations,
    totalMessages,
    whatsappIntegrations,
    subscriptions,
    plans,
    recentBusinessesRaw,
  ] = await Promise.all([
    prisma.business.count(),
    prisma.business.count({ where: { status: 'ACTIVE' } }),
    prisma.business.count({ where: { status: 'SUSPENDED' } }),
    prisma.user.count(),
    prisma.customer.count(),
    prisma.conversation.count(),
    prisma.message.count(),
    prisma.whatsAppIntegration.findMany({
      select: { provider: true, status: true },
    }),
    prisma.subscription.findMany({
      include: { plan: { select: { code: true } } },
    }),
    prisma.plan.findMany({ select: { code: true, name: true } }),
    prisma.business.findMany({
      take: 6,
      orderBy: { createdAt: 'desc' },
      include: {
        members: {
          where: { role: 'OWNER' },
          include: { user: { select: { name: true, email: true } } },
          take: 1,
        },
        subscription: {
          include: { plan: { select: { code: true, name: true } } },
        },
        whatsapp: {
          select: { provider: true, status: true, displayPhoneNumber: true },
        },
      },
    }),
  ]);

  // Current month usage (UTC YYYY-MM)
  const currentPeriod = new Date().toISOString().slice(0, 7);
  const currentMonthUsages = await prisma.usage.findMany({
    where: { period: currentPeriod },
    select: { messages: true },
  });
  const currentMonthMessages = currentMonthUsages.reduce((sum, u) => sum + u.messages, 0);

  // Group subscriptions by status & plan
  const subStatusCounts: Record<string, number> = {
    TRIALING: 0,
    ACTIVE: 0,
    PAST_DUE: 0,
    CANCELED: 0,
    EXPIRED: 0,
  };
  const planCounts: Record<string, number> = {};
  plans.forEach((p) => {
    planCounts[p.code] = 0;
  });

  subscriptions.forEach((s) => {
    subStatusCounts[s.status] = (subStatusCounts[s.status] ?? 0) + 1;
    if (s.plan?.code) {
      planCounts[s.plan.code] = (planCounts[s.plan.code] ?? 0) + 1;
    }
  });

  // WhatsApp providers count
  const whatsappProviders = {
    cloudApi: whatsappIntegrations.filter((w) => w.provider === 'CLOUD_API').length,
    evolution: whatsappIntegrations.filter((w) => w.provider === 'EVOLUTION').length,
    active: whatsappIntegrations.filter((w) => w.status === 'ACTIVE').length,
  };

  const recentBusinesses = recentBusinessesRaw.map((b) => ({
    id: b.id,
    name: b.name,
    type: b.type,
    status: b.status,
    createdAt: b.createdAt,
    owner: b.members[0]?.user ?? null,
    plan: b.subscription?.plan?.code ?? 'STARTER',
    subscriptionStatus: b.subscription?.status ?? 'TRIALING',
    whatsapp: b.whatsapp,
  }));

  return {
    kpis: {
      totalBusinesses,
      activeBusinesses,
      suspendedBusinesses,
      totalUsers,
      totalCustomers,
      totalConversations,
      totalMessages,
      currentMonthMessages,
    },
    whatsapp: whatsappProviders,
    subscriptions: {
      byStatus: subStatusCounts,
      byPlan: planCounts,
    },
    recentBusinesses,
  };
}

// ─── Businesses ──────────────────────────────────────────────────────────────

export async function listBusinesses(options: {
  search?: string;
  status?: BusinessStatus;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (options.status) {
    where.status = options.status;
  }
  if (options.search?.trim()) {
    const q = options.search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.business.count({ where }),
    prisma.business.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        members: {
          where: { role: 'OWNER' },
          include: { user: { select: { id: true, name: true, email: true } } },
          take: 1,
        },
        subscription: {
          include: { plan: true },
        },
        whatsapp: {
          select: {
            provider: true,
            status: true,
            displayPhoneNumber: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            customers: true,
            conversations: true,
            messages: true,
            members: true,
          },
        },
      },
    }),
  ]);

  return {
    items: items.map((b) => ({
      id: b.id,
      name: b.name,
      type: b.type,
      status: b.status,
      phone: b.phone,
      email: b.email,
      createdAt: b.createdAt,
      aiEnabled: b.aiEnabled,
      owner: b.members[0]?.user ?? null,
      stats: {
        customers: b._count.customers,
        conversations: b._count.conversations,
        messages: b._count.messages,
        members: b._count.members,
      },
      subscription: b.subscription
        ? {
            planCode: b.subscription.plan.code,
            planName: b.subscription.plan.name,
            status: b.subscription.status,
            trialEndsAt: b.subscription.trialEndsAt,
            currentPeriodEnd: b.subscription.currentPeriodEnd,
          }
        : null,
      whatsapp: b.whatsapp,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getBusinessDetails(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, isSuperAdmin: true, createdAt: true } } },
        orderBy: { createdAt: 'asc' },
      },
      subscription: {
        include: { plan: true },
      },
      whatsapp: {
        select: {
          id: true,
          provider: true,
          status: true,
          displayPhoneNumber: true,
          phoneNumberId: true,
          baseUrl: true,
          instanceName: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      usage: {
        take: 6,
        orderBy: { period: 'desc' },
      },
      _count: {
        select: {
          customers: true,
          conversations: true,
          messages: true,
          faqs: true,
          services: true,
          autoReplyRules: true,
          campaigns: true,
        },
      },
    },
  });

  if (!business) throw notFound('Business not found');

  return {
    ...business,
    owner: business.members.find((m) => m.role === 'OWNER')?.user ?? null,
  };
}

export async function updateBusinessStatus(
  businessId: string,
  status: BusinessStatus,
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const exists = await prisma.business.findUnique({ where: { id: businessId } });
  if (!exists) throw notFound('Business not found');

  const previousStatus = exists.status;
  const updated = await prisma.business.update({
    where: { id: businessId },
    data: { status },
  });

  securityLog.info({ event: 'admin_business_status_updated', businessId, status }, 'Business status updated by admin');

  recordAudit({
    actorId,
    action: 'business.status_updated',
    targetType: 'Business',
    targetId: businessId,
    description: `Statut de "${exists.name}" changé de ${previousStatus} → ${status}`,
    metadata: { businessName: exists.name, previousStatus, newStatus: status },
    ipAddress,
    userAgent,
  });

  return updated;
}

export async function updateBusinessSubscription(
  businessId: string,
  input: {
    planCode?: PlanCode;
    status?: SubscriptionStatus;
    extendTrialDays?: number;
  },
  actorId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  const sub = await prisma.subscription.findUnique({
    where: { businessId },
    include: { plan: true, business: { select: { name: true } } },
  });
  if (!sub) throw notFound('Subscription not found for this business');

  const previousPlan = sub.plan.code;
  const previousStatus = sub.status;

  let newPlanId = sub.planId;
  if (input.planCode && input.planCode !== sub.plan.code) {
    const plan = await prisma.plan.findUnique({ where: { code: input.planCode } });
    if (!plan) throw badRequest('Unknown plan code');
    newPlanId = plan.id;
  }

  let trialEndsAt = sub.trialEndsAt;
  if (input.extendTrialDays && input.extendTrialDays > 0) {
    const base = trialEndsAt && trialEndsAt > new Date() ? trialEndsAt : new Date();
    trialEndsAt = new Date(base.getTime() + input.extendTrialDays * 86_400_000);
  }

  const updated = await prisma.subscription.update({
    where: { businessId },
    data: {
      planId: newPlanId,
      status: input.status ?? sub.status,
      trialEndsAt,
    },
    include: { plan: true },
  });

  securityLog.info(
    { event: 'admin_subscription_updated', businessId, plan: updated.plan.code, status: updated.status },
    'Subscription updated by admin',
  );

  recordAudit({
    actorId,
    action: 'subscription.updated',
    targetType: 'Subscription',
    targetId: businessId,
    description: `Abonnement de "${sub.business.name}" : ${previousPlan} → ${updated.plan.code}, ${previousStatus} → ${updated.status}`,
    metadata: {
      businessName: sub.business.name,
      previousPlan,
      newPlan: updated.plan.code,
      previousStatus,
      newStatus: updated.status,
      extendTrialDays: input.extendTrialDays ?? null,
    },
    ipAddress,
    userAgent,
  });

  return updated;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function listUsers(options: {
  search?: string;
  isSuperAdmin?: boolean;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 20));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (typeof options.isSuperAdmin === 'boolean') {
    where.isSuperAdmin = options.isSuperAdmin;
  }
  if (options.search?.trim()) {
    const q = options.search.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        isSuperAdmin: true,
        createdAt: true,
        memberships: {
          select: {
            role: true,
            business: {
              select: {
                id: true,
                name: true,
                status: true,
              },
            },
          },
        },
      },
    }),
  ]);

  return {
    items: users.map((u) => ({
      ...u,
      isSuperAdmin: Boolean(u.isSuperAdmin || env.SUPERADMIN_EMAILS.includes(u.email.toLowerCase())),
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function toggleUserSuperAdmin(
  targetUserId: string,
  isSuperAdmin: boolean,
  currentAdminUserId: string,
  ipAddress?: string,
  userAgent?: string,
) {
  if (targetUserId === currentAdminUserId && !isSuperAdmin) {
    throw badRequest('Vous ne pouvez pas révoquer vos propres droits Super Admin');
  }

  const user = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!user) throw notFound('User not found');

  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: { isSuperAdmin },
    select: { id: true, name: true, email: true, isSuperAdmin: true },
  });

  securityLog.info(
    { event: 'admin_superadmin_toggled', targetUserId, isSuperAdmin, byAdmin: currentAdminUserId },
    'Super admin flag toggled',
  );

  recordAudit({
    actorId: currentAdminUserId,
    action: isSuperAdmin ? 'user.superadmin_granted' : 'user.superadmin_revoked',
    targetType: 'User',
    targetId: targetUserId,
    description: isSuperAdmin
      ? `Droits Super Admin accordés à "${user.name}" (${user.email})`
      : `Droits Super Admin révoqués pour "${user.name}" (${user.email})`,
    metadata: { targetName: user.name, targetEmail: user.email, previousValue: user.isSuperAdmin, newValue: isSuperAdmin },
    ipAddress,
    userAgent,
  });

  return updated;
}

// ─── Audit Logs ──────────────────────────────────────────────────────────────

export async function listAuditLogs(options: {
  search?: string;
  action?: string;
  actorId?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(100, Math.max(1, options.limit ?? 30));
  const skip = (page - 1) * limit;

  const where: any = {};
  if (options.action) {
    where.action = options.action;
  }
  if (options.actorId) {
    where.actorId = options.actorId;
  }
  if (options.search?.trim()) {
    const q = options.search.trim();
    where.OR = [
      { description: { contains: q, mode: 'insensitive' } },
      { action: { contains: q, mode: 'insensitive' } },
      { targetType: { contains: q, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
