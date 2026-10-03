import request from 'supertest';
import { fakePrisma } from './fake-prisma';
import { app, registerUser } from './helpers';
import { signAccessToken } from '../src/lib/tokens';

jest.mock('../src/lib/prisma', () => ({ prisma: require('./fake-prisma').fakePrisma }));
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('onboarding completion', () => {
  it('a new business is not onboarded; the owner completes it once (idempotent)', async () => {
    const owner = await registerUser('onb1');
    expect((await request(app).get('/api/business').set(auth(owner.token))).body.data.onboardedAt).toBeNull();

    const first = await request(app).post('/api/business/onboarding/complete').set(auth(owner.token));
    expect(first.status).toBe(200);
    const stamp = first.body.data.onboardedAt;
    expect(stamp).toBeTruthy();
    const again = await request(app).post('/api/business/onboarding/complete').set(auth(owner.token));
    expect(new Date(again.body.data.onboardedAt).getTime()).toBe(new Date(stamp).getTime());

    const me = await request(app).get('/api/auth/me').set(auth(owner.token));
    expect(me.body.data.business.onboardedAt).toBeTruthy();
  });

  it('only completes the caller\'s own business and requires OWNER', async () => {
    const a = await registerUser('onb2a');
    const b = await registerUser('onb2b');
    await request(app).post('/api/business/onboarding/complete').set(auth(a.token));
    expect((await request(app).get('/api/business').set(auth(b.token))).body.data.onboardedAt).toBeNull();

    const u = await registerUser('onb2-agent');
    const uid = (await request(app).get('/api/auth/me').set(auth(u.token))).body.data.user.id;
    await fakePrisma.businessMember.create({ data: { userId: uid, businessId: b.businessId, role: 'ADMIN' } });
    const admin = signAccessToken({ sub: uid, bid: b.businessId, role: 'ADMIN' });
    expect((await request(app).post('/api/business/onboarding/complete').set(auth(admin))).status).toBe(403);
    expect((await request(app).post('/api/business/onboarding/complete')).status).toBe(401);
  });

  it('onboardedAt cannot be set through PATCH /api/business', async () => {
    const owner = await registerUser('onb3');
    const res = await request(app).patch('/api/business').set(auth(owner.token)).send({ onboardedAt: new Date().toISOString() });
    expect(res.status).toBe(400);
  });
});
