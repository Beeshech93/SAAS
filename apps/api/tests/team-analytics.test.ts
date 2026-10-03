import request from 'supertest';
import { fakePrisma } from './fake-prisma';
import { app, registerUser } from './helpers';
import { firstResponseStats } from '../src/modules/analytics/analytics.routes';

jest.mock('../src/lib/prisma', () => ({ prisma: require('./fake-prisma').fakePrisma }));

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const tokenOf = (link: string) => new URL(link).searchParams.get('token')!;

async function invite(owner: { token: string }, email: string, role: 'ADMIN' | 'AGENT' = 'AGENT') {
  const res = await request(app).post('/api/team/invitations').set(auth(owner.token)).send({ email, role });
  return res;
}
async function join(owner: { token: string }, email: string, role: 'ADMIN' | 'AGENT' = 'AGENT') {
  const inv = await invite(owner, email, role);
  const acc = await request(app).post('/api/auth/accept-invite').send({ token: tokenOf(inv.body.data.link), name: 'New Person', password: 'Str0ngPassw0rd!' });
  return { acc, token: acc.body.data?.accessToken as string, userId: acc.body.data?.user?.id as string };
}

describe('team invitations', () => {
  it('owner invites, invitee accepts and becomes a member with the chosen role', async () => {
    const owner = await registerUser('team1');
    const inv = await invite(owner, 'Agent1@Example.com');
    expect(inv.status).toBe(201);
    expect(inv.body.data.link).toContain('/accept-invite?token=');
    expect(inv.body.data.invitation.email).toBe('agent1@example.com');
    expect(JSON.stringify(fakePrisma.invitation.rows)).not.toContain(tokenOf(inv.body.data.link)); // only the hash is stored

    const info = await request(app).post('/api/auth/invite-info').send({ token: tokenOf(inv.body.data.link) });
    expect(info.body.data).toMatchObject({ email: 'agent1@example.com', role: 'AGENT', businessName: 'Business team1' });

    const acc = await request(app).post('/api/auth/accept-invite').send({ token: tokenOf(inv.body.data.link), name: 'Agent One', password: 'Str0ngPassw0rd!' });
    expect(acc.status).toBe(201);
    expect(acc.body.data).toMatchObject({ role: 'AGENT', business: { id: owner.businessId } });
    expect(acc.headers['set-cookie']).toBeDefined();

    // Can log in normally and lands in the inviting business.
    const login = await request(app).post('/api/auth/login').send({ email: 'agent1@example.com', password: 'Str0ngPassw0rd!' });
    expect(login.body.data.business.id).toBe(owner.businessId);

    const team = await request(app).get('/api/team').set(auth(owner.token));
    expect(team.body.data.map((m: any) => m.role).sort()).toEqual(['AGENT', 'OWNER']);
  });

  it('an invitation works once and rejects bad or expired tokens', async () => {
    const owner = await registerUser('team2');
    const inv = await invite(owner, 'once@example.com');
    const token = tokenOf(inv.body.data.link);
    const body = { token, name: 'X', password: 'Str0ngPassw0rd!' };
    expect((await request(app).post('/api/auth/accept-invite').send(body)).status).toBe(201);
    expect((await request(app).post('/api/auth/accept-invite').send(body)).status).toBe(404);
    expect((await request(app).post('/api/auth/accept-invite').send({ ...body, token: 'x'.repeat(40) })).status).toBe(404);

    const inv2 = await invite(owner, 'late@example.com');
    fakePrisma.invitation.rows.find((i: any) => i.email === 'late@example.com').expiresAt = new Date(Date.now() - 1000);
    expect((await request(app).post('/api/auth/accept-invite').send({ ...body, token: tokenOf(inv2.body.data.link) })).status).toBe(404);
  });

  it('refuses to invite an e-mail that already has an account; re-inviting replaces the old link', async () => {
    const owner = await registerUser('team3');
    const other = await registerUser('team3-other');
    expect((await invite(owner, 'userteam3-other@example.com')).status).toBe(409);
    const first = await invite(owner, 'again@example.com');
    const second = await invite(owner, 'again@example.com');
    const body = { name: 'X', password: 'Str0ngPassw0rd!' };
    expect((await request(app).post('/api/auth/accept-invite').send({ ...body, token: tokenOf(first.body.data.link) })).status).toBe(404);
    expect((await request(app).post('/api/auth/accept-invite').send({ ...body, token: tokenOf(second.body.data.link) })).status).toBe(201);
    expect(other.res.status).toBe(201);
  });

  it('only the OWNER can invite, change roles or remove; agents cannot even list the team', async () => {
    const owner = await registerUser('team4');
    const admin = await join(owner, 'admin4@example.com', 'ADMIN');
    const agent = await join(owner, 'agent4@example.com', 'AGENT');
    expect((await request(app).get('/api/team').set(auth(admin.token))).status).toBe(200);
    expect((await request(app).get('/api/team').set(auth(agent.token))).status).toBe(403);
    expect((await invite({ token: admin.token }, 'x@example.com')).status).toBe(403);
    expect((await request(app).patch(`/api/team/${agent.userId}`).set(auth(admin.token)).send({ role: 'ADMIN' })).status).toBe(403);
    expect((await request(app).delete(`/api/team/${agent.userId}`).set(auth(admin.token))).status).toBe(403);
  });

  it('role change applies immediately; the owner is protected', async () => {
    const owner = await registerUser('team5');
    const agent = await join(owner, 'agent5@example.com');
    expect((await request(app).get('/api/team').set(auth(agent.token))).status).toBe(403);
    expect((await request(app).patch(`/api/team/${agent.userId}`).set(auth(owner.token)).send({ role: 'ADMIN' })).status).toBe(200);
    expect((await request(app).get('/api/team').set(auth(agent.token))).status).toBe(200);

    const ownerId = (await request(app).get('/api/auth/me').set(auth(owner.token))).body.data.user.id;
    expect((await request(app).patch(`/api/team/${ownerId}`).set(auth(owner.token)).send({ role: 'AGENT' })).status).toBe(403);
    expect((await request(app).delete(`/api/team/${ownerId}`).set(auth(owner.token))).status).toBe(403);
    expect((await request(app).patch(`/api/team/${agent.userId}`).set(auth(owner.token)).send({ role: 'OWNER' })).status).toBe(400);
  });

  it('removing a member cuts access at once and returns their conversations to the pool', async () => {
    const owner = await registerUser('team6');
    const agent = await join(owner, 'agent6@example.com');
    const customer = (await request(app).post('/api/customers').set(auth(owner.token)).send({ phone: '+50937661234' })).body.data;
    const conv = (await request(app).post('/api/conversations').set(auth(owner.token)).send({ customerId: customer.id })).body.data;
    await request(app).patch(`/api/conversations/${conv.id}`).set(auth(owner.token)).send({ assignedToId: agent.userId });
    expect((await request(app).get('/api/conversations').set(auth(agent.token))).body.data).toHaveLength(1);

    expect((await request(app).delete(`/api/team/${agent.userId}`).set(auth(owner.token))).status).toBe(200);
    expect((await request(app).get('/api/conversations').set(auth(agent.token))).status).toBe(401);
    const after = (await request(app).get(`/api/conversations/${conv.id}`).set(auth(owner.token))).body.data;
    expect(after).toMatchObject({ assignedToId: null, aiActive: true });
  });

  it('isolates teams: another owner cannot see or modify my members or invitations', async () => {
    const a = await registerUser('team7a');
    const b = await registerUser('team7b');
    const agent = await join(a, 'agent7@example.com');
    const inv = await invite(a, 'pending7@example.com');
    expect((await request(app).get('/api/team').set(auth(b.token))).body.data).toHaveLength(1);
    expect((await request(app).patch(`/api/team/${agent.userId}`).set(auth(b.token)).send({ role: 'ADMIN' })).status).toBe(404);
    expect((await request(app).delete(`/api/team/${agent.userId}`).set(auth(b.token))).status).toBe(404);
    expect((await request(app).delete(`/api/team/invitations/${inv.body.data.invitation.id}`).set(auth(b.token))).status).toBe(404);
    expect((await request(app).get('/api/team/invitations').set(auth(b.token))).body.data).toHaveLength(0);
    expect((await request(app).get('/api/team/invitations').set(auth(a.token))).body.data).toHaveLength(1);
  });

  it('owner can revoke a pending invitation', async () => {
    const owner = await registerUser('team8');
    const inv = await invite(owner, 'revoke@example.com');
    expect((await request(app).delete(`/api/team/invitations/${inv.body.data.invitation.id}`).set(auth(owner.token))).status).toBe(200);
    expect((await request(app).post('/api/auth/accept-invite').send({ token: tokenOf(inv.body.data.link), name: 'X', password: 'Str0ngPassw0rd!' })).status).toBe(404);
  });
});

