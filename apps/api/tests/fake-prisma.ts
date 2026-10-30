/**
 * Minimal in-memory stand-in for the Prisma calls used in phase 1, so the test
 * suite runs without PostgreSQL. It supports only what the services call.
 */
import { randomUUID } from 'crypto';

type Row = Record<string, any>;
let clock = 0;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Row[]).some((w) => matches(row, w));
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('in' in v) return v.in.includes(row[k]);
      if ('gte' in v) return row[k] >= v.gte;
      if ('contains' in v) return String(row[k] ?? '').toLowerCase().includes(String(v.contains).toLowerCase());
    }
    if (k === 'businessId_period') return row.businessId === v.businessId && row.period === v.period;
    if (k === 'userId_businessId') return row.userId === v.userId && row.businessId === v.businessId;
    if (v === null) return row[k] == null;
    return row[k] === v;
  });
}

/** Applies a Prisma-style update, including { increment: n }. */
function apply(row: Row, data: Row) {
  for (const [k, v] of Object.entries(data)) {
    row[k] = v && typeof v === 'object' && 'increment' in v ? (row[k] ?? 0) + v.increment : v;
  }
  row.updatedAt = new Date();
}

function table(defaults: () => Row = () => ({})) {
  const rows: Row[] = [];
  return {
    rows,
    create: async ({ data }: { data: Row }) => {
      // Strictly increasing clock so ordering by createdAt is deterministic in tests.
      clock = Math.max(Date.now(), clock + 1);
      const now = new Date(clock);
      const row = { id: randomUUID(), createdAt: now, updatedAt: now, ...defaults(), ...data };
      rows.push(row);
      return { ...row };
    },
    findUnique: async ({ where }: { where: Row }) => {
      const r = rows.find((x) => matches(x, where));
      return r ? { ...r } : null;
    },
    findFirst: async ({ where }: { where?: Row }) => {
      const r = rows.find((x) => matches(x, where));
      return r ? { ...r } : null;
    },
    update: async ({ where, data }: { where: Row; data: Row }) => {
      const r = rows.find((x) => matches(x, where));
      if (!r) throw new Error('Record not found');
      apply(r, data);
      return { ...r };
    },
    upsert: async ({ where, create, update }: { where: Row; create: Row; update: Row }) => {
      const r = rows.find((x) => matches(x, where));
      if (r) { apply(r, update); return { ...r }; }
      clock = Math.max(Date.now(), clock + 1);
      const row = { id: randomUUID(), createdAt: new Date(clock), updatedAt: new Date(clock), ...defaults(), ...create };
      rows.push(row);
      return { ...row };
    },
    findMany: async ({ where, orderBy, take }: { where?: Row; orderBy?: Row; take?: number } = {}) => {
      let out = rows.filter((x) => matches(x, where)).map((r) => ({ ...r }));
      if (orderBy) {
        const [[k, dir]] = Object.entries(orderBy) as [[string, string]];
        out.sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (dir === 'desc' ? -1 : 1));
      }
      return take ? out.slice(0, take) : out;
    },
    createMany: async ({ data }: { data: Row[] }) => {
      for (const d of data) { clock = Math.max(Date.now(), clock + 1); rows.push({ id: randomUUID(), createdAt: new Date(clock), updatedAt: new Date(clock), ...defaults(), ...d }); }
      return { count: data.length };
    },
    count: async ({ where }: { where?: Row } = {}) => rows.filter((x) => matches(x, where)).length,
    deleteMany: async ({ where }: { where?: Row }) => {
      let count = 0;
      for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i]!, where)) { rows.splice(i, 1); count++; }
      return { count };
    },
    updateMany: async ({ where, data }: { where: Row; data: Row }) => {
      const hits = rows.filter((x) => matches(x, where));
      hits.forEach((r) => apply(r, data));
      return { count: hits.length };
    },
  };
}

