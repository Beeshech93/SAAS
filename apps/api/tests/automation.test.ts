import request from 'supertest';
import { app, registerUser } from './helpers';
import { fakePrisma } from './fake-prisma';
import { EvolutionApiProvider, setProviderFactory } from '../src/integrations/whatsapp/provider';
import { setAutoResponder } from '../src/modules/automation/responder';
import { inWindow, localMinutes, normalize, optOutIntent, pickRule, renderTemplate } from '../src/modules/automation/rules.service';

jest.mock('../src/lib/prisma', () => ({ prisma: require('./fake-prisma').fakePrisma }));

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const rule = (o: Record<string, unknown>) => ({ id: String(Math.random()), trigger: 'KEYWORD', keywords: [], activeFrom: null, activeTo: null, priority: 0, active: true, ...o }) as any;
const ctx = (o: Record<string, unknown> = {}) => ({ text: 'bonjour', isFirstMessage: false, now: new Date('2026-10-03T15:00:00Z'), timezone: 'UTC', ...o }) as any;

describe('rules engine (pure)', () => {
  it('normalizes accents and case', () => expect(normalize('  Réservation  ?')).toBe('reservation ?'));
  it('handles windows, including wrapping midnight', () => {
    expect(inWindow('08:00', '17:00', 12 * 60)).toBe(true);
    expect(inWindow('08:00', '17:00', 17 * 60)).toBe(false);
    expect(inWindow('18:00', '07:00', 23 * 60)).toBe(true);
    expect(inWindow('18:00', '07:00', 3 * 60)).toBe(true);
    expect(inWindow('18:00', '07:00', 12 * 60)).toBe(false);
  });
  it('computes local time in the business timezone', () => {
    expect(localMinutes(new Date('2026-10-03T15:00:00Z'), 'America/Port-au-Prince')).toBe(11 * 60); // UTC-4 in October
    expect(localMinutes(new Date('2026-10-03T15:00:00Z'), 'Not/AZone')).toBe(15 * 60);
  });
  it('matches whole keywords only, ignoring accents', () => {
    const r = rule({ keywords: ['horaire', 'prix'] });
    expect(pickRule([r], ctx({ text: 'Quels sont vos HORAIRES ?' }))).toBeNull(); // "horaires" is not "horaire"
    expect(pickRule([r], ctx({ text: 'Quel est le prix?' }))).toBe(r);
    expect(pickRule([rule({ keywords: ['réservation'] })], ctx({ text: 'une reservation svp' }))).not.toBeNull();
  });
  it('prefers keyword over away over welcome, then priority', () => {
    const kw = rule({ keywords: ['bonjour'] });
    const away = rule({ trigger: 'AWAY', activeFrom: '00:00', activeTo: '23:59' });
    const welcome = rule({ trigger: 'WELCOME' });
    expect(pickRule([welcome, away, kw], ctx({ isFirstMessage: true }))).toBe(kw);
    expect(pickRule([welcome, away], ctx({ isFirstMessage: true }))).toBe(away);
    expect(pickRule([welcome], ctx({ isFirstMessage: true }))).toBe(welcome);
    expect(pickRule([welcome], ctx({ isFirstMessage: false }))).toBeNull();
    const hi = rule({ keywords: ['bonjour'], priority: 5 });
    expect(pickRule([kw, hi], ctx())).toBe(hi);
  });
  it('does not repeat an away rule that was just sent, and ignores inactive rules', () => {
    const away = rule({ trigger: 'AWAY', activeFrom: '00:00', activeTo: '23:59' });
    expect(pickRule([away], ctx({ recentRuleIds: new Set([away.id]) }))).toBeNull();
    expect(pickRule([rule({ keywords: ['bonjour'], active: false })], ctx())).toBeNull();
  });
  it('renders {{name}} with the first name and tidies spacing', () => {
    expect(renderTemplate('Bonjour {{name}} !', 'Jean Baptiste')).toBe('Bonjour Jean !');
    expect(renderTemplate('Bonjour {{name}} !', null)).toBe('Bonjour !');
    expect(renderTemplate('Bonjour {{name}}, merci', '')).toBe('Bonjour, merci');
  });
  it('detects exact STOP/START only', () => {
    expect(optOutIntent(' STOP. ')).toBe('STOP');
    expect(optOutIntent('Arrêt')).toBe('STOP');
    expect(optOutIntent('START')).toBe('START');
    expect(optOutIntent('please stop calling me')).toBeNull();
  });
});

describe('auto-reply rules API', () => {
  it('validates per trigger and enforces tenancy', async () => {
    const a = await registerUser('ar-a');
    const b = await registerUser('ar-b');
    const post = (body: object, tok = a.token) => request(app).post('/api/auto-replies').set(auth(tok)).send(body);
    expect((await post({ name: 'x', trigger: 'KEYWORD', reply: 'hi' })).status).toBe(400); // keywords needed
    expect((await post({ name: 'x', trigger: 'AWAY', reply: 'hi' })).status).toBe(400); // hours needed
    expect((await post({ name: 'x', trigger: 'AWAY', reply: 'hi', activeFrom: '18:00', activeTo: '18:00' })).status).toBe(400);
    const ok = await post({ name: 'Horaires', trigger: 'KEYWORD', keywords: ['horaire'], reply: 'Nous ouvrons à 8h.' });
    expect(ok.status).toBe(201);
    const id = ok.body.data.id;
    expect((await request(app).patch(`/api/auto-replies/${id}`).set(auth(b.token)).send({ active: false })).status).toBe(404);
    expect((await request(app).patch(`/api/auto-replies/${id}`).set(auth(a.token)).send({ keywords: [] })).status).toBe(400);
    expect((await request(app).patch(`/api/auto-replies/${id}`).set(auth(a.token)).send({ active: false })).body.data.active).toBe(false);
    expect((await request(app).get('/api/auto-replies').set(auth(b.token))).body.data).toHaveLength(0);
    expect((await request(app).delete(`/api/auto-replies/${id}`).set(auth(a.token))).status).toBe(200);
  });
});

