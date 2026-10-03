import { Router } from 'express';
import { z } from 'zod';
import { parseId } from '../../lib/crud';
import { AppError, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:mm');

const ruleSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    trigger: z.enum(['KEYWORD', 'WELCOME', 'AWAY']),
    keywords: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
    reply: z.string().trim().min(1).max(1000),
    activeFrom: hhmm.nullable().default(null),
    activeTo: hhmm.nullable().default(null),
    priority: z.number().int().min(0).max(100).default(0),
    active: z.boolean().default(true),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.trigger === 'KEYWORD' && r.keywords.length === 0) ctx.addIssue({ code: 'custom', path: ['keywords'], message: 'At least one keyword' });
    if (r.trigger === 'AWAY' && !(r.activeFrom && r.activeTo)) ctx.addIssue({ code: 'custom', path: ['activeFrom'], message: 'Hours are required' });
    if ((r.activeFrom == null) !== (r.activeTo == null)) ctx.addIssue({ code: 'custom', path: ['activeTo'], message: 'Both hours or none' });
    if (r.activeFrom && r.activeFrom === r.activeTo) ctx.addIssue({ code: 'custom', path: ['activeTo'], message: 'Hours must differ' });
  });

// Partial update: merge into the stored rule, then validate the whole thing.
const patchSchema = z
  .object({
    name: z.string(), trigger: z.string(), keywords: z.array(z.string()), reply: z.string(),
    activeFrom: z.string().nullable(), activeTo: z.string().nullable(), priority: z.number(), active: z.boolean(),
  })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' });

export const automationRouter = Router();
automationRouter.use(authenticate);
const canWrite = requireRole('OWNER', 'ADMIN');

automationRouter.get('/', async (req, res, next) => {
  try {
    const data = await prisma.autoReplyRule.findMany({ where: { businessId: req.auth!.businessId }, orderBy: { createdAt: 'asc' } });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

automationRouter.post('/', canWrite, validateBody(ruleSchema), async (req, res, next) => {
  try {
    const data = await prisma.autoReplyRule.create({ data: { ...req.body, businessId: req.auth!.businessId } });
    logger.info({ event: 'auto_reply_created', businessId: data.businessId, userId: req.auth!.userId }, 'Auto-reply rule created');
    res.status(201).json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

automationRouter.patch('/:id', canWrite, validateBody(patchSchema), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const businessId = req.auth!.businessId;
    const existing = await prisma.autoReplyRule.findFirst({ where: { id, businessId } });
    if (!existing) throw notFound('Rule not found');
    const { name, trigger, keywords, reply, activeFrom, activeTo, priority, active } = existing;
    const merged = ruleSchema.safeParse({ name, trigger, keywords, reply, activeFrom, activeTo, priority, active, ...req.body });
    if (!merged.success) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request', merged.error.flatten().fieldErrors);
    }
    await prisma.autoReplyRule.updateMany({ where: { id, businessId }, data: merged.data });
    res.json({ success: true, data: await prisma.autoReplyRule.findFirst({ where: { id, businessId } }) });
  } catch (e) {
    next(e);
  }
});

automationRouter.delete('/:id', canWrite, async (req, res, next) => {
  try {
    const { count } = await prisma.autoReplyRule.deleteMany({ where: { id: parseId(req.params.id), businessId: req.auth!.businessId } });
    if (!count) throw notFound('Rule not found');
    res.json({ success: true, data: null });
  } catch (e) {
    next(e);
  }
});