export function createFakePrisma() {
  const user = table(() => ({ isSuperAdmin: false }));
  const business = table(() => ({ status: 'ACTIVE', language: 'fr', timezone: 'America/Port-au-Prince', aiEnabled: true, aiRules: null, onboardedAt: null }));
  const businessMember = table();
  const refreshToken = table(() => ({ revokedAt: null }));
  const faq = table(() => ({ active: true }));
  const customer = table(() => ({ marketingOptOut: false }));
  const conversation = table(() => ({ status: 'OPEN', channel: 'WHATSAPP', aiActive: true, assignedToId: null, lastMessageAt: new Date() }));
  const message = table(() => ({ messageType: 'TEXT' }));
  const whatsAppIntegration = table(() => ({ status: 'ACTIVE', displayPhoneNumber: null, provider: 'CLOUD_API', baseUrl: null, instanceName: null, webhookSecret: null }));
  const autoReplyRule = table(() => ({ active: true, keywords: [], activeFrom: null, activeTo: null, priority: 0 }));
  const campaign = table(() => ({ status: 'DRAFT', recentDays: null, totalCount: 0, sentCount: 0, failedCount: 0, startedAt: null, completedAt: null }));
  const campaignRecipient = table(() => ({ status: 'PENDING', error: null, externalId: null, sentAt: null }));
  const customerList = table();
  const customerListMember = table();
  const invitation = table(() => ({ acceptedAt: null }));
  const plan = table(() => ({ currency: 'USD', active: true }));
  const subscription = table(() => ({ status: 'TRIALING', trialEndsAt: null, currentPeriodEnd: null }));
  const usage = table(() => ({ messages: 0 }));
  const service = table(() => ({ available: true, currency: 'HTG', amenities: [] }));

  // Emulate `include` relations on mock tables.
  const withMemberIncludes = async (m: Row | null, include?: Row) => {
    if (!m || !include) return m;
    if (include.business) m.business = await business.findUnique({ where: { id: m.businessId } });
    if (include.user) m.user = await user.findUnique({ where: { id: m.userId } });
    return m;
  };

  const withSubIncludes = async (s: Row | null, include?: Row) => {
    if (!s || !include) return s;
    if (include.plan) s.plan = (await plan.findUnique({ where: { id: s.planId } })) ?? { code: 'STARTER', name: 'Starter' };
    return s;
  };

  const withBusinessIncludes = async (b: Row | null, include?: Row) => {
    if (!b || !include) return b;
    if (include.members) {
      const ms = await businessMember.findMany({ where: { businessId: b.id } });
      b.members = await Promise.all(ms.map((m) => withMemberIncludes(m, { user: true })));
    }
    if (include.subscription) {
      const s = await subscription.findUnique({ where: { businessId: b.id } });
      b.subscription = s ? await withSubIncludes(s, { plan: true }) : null;
    }
    if (include.whatsapp) {
      b.whatsapp = await whatsAppIntegration.findUnique({ where: { businessId: b.id } });
    }
    if (include.usage) {
      b.usage = await usage.findMany({ where: { businessId: b.id } });
    }
    if (include._count) {
      b._count = {
        customers: await customer.count({ where: { businessId: b.id } }),
        conversations: await conversation.count({ where: { businessId: b.id } }),
        messages: await message.count({ where: { businessId: b.id } }),
        members: await businessMember.count({ where: { businessId: b.id } }),
        faqs: await faq.count({ where: { businessId: b.id } }),
        services: await service.count({ where: { businessId: b.id } }),
        autoReplyRules: await autoReplyRule.count({ where: { businessId: b.id } }),
        campaigns: await campaign.count({ where: { businessId: b.id } }),
      };
    }
    return b;
  };

  const member = {
    ...businessMember,
    findUnique: async (a: Row) => withMemberIncludes(await businessMember.findUnique(a as any), a.include),
    findFirst: async (a: Row) => withMemberIncludes(await businessMember.findFirst(a as any), a.include),
  };

  const enhancedBusiness = {
    ...business,
    findUnique: async (a: Row) => withBusinessIncludes(await business.findUnique(a as any), a.include),
    findFirst: async (a: Row) => withBusinessIncludes(await business.findFirst(a as any), a.include),
    findMany: async (a: Row = {}) => {
      const list = await business.findMany(a as any);
      return Promise.all(list.map((b) => withBusinessIncludes(b, a.include)));
    },
  };

  const enhancedSubscription = {
    ...subscription,
    findUnique: async (a: Row) => withSubIncludes(await subscription.findUnique(a as any), a.include),
    findMany: async (a: Row = {}) => {
      const list = await subscription.findMany(a as any);
      return Promise.all(list.map((s) => withSubIncludes(s, a.include)));
    },
  };

  const enhancedUser = {
    ...user,
    findMany: async (a: Row = {}) => {
      const list = await user.findMany(a as any);
      return Promise.all(
        list.map(async (u) => {
          if (a.select?.memberships) {
            const ms = await businessMember.findMany({ where: { userId: u.id } });
            u.memberships = await Promise.all(ms.map((m) => withMemberIncludes(m, { business: true })));
          }
          return u;
        }),
      );
    },
  };

  const auditLog = table();

  const fake: Row = {
    user: enhancedUser,
    business: enhancedBusiness,
    businessMember: member,
    refreshToken,
    faq,
    service,
    plan,
    subscription: enhancedSubscription,
    usage,
    invitation,
    whatsAppIntegration,
    autoReplyRule,
    customerList,
    customerListMember,
    campaign,
    campaignRecipient,
    customer,
    conversation,
    message,
    auditLog,
    $transaction: async (fn: (tx: Row) => Promise<unknown>) => fn(fake),
  };
  return fake;
}

export const fakePrisma = createFakePrisma();
