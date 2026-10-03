/**
 * End-to-end smoke test against real PostgreSQL + the real Prisma client (no fakes for the DB).
 * Covers the queries the in-memory fake cannot prove: composite keys, Decimal, upsert/increment,
 * case-insensitive search, JSON columns, unique constraints and cascades.
 */
import crypto from 'crypto';
import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { setAIProvider } from '../../src/integrations/ai/provider';
import { setProviderFactory } from '../../src/integrations/whatsapp/provider';
import { setAutoResponder } from '../../src/modules/automation/responder';
import { aiResponder } from '../../src/modules/ai/ai.service';

const app = createApp();
const run = Date.now().toString(36);
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const sign = (b: string) => 'sha256=' + crypto.createHmac('sha256', 'app-secret-for-tests').update(b).digest('hex');
const PW = 'Str0ngPassw0rd!';

async function register(tag: string) {
  const res = await request(app).post('/api/auth/register').send({ name: `U ${tag}`, email: `${tag}-${run}@example.com`, password: PW, businessName: `Biz ${tag}`, businessType: 'HOTEL' });
  expect(res.status).toBe(201);
  return { token: res.body.data.accessToken as string, businessId: res.body.data.business.id as string, cookie: res.headers['set-cookie'] as unknown as string[] };
}

afterAll(async () => { await prisma.$disconnect(); });

