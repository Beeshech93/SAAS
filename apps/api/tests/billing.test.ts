import crypto from 'crypto';
import request from 'supertest';
import { fakePrisma } from './fake-prisma';
import { app, registerUser } from './helpers';
import { env } from '../src/config/env';
import { setAIProvider } from '../src/integrations/ai/provider';
import { setProviderFactory } from '../src/integrations/whatsapp/provider';
import { setAutoResponder } from '../src/modules/automation/responder';
import { aiResponder } from '../src/modules/ai/ai.service';
import { periodOf } from '../src/modules/billing/billing.service';
import { signAccessToken } from '../src/lib/tokens';

jest.mock('../src/lib/prisma', () => ({ prisma: require('./fake-prisma').fakePrisma }));

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const sub = (businessId: string) => fakePrisma.subscription.rows.find((s: any) => s.businessId === businessId);
const usageRow = (businessId: string) => fakePrisma.usage.rows.find((u: any) => u.businessId === businessId && u.period === periodOf());
const planRow = (code: string) => fakePrisma.plan.rows.find((p: any) => p.code === code);

// Tests edit plan rows; start each test from the code defaults (plans are re-created lazily).
afterEach(() => { fakePrisma.plan.rows.length = 0; fakePrisma.subscription.rows.forEach((s: any) => (s.planId = 'gone')); });

async function convFor(owner: { token: string }, phone = '+50937881234') {
  const c = (await request(app).post('/api/customers').set(auth(owner.token)).send({ phone })).body.data;
  return (await request(app).post('/api/conversations').set(auth(owner.token)).send({ customerId: c.id })).body.data;
}

describe('plan catalog', () => {
  it('is public and lists STARTER, BUSINESS, PRO with price, limits and feature flags', async () => {
    const res = await request(app).get('/api/plans');
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: any) => p.code)).toEqual(['STARTER', 'BUSINESS', 'PRO']);
    for (const p of res.body.data) {
      expect(p).toEqual(expect.objectContaining({ priceCents: expect.any(Number), messageLimit: expect.any(Number), userLimit: expect.any(Number), featureFlags: expect.any(Object) }));
    }
  });
});

describe('subscription', () => {
  it('a new business starts a 14-day STARTER trial', async () => {
    const owner = await registerUser('bill1');
    const s = sub(owner.businessId);
    expect(s.status).toBe('TRIALING');
    const days = (new Date(s.trialEndsAt).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);

    const res = await request(app).get('/api/subscription').set(auth(owner.token));
    expect(res.body.data).toMatchObject({ status: 'TRIALING', active: true, plan: { code: 'STARTER' }, usage: { messages: 0, users: 1, pendingInvites: 0 } });
    expect(res.body.data.plans).toHaveLength(3);
  });

  it('is OWNER-only', async () => {
    const owner = await registerUser('bill2');
    const u = await registerUser('bill2-admin');
    const uid = (await request(app).get('/api/auth/me').set(auth(u.token))).body.data.user.id;
    await fakePrisma.businessMember.create({ data: { userId: uid, businessId: owner.businessId, role: 'ADMIN' } });
    const admin = signAccessToken({ sub: uid, bid: owner.businessId, role: 'ADMIN' });
    expect((await request(app).get('/api/subscription').set(auth(admin))).status).toBe(403);
    expect((await request(app).get('/api/subscription')).status).toBe(401);
  });

  it('plan changes need a payment provider unless BILLING_SELF_SERVICE is on (dev/staging)', async () => {
    const owner = await registerUser('bill3');
    expect((await request(app).post('/api/subscription/change-plan').set(auth(owner.token)).send({ plan: 'PRO' })).status).toBe(501);

    (env as any).BILLING_SELF_SERVICE = true;
    try {
      expect((await request(app).post('/api/subscription/change-plan').set(auth(owner.token)).send({ plan: 'PRO' })).status).toBe(200);
      expect(sub(owner.businessId)).toMatchObject({ status: 'ACTIVE', trialEndsAt: null });
      const res = await request(app).get('/api/subscription').set(auth(owner.token));
      expect(res.body.data.plan.code).toBe('PRO');
      expect(res.body.data.limits.users).toBe(30);
      expect((await request(app).post('/api/subscription/change-plan').set(auth(owner.token)).send({ plan: 'GOLD' })).status).toBe(400);
    } finally {
      (env as any).BILLING_SELF_SERVICE = false;
    }
  });

  it('refuses a downgrade that would leave more members than the plan allows', async () => {
    const owner = await registerUser('bill4');
    (env as any).BILLING_SELF_SERVICE = true;
    try {
      await request(app).post('/api/subscription/change-plan').set(auth(owner.token)).send({ plan: 'PRO' });
      for (let i = 0; i < 3; i++) {
        const u = await registerUser(`bill4-m${i}`);
        const uid = (await request(app).get('/api/auth/me').set(auth(u.token))).body.data.user.id;
        await fakePrisma.businessMember.create({ data: { userId: uid, businessId: owner.businessId, role: 'AGENT' } });
      }
      const res = await request(app).post('/api/subscription/change-plan').set(auth(owner.token)).send({ plan: 'STARTER' });
      expect(res.status).toBe(409);
    } finally {
      (env as any).BILLING_SELF_SERVICE = false;
    }
  });
});

