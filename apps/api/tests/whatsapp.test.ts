import crypto from 'crypto';
import request from 'supertest';
import { fakePrisma } from './fake-prisma';
import { app, registerUser } from './helpers';
import { signAccessToken } from '../src/lib/tokens';
import { decrypt } from '../src/lib/crypto';
import { CloudApiProvider, setProviderFactory, WhatsAppProvider } from '../src/integrations/whatsapp/provider';
import { setAutoResponder } from '../src/modules/automation/responder';

jest.mock('../src/lib/prisma', () => ({ prisma: require('./fake-prisma').fakePrisma }));

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const SECRET = 'app-secret-for-tests';
const sign = (body: string) => 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');

function post(payload: unknown, signature?: string) {
  const body = JSON.stringify(payload);
  return request(app)
    .post('/api/webhooks/whatsapp')
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', signature ?? sign(body))
    .send(body);
}

const inbound = (phoneNumberId: string, id: string, from: string, extra: Record<string, unknown> = { type: 'text', text: { body: 'Bonjour, avez-vous une chambre ?' } }) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp',
    metadata: { display_phone_number: '50937000000', phone_number_id: phoneNumberId },
    contacts: [{ profile: { name: 'Jean Baptiste' }, wa_id: from }],
    messages: [{ id, from, timestamp: '1700000000', ...extra }],
  } }] }],
});

let sent: { to: string; text: string }[] = [];
const fakeProvider = (fail = false): WhatsAppProvider => ({
  sendTextMessage: async (to, text) => {
    if (fail) throw new Error('(#131047) Re-engagement message');
    sent.push({ to, text });
    return { messageId: `wamid.OUT${sent.length}` };
  },
  sendTemplateMessage: async () => ({ messageId: 'x' }),
  sendImageMessage: async () => ({ messageId: 'x' }),
  sendDocumentMessage: async () => ({ messageId: 'x' }),
  markAsRead: async () => undefined,
});

async function connect(tag: string, phoneNumberId: string) {
  const owner = await registerUser(`wa-${tag}`);
  const res = await request(app).put('/api/whatsapp').set(auth(owner.token)).send({ phoneNumberId, accessToken: 'EAAG-secret-token-123456' });
  expect(res.status).toBe(200);
  return owner;
}

beforeEach(() => {
  sent = [];
  setProviderFactory(() => fakeProvider());
  setAutoResponder(null);
});

describe('webhook verification handshake', () => {
  it('echoes the challenge with the right token', async () => {
    const res = await request(app).get('/api/webhooks/whatsapp').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-token-for-tests', 'hub.challenge': '12345' });
    expect(res.status).toBe(200);
    expect(res.text).toBe('12345');
  });
  it('rejects a wrong token', async () => {
    const res = await request(app).get('/webhooks/whatsapp').query({ 'hub.mode': 'subscribe', 'hub.verify_token': 'nope', 'hub.challenge': '1' });
    expect(res.status).toBe(403);
  });
});

