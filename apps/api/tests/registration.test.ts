import request from 'supertest';
import { app, validUser } from './helpers';
import { env } from '../src/config/env';

jest.mock('../src/lib/prisma', () => ({ prisma: require('./fake-prisma').fakePrisma }));

describe('registration allowlist', () => {
  afterEach(() => {
    env.REGISTRATION_ALLOWED_EMAILS = [];
  });
  it('is open when no allowlist is configured', async () => {
    expect((await request(app).post('/api/auth/register').send(validUser('open'))).status).toBe(201);
  });
  it('only lets listed emails create a business (case-insensitive)', async () => {
    const ok = validUser('allowed');
    env.REGISTRATION_ALLOWED_EMAILS = [ok.email.toLowerCase()];
    expect((await request(app).post('/api/auth/register').send(validUser('stranger'))).status).toBe(403);
    expect((await request(app).post('/api/auth/register').send({ ...ok, email: ok.email.toUpperCase() })).status).toBe(201);
  });
});