describe('user limit', () => {
  it('blocks invitations beyond the plan, counting pending invitations as seats', async () => {
    const owner = await registerUser('limU'); // STARTER = 3 users: owner + 2
    expect((await request(app).post('/api/team/invitations').set(auth(owner.token)).send({ email: 'a@x.com', role: 'AGENT' })).status).toBe(201);
    expect((await request(app).post('/api/team/invitations').set(auth(owner.token)).send({ email: 'b@x.com', role: 'AGENT' })).status).toBe(201);
    const third = await request(app).post('/api/team/invitations').set(auth(owner.token)).send({ email: 'c@x.com', role: 'AGENT' });
    expect(third.status).toBe(402);
    expect(third.body).toMatchObject({ success: false, error: { code: 'PLAN_LIMIT', details: { reason: 'USER_LIMIT_REACHED' } } });
  });

  it('upgrading the plan frees seats', async () => {
    const owner = await registerUser('limU2');
    await request(app).post('/api/team/invitations').set(auth(owner.token)).send({ email: 'a@x.com', role: 'AGENT' });
    await request(app).post('/api/team/invitations').set(auth(owner.token)).send({ email: 'b@x.com', role: 'AGENT' });
    planRow('BUSINESS'); // created lazily below
    (env as any).BILLING_SELF_SERVICE = true;
    try {
      await request(app).post('/api/subscription/change-plan').set(auth(owner.token)).send({ plan: 'BUSINESS' });
    } finally { (env as any).BILLING_SELF_SERVICE = false; }
    expect((await request(app).post('/api/team/invitations').set(auth(owner.token)).send({ email: 'c@x.com', role: 'AGENT' })).status).toBe(201);
  });
});

describe('message quota and subscription state', () => {
  it('counts agent messages and blocks sending at the limit (customer messages are never blocked)', async () => {
    const owner = await registerUser('limM');
    const conv = await convFor(owner);
    await request(app).get('/api/subscription').set(auth(owner.token)); // materialize plan
    planRow('STARTER').messageLimit = 2;

    for (let i = 0; i < 2; i++) {
      expect((await request(app).post('/api/messages').set(auth(owner.token)).send({ conversationId: conv.id, content: `m${i}` })).status).toBe(201);
    }
    expect(usageRow(owner.businessId).messages).toBe(2);

    const blocked = await request(app).post('/api/messages').set(auth(owner.token)).send({ conversationId: conv.id, content: 'one too many' });
    expect(blocked.status).toBe(402);
    expect(blocked.body.error).toMatchObject({ code: 'PLAN_LIMIT', details: { reason: 'MESSAGE_LIMIT_REACHED' } });
    expect(usageRow(owner.businessId).messages).toBe(2);
  });

  it('usage is per business and per month', async () => {
    const a = await registerUser('limMa');
    const b = await registerUser('limMb');
    const conv = await convFor(a);
    await request(app).post('/api/messages').set(auth(a.token)).send({ conversationId: conv.id, content: 'hi' });
    expect(usageRow(a.businessId).messages).toBe(1);
    expect(usageRow(b.businessId)).toBeUndefined();
    // Previous month's row does not count toward this month.
    fakePrisma.usage.rows.push({ id: 'old', businessId: b.businessId, period: '2000-01', messages: 99999 });
    const conv2 = await convFor(b, '+50937992222');
    expect((await request(app).post('/api/messages').set(auth(b.token)).send({ conversationId: conv2.id, content: 'hi' })).status).toBe(201);
  });

  it('an expired trial blocks sending but not reading', async () => {
    const owner = await registerUser('expired');
    const conv = await convFor(owner);
    sub(owner.businessId).trialEndsAt = new Date(Date.now() - 1000);
    const res = await request(app).post('/api/messages').set(auth(owner.token)).send({ conversationId: conv.id, content: 'x' });
    expect(res.status).toBe(402);
    expect(res.body.error.details.reason).toBe('SUBSCRIPTION_INACTIVE');
    expect((await request(app).get('/api/conversations').set(auth(owner.token))).status).toBe(200);
    expect((await request(app).get('/api/subscription').set(auth(owner.token))).body.data).toMatchObject({ active: false });
  });

  it('a businesses created before billing existed gets a trial lazily', async () => {
    const owner = await registerUser('legacy');
    fakePrisma.subscription.rows.splice(fakePrisma.subscription.rows.findIndex((s: any) => s.businessId === owner.businessId), 1);
    const res = await request(app).get('/api/subscription').set(auth(owner.token));
    expect(res.body.data).toMatchObject({ status: 'TRIALING', active: true });
  });
});