describe('analytics', () => {
  const t = (s: number) => new Date(1_700_000_000_000 + s * 1000);
  it('first-response stats split AI vs agent and ignore system notes', () => {
    const msgs = [
      { conversationId: 'a', direction: 'INBOUND', senderType: 'CUSTOMER', createdAt: t(0) },
      { conversationId: 'a', direction: 'OUTBOUND', senderType: 'SYSTEM', createdAt: t(1) },
      { conversationId: 'a', direction: 'OUTBOUND', senderType: 'AI', createdAt: t(4) },
      { conversationId: 'b', direction: 'INBOUND', senderType: 'CUSTOMER', createdAt: t(100) },
      { conversationId: 'b', direction: 'OUTBOUND', senderType: 'AGENT', createdAt: t(160) },
      { conversationId: 'c', direction: 'INBOUND', senderType: 'CUSTOMER', createdAt: t(200) }, // unanswered
    ];
    expect(firstResponseStats(msgs)).toEqual({ averageSeconds: 32, aiAverageSeconds: 4, agentAverageSeconds: 60, sampleSize: 2 });
    expect(firstResponseStats([])).toMatchObject({ averageSeconds: null, sampleSize: 0 });
  });

  it('counts conversations, customers and messages for the business only', async () => {
    const a = await registerUser('an-a');
    const b = await registerUser('an-b');
    const cust = (await request(app).post('/api/customers').set(auth(a.token)).send({ phone: '+50937771234' })).body.data;
    const conv = (await request(app).post('/api/conversations').set(auth(a.token)).send({ customerId: cust.id })).body.data;
    await fakePrisma.message.create({ data: { businessId: a.businessId, conversationId: conv.id, senderType: 'CUSTOMER', direction: 'INBOUND', content: 'Salut' } });
    await fakePrisma.message.create({ data: { businessId: a.businessId, conversationId: conv.id, senderType: 'AI', direction: 'OUTBOUND', content: 'Bonjour' } });
    await fakePrisma.message.create({ data: { businessId: a.businessId, conversationId: conv.id, senderType: 'SYSTEM', direction: 'OUTBOUND', content: 'note' } });
    await request(app).patch(`/api/conversations/${conv.id}`).set(auth(a.token)).send({ status: 'RESOLVED' });

    const res = await request(app).get('/api/analytics').set(auth(a.token));
    expect(res.status).toBe(200);
    expect(res.body.data.conversations).toEqual({ total: 1, open: 0, pending: 0, resolved: 1, closed: 0 });
    expect(res.body.data.customers).toBe(1);
    expect(res.body.data.messages).toEqual({ total: 2, inbound: 1, outbound: 1, byAI: 1, byAgent: 0 });
    expect(res.body.data.firstResponse.sampleSize).toBe(1);
    expect(res.body.data.daily).toHaveLength(7);
    expect(res.body.data.daily[6]).toMatchObject({ inbound: 1, outbound: 1 });

    const other = await request(app).get('/api/analytics').set(auth(b.token));
    expect(other.body.data.conversations.total).toBe(0);
    expect(other.body.data.messages.total).toBe(0);
  });

  it('is forbidden to agents and unauthenticated users', async () => {
    const owner = await registerUser('an-role');
    const agent = await join(owner, 'agent-an@example.com');
    expect((await request(app).get('/api/analytics').set(auth(agent.token))).status).toBe(403);
    expect((await request(app).get('/api/analytics')).status).toBe(401);
  });
});
