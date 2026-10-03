import request from 'supertest';
import { app, registerUser } from './helpers';
import { fakePrisma } from './fake-prisma';
import { setProviderFactory, WhatsAppProvider } from '../src/integrations/whatsapp/provider';

jest.mock('../src/lib/prisma', () => ({ prisma: require('./fake-prisma').fakePrisma }));

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
let sent: string[] = [];
const provider = (): WhatsAppProvider => ({
  sendTextMessage: async (to) => { sent.push(to); return { messageId: `O${sent.length}` }; },
  sendTemplateMessage: async () => ({ messageId: 'x' }),
  sendImageMessage: async () => ({ messageId: 'x' }),
  sendDocumentMessage: async () => ({ messageId: 'x' }),
  markAsRead: async () => undefined,
});
beforeEach(() => { sent = []; setProviderFactory(() => provider()); });

const mkList = (tok: string, name = 'VIP') => request(app).post('/api/lists').set(auth(tok)).send({ name });
const addContacts = (tok: string, id: string, contacts: object[], customerIds: string[] = []) =>
  request(app).post(`/api/lists/${id}/members`).set(auth(tok)).send({ contacts, customerIds });

describe('customer lists', () => {
  it('creates lists with unique names and counts members', async () => {
    const o = await registerUser('ls-a');
    const l = (await mkList(o.token)).body.data;
    expect((await mkList(o.token)).status).toBe(409);
    expect((await request(app).post('/api/lists').set(auth(o.token)).send({ name: '' })).status).toBe(400);
    await addContacts(o.token, l.id, [{ phone: '+50937000001' }]);
    const all = (await request(app).get('/api/lists').set(auth(o.token))).body.data;
    expect(all).toEqual([expect.objectContaining({ name: 'VIP', memberCount: 1 })]);
    expect((await request(app).patch(`/api/lists/${l.id}`).set(auth(o.token)).send({ name: 'Gold' })).body.data.name).toBe('Gold');
  });

  it('imports pasted numbers (creating customers), skips duplicates and reports invalid ones', async () => {
    const o = await registerUser('ls-imp');
    const l = (await mkList(o.token)).body.data;
    const existing = (await request(app).post('/api/customers').set(auth(o.token)).send({ phone: '+50937000002', name: 'Marie' })).body.data;
    const r = await addContacts(o.token, l.id, [{ phone: '509 3700 0001', name: 'Jean' }, { phone: '+50937000002' }, { phone: 'abc' }, { phone: '509 3700 0001' }]);
    expect(r.body.data).toMatchObject({ added: 2, created: 1, invalidCount: 1, invalid: ['abc'] });
    const again = await addContacts(o.token, l.id, [], [existing.id]);
    expect(again.body.data).toMatchObject({ added: 0, alreadyIn: 1 });
    const detail = (await request(app).get(`/api/lists/${l.id}`).set(auth(o.token))).body.data;
    expect(detail.members.map((m: any) => m.phone).sort()).toEqual(['+50937000001', '+50937000002']);
    await request(app).delete(`/api/lists/${l.id}/members/${existing.id}`).set(auth(o.token));
    expect((await request(app).get(`/api/lists/${l.id}`).set(auth(o.token))).body.data.members).toHaveLength(1);
  });

  it('is tenant-isolated: other tenants cannot read it nor add their customers', async () => {
    const a = await registerUser('ls-iso-a');
    const b = await registerUser('ls-iso-b');
    const l = (await mkList(a.token)).body.data;
    const foreign = (await request(app).post('/api/customers').set(auth(b.token)).send({ phone: '+50937000009' })).body.data;
    expect((await request(app).get(`/api/lists/${l.id}`).set(auth(b.token))).status).toBe(404);
    expect((await request(app).delete(`/api/lists/${l.id}`).set(auth(b.token))).status).toBe(404);
    expect((await addContacts(b.token, l.id, [])).status).toBe(400);
    const r = await addContacts(a.token, l.id, [], [foreign.id]); // another tenant's customer id
    expect(r.body.data.added).toBe(0);
    expect((await request(app).get('/api/lists')).status).toBe(401);
  });
});

describe('campaigns aimed at a list', () => {
  async function setup(tag: string) {
    const o = await registerUser(`lc-${tag}`);
    await request(app).put('/api/whatsapp').set(auth(o.token)).send({ phoneNumberId: `8${Math.floor(Math.random() * 1e9)}`.padEnd(10, '0'), accessToken: 'EAAG-secret-token-123456' });
    for (const phone of ['+50937100001', '+50937100002', '+50937100003']) await request(app).post('/api/customers').set(auth(o.token)).send({ phone });
    const l = (await mkList(o.token)).body.data;
    await addContacts(o.token, l.id, [{ phone: '+50937100001' }, { phone: '+50937100002' }]);
    return { o, l };
  }

  it('reaches only list members, and excludes opted-out ones', async () => {
    const { o, l } = await setup('only');
    fakePrisma.customer.rows.find((c: any) => c.businessId === o.businessId && c.phone === '+50937100002').marketingOptOut = true;
    expect((await request(app).get(`/api/campaigns/audience?listId=${l.id}`).set(auth(o.token))).body.data).toMatchObject({ total: 3, reach: 1 });
    const c = (await request(app).post('/api/campaigns').set(auth(o.token)).send({ name: 'VIP', message: 'Salut', listId: l.id })).body.data;
    const res = await request(app).post(`/api/campaigns/${c.id}/start`).set(auth(o.token));
    expect(res.body.data.campaign).toMatchObject({ status: 'COMPLETED', totalCount: 1, sentCount: 1 });
    expect(sent).toEqual(['+50937100001']);
  });

  it('rejects another tenant’s list, an empty list, and deleting a list used by a draft', async () => {
    const { o, l } = await setup('guards');
    const other = await registerUser('lc-other');
    const foreignList = (await mkList(other.token, 'X')).body.data;
    expect((await request(app).post('/api/campaigns').set(auth(o.token)).send({ name: 'n', message: 'm', listId: foreignList.id })).status).toBe(400);
    const empty = (await mkList(o.token, 'Vide')).body.data;
    const ce = (await request(app).post('/api/campaigns').set(auth(o.token)).send({ name: 'e', message: 'm', listId: empty.id })).body.data;
    expect((await request(app).post(`/api/campaigns/${ce.id}/start`).set(auth(o.token))).status).toBe(400);
    const draft = (await request(app).post('/api/campaigns').set(auth(o.token)).send({ name: 'd', message: 'm', listId: l.id })).body.data;
    expect((await request(app).delete(`/api/lists/${l.id}`).set(auth(o.token))).status).toBe(409);
    await request(app).delete(`/api/campaigns/${draft.id}`).set(auth(o.token));
    expect((await request(app).delete(`/api/lists/${l.id}`).set(auth(o.token))).status).toBe(200);
  });
});
