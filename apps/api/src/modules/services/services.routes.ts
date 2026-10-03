import { Router } from 'express';
import { z } from 'zod';
import { parseId } from '../../lib/crud';
import { notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';

const nullableText = (max: number) =>
  z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable();

const base = z.object({
  type: z.enum(['ROOM', 'MENU_ITEM', 'SERVICE']),
  name: z.string().trim().min(1).max(150),
  category: nullableText(100),
  description: nullableText(2000),
  price: z.number().nonnegative().max(1_000_000_000).multipleOf(0.01).nullable(),
  currency: z.enum(['HTG', 'USD']),
  capacity: z.number().int().positive().max(1000).nullable(),
  amenities: z.array(z.string().trim().min(1).max(60)).max(30),
  available: z.boolean(),
});

const createSchema = base
  .partial({ category: true, description: true, price: true, capacity: true, amenities: true })
  .extend({
    type: z.enum(['ROOM', 'MENU_ITEM', 'SERVICE']).default('SERVICE'),
    currency: z.enum(['HTG', 'USD']).default('HTG'),
    available: z.boolean().default(true),
  })
  .strict();

const updateSchema = base
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' });

export const servicesRouter = Router();
servicesRouter.use(authenticate);

const canWrite = requireRole('OWNER', 'ADMIN');

servicesRouter.get('/', async (req, res, next) => {
  try {
    const type = ['ROOM', 'MENU_ITEM', 'SERVICE'].includes(String(req.query.type)) ? String(req.query.type) : undefined;
    const data = await prisma.service.findMany({
      where: { businessId: req.auth!.businessId, ...(type ? { type: type as 'ROOM' } : {}) },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

servicesRouter.post('/', canWrite, validateBody(createSchema), async (req, res, next) => {
  try {
    const data = await prisma.service.create({ data: { ...req.body, businessId: req.auth!.businessId } });
    logger.info({ event: 'service_created', businessId: data.businessId, userId: req.auth!.userId }, 'Service created');
    res.status(201).json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

servicesRouter.patch('/:id', canWrite, validateBody(updateSchema), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const where = { id, businessId: req.auth!.businessId };
    const { count } = await prisma.service.updateMany({ where, data: req.body });
    if (!count) throw notFound('Service not found');
    res.json({ success: true, data: await prisma.service.findFirst({ where }) });
  } catch (e) {
    next(e);
  }
});

servicesRouter.delete('/:id', canWrite, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const { count } = await prisma.service.deleteMany({ where: { id, businessId: req.auth!.businessId } });
    if (!count) throw notFound('Service not found');
    res.json({ success: true, data: null });
  } catch (e) {
    next(e);
  }
});
