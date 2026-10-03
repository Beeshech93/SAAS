import { Router } from 'express';
import { z } from 'zod';
import { parseId } from '../../lib/crud';
import { AppError, conflict, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { audience, cancelCampaign, processBatch, startCampaign } from './campaigns.service';

const base = z.object({
  name: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(1000),
  recentDays: z.number().int().min(1).max(365).nullable(),
  listId: z.string().uuid().nullable(),
});
const createSchema = base.extend({ recentDays: base.shape.recentDays.default(null), listId: base.shape.listId.default(null) }).strict();
const updateSchema = base.partial().strict().refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' });

export const campaignsRouter = Router();
campaignsRouter.use(authenticate, requireRole('OWNER', 'ADMIN'));

campaignsRouter.get('/', async (req, res, next) => {
  try {
    res.json({ success: true, data: await prisma.campaign.findMany({ where: { businessId: req.auth!.businessId }, orderBy: { createdAt: 'desc' }, take: 100 }) });
  } catch (e) {
    next(e);
  }
});

// How many customers a campaign would reach (before creating it).
campaignsRouter.get('/audience', async (req, res, next) => {
  try {
    const days = z.coerce.number().int().min(1).max(365).optional().safeParse(req.query.recentDays || undefined);
    if (!days.success) throw new AppError(400, 'VALIDATION_ERROR', 'recentDays must be 1-365');
    const listId = z.string().uuid().optional().safeParse(req.query.listId || undefined);
    if (!listId.success) throw new AppError(400, 'VALIDATION_ERROR', 'listId must be a uuid');
    const total = await prisma.customer.count({ where: { businessId: req.auth!.businessId } });
    const reach = (await audience(req.auth!.businessId, days.data, listId.data)).length;
    res.json({ success: true, data: { total, reach, optedOut: await prisma.customer.count({ where: { businessId: req.auth!.businessId, marketingOptOut: true } }) } });
  } catch (e) {
    next(e);
  }
});

// A campaign may only target one of the business's own lists.
async function assertOwnList(businessId: string, listId: string | null | undefined) {
  if (listId && !(await prisma.customerList.findFirst({ where: { id: listId, businessId } }))) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request', { listId: ['List not found'] });
  }
}

campaignsRouter.post('/', validateBody(createSchema), async (req, res, next) => {
  try {
    await assertOwnList(req.auth!.businessId, req.body.listId);
    const data = await prisma.campaign.create({ data: { ...req.body, businessId: req.auth!.businessId, createdById: req.auth!.userId } });
    logger.info({ event: 'campaign_created', businessId: data.businessId, userId: req.auth!.userId }, 'Campaign created');
    res.status(201).json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

campaignsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const businessId = req.auth!.businessId;
    const campaign = await prisma.campaign.findFirst({ where: { id, businessId } });
    if (!campaign) throw notFound('Campaign not found');
    const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId: id, businessId }, orderBy: { createdAt: 'asc' }, take: 500 });
    const remaining = await prisma.campaignRecipient.count({ where: { campaignId: id, status: 'PENDING' } });
    res.json({ success: true, data: { campaign, recipients, remaining } });
  } catch (e) {
    next(e);
  }
});

campaignsRouter.patch('/:id', validateBody(updateSchema), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const businessId = req.auth!.businessId;
    await assertOwnList(businessId, req.body.listId);
    const { count } = await prisma.campaign.updateMany({ where: { id, businessId, status: 'DRAFT' }, data: req.body });
    if (!count) {
      if (await prisma.campaign.findFirst({ where: { id, businessId } })) throw conflict('Only a draft can be edited');
      throw notFound('Campaign not found');
    }
    res.json({ success: true, data: await prisma.campaign.findFirst({ where: { id, businessId } }) });
  } catch (e) {
    next(e);
  }
});

campaignsRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const businessId = req.auth!.businessId;
    const c = await prisma.campaign.findFirst({ where: { id, businessId } });
    if (!c) throw notFound('Campaign not found');
    if (c.status === 'SENDING') throw conflict('Cancel the campaign before deleting it');
    await prisma.campaignRecipient.deleteMany({ where: { campaignId: id, businessId } });
    await prisma.campaign.deleteMany({ where: { id, businessId } });
    res.json({ success: true, data: null });
  } catch (e) {
    next(e);
  }
});

campaignsRouter.post('/:id/start', async (req, res, next) => {
  try {
    await startCampaign(req.auth!.businessId, parseId(req.params.id));
    res.json({ success: true, data: await processBatch(req.auth!.businessId, parseId(req.params.id)) });
  } catch (e) {
    next(e);
  }
});

// Called repeatedly (by the dashboard) until `remaining` is 0.
campaignsRouter.post('/:id/process', async (req, res, next) => {
  try {
    res.json({ success: true, data: await processBatch(req.auth!.businessId, parseId(req.params.id)) });
  } catch (e) {
    next(e);
  }
});

campaignsRouter.post('/:id/cancel', async (req, res, next) => {
  try {
    res.json({ success: true, data: await cancelCampaign(req.auth!.businessId, parseId(req.params.id)) });
  } catch (e) {
    next(e);
  }
});
