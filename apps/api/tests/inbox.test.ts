import request from 'supertest';
import { fakePrisma } from './fake-prisma';
import { app, registerUser } from './helpers';
import { signAccessToken } from '../src/lib/tokens';
import { normalizePhone } from '../src/lib/phone';

jest.mock('../src/lib/prisma', () => ({ prisma: require('./fake-prisma').fakePrisma }));

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function setup(tag: string) {
  const owner = await registerUser(`${tag}-owner`);
  const customer = (
    await request(app).post('/api/customers').set(auth(owner.token)).send({ phone: '+509 3700-1234', name: 'Jean' })
  ).body.data;
  const conv = (
    await request(app).post('/api/conversations').set(auth(owner.token)).send({ customerId: customer.id })
  ).body.data;
  return { owner, customer, conv };
}

async function addAgent(owner: { businessId: string }, tag: string) {
  const u = await registerUser(`${tag}-agent`);
  const uid = (await request(app).get('/api/auth/me').set(auth(u.token))).body.data.user.id;
  await fakePrisma.businessMember.create({ data: { userId: uid, businessId: owner.businessId, role: 'AGENT' } });
  return { uid, token: signAccessToken({ sub: uid, bid: owner.businessId, role: 'AGENT' }) };
}

describe('phone normalization', () => {
  it.each([
    ['+509 3700-1234', '+50937001234'],
    ['(509) 3700 1234', '+50937001234'],
    ['00509 37001234', '+50937001234'],
    ['50937001234', '+50937001234'],
  ])('%s -> %s', (raw, out) => expect(normalizePhone(raw)).toBe(out));
  it('rejects garbage', () => {
    expect(normalizePhone('abc')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
  });
});

describe('customers', () => {
  it('creates with normalized phone, rejects duplicates, fetches and updates', async () => {
    const a = await registerUser('cust');
    const created = await request(app).post('/api/customers').set(auth(a.token)).send({ phone: '+509 3700-1234', name: 'Marie' });
    expect(created.status).toBe(201);
    expect(created.body.data.phone).toBe('+50937001234');

    const dup = await request(app).post('/api/customers').set(auth(a.token)).send({ phone: '50937001234' });
    expect(dup.status).toBe(409);

    const id = created.body.data.id;
    expect((await request(app).get(`/api/customers/${id}`).set(auth(a.token))).body.data.name).toBe('Marie');
    const upd = await request(app).patch(`/api/customers/${id}`).set(auth(a.token)).send({ notes: 'VIP' });
    expect(upd.body.data.notes).toBe('VIP');
    expect((await request(app).get('/api/customers?search=mar').set(auth(a.token))).body.data).toHaveLength(1);
    expect((await request(app).get('/api/customers?search=zzz').set(auth(a.token))).body.data).toHaveLength(0);
  });

  it('allows the same phone in different businesses but isolates data', async () => {
    const a = await registerUser('custA');
    const b = await registerUser('custB');
    const ca = await request(app).post('/api/customers').set(auth(a.token)).send({ phone: '+50937001234' });
    const cb = await request(app).post('/api/customers').set(auth(b.token)).send({ phone: '+50937001234' });
    expect(ca.status).toBe(201);
    expect(cb.status).toBe(201);
    expect((await request(app).get(`/api/customers/${ca.body.data.id}`).set(auth(b.token))).status).toBe(404);
    expect((await request(app).patch(`/api/customers/${ca.body.data.id}`).set(auth(b.token)).send({ name: 'x' })).status).toBe(404);
  });

  it('rejects invalid phone and injected businessId', async () => {
    const a = await registerUser('custV');
    expect((await request(app).post('/api/customers').set(auth(a.token)).send({ phone: 'hello' })).status).toBe(400);
    expect((await request(app).post('/api/customers').set(auth(a.token)).send({ phone: '+50937001234', businessId: a.businessId })).status).toBe(400);
  });
});

describe('conversations and messages', () => {
  it('lists conversations with customer info and records messages', async () => {
    const { owner, conv } = await setup('inbox');
    const sent = await request(app).post('/api/messages').set(auth(owner.token)).send({ conversationId: conv.id, content: 'Bonjour !' });
    expect(sent.status).toBe(201);
    expect(sent.body.data).toMatchObject({ senderType: 'AGENT', direction: 'OUTBOUND', messageType: 'TEXT' });

    const list = await request(app).get('/api/conversations').set(auth(owner.token));
    expect(list.body.data[0]).toMatchObject({ id: conv.id, lastMessagePreview: 'Bonjour !', customer: { name: 'Jean' } });

    const msgs = await request(app).get(`/api/messages?conversationId=${conv.id}`).set(auth(owner.token));
    expect(msgs.body.data).toHaveLength(1);
  });

  it('human reply takes over an unassigned conversation and pauses the AI', async () => {
    const { owner, conv } = await setup('takeover');
    expect(conv.aiActive).toBe(true);
    await request(app).post('/api/messages').set(auth(owner.token)).send({ conversationId: conv.id, content: 'Je vous écoute' });
    const after = (await request(app).get(`/api/conversations/${conv.id}`).set(auth(owner.token))).body.data;
    expect(after.aiActive).toBe(false);
    expect(after.assignedToId).toEqual(expect.any(String));
  });

  it('assignment pauses AI, unassignment resumes it, assignee must be a member', async () => {
    const { owner, conv } = await setup('assign');
    const agent = await addAgent(owner, 'assign');
    const assigned = await request(app).patch(`/api/conversations/${conv.id}`).set(auth(owner.token)).send({ assignedToId: agent.uid });
    expect(assigned.body.data).toMatchObject({ assignedToId: agent.uid, aiActive: false });

    const back = await request(app).patch(`/api/conversations/${conv.id}`).set(auth(owner.token)).send({ assignedToId: null });
    expect(back.body.data).toMatchObject({ assignedToId: null, aiActive: true });

    const outsider = await registerUser('assign-outsider');
    const outsiderId = (await request(app).get('/api/auth/me').set(auth(outsider.token))).body.data.user.id;
    const bad = await request(app).patch(`/api/conversations/${conv.id}`).set(auth(owner.token)).send({ assignedToId: outsiderId });
    expect(bad.status).toBe(400);
  });

  it('an AGENT only sees assigned conversations, can reply and resolve, cannot reassign', async () => {
    const { owner, conv } = await setup('agent');
    const agent = await addAgent(owner, 'agent');
    expect((await request(app).get('/api/conversations').set(auth(agent.token))).body.data).toHaveLength(0);
    expect((await request(app).get(`/api/conversations/${conv.id}`).set(auth(agent.token))).status).toBe(404);
    expect((await request(app).post('/api/messages').set(auth(agent.token)).send({ conversationId: conv.id, content: 'x' })).status).toBe(404);

    await request(app).patch(`/api/conversations/${conv.id}`).set(auth(owner.token)).send({ assignedToId: agent.uid });
    expect((await request(app).get('/api/conversations').set(auth(agent.token))).body.data).toHaveLength(1);
    expect((await request(app).post('/api/messages').set(auth(agent.token)).send({ conversationId: conv.id, content: 'Bonjour' })).status).toBe(201);
    const resolved = await request(app).patch(`/api/conversations/${conv.id}`).set(auth(agent.token)).send({ status: 'RESOLVED' });
    expect(resolved.body.data.status).toBe('RESOLVED');
    expect((await request(app).patch(`/api/conversations/${conv.id}`).set(auth(agent.token)).send({ assignedToId: null })).status).toBe(403);
    expect((await request(app).post('/api/conversations').set(auth(agent.token)).send({ customerId: conv.customerId })).status).toBe(403);
  });

  it('isolates tenants for conversations and messages', async () => {
    const { owner, conv } = await setup('isoA');
    const other = await registerUser('isoB-owner');
    expect((await request(app).get('/api/conversations').set(auth(other.token))).body.data).toHaveLength(0);
    expect((await request(app).get(`/api/conversations/${conv.id}`).set(auth(other.token))).status).toBe(404);
    expect((await request(app).patch(`/api/conversations/${conv.id}`).set(auth(other.token)).send({ status: 'CLOSED' })).status).toBe(404);
    expect((await request(app).get(`/api/messages?conversationId=${conv.id}`).set(auth(other.token))).status).toBe(404);
    expect((await request(app).post('/api/messages').set(auth(other.token)).send({ conversationId: conv.id, content: 'hack' })).status).toBe(404);
    expect((await request(app).post('/api/conversations').set(auth(other.token)).send({ customerId: conv.customerId })).status).toBe(404);
    expect((await request(app).get(`/api/conversations/${conv.id}`).set(auth(owner.token))).status).toBe(200);
  });

  it('validates message input', async () => {
    const { owner, conv } = await setup('val');
    expect((await request(app).post('/api/messages').set(auth(owner.token)).send({ conversationId: conv.id, content: '   ' })).status).toBe(400);
    expect((await request(app).get('/api/messages').set(auth(owner.token))).status).toBe(400);
  });
});
