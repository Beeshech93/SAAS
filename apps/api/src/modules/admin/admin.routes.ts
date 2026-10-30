import { Router } from 'express';
import { z } from 'zod';
import { parseId } from '../../lib/crud';
import { authenticate, requireSuperAdmin } from '../../middleware/auth';
import { validateBody, validateQuery } from '../../middleware/validate';
import * as adminService from './admin.service';
import * as evolutionAdminService from './evolution-admin.service';

export const adminRouter = Router();

// All routes require authentication and Super Admin privileges
adminRouter.use(authenticate, requireSuperAdmin);

adminRouter.get('/overview', async (_req, res, next) => {
  try {
    const data = await adminService.getOverviewStats();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

const listBusinessesQuery = z.object({
  search: z.string().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

adminRouter.get('/businesses', validateQuery(listBusinessesQuery), async (req, res, next) => {
  try {
    const data = await adminService.listBusinesses(req.query as any);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/businesses/:id', async (req, res, next) => {
  try {
    const data = await adminService.getBusinessDetails(parseId(req.params.id));
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

const updateStatusBody = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

adminRouter.patch(
  '/businesses/:id/status',
  validateBody(updateStatusBody),
  async (req, res, next) => {
    try {
      const data = await adminService.updateBusinessStatus(
        parseId(req.params.id),
        req.body.status,
        req.auth!.userId,
        req.ip ?? undefined,
        req.headers['user-agent'] ?? undefined,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

const updateSubscriptionBody = z.object({
  planCode: z.enum(['STARTER', 'BUSINESS', 'PRO']).optional(),
  status: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED']).optional(),
  extendTrialDays: z.coerce.number().int().min(1).max(365).optional(),
});

adminRouter.patch(
  '/businesses/:id/subscription',
  validateBody(updateSubscriptionBody),
  async (req, res, next) => {
    try {
      const data = await adminService.updateBusinessSubscription(
        parseId(req.params.id),
        req.body,
        req.auth!.userId,
        req.ip ?? undefined,
        req.headers['user-agent'] ?? undefined,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

const listUsersQuery = z.object({
  search: z.string().optional(),
  isSuperAdmin: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

adminRouter.get('/users', validateQuery(listUsersQuery), async (req, res, next) => {
  try {
    const data = await adminService.listUsers(req.query as any);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

const toggleSuperAdminBody = z.object({
  isSuperAdmin: z.boolean(),
});

adminRouter.patch(
  '/users/:id/superadmin',
  validateBody(toggleSuperAdminBody),
  async (req, res, next) => {
    try {
      const data = await adminService.toggleUserSuperAdmin(
        parseId(req.params.id),
        req.body.isSuperAdmin,
        req.auth!.userId,
        req.ip ?? undefined,
        req.headers['user-agent'] ?? undefined,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Audit Logs ──────────────────────────────────────────────────────────────

const listAuditLogsQuery = z.object({
  search: z.string().optional(),
  action: z.string().optional(),
  actorId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

adminRouter.get('/audit-logs', validateQuery(listAuditLogsQuery), async (req, res, next) => {
  try {
    const data = await adminService.listAuditLogs(req.query as any);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ─── Evolution API Global Management ─────────────────────────────────────────

adminRouter.get('/evolution', async (_req, res, next) => {
  try {
    const data = await evolutionAdminService.getGlobalEvolutionConfig();
    res.json({
      success: true,
      data: {
        serverUrl: data.serverUrl,
        hasApiKey: data.hasApiKey,
        isConfigured: data.isConfigured,
        source: data.source,
      },
    });
  } catch (err) {
    next(err);
  }
});

const saveEvolutionSchema = z.object({
  serverUrl: z.string().trim().url(),
  apiKey: z.string().trim().min(8).optional(),
});

adminRouter.put('/evolution', validateBody(saveEvolutionSchema), async (req, res, next) => {
  try {
    const data = await evolutionAdminService.saveGlobalEvolutionConfig({
      serverUrl: req.body.serverUrl,
      apiKey: req.body.apiKey,
      actorId: req.auth!.userId,
    });
    res.json({
      success: true,
      data: {
        serverUrl: data.serverUrl,
        hasApiKey: data.hasApiKey,
        isConfigured: data.isConfigured,
        source: data.source,
      },
    });
  } catch (err) {
    next(err);
  }
});

const testEvolutionSchema = z.object({
  serverUrl: z.string().trim().url(),
  apiKey: z.string().trim().min(8).optional(),
});

adminRouter.post('/evolution/test', validateBody(testEvolutionSchema), async (req, res, next) => {
  try {
    let key = req.body.apiKey;
    if (!key) {
      const cfg = await evolutionAdminService.getGlobalEvolutionConfig();
      key = cfg.apiKey;
    }
    if (!key) {
      return res.status(400).json({ success: false, error: 'Clé API manquante pour tester la connexion' });
    }
    const result = await evolutionAdminService.testEvolutionConnection(req.body.serverUrl, key);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