describe('inbound: rules, opt-out and the AI fallback', () => {
  let calls: { url: string; body: any }[] = [];
  const realFetch = global.fetch;
  beforeEach(() => {
    calls = [];
    setProviderFactory((c) => new EvolutionApiProvider({ baseUrl: c.baseUrl!, instanceName: c.instanceName!, apiKey: c.accessToken }));
    setAutoResponder(null);
    global.fetch = jest.fn(async (url: any, init: any) => {
      calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : undefined });
      if (String(url).includes('connectionState')) return new Response(JSON.stringify({ instance: { state: 'open' } }), { status: 200 });
      if (String(url).includes('webhook/set')) return new Response('{}', { status: 201 });
      return new Response(JSON.stringify({ key: { id: `OUT-${calls.length}` } }), { status: 201 });
    }) as any;
  });
  afterAll(() => { global.fetch = realFetch; });

  async function setup(tag: string) {
    const owner = await registerUser(`inb-${tag}`);
    const res = await request(app).put('/api/whatsapp').set(auth(owner.token)).send({ provider: 'EVOLUTION', baseUrl: 'https://evo.example.com', instanceName: `i-${tag}`, apiKey: 'evo-key-123456' });
    const path = new URL(res.body.data.webhookUrl).pathname;
    let n = 0;
    const say = (text: string, jid = '50937001111') =>
      request(app).post(path).send({ event: 'messages.upsert', data: { key: { remoteJid: `${jid}@s.whatsapp.net`, fromMe: false, id: `${tag}-${++n}` }, pushName: 'Jean Baptiste', message: { conversation: text }, messageType: 'conversation' } });
    const sent = () => calls.filter((c) => c.url.includes('/message/sendText/')).map((c) => c.body.text);
    const customer = () => fakePrisma.customer.rows.find((c: any) => c.businessId === owner.businessId && c.phone === '+50937001111');
    return { owner, say, sent, customer };
  }
  const addRule = (tok: string, body: object) => request(app).post('/api/auto-replies').set(auth(tok)).send(body);

  it('answers a keyword rule (with {{name}}) instead of the AI, and falls back to the AI otherwise', async () => {
    const { owner, say, sent } = await setup('kw');
    await addRule(owner.token, { name: 'Prix', trigger: 'KEYWORD', keywords: ['prix'], reply: 'Bonjour {{name}}, nos prix sont sur notre site.' });
    setAutoResponder({ respond: async () => 'Réponse IA' } as any);
    await say('Quel est le prix ?');
    expect(sent()).toEqual(['Bonjour Jean, nos prix sont sur notre site.']);
    await say('Autre question');
    expect(sent()).toEqual(['Bonjour Jean, nos prix sont sur notre site.', 'Réponse IA']);
  });
  it('sends the welcome only on the first message of a conversation', async () => {
    const { owner, say, sent } = await setup('wel');
    await addRule(owner.token, { name: 'Bienvenue', trigger: 'WELCOME', reply: 'Bienvenue chez nous !' });
    await say('Salut');
    await say('Une autre question');
    expect(sent()).toEqual(['Bienvenue chez nous !']);
  });
  it('sends the away message once, not on every message', async () => {
    const { owner, say, sent } = await setup('away');
    await addRule(owner.token, { name: 'Fermé', trigger: 'AWAY', reply: 'Nous sommes fermés.', activeFrom: '00:00', activeTo: '23:59' });
    await say('Bonjour');
    await say('Vous êtes là ?');
    expect(sent()).toEqual(['Nous sommes fermés.']);
  });
  it('stays silent for rules when a human has taken the conversation', async () => {
    const { owner, say, sent } = await setup('human');
    await addRule(owner.token, { name: 'Prix', trigger: 'KEYWORD', keywords: ['prix'], reply: 'Voir le site.' });
    await say('Bonjour');
    const conv = (await request(app).get('/api/conversations').set(auth(owner.token))).body.data[0];
    await request(app).patch(`/api/conversations/${conv.id}`).set(auth(owner.token)).send({ aiActive: false });
    await say('Le prix ?');
    expect(sent()).toEqual([]);
  });
  it('STOP opts the customer out and START opts back in, with a confirmation', async () => {
    const { say, sent, customer } = await setup('stop');
    await say('STOP');
    expect(customer().marketingOptOut).toBe(true);
    expect(sent()[0]).toMatch(/ne recevrez plus/);
    await say('start');
    expect(customer().marketingOptOut).toBe(false);
  });
});
