import request from 'supertest';
import { fakePrisma } from './fake-prisma';
import { app, registerUser } from './helpers';
import { signAccessToken } from '../src/lib/tokens';

jest.mock('../src/lib/prisma', () => ({ prisma: require('./fake-prisma').fakePrisma }));

describe('multi-tenancy and roles', () => {
  it("each business only sees and edits its own record", async () => {
    const a = await registerUser('tenantA');
    const b = await registerUser('tenantB');

    const getA = await request(app).get('/api/business').set('Authorization', `Bearer ${a.token}`);
    const getB = await request(app).get('/api/business').set('Authorization', `Bearer ${b.token}`);
    expect(getA.body.data.id).toBe(a.businessId);
    expect(getB.body.data.id).toBe(b.businessId);

    const patch = await request(app)
      .patch('/api/business')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ name: 'Hôtel A Renamed' });
    expect(patch.status).toBe(200);

    const afterB = await request(app).get('/api/business').set('Authorization', `Bearer ${b.token}`);
    expect(afterB.body.data.name).toBe('Business tenantB');
  });

  it('cannot target another tenant by injecting an id in the body', async () => {
    const a = await registerUser('injA');
    const b = await registerUser('injB');
    const res = await request(app)
      .patch('/api/business')
      .set('Authorization', `Bearer ${a.token}`)
      .send({ id: b.businessId, businessId: b.businessId, name: 'Hacked' });
    expect(res.status).toBe(400);
    const afterB = await request(app).get('/api/business').set('Authorization', `Bearer ${b.token}`);
    expect(afterB.body.data.name).toBe('Business injB');
  });

  it("a token claiming another tenant's business is rejected (no membership)", async () => {
    const a = await registerUser('claimA');
    const b = await registerUser('claimB');
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${a.token}`);
    const forged = signAccessToken({ sub: me.body.data.user.id, bid: b.businessId, role: 'OWNER' });
    const res = await request(app).get('/api/business').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('an AGENT can read but not modify the business', async () => {
    const owner = await registerUser('roleO');
    const agent = await registerUser('roleAgent');
    const agentUserId = (
      await request(app).get('/api/auth/me').set('Authorization', `Bearer ${agent.token}`)
    ).body.data.user.id;
    // Add the agent to the owner's business (team management arrives in a later phase).
    await fakePrisma.businessMember.create({
      data: { userId: agentUserId, businessId: owner.businessId, role: 'AGENT' },
    });
    const token = signAccessToken({ sub: agentUserId, bid: owner.businessId, role: 'AGENT' });

    expect((await request(app).get('/api/business').set('Authorization', `Bearer ${token}`)).status).toBe(200);
    const patch = await request(app).patch('/api/business').set('Authorization', `Bearer ${token}`).send({ name: 'x' });
    expect(patch.status).toBe(403);
    expect(patch.body.error.code).toBe('FORBIDDEN');
  });

  it('role changes in the database take effect before the token expires', async () => {
    const owner = await registerUser('demote');
    const member = fakePrisma.businessMember.rows.find((m: any) => m.businessId === owner.businessId);
    member.role = 'AGENT';
    const res = await request(app).patch('/api/business').set('Authorization', `Bearer ${owner.token}`).send({ name: 'y' });
    expect(res.status).toBe(403);
  });
});
