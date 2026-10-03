import request from 'supertest';
import { app, registerUser } from './helpers';
import { fakePrisma } from './fake-prisma';
import { decrypt } from '../src/lib/crypto';
import { EvolutionApiProvider, setProviderFactory } from '../src/integrations/whatsapp/provider';
import { setAutoResponder } from '../src/modules/automation/responder';
import { assertSafeServerUrl } from '../src/lib/url-guard';

jest.mock('../src/lib/prisma', () => ({ prisma: require('./fake-prisma').fakePrisma }));

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const BASE = 'https://evo.example.com';

let calls: { url: string; method: string; body: any; apikey: string }[] = [];
const realFetch = global.fetch;
let sessionState = 'open';
function mockEvolution(overrides: { state?: number } = {}) {
  sessionState = 'open';
  global.fetch = jest.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined, apikey: init?.headers?.apikey });
    if (String(url).includes('/instance/connectionState')) return new Response(JSON.stringify({ instance: { state: sessionState } }), { status: overrides.state ?? 200 });
    if (String(url).includes('/instance/create')) return new Response(JSON.stringify({ instance: { instanceName: 'x' }, hash: 'instance-own-key-999' }), { status: 201 });
    if (String(url).includes('/instance/connect/')) return new Response(JSON.stringify({ base64: 'data:image/png;base64,QRDATA', pairingCode: 'ABCD-1234', count: 1 }), { status: 200 });
    if (String(url).includes('/webhook/set')) return new Response('{}', { status: 201 });
    return new Response(JSON.stringify({ key: { id: 'EVO-OUT-1' } }), { status: 201 });
  }) as any;
}

beforeEach(() => {
  calls = [];
  setProviderFactory((c) => new EvolutionApiProvider({ baseUrl: c.baseUrl!, instanceName: c.instanceName!, apiKey: c.accessToken }));
  setAutoResponder(null);
  mockEvolution();
});
afterAll(() => {
  global.fetch = realFetch;
});

async function connect(tag: string, instanceName = 'shop') {
  const owner = await registerUser(`evo-${tag}`);
  const res = await request(app).put('/api/whatsapp').set(auth(owner.token)).send({ provider: 'EVOLUTION', baseUrl: BASE, instanceName, apiKey: 'evo-key-123456' });
  return { owner, res };
}

const upsert = (over: Record<string, unknown> = {}) => ({
  event: 'messages.upsert',
  instance: 'shop',
  data: { key: { remoteJid: '50937001111@s.whatsapp.net', fromMe: false, id: 'EVO-IN-1' }, pushName: 'Jean', message: { conversation: 'Bonjour' }, messageType: 'conversation', ...over },
});

describe('connect Evolution', () => {
  it('saves encrypted, checks the instance and registers the webhook', async () => {
    const { res } = await connect('ok');
    expect(res.status).toBe(200);
    expect(res.body.data.integration).toMatchObject({ provider: 'EVOLUTION', baseUrl: BASE, instanceName: 'shop' });
    expect(res.body.data.connectionState).toBe('open');
    expect(res.body.data.webhookRegistered).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('evo-key-123456');
    const row = fakePrisma.whatsAppIntegration.rows.find((r: any) => r.instanceName === 'shop')!;
    expect(row.accessTokenEnc).not.toContain('evo-key');
    expect(decrypt(row.accessTokenEnc)).toBe('evo-key-123456');
    const hook = calls.find((c) => c.url.includes('/webhook/set/shop'))!;
    expect(hook.apikey).toBe('evo-key-123456');
    expect(hook.body.webhook.url).toBe(res.body.data.webhookUrl);
    expect(res.body.data.webhookUrl).toContain(`/api/webhooks/evolution/${row.id}/${row.webhookSecret}`);
  });
  it('rejects private URLs in production-like checks and refuses another business taking the same instance', async () => {
    const { res } = await connect('dup', 'same');
    expect(res.status).toBe(200);
    const other = await registerUser('evo-dup2');
    const r2 = await request(app).put('/api/whatsapp').set(auth(other.token)).send({ provider: 'EVOLUTION', baseUrl: BASE, instanceName: 'same', apiKey: 'another-key-1' });
    expect(r2.status).toBe(409);
  });
  it('reports when Evolution does not answer correctly', async () => {
    mockEvolution({ state: 401 });
    const { res } = await connect('bad', 'badinst');
    expect(res.status).toBe(502);
  });
});

