/**
 * On Vercel the platform imports src/index.ts and calls the exported app as a function.
 * It must not start its own server, and must trust exactly one proxy hop.
 */
import request from 'supertest';

jest.mock('../src/lib/prisma', () => ({ prisma: require('./fake-prisma').fakePrisma }));

describe('Vercel entrypoint', () => {
  const OLD = process.env.VERCEL;
  beforeAll(() => { process.env.VERCEL = '1'; });
  afterAll(() => { if (OLD === undefined) delete process.env.VERCEL; else process.env.VERCEL = OLD; });

  it('default-exports the Express app without listening, and serves /api/health', async () => {
    const listen = jest.spyOn(require('http').Server.prototype, 'listen');
    let app: any;
    jest.isolateModules(() => { app = require('../src/index').default; });
    expect(typeof app).toBe('function');
    expect(listen).not.toHaveBeenCalled();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok' } });
    expect(app.get('trust proxy')).toBe(1);
    listen.mockRestore();
  });

  it('keeps the plain /health endpoint for Docker/other hosts', async () => {
    let app: any;
    jest.isolateModules(() => { app = require('../src/index').default; });
    expect((await request(app).get('/health')).status).toBe(200);
  });
});
