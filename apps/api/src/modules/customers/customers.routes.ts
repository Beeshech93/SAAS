import { Router } from 'express';
import { z } from 'zod';
import { parseId } from '../../lib/crud';
import { conflict, notFound } from '../../lib/errors';
import { normalizePhone } from '../../lib/phone';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { createCustomer } from './customers.service';

const text = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable();
const phone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) ctx.addIssue({ code: 'custom', message: 'Invalid phone number' });
    return n as string;
  });

const fields = {
  name: text(120),
  email: z.string().trim().toLowerCase().email().max(254).nullable(),
  country: text(60),
  notes: text(2000),
};
const createSchema = z.object({ phone, ...fields }).partial({ name: true, email: true, country: true, notes: true }).strict();
const updateSchema = z
  .object({ phone, ...fields })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' });

export const customersRouter = Router();
customersRouter.use(authenticate);
const canWrite = requireRole('OWNER', 'ADMIN');

customersRouter.get('/', async (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 60) : '';
    const data = await prisma.customer.findMany({
      where: {
        businessId: req.auth!.businessId,
        ...(search
          ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { phone: { contains: search.replace(/[\s()-]/g, '') } }] }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

customersRouter.post('/', canWrite, validateBody(createSchema), async (req, res, next) => {
  try {
    res.status(201).json({ success: true, data: await createCustomer(req.auth!.businessId, req.body) });
  } catch (e) {
    next(e);
  }
});

customersRouter.get('/:id', async (req, res, next) => {
  try {
    const data = await prisma.customer.findFirst({ where: { id: parseId(req.params.id), businessId: req.auth!.businessId } });
    if (!data) throw notFound('Customer not found');
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

customersRouter.patch('/:id', canWrite, validateBody(updateSchema), async (req, res, next) => {
  try {
    const where = { id: parseId(req.params.id), businessId: req.auth!.businessId };
    if (req.body.phone) {
      const dup = await prisma.customer.findFirst({ where: { businessId: where.businessId, phone: req.body.phone } });
      if (dup && dup.id !== where.id) throw conflict('A customer with this phone number already exists');
    }
    const { count } = await prisma.customer.updateMany({ where, data: req.body });
    if (!count) throw notFound('Customer not found');
    res.json({ success: true, data: await prisma.customer.findFirst({ where }) });
  } catch (e) {
    next(e);
  }
});
