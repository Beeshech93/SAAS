import request from 'supertest';
import { createApp } from '../src/app';

export const app = createApp();

export const validUser = (n: number | string = 1) => ({
  name: `User ${n}`,
  email: `user${n}@example.com`,
  password: 'Str0ngPassw0rd!',
  businessName: `Business ${n}`,
  businessType: 'HOTEL',
});

export async function registerUser(n: number | string = 1) {
  const res = await request(app).post('/api/auth/register').send(validUser(n));
  return {
    res,
    token: res.body.data?.accessToken as string,
    businessId: res.body.data?.business?.id as string,
    cookie: res.headers['set-cookie'] as unknown as string[],
  };
}