describe('POST webhook', () => {
  it('rejects missing or invalid signatures and stores nothing', async () => {
    const owner = await connect('sig', '100000001');
    const payload = inbound('100000001', 'wamid.SIG', '50937001111');
    expect((await post(payload, 'sha256=deadbeef')).status).toBe(401);
    expect((await request(app).post('/api/webhooks/whatsapp').send(payload)).status).toBe(401);
    expect((await request(app).get('/api/conversations').set(auth(owner.token))).body.data).toHaveLength(0);
  });

  it('stores customer, conversation and message from a valid inbound text', async () => {
    const owner = await connect('in', '100000002');
    const res = await post(inbound('100000002', 'wamid.IN1', '50937002222'));
    expect(res.status).toBe(200);

    const customers = (await request(app).get('/api/customers').set(auth(owner.token))).body.data;
    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({ phone: '+50937002222', name: 'Jean Baptiste' });

    const convs = (await request(app).get('/api/conversations').set(auth(owner.token))).body.data;
    expect(convs).toHaveLength(1);
    expect(convs[0]).toMatchObject({ channel: 'WHATSAPP', status: 'OPEN', aiActive: true, lastMessagePreview: 'Bonjour, avez-vous une chambre ?' });

    const msgs = (await request(app).get(`/api/messages?conversationId=${convs[0].id}`).set(auth(owner.token))).body.data;
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ senderType: 'CUSTOMER', direction: 'INBOUND', messageType: 'TEXT', externalId: 'wamid.IN1' });
  });

  it('ignores redelivered messages (idempotent) and groups them in the same conversation', async () => {
    const owner = await connect('dup', '100000003');
    await post(inbound('100000003', 'wamid.D1', '50937003333'));
    await post(inbound('100000003', 'wamid.D1', '50937003333'));
    await post(inbound('100000003', 'wamid.D2', '50937003333'));
    const convs = (await request(app).get('/api/conversations').set(auth(owner.token))).body.data;
    expect(convs).toHaveLength(1);
    expect((await request(app).get(`/api/messages?conversationId=${convs[0].id}`).set(auth(owner.token))).body.data).toHaveLength(2);
  });

  it('maps media and interactive messages', async () => {
    const owner = await connect('media', '100000004');
    await post(inbound('100000004', 'wamid.M1', '50937004444', { type: 'image', image: { id: 'MEDIA1', mime_type: 'image/jpeg', caption: 'Ma réservation' } }));
    await post(inbound('100000004', 'wamid.M2', '50937004444', { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'b1', title: 'Oui' } } }));
    await post(inbound('100000004', 'wamid.M3', '50937004444', { type: 'sticker', sticker: {} }));
    const convId = (await request(app).get('/api/conversations').set(auth(owner.token))).body.data[0].id;
    const msgs = (await request(app).get(`/api/messages?conversationId=${convId}`).set(auth(owner.token))).body.data;
    expect(msgs.map((m: any) => [m.messageType, m.content])).toEqual([['IMAGE', 'Ma réservation'], ['BUTTON', 'Oui'], ['TEXT', '[sticker]']]);
    expect(msgs[0].metadata.mediaId).toBe('MEDIA1');
  });

  it('acknowledges unknown numbers, status updates and junk without storing anything', async () => {
    expect((await post(inbound('999999999', 'wamid.U1', '50937005555'))).status).toBe(200);
    expect((await post({ entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '1' }, statuses: [{ id: 'x', status: 'read' }] } }] }] })).status).toBe(200);
    expect((await post({ hello: 'world' })).status).toBe(200);
    expect(fakePrisma.message.rows.some((m: any) => m.externalId === 'wamid.U1')).toBe(false);
  });

  it('routes by the receiving number: tenants never mix', async () => {
    const a = await connect('isoA', '100000005');
    const b = await connect('isoB', '100000006');
    await post(inbound('100000005', 'wamid.A1', '50937006666'));
    expect((await request(app).get('/api/conversations').set(auth(a.token))).body.data).toHaveLength(1);
    expect((await request(app).get('/api/conversations').set(auth(b.token))).body.data).toHaveLength(0);
  });

  it('does not process messages for a DISABLED integration', async () => {
    const owner = await connect('off', '100000007');
    await request(app).put('/api/whatsapp').set(auth(owner.token)).send({ phoneNumberId: '100000007', accessToken: 'EAAG-secret-token-123456', status: 'DISABLED' });
    await post(inbound('100000007', 'wamid.OFF', '50937007777'));
    expect((await request(app).get('/api/conversations').set(auth(owner.token))).body.data).toHaveLength(0);
  });
});

describe('auto-response decision', () => {
  it('replies through WhatsApp only while the AI is ACTIVE', async () => {
    const owner = await connect('ai', '100000008');
    setAutoResponder({ respond: async ({ text }) => `Echo: ${text}` });

    await post(inbound('100000008', 'wamid.AI1', '50937008888'));
    expect(sent).toEqual([{ to: '+50937008888', text: 'Echo: Bonjour, avez-vous une chambre ?' }]);

    const conv = (await request(app).get('/api/conversations').set(auth(owner.token))).body.data[0];
    const msgs = (await request(app).get(`/api/messages?conversationId=${conv.id}`).set(auth(owner.token))).body.data;
    expect(msgs[1]).toMatchObject({ senderType: 'AI', direction: 'OUTBOUND', metadata: { delivery: 'sent' } });

    // A human takes over: AI paused, no more automatic replies.
    await request(app).patch(`/api/conversations/${conv.id}`).set(auth(owner.token)).send({ assignedToId: (await request(app).get('/api/auth/me').set(auth(owner.token))).body.data.user.id });
    await post(inbound('100000008', 'wamid.AI2', '50937008888', { type: 'text', text: { body: 'Allô ?' } }));
    expect(sent).toHaveLength(1);
  });

  it('records a failed AI delivery without crashing the webhook', async () => {
    const owner = await connect('aifail', '100000009');
    setProviderFactory(() => fakeProvider(true));
    setAutoResponder({ respond: async () => 'Bonjour' });
    expect((await post(inbound('100000009', 'wamid.F1', '50937009999'))).status).toBe(200);
    const out = fakePrisma.message.rows.find((m: any) => m.senderType === 'AI' && m.businessId === owner.businessId);
    expect(out.metadata.delivery).toBe('failed');
  });
});

