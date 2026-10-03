import request from 'supertest';
import { app, registerUser } from './helpers';
import { fakePrisma } from './fake-prisma';
import { setProviderFactory, WhatsAppProvider } from '../src/integrations/whatsapp/provider';
import { setAutoResponder } from '../src/modules/automation/responder';
import { periodOf } from '../src/modules/billing/billing.service';

jest.mock('../src/lib/prisma', () => ({ prisma: require('./fake-prisma').fakePrisma }));

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
let sent: { to: string; text: string }[] = [];
let failFor: string | null = null;
const provider = (): WhatsAppProvider => ({
  sendTextMessage: async (to, text) => {
    if (failFor && to === failFor) throw new Error('number not on WhatsApp');
    sent.push({ to, text });
    return { messageId: `OUT${sent.length}` };
  },
  sendTemplateMessage: async () => ({ messageId: 'x' }),
  sendImageMessage: async () => ({ messageId: 'x' }),
  sendDocumentMessage: async () => ({ messageId: 'x' }),
  markAsRead: async () => undefined,
});

beforeEach(() => {
  sent = [];
  failFor = null;
  setProviderFactory(() => provider());
  setAutoResponder(null);
});

async function business(tag: string, customers: { phone: string; name?: string }[], connect = true) {
  const owner = await registerUser(`camp-${tag}`);
  if (connect) await request(app).put('/api/whatsapp').set(auth(owner.token)).send({ phoneNumberId: `9${Math.floor(Math.random() * 1e9)}`.padEnd(10, '0'), accessToken: 'EAAG-secret-token-123456' });
  for (const c of customers) await request(app).post('/api/customers').set(auth(owner.token)).send(c);
  return owner;
}
const create = (tok: string, body: object = {}) => request(app).post('/api/campaigns').set(auth(tok)).send({ name: 'Promo', message: 'Bonjour {{name}}, -10% ce week-end !', ...body });

