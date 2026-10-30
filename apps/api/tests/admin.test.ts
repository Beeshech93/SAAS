import request from 'supertest';
import { fakePrisma } from './fake-prisma';
import { app, registerUser } from './helpers';

jest.mock('../src/lib/prisma', () => ({ prisma: require('./fake-prisma').fakePrisma }));

describe('Super Admin Panel API', () => {
  let regularToken: string;
  let adminToken: string;
  let adminUserId: string;
  let regularUserId: string;
  let businessId: string;

  beforeAll(async () => {
    // Register regular user
    const reg1 = await registerUser('admin_test_reg');
    regularToken = reg1.token;
    businessId = reg1.businessId;
    const regUser = fakePrisma.user.rows.find((u: any) => u.email === 'useradmin_test_reg@example.com');
    regularUserId = regUser.id;

    // Register admin user and mark as super admin
    const reg2 = await registerUser('super_admin_user');
    adminToken = reg2.token;
    const adminUser = fakePrisma.user.rows.find((u: any) => u.email === 'usersuper_admin_user@example.com');
    adminUserId = adminUser.id;
    adminUser.isSuperAdmin = true;
  });

  describe('access control', () => {
    it('blocks unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/admin/overview');
      expect(res.status).toBe(401);
    });

    it('blocks regular users with 403', async () => {
      const res = await request(app)
        .get('/api/admin/overview')
        .set('Authorization', `Bearer ${regularToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows super admins to access /api/admin/overview', async () => {
      const res = await request(app)
        .get('/api/admin/overview')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.kpis).toBeDefined();
      expect(res.body.data.kpis.totalBusinesses).toBeGreaterThan(0);
      expect(res.body.data.recentBusinesses).toBeInstanceOf(Array);
    });
  });

  describe('businesses management', () => {
    it('lists businesses with pagination and stats', async () => {
      const res = await request(app)
        .get('/api/admin/businesses?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.pagination.total).toBeGreaterThan(0);
      const biz = res.body.data.items.find((b: any) => b.id === businessId);
      expect(biz).toBeDefined();
      expect(biz.stats).toBeDefined();
    });

    it('filters businesses by search query', async () => {
      const res = await request(app)
        .get('/api/admin/businesses?search=admin_test_reg')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
    });

    it('fetches business details', async () => {
      const res = await request(app)
        .get(`/api/admin/businesses/${businessId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(businessId);
      expect(res.body.data.members).toBeInstanceOf(Array);
    });

    it('updates business status to SUSPENDED and then ACTIVE', async () => {
      const suspendRes = await request(app)
        .patch(`/api/admin/businesses/${businessId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'SUSPENDED' });
      expect(suspendRes.status).toBe(200);
      expect(suspendRes.body.data.status).toBe('SUSPENDED');

      const activateRes = await request(app)
        .patch(`/api/admin/businesses/${businessId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ACTIVE' });
      expect(activateRes.status).toBe(200);
      expect(activateRes.body.data.status).toBe('ACTIVE');
    });
  });

  describe('users management', () => {
    it('lists platform users', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.items).toBeInstanceOf(Array);
      expect(res.body.data.pagination.total).toBeGreaterThan(0);
    });

    it('toggles superadmin rights for a user', async () => {
      const promoteRes = await request(app)
        .patch(`/api/admin/users/${regularUserId}/superadmin`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isSuperAdmin: true });
      expect(promoteRes.status).toBe(200);
      expect(promoteRes.body.data.isSuperAdmin).toBe(true);

      const demoteRes = await request(app)
        .patch(`/api/admin/users/${regularUserId}/superadmin`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isSuperAdmin: false });
      expect(demoteRes.status).toBe(200);
      expect(demoteRes.body.data.isSuperAdmin).toBe(false);
    });

    it('prevents self-demoting from superadmin', async () => {
      const res = await request(app)
        .patch(`/api/admin/users/${adminUserId}/superadmin`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isSuperAdmin: false });
      expect(res.status).toBe(400);
    });
  });
});