describe('real database', () => {
  const sent: string[] = [];
  beforeAll(() => {
    setAIProvider({ complete: async (r) => (r.messages[r.messages.length - 1]!.content.includes('check-in') ? 'Le check-in commence à 15h00.' : 'NO_INFO') });
    setProviderFactory(() => ({
      sendTextMessage: async (_to, text) => { sent.push(text); return { messageId: `wamid.OUT-${run}-${sent.length}` }; },
      sendTemplateMessage: async () => ({ messageId: 'x' }), sendImageMessage: async () => ({ messageId: 'x' }),
      sendDocumentMessage: async () => ({ messageId: 'x' }), markAsRead: async () => undefined,
    }));
    setAutoResponder(aiResponder);
  });

  it('auth: register, duplicate email, login, refresh rotation + reuse detection, logout', async () => {
    const a = await register('auth');
    const dup = await request(app).post('/api/auth/register').send({ name: 'X', email: `auth-${run}@example.com`, password: PW, businessName: 'B' });
    expect(dup.status).toBe(409);
    expect((await request(app).post('/api/auth/login').send({ email: `auth-${run}@example.com`, password: PW })).status).toBe(200);
    expect((await request(app).post('/api/auth/login').send({ email: `auth-${run}@example.com`, password: 'WrongPassw0rd!' })).status).toBe(401);

    const r1 = await request(app).post('/api/auth/refresh').set('Cookie', a.cookie);
    expect(r1.status).toBe(200);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', a.cookie)).status).toBe(401); // reuse
    expect((await request(app).post('/api/auth/refresh').set('Cookie', r1.headers['set-cookie'] as unknown as string[])).status).toBe(401); // family revoked
  });

  it('content: business, FAQ, services (Decimal), customers (case-insensitive search), tenant isolation', async () => {
    const a = await register('content-a');
    const b = await register('content-b');
    expect((await request(app).patch('/api/business').set(auth(a.token)).send({ description: 'Hôtel au bord de mer', aiRules: 'Animaux acceptés.' })).status).toBe(200);

    const faq = await request(app).post('/api/faqs').set(auth(a.token)).send({ question: 'Check-in ?', answer: 'Le check-in commence à 15h00.' });
    expect(faq.status).toBe(201);
    const svc = await request(app).post('/api/services').set(auth(a.token)).send({ type: 'ROOM', name: 'Chambre double', price: 85.5, currency: 'USD', capacity: 2, amenities: ['Wi-Fi', 'Clim'] });
    expect(svc.status).toBe(201);
    expect(Number(svc.body.data.price)).toBe(85.5);
    expect(svc.body.data.amenities).toEqual(['Wi-Fi', 'Clim']);

    expect((await request(app).get('/api/faqs').set(auth(b.token))).body.data).toHaveLength(0);
    expect((await request(app).patch(`/api/faqs/${faq.body.data.id}`).set(auth(b.token)).send({ answer: 'x' })).status).toBe(404);
    expect((await request(app).delete(`/api/services/${svc.body.data.id}`).set(auth(b.token))).status).toBe(404);

    const c1 = await request(app).post('/api/customers').set(auth(a.token)).send({ phone: '+509 3700-1234', name: 'Marie Joseph' });
    expect(c1.body.data.phone).toBe('+50937001234');
    expect((await request(app).post('/api/customers').set(auth(a.token)).send({ phone: '50937001234' })).status).toBe(409);
    expect((await request(app).post('/api/customers').set(auth(b.token)).send({ phone: '50937001234' })).status).toBe(201); // same number, other tenant
    expect((await request(app).get('/api/customers?search=MARIE').set(auth(a.token))).body.data).toHaveLength(1);
    expect((await request(app).get('/api/customers?search=3700').set(auth(a.token))).body.data).toHaveLength(1);
    expect((await request(app).get(`/api/customers/${c1.body.data.id}`).set(auth(b.token))).status).toBe(404);
  });

  it('whatsapp + AI: connect, signed webhook, dedupe, AI answer, handoff, usage counting, human takeover', async () => {
    const o = await register('wa');
    await request(app).post('/api/faqs').set(auth(o.token)).send({ question: 'Check-in ?', answer: 'Le check-in commence à 15h00.' });
    const pnid = `9${Date.now()}`.slice(0, 15);
    expect((await request(app).put('/api/whatsapp').set(auth(o.token)).send({ phoneNumberId: pnid, accessToken: 'EAAG-secret-token-123456' })).status).toBe(200);
    const stored = await prisma.whatsAppIntegration.findFirstOrThrow({ where: { businessId: o.businessId } });
    expect(stored.accessTokenEnc).not.toContain('EAAG');

    const hook = (id: string, text: string) => {
      const body = JSON.stringify({ entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: pnid }, contacts: [{ wa_id: '50937660000', profile: { name: 'Jean' } }], messages: [{ id: id, from: '50937660000', type: 'text', text: { body: text } }] } }] }] });
      return request(app).post('/api/webhooks/whatsapp').set('Content-Type', 'application/json').set('X-Hub-Signature-256', sign(body)).send(body);
    };
    expect((await request(app).post('/api/webhooks/whatsapp').set('X-Hub-Signature-256', 'sha256=00').send({})).status).toBe(401);

    const id1 = `wamid.IN1-${run}`;
    expect((await hook(id1, 'À quelle heure est le check-in ?')).status).toBe(200);
    expect((await hook(id1, 'À quelle heure est le check-in ?')).status).toBe(200); // retry
    expect(sent).toContain('Le check-in commence à 15h00.');

    const conv = (await request(app).get('/api/conversations').set(auth(o.token))).body.data[0];
    expect(conv).toMatchObject({ aiActive: true, status: 'OPEN', customer: { name: 'Jean', phone: '+50937660000' } });
    let msgs = (await request(app).get(`/api/messages?conversationId=${conv.id}`).set(auth(o.token))).body.data;
    expect(msgs.map((m: any) => m.senderType)).toEqual(['CUSTOMER', 'AI']);

    // Unknown question -> fallback + handoff
    await hook(`wamid.IN2-${run}`, 'Avez-vous un spa ?');
    const after = (await request(app).get(`/api/conversations/${conv.id}`).set(auth(o.token))).body.data;
    expect(after).toMatchObject({ aiActive: false, status: 'PENDING' });
    expect(sent.some((s) => s.includes('Je ne dispose pas de cette information'))).toBe(true);
    msgs = (await request(app).get(`/api/messages?conversationId=${conv.id}`).set(auth(o.token))).body.data;
    expect(msgs.some((m: any) => m.senderType === 'SYSTEM' && m.metadata.event === 'handoff')).toBe(true);

    // Agent reply is sent and stored with the provider id; usage counted atomically.
    const reply = await request(app).post('/api/messages').set(auth(o.token)).send({ conversationId: conv.id, content: 'Oui, nous avons un spa.' });
    expect(reply.status).toBe(201);
    expect(reply.body.data.externalId).toMatch(/^wamid\.OUT/);
    const period = new Date().toISOString().slice(0, 7);
    const usage = await prisma.usage.findUniqueOrThrow({ where: { businessId_period: { businessId: o.businessId, period } } });
    expect(usage.messages).toBe(3); // AI answer + AI fallback + agent reply
    const sub = (await request(app).get('/api/subscription').set(auth(o.token))).body.data;
    expect(sub).toMatchObject({ status: 'TRIALING', active: true, usage: { messages: 3 } });
  });

  it('team + analytics + billing limits', async () => {
    const o = await register('team');
    const inv = await request(app).post('/api/team/invitations').set(auth(o.token)).send({ email: `agent-${run}@example.com`, role: 'AGENT' });
    expect(inv.status).toBe(201);
    const token = new URL(inv.body.data.link).searchParams.get('token')!;
    const acc = await request(app).post('/api/auth/accept-invite').send({ token, name: 'Agent', password: PW });
    expect(acc.status).toBe(201);
    expect((await request(app).post('/api/auth/accept-invite').send({ token, name: 'Agent', password: PW })).status).toBe(404);

    const team = await request(app).get('/api/team').set(auth(o.token));
    expect(team.body.data.map((m: any) => m.role).sort()).toEqual(['AGENT', 'OWNER']);
    expect((await request(app).get('/api/analytics').set(auth(acc.body.data.accessToken))).status).toBe(403);

    // STARTER = 3 seats: owner + agent + 1 pending, then blocked.
    expect((await request(app).post('/api/team/invitations').set(auth(o.token)).send({ email: `x1-${run}@example.com`, role: 'AGENT' })).status).toBe(201);
    expect((await request(app).post('/api/team/invitations').set(auth(o.token)).send({ email: `x2-${run}@example.com`, role: 'AGENT' })).status).toBe(402);

    const an = await request(app).get('/api/analytics').set(auth(o.token));
    expect(an.status).toBe(200);
    expect(an.body.data.daily).toHaveLength(7);

    // Removing the agent cuts access immediately.
    expect((await request(app).delete(`/api/team/${acc.body.data.user.id}`).set(auth(o.token))).status).toBe(200);
    expect((await request(app).get('/api/business').set(auth(acc.body.data.accessToken))).status).toBe(401);
  });

  it('onboarding flag and cascade delete', async () => {
    const o = await register('onb');
    expect((await request(app).post('/api/business/onboarding/complete').set(auth(o.token))).body.data.onboardedAt).toBeTruthy();
    await request(app).post('/api/faqs').set(auth(o.token)).send({ question: 'q', answer: 'a' });
    await prisma.business.delete({ where: { id: o.businessId } });
    expect(await prisma.faq.count({ where: { businessId: o.businessId } })).toBe(0);
    expect(await prisma.businessMember.count({ where: { businessId: o.businessId } })).toBe(0);
  });
});
