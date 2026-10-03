import request from 'supertest';
import { fakePrisma } from './fake-prisma';
import { app, registerUser } from './helpers';
import { signAccessToken } from '../src/lib/tokens';

jest.mock('../src/lib/prisma', () => ({ prisma: require('./fake-prisma').fakePrisma }));

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe.each([
  ['faqs', { question: 'À quelle heure est le check-in ?', answer: 'Le check-in commence à 15h00.' }, { answer: 'Dès 14h00.' }],
  ['services', { type: 'ROOM', name: 'Chambre double', price: 85.5, currency: 'USD', capacity: 2, amenities: ['Wi-Fi', 'Clim'] }, { available: false }],
])('/api/%s', (path, createBody, patchBody) => {
  it('requires authentication', async () => {
    expect((await request(app).get(`/api/${path}`)).status).toBe(401);
  });

  it('creates, lists, updates and deletes within the tenant', async () => {
    const a = await registerUser(`${path}-crud`);
    const created = await request(app).post(`/api/${path}`).set(auth(a.token)).send(createBody);
    expect(created.status).toBe(201);
    expect(created.body.data.businessId).toBe(a.businessId);
    const id = created.body.data.id;

    const list = await request(app).get(`/api/${path}`).set(auth(a.token));
    expect(list.body.data).toHaveLength(1);

    const patched = await request(app).patch(`/api/${path}/${id}`).set(auth(a.token)).send(patchBody);
    expect(patched.status).toBe(200);
    expect(patched.body.data).toMatchObject(patchBody);

    expect((await request(app).delete(`/api/${path}/${id}`).set(auth(a.token))).status).toBe(200);
    expect((await request(app).get(`/api/${path}`).set(auth(a.token))).body.data).toHaveLength(0);
  });

  it('isolates tenants: B cannot list, edit or delete A rows', async () => {
    const a = await registerUser(`${path}-isoA`);
    const b = await registerUser(`${path}-isoB`);
    const id = (await request(app).post(`/api/${path}`).set(auth(a.token)).send(createBody)).body.data.id;

    expect((await request(app).get(`/api/${path}`).set(auth(b.token))).body.data).toHaveLength(0);
    expect((await request(app).patch(`/api/${path}/${id}`).set(auth(b.token)).send(patchBody)).status).toBe(404);
    expect((await request(app).delete(`/api/${path}/${id}`).set(auth(b.token))).status).toBe(404);
    expect((await request(app).get(`/api/${path}`).set(auth(a.token))).body.data).toHaveLength(1);
  });

  it('rejects injected businessId and malformed ids', async () => {
    const a = await registerUser(`${path}-inj`);
    const b = await registerUser(`${path}-injB`);
    const res = await request(app).post(`/api/${path}`).set(auth(a.token)).send({ ...createBody, businessId: b.businessId });
    expect(res.status).toBe(400);
    expect((await request(app).patch(`/api/${path}/not-a-uuid`).set(auth(a.token)).send(patchBody)).status).toBe(404);
  });

  it('lets an AGENT read but not write', async () => {
    const owner = await registerUser(`${path}-roleO`);
    const agentUser = await registerUser(`${path}-roleA`);
    const uid = (await request(app).get('/api/auth/me').set(auth(agentUser.token))).body.data.user.id;
    await fakePrisma.businessMember.create({ data: { userId: uid, businessId: owner.businessId, role: 'AGENT' } });
    const token = signAccessToken({ sub: uid, bid: owner.businessId, role: 'AGENT' });
    expect((await request(app).get(`/api/${path}`).set(auth(token))).status).toBe(200);
    expect((await request(app).post(`/api/${path}`).set(auth(token)).send(createBody)).status).toBe(403);
  });
});

describe('validation', () => {
  it('rejects empty FAQ and negative price', async () => {
    const a = await registerUser('val');
    expect((await request(app).post('/api/faqs').set(auth(a.token)).send({ question: '', answer: 'x' })).status).toBe(400);
    expect((await request(app).post('/api/services').set(auth(a.token)).send({ name: 'x', price: -5 })).status).toBe(400);
  });
});

describe('business URL fields', () => {
  it('rejects non-http(s) schemes such as javascript:', async () => {
    const a = await registerUser('urlcheck');
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com']) {
      expect((await request(app).patch('/api/business').set(auth(a.token)).send({ website: bad })).status).toBe(400);
      expect((await request(app).patch('/api/business').set(auth(a.token)).send({ logo: bad })).status).toBe(400);
    }
    expect((await request(app).patch('/api/business').set(auth(a.token)).send({ website: 'https://example.com' })).status).toBe(200);
  });
});
