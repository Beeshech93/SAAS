import { Router } from 'express';
import { z } from 'zod';
import { parseId } from '../../lib/crud';
import { notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';

const base = z.object({
  question: z.string().trim().min(1).max(300),
  answer: z.string().trim().min(1).max(2000),
  active: z.boolean(),
});
const createSchema = base.extend({ active: z.boolean().default(true) }).strict();
const updateSchema = base
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' });

export const faqRouter = Router();
faqRouter.use(authenticate);

const canWrite = requireRole('OWNER', 'ADMIN');

faqRouter.get('/', async (req, res, next) => {
  try {
    const data = await prisma.faq.findMany({
      where: { businessId: req.auth!.businessId },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

faqRouter.post('/', canWrite, validateBody(createSchema), async (req, res, next) => {
  try {
    const data = await prisma.faq.create({ data: { ...req.body, businessId: req.auth!.businessId } });
    logger.info({ event: 'faq_created', businessId: data.businessId, userId: req.auth!.userId }, 'FAQ created');
    res.status(201).json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// updateMany/deleteMany with { id, businessId } guarantees a row of another tenant is never touched.
faqRouter.patch('/:id', canWrite, validateBody(updateSchema), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const { count } = await prisma.faq.updateMany({ where: { id, businessId: req.auth!.businessId }, data: req.body });
    if (!count) throw notFound('FAQ not found');
    res.json({ success: true, data: await prisma.faq.findFirst({ where: { id, businessId: req.auth!.businessId } }) });
  } catch (e) {
    next(e);
  }
});

faqRouter.delete('/:id', canWrite, async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    const { count } = await prisma.faq.deleteMany({ where: { id, businessId: req.auth!.businessId } });
    if (!count) throw notFound('FAQ not found');
    res.json({ success: true, data: null });
  } catch (e) {
    next(e);
  }
});
