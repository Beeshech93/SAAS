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
  const user = table();
  const business = table(() => ({ status: 'ACTIVE', language: 'fr', timezone: 'America/Port-au-Prince', aiEnabled: true, aiRules: null, onboardedAt: null }));
  const businessMember = table();
  const refreshToken = table(() => ({ revokedAt: null }));
  const faq = table(() => ({ active: true }));
  const customer = table();
  const conversation = table(() => ({ status: 'OPEN', channel: 'WHATSAPP', aiActive: true, assignedToId: null, lastMessageAt: new Date() }));
  const message = table(() => ({ messageType: 'TEXT' }));
  const whatsAppIntegration = table(() => ({ status: 'ACTIVE', displayPhoneNumber: null }));
  const invitation = table(() => ({ acceptedAt: null }));
  const plan = table(() => ({ currency: 'USD', active: true }));
  const subscription = table(() => ({ status: 'TRIALING', trialEndsAt: null, currentPeriodEnd: null }));
  const usage = table(() => ({ messages: 0 }));
  const service = table(() => ({ available: true, currency: 'HTG', amenities: [] }));

  // Emulate `include: { business, user }` on member lookups.
  const withIncludes = async (m: Row | null, include?: Row) => {
    if (!m || !include) return m;
    if (include.business) m.business = await business.findUnique({ where: { id: m.businessId } });
    if (include.user) m.user = await user.findUnique({ where: { id: m.userId } });
    return m;
  };
  const member = {
    ...businessMember,
    findUnique: async (a: Row) => withIncludes(await businessMember.findUnique(a as any), a.include),
    findFirst: async (a: Row) => withIncludes(await businessMember.findFirst(a as any), a.include),
  };

  const fake: Row = {
    user,
    business,
    businessMember: member,
    refreshToken,
    faq,
    service,
    plan,
    subscription,
    usage,
    invitation,
    whatsAppIntegration,
    customer,
    conversation,
    message,
    $transaction: async (fn: (tx: Row) => Promise<unknown>) => fn(fake),
  };
  return fake;
}

export const fakePrisma = createFakePrisma();