describe('feature flags', () => {
  it('a plan without a feature gets 402 FEATURE_NOT_IN_PLAN', async () => {
    const owner = await registerUser('flags');
    await request(app).get('/api/subscription').set(auth(owner.token));
    planRow('STARTER').featureFlags = { ai: false, analytics: false, customBranding: false, prioritySupport: false };
    for (const [method, path] of [['get', '/api/analytics'], ['post', '/api/ai/preview']] as const) {
      const res = await (request(app) as any)[method](path).set(auth(owner.token)).send({ message: 'x' });
      expect(res.status).toBe(402);
      expect(res.body.error.details).toMatchObject({ reason: 'FEATURE_NOT_IN_PLAN' });
    }
  });
});

describe('AI replies and billing', () => {
  const sign = (b: string) => 'sha256=' + crypto.createHmac('sha256', 'app-secret-for-tests').update(b).digest('hex');
  const hook = (pnid: string, id: string) => {
    const b = JSON.stringify({ entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: pnid }, messages: [{ id, from: '50937441234', type: 'text', text: { body: 'Bonjour' } }] } }] }] });
    return request(app).post('/api/webhooks/whatsapp').set('Content-Type', 'application/json').set('X-Hub-Signature-256', sign(b)).send(b);
  };
  let aiCalls = 0;
  beforeEach(() => {
    aiCalls = 0;
    setAIProvider({ complete: async () => { aiCalls++; return 'Bonjour !'; } });
    setAutoResponder(aiResponder);
    setProviderFactory(() => ({
      sendTextMessage: async () => ({ messageId: `wamid.${Math.random()}` }), sendTemplateMessage: async () => ({ messageId: 'x' }),
      sendImageMessage: async () => ({ messageId: 'x' }), sendDocumentMessage: async () => ({ messageId: 'x' }), markAsRead: async () => undefined,
    }));
  });
  afterEach(() => setAutoResponder(null));

  async function connected(tag: string, pnid: string) {
    const owner = await registerUser(tag);
    await request(app).put('/api/whatsapp').set(auth(owner.token)).send({ phoneNumberId: pnid, accessToken: 'EAAG-secret-token-123456' });
    return owner;
  }

  it('AI replies count toward the quota', async () => {
    const owner = await connected('aibill1', '300000001');
    await hook('300000001', 'wamid.B1');
    expect(aiCalls).toBe(1);
    expect(usageRow(owner.businessId).messages).toBe(1);
  });

  it('at the limit the AI makes no model call, the customer message is still stored, the conversation goes PENDING', async () => {
    const owner = await connected('aibill2', '300000002');
    await request(app).get('/api/subscription').set(auth(owner.token));
    fakePrisma.usage.rows.push({ id: 'u', businessId: owner.businessId, period: periodOf(), messages: planRow('STARTER').messageLimit });
    expect((await hook('300000002', 'wamid.B2')).status).toBe(200);
    expect(aiCalls).toBe(0);
    const conv = (await request(app).get('/api/conversations').set(auth(owner.token))).body.data[0];
    expect(conv.status).toBe('PENDING');
    const msgs = (await request(app).get(`/api/messages?conversationId=${conv.id}`).set(auth(owner.token))).body.data;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].senderType).toBe('CUSTOMER');
  });
});