describe('campaigns', () => {
  it('sends to every customer in batches, personalized, and completes', async () => {
    const o = await business('ok', [{ phone: '+50937000001', name: 'Jean Baptiste' }, { phone: '+50937000002' }, { phone: '+50937000003', name: 'Marie' }]);
    const c = (await create(o.token)).body.data;
    expect(c.status).toBe('DRAFT');
    const start = await request(app).post(`/api/campaigns/${c.id}/start`).set(auth(o.token));
    expect(start.status).toBe(200);
    expect(start.body.data.remaining).toBe(0);
    expect(start.body.data.campaign).toMatchObject({ status: 'COMPLETED', totalCount: 3, sentCount: 3, failedCount: 0 });
    expect(sent.map((s) => s.text).sort()).toEqual(['Bonjour Jean, -10% ce week-end !', 'Bonjour Marie, -10% ce week-end !', 'Bonjour, -10% ce week-end !']);
    const usage = fakePrisma.usage.rows.find((u: any) => u.businessId === o.businessId && u.period === periodOf());
    expect(usage.messages).toBe(3);
  });

  it('processes in several calls when there are more recipients than the batch size', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ phone: `+509370001${String(i).padStart(2, '0')}` }));
    const o = await business('batch', many);
    const c = (await create(o.token)).body.data;
    const start = await request(app).post(`/api/campaigns/${c.id}/start`).set(auth(o.token));
    expect(start.body.data.remaining).toBe(2); // batch size 10
    expect(start.body.data.campaign.status).toBe('SENDING');
    const next = await request(app).post(`/api/campaigns/${c.id}/process`).set(auth(o.token));
    expect(next.body.data.remaining).toBe(0);
    expect(next.body.data.campaign).toMatchObject({ status: 'COMPLETED', sentCount: 12 });
    expect(new Set(sent.map((s) => s.to)).size).toBe(12); // nobody twice
    expect((await request(app).post(`/api/campaigns/${c.id}/start`).set(auth(o.token))).status).toBe(409);
  });

  it('skips customers who opted out and records failures without stopping', async () => {
    const o = await business('skip', [{ phone: '+50937000011' }, { phone: '+50937000012' }, { phone: '+50937000013' }]);
    const stop = fakePrisma.customer.rows.find((c: any) => c.businessId === o.businessId && c.phone === '+50937000011');
    stop.marketingOptOut = true;
    failFor = '+50937000012';
    const c = (await create(o.token)).body.data;
    const res = (await request(app).post(`/api/campaigns/${c.id}/start`).set(auth(o.token))).body.data;
    expect(res.campaign).toMatchObject({ status: 'COMPLETED', totalCount: 2, sentCount: 1, failedCount: 1 });
    const detail = (await request(app).get(`/api/campaigns/${c.id}`).set(auth(o.token))).body.data;
    expect(detail.recipients.find((r: any) => r.phone === '+50937000012')).toMatchObject({ status: 'FAILED', error: expect.stringContaining('not on WhatsApp') });
  });

  it('re-checks opt-out right before sending (STOP after the snapshot)', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ phone: `+509370002${String(i).padStart(2, '0')}` }));
    const o = await business('late', many);
    const c = (await create(o.token)).body.data;
    await request(app).post(`/api/campaigns/${c.id}/start`).set(auth(o.token));
    const pending = fakePrisma.campaignRecipient.rows.find((r: any) => r.campaignId === c.id && r.status === 'PENDING');
    fakePrisma.customer.rows.find((x: any) => x.id === pending.customerId).marketingOptOut = true;
    const res = (await request(app).post(`/api/campaigns/${c.id}/process`).set(auth(o.token))).body.data;
    expect(res.campaign.status).toBe('COMPLETED');
    expect(sent).toHaveLength(11);
  });

  it('refuses without WhatsApp, without recipients, or beyond the plan quota', async () => {
    const noWa = await business('nowa', [{ phone: '+50937000021' }], false);
    expect((await request(app).post(`/api/campaigns/${(await create(noWa.token)).body.data.id}/start`).set(auth(noWa.token))).status).toBe(409);
    const empty = await business('empty', []);
    expect((await request(app).post(`/api/campaigns/${(await create(empty.token)).body.data.id}/start`).set(auth(empty.token))).status).toBe(400);
    const big = await business('quota', [{ phone: '+50937000031' }, { phone: '+50937000032' }]);
    fakePrisma.usage.rows.push({ id: 'u-q', businessId: big.businessId, period: periodOf(), messages: 499, createdAt: new Date(), updatedAt: new Date() });
    const r = await request(app).post(`/api/campaigns/${(await create(big.token)).body.data.id}/start`).set(auth(big.token));
    expect(r.status).toBe(402);
    expect(sent).toHaveLength(0);
  });

  it('cancel stops a running campaign and skips the rest', async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ phone: `+509370003${String(i).padStart(2, '0')}` }));
    const o = await business('cancel', many);
    const c = (await create(o.token)).body.data;
    await request(app).post(`/api/campaigns/${c.id}/start`).set(auth(o.token));
    const res = await request(app).post(`/api/campaigns/${c.id}/cancel`).set(auth(o.token));
    expect(res.body.data.status).toBe('CANCELLED');
    await request(app).post(`/api/campaigns/${c.id}/process`).set(auth(o.token));
    expect(sent).toHaveLength(10);
    expect((await request(app).delete(`/api/campaigns/${c.id}`).set(auth(o.token))).status).toBe(200);
  });

  it('requires login, is tenant-isolated, and only drafts are editable', async () => {
    const a = await business('iso-a', [{ phone: '+50937000041' }]);
    const b = await business('iso-b', []);
    const c = (await create(a.token)).body.data;
    expect((await request(app).get(`/api/campaigns/${c.id}`).set(auth(b.token))).status).toBe(404);
    expect((await request(app).post(`/api/campaigns/${c.id}/start`).set(auth(b.token))).status).toBe(404);
    expect((await request(app).get('/api/campaigns')).status).toBe(401);
    expect((await request(app).patch(`/api/campaigns/${c.id}`).set(auth(a.token)).send({ name: 'Nouveau' })).body.data.name).toBe('Nouveau');
    await request(app).post(`/api/campaigns/${c.id}/start`).set(auth(a.token));
    expect((await request(app).patch(`/api/campaigns/${c.id}`).set(auth(a.token)).send({ name: 'X' })).status).toBe(409);
    expect((await request(app).get('/api/campaigns/audience').set(auth(a.token))).body.data).toMatchObject({ total: 1, reach: 1 });
  });
});