describe('url guard', () => {
  it('normalizes and rejects credentials / non-http(s)', () => {
    expect(assertSafeServerUrl('https://evo.example.com/')).toBe('https://evo.example.com');
    expect(() => assertSafeServerUrl('https://u:p@evo.example.com')).toThrow();
    expect(() => assertSafeServerUrl('ftp://evo.example.com')).toThrow();
  });
});

describe('Evolution webhook', () => {
  async function setup(tag: string) {
    const { owner, res } = await connect(tag, `inst-${tag}`);
    const path = new URL(res.body.data.webhookUrl).pathname;
    return { owner, path };
  }
  it('rejects a wrong secret and stores nothing', async () => {
    const { owner, path } = await setup('sec');
    const bad = path.replace(/[^/]+$/, 'wrong-secret');
    expect((await request(app).post(bad).send(upsert())).status).toBe(401);
    expect((await request(app).get('/api/conversations').set(auth(owner.token))).body.data).toHaveLength(0);
  });
  it('stores an inbound text, deduplicates, and ignores own/group messages', async () => {
    const { owner, path } = await setup('in');
    expect((await request(app).post(path).send(upsert())).status).toBe(200);
    await request(app).post(path).send(upsert()); // retry
    await request(app).post(path).send(upsert({ key: { remoteJid: '50937001111@s.whatsapp.net', fromMe: true, id: 'EVO-OWN' } }));
    await request(app).post(path).send(upsert({ key: { remoteJid: '1203@g.us', fromMe: false, id: 'EVO-GRP' } }));
    const list = (await request(app).get('/api/conversations').set(auth(owner.token))).body.data;
    expect(list).toHaveLength(1);
    const msgs = (await request(app).get(`/api/messages?conversationId=${list[0].id}`).set(auth(owner.token))).body.data;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].content).toBe('Bonjour');
  });
  it('replies through Evolution when the AI is active', async () => {
    const { path } = await setup('ai');
    setAutoResponder({ respond: async () => 'Oui, nous avons une chambre.' } as any);
    await request(app).post(path).send(upsert({ key: { remoteJid: '50937002222@s.whatsapp.net', fromMe: false, id: 'EVO-AI-1' } }));
    const send = calls.find((c) => c.url.includes('/message/sendText/inst-ai'))!;
    expect(send.body).toEqual({ number: '50937002222', text: 'Oui, nous avons une chambre.' });
    expect(send.apikey).toBe('evo-key-123456');
  });
});

describe('QR code connection', () => {
  it('creates the instance with the global key and stores only the instance key', async () => {
    const owner = await registerUser('evo-create');
    const res = await request(app).put('/api/whatsapp').set(auth(owner.token)).send({ provider: 'EVOLUTION', baseUrl: BASE, instanceName: 'fresh', apiKey: 'global-admin-key-1', createInstance: true });
    expect(res.status).toBe(200);
    const create = calls.find((c) => c.url.endsWith('/instance/create'))!;
    expect(create.apikey).toBe('global-admin-key-1');
    expect(create.body).toMatchObject({ instanceName: 'fresh', qrcode: true });
    const row = fakePrisma.whatsAppIntegration.rows.find((r: any) => r.instanceName === 'fresh')!;
    expect(decrypt(row.accessTokenEnc)).toBe('instance-own-key-999');
    expect(calls.find((c) => c.url.includes('/webhook/set/fresh'))!.apikey).toBe('instance-own-key-999');
    expect(JSON.stringify(res.body)).not.toContain('global-admin-key');
  });
  it('returns the QR (no-store) while disconnected, nothing once connected', async () => {
    const { owner } = await connect('qr', 'qrinst');
    sessionState = 'connecting';
    const qr = await request(app).post('/api/whatsapp/qr').set(auth(owner.token));
    expect(qr.status).toBe(200);
    expect(qr.body.data).toEqual({ state: 'connecting', qr: 'data:image/png;base64,QRDATA', pairingCode: 'ABCD-1234' });
    expect(qr.headers['cache-control']).toBe('no-store');
    expect((await request(app).get('/api/whatsapp/status').set(auth(owner.token))).body.data.state).toBe('connecting');
    sessionState = 'open';
    expect((await request(app).post('/api/whatsapp/qr').set(auth(owner.token))).body.data).toEqual({ state: 'open', qr: null, pairingCode: null });
  });
  it('needs a login and an Evolution connection', async () => {
    expect((await request(app).post('/api/whatsapp/qr')).status).toBe(401);
    const owner = await registerUser('evo-none');
    expect((await request(app).post('/api/whatsapp/qr').set(auth(owner.token))).status).toBe(409);
  });
});
