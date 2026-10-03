import { Router } from 'express';
import { z } from 'zod';
import { parseId } from '../../lib/crud';
import { AppError, forbidden, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';

const STATUSES = ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] as const;

const createSchema = z.object({ customerId: z.string().uuid() }).strict();
const updateSchema = z
  .object({
    status: z.enum(STATUSES),
    assignedToId: z.string().uuid().nullable(),
    aiActive: z.boolean(),
  })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, { message: 'At least one field is required' });

export const conversationsRouter = Router();
conversationsRouter.use(authenticate);

/** AGENTs only see conversations assigned to them; OWNER/ADMIN see all. */
const scope = (auth: { businessId: string; userId: string; role: string }) => ({
  businessId: auth.businessId,
  ...(auth.role === 'AGENT' ? { assignedToId: auth.userId } : {}),
});

conversationsRouter.get('/', async (req, res, next) => {
  try {
    const status = STATUSES.find((s) => s === req.query.status);
    const conversations = await prisma.conversation.findMany({
      where: { ...scope(req.auth!), ...(status ? { status } : {}) },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });
    const customers = await prisma.customer.findMany({
      where: { businessId: req.auth!.businessId, id: { in: conversations.map((c) => c.customerId) } },
    });
    const byId = new Map(customers.map((c) => [c.id, { id: c.id, name: c.name, phone: c.phone }]));
    res.json({ success: true, data: conversations.map((c) => ({ ...c, customer: byId.get(c.customerId) ?? null })) });
  } catch (e) {
    next(e);
  }
});

conversationsRouter.post('/', requireRole('OWNER', 'ADMIN'), validateBody(createSchema), async (req, res, next) => {
  try {
    const { businessId } = req.auth!;
    const customer = await prisma.customer.findFirst({ where: { id: req.body.customerId, businessId } });
    if (!customer) throw notFound('Customer not found');
    const data = await prisma.conversation.create({ data: { businessId, customerId: customer.id } });
    res.status(201).json({ success: true, data: { ...data, customer } });
  } catch (e) {
    next(e);
  }
});

conversationsRouter.get('/:id', async (req, res, next) => {
  try {
    const conv = await prisma.conversation.findFirst({ where: { id: parseId(req.params.id), ...scope(req.auth!) } });
    if (!conv) throw notFound('Conversation not found');
    const customer = await prisma.customer.findFirst({ where: { id: conv.customerId, businessId: conv.businessId } });
    res.json({ success: true, data: { ...conv, customer } });
  } catch (e) {
    next(e);
  }
});

conversationsRouter.patch('/:id', validateBody(updateSchema), async (req, res, next) => {
  try {
    const auth = req.auth!;
    const where = { id: parseId(req.params.id), ...scope(auth) };
    const conv = await prisma.conversation.findFirst({ where });
    if (!conv) throw notFound('Conversation not found');

    const body = req.body as { status?: string; assignedToId?: string | null; aiActive?: boolean };
    const data: Record<string, unknown> = {};
    if (body.status) data.status = body.status;

    if (body.assignedToId !== undefined) {
      if (auth.role === 'AGENT') throw forbidden('Agents cannot change the assignment');
      if (body.assignedToId !== null) {
        const member = await prisma.businessMember.findUnique({
          where: { userId_businessId: { userId: body.assignedToId, businessId: auth.businessId } },
        });
        if (!member) throw new AppError(400, 'VALIDATION_ERROR', 'Assignee is not a member of this business');
      }
      data.assignedToId = body.assignedToId;
      // Human takes over => AI paused; handed back (unassigned) => AI active. An explicit aiActive wins.
      if (body.aiActive === undefined) data.aiActive = body.assignedToId === null;
    }
    if (body.aiActive !== undefined) data.aiActive = body.aiActive;

    await prisma.conversation.updateMany({ where: { id: conv.id, businessId: auth.businessId }, data });
    logger.info({ event: 'conversation_updated', conversationId: conv.id, userId: auth.userId, changes: Object.keys(data) }, 'Conversation updated');
    res.json({ success: true, data: await prisma.conversation.findFirst({ where: { id: conv.id, businessId: auth.businessId } }) });
  } catch (e) {
    next(e);
  }
});
