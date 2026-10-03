import request from 'supertest';
import { fakePrisma } from './fake-prisma';
import { app, registerUser, validUser } from './helpers';

jest.mock('../src/lib/prisma', () => ({ prisma: require('./fake-prisma').fakePrisma }));

describe('authentication', () => {
  it('registers a user with a business and OWNER role', async () => {
    const { res } = await registerUser('reg');
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.role).toBe('OWNER');
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user.passwordHash).toBeUndefined();
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toMatch(/refresh_token=/);
    expect(cookie).toMatch(/HttpOnly/);
  });

  it('stores the password hashed, not in clear', async () => {
    await registerUser('hash');
    const row = fakePrisma.user.rows.find((u: any) => u.email === 'userhash@example.com');
    expect(row.passwordHash).not.toContain('Str0ngPassw0rd!');
    expect(row.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('rejects a duplicate email', async () => {
    await registerUser('dup');
    const { res } = await registerUser('dup');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects weak passwords and invalid input with a VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validUser('weak'), password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('logs in with correct credentials', async () => {
    await registerUser('login');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'userlogin@example.com', password: 'Str0ngPassw0rd!' });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
  });

  it('rejects an invalid password and unknown email with the same error', async () => {
    await registerUser('bad');
    const wrongPw = await request(app)
      .post('/api/auth/login')
      .send({ email: 'userbad@example.com', password: 'WrongPassw0rd!' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'WrongPassw0rd!' });
    expect(wrongPw.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrongPw.body.error.message).toBe(unknown.body.error.message);
  });

  it('blocks access without a token or with a forged token', async () => {
    expect((await request(app).get('/api/business')).status).toBe(401);
    const forged = await request(app).get('/api/business').set('Authorization', 'Bearer not.a.jwt');
    expect(forged.status).toBe(401);
    expect(forged.body.error.code).toBe('UNAUTHORIZED');
  });

  it('serves /api/auth/me for an authenticated user', async () => {
    const { token } = await registerUser('me');
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('userme@example.com');
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const { cookie } = await registerUser('rot');
    const first = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(first.status).toBe(200);
    expect(first.body.data.accessToken).toEqual(expect.any(String));

    // The original token was rotated: reusing it must fail and revoke the family.
    const reuse = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
    expect(reuse.status).toBe(401);
    const newCookie = first.headers['set-cookie'] as unknown as string[];
    const afterReuse = await request(app).post('/api/auth/refresh').set('Cookie', newCookie);
    expect(afterReuse.status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const { cookie } = await registerUser('out');
    expect((await request(app).post('/api/auth/logout').set('Cookie', cookie)).status).toBe(200);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });
});