describe('outbound agent messages', () => {
  it('sends via the provider and records the wamid', async () => {
    const owner = await connect('out', '100000010');
    await post(inbound('100000010', 'wamid.O1', '50937010000'));
    const conv = (await request(app).get('/api/conversations').set(auth(owner.token))).body.data[0];
    const res = await request(app).post('/api/messages').set(auth(owner.token)).send({ conversationId: conv.id, content: 'Oui, nous avons une chambre.' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ externalId: 'wamid.OUT1', metadata: { delivery: 'sent' } });
    expect(sent[0]).toEqual({ to: '+50937010000', text: 'Oui, nous avons une chambre.' });
  });

  it('keeps the message and flags the failure when WhatsApp rejects it', async () => {
    const owner = await connect('outfail', '100000011');
    await post(inbound('100000011', 'wamid.O2', '50937011111'));
    setProviderFactory(() => fakeProvider(true));
    const conv = (await request(app).get('/api/conversations').set(auth(owner.token))).body.data[0];
    const res = await request(app).post('/api/messages').set(auth(owner.token)).send({ conversationId: conv.id, content: 'Bonjour' });
    expect(res.status).toBe(201);
    expect(res.body.data.metadata).toMatchObject({ delivery: 'failed' });
  });
});

describe('integration settings API', () => {
  it('never returns the token and stores it encrypted', async () => {
    const owner = await connect('enc', '100000012');
    const get = await request(app).get('/api/whatsapp').set(auth(owner.token));
    expect(get.body.data.connected).toBe(true);
    expect(JSON.stringify(get.body)).not.toContain('EAAG-secret');
    const row = fakePrisma.whatsAppIntegration.rows.find((r: any) => r.phoneNumberId === '100000012');
    expect(row.accessTokenEnc).not.toContain('EAAG');
    expect(decrypt(row.accessTokenEnc)).toBe('EAAG-secret-token-123456');
  });

  it('prevents claiming a number already used by another business', async () => {
    await connect('claimA', '100000013');
    const other = await registerUser('wa-claimB');
    const res = await request(app).put('/api/whatsapp').set(auth(other.token)).send({ phoneNumberId: '100000013', accessToken: 'EAAG-another-token-1' });
    expect(res.status).toBe(409);
  });

  it('is OWNER-only for changes and hidden from AGENTs', async () => {
    const owner = await connect('role', '100000014');
    const u = await registerUser('wa-role-agent');
    const uid = (await request(app).get('/api/auth/me').set(auth(u.token))).body.data.user.id;
    await fakePrisma.businessMember.create({ data: { userId: uid, businessId: owner.businessId, role: 'AGENT' } });
    const agent = signAccessToken({ sub: uid, bid: owner.businessId, role: 'AGENT' });
    expect((await request(app).get('/api/whatsapp').set(auth(agent))).status).toBe(403);
    expect((await request(app).put('/api/whatsapp').set(auth(agent)).send({ phoneNumberId: '100000099', accessToken: 'EAAG-whatever-12345' })).status).toBe(403);
    expect((await request(app).delete('/api/whatsapp').set(auth(agent))).status).toBe(403);
  });

  it('disconnects', async () => {
    const owner = await connect('del', '100000015');
    await request(app).delete('/api/whatsapp').set(auth(owner.token));
    expect((await request(app).get('/api/whatsapp').set(auth(owner.token))).body.data.connected).toBe(false);
  });
});

describe('CloudApiProvider request shape', () => {
  it('calls the official Graph API with a bearer token and parses the message id', async () => {
    const calls: any[] = [];
    const orig = global.fetch;
    global.fetch = (async (url: string, init: any) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.X' }] }), { status: 200 });
    }) as any;
    try {
      const p = new CloudApiProvider({ phoneNumberId: '555', accessToken: 'TOKEN' });
      expect(await p.sendTextMessage('+50937001234', 'Salut')).toEqual({ messageId: 'wamid.X' });
      expect(calls[0].url).toBe('https://graph.facebook.com/v21.0/555/messages');
      expect(calls[0].init.headers.Authorization).toBe('Bearer TOKEN');
      expect(JSON.parse(calls[0].init.body)).toMatchObject({ messaging_product: 'whatsapp', to: '50937001234', type: 'text', text: { body: 'Salut' } });
    } finally {
      global.fetch = orig;
    }
  });

  it('surfaces API errors without leaking the token', async () => {
    const orig = global.fetch;
    global.fetch = (async () => new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token' } }), { status: 401 })) as any;
    try {
      const err = await new CloudApiProvider({ phoneNumberId: '555', accessToken: 'TOKEN' }).sendTextMessage('+50937001234', 'x').catch((e) => e);
      expect(err.message).toBe('Invalid OAuth access token');
      expect(err.message).not.toContain('TOKEN');
    } finally {
      global.fetch = orig;
    }
  });
});
