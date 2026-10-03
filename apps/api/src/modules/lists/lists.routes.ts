import { Router } from 'express';
import { z } from 'zod';
import { parseId } from '../../lib/crud';
import { AppError, conflict, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { normalizePhone } from '../../lib/phone';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { findOrCreateCustomerByPhone } from '../customers/customers.service';

const nameSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();
const membersSchema = z
  .object({
    customerIds: z.array(z.string().uuid()).max(500).default([]),
    // Pasted numbers: unknown ones become new customers.
    contacts: z.array(z.object({ phone: z.string().trim().min(1).max(40), name: z.string().trim().max(100).optional() }).strict()).max(500).default([]),
  })
  .strict()
  .refine((b) => b.customerIds.length + b.contacts.length > 0, { message: 'Nothing to add' });

export const listsRouter = Router();
listsRouter.use(authenticate, requireRole('OWNER', 'ADMIN'));

async function loadList(businessId: string, rawId: unknown) {
  const list = await prisma.customerList.findFirst({ where: { id: parseId(rawId), businessId } });
  if (!list) throw notFound('List not found');
  return list;
}

listsRouter.get('/', async (req, res, next) => {
  try {
    const businessId = req.auth!.businessId;
    const lists = await prisma.customerList.findMany({ where: { businessId }, orderBy: { name: 'asc' }, take: 200 });
    const data = await Promise.all(lists.map(async (l) => ({ ...l, memberCount: await prisma.customerListMember.count({ where: { listId: l.id } }) })));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

listsRouter.post('/', validateBody(nameSchema), async (req, res, next) => {
  try {
    const businessId = req.auth!.businessId;
    if (await prisma.customerList.findFirst({ where: { businessId, name: req.body.name } })) throw conflict('A list with this name already exists');
    const data = await prisma.customerList.create({ data: { businessId, name: req.body.name } });
    res.status(201).json({ success: true, data: { ...data, memberCount: 0 } });
  } catch (e) {
    next(e);
  }
});

listsRouter.get('/:id', async (req, res, next) => {
  try {
    const businessId = req.auth!.businessId;
    const list = await loadList(businessId, req.params.id);
    const links = await prisma.customerListMember.findMany({ where: { listId: list.id }, take: 1000 });
    const ids = links.map((m) => m.customerId);
    const members = ids.length ? await prisma.customer.findMany({ where: { businessId, id: { in: ids } } }) : [];
    res.json({ success: true, data: { list, members } });
  } catch (e) {
    next(e);
  }
});

listsRouter.patch('/:id', validateBody(nameSchema), async (req, res, next) => {
  try {
    const businessId = req.auth!.businessId;
    const list = await loadList(businessId, req.params.id);
    const same = await prisma.customerList.findFirst({ where: { businessId, name: req.body.name } });
    if (same && same.id !== list.id) throw conflict('A list with this name already exists');
    await prisma.customerList.updateMany({ where: { id: list.id, businessId }, data: { name: req.body.name } });
    res.json({ success: true, data: await prisma.customerList.findFirst({ where: { id: list.id, businessId } }) });
  } catch (e) {
    next(e);
  }
});

listsRouter.delete('/:id', async (req, res, next) => {
  try {
    const businessId = req.auth!.businessId;
    const list = await loadList(businessId, req.params.id);
    // A draft or running campaign aimed at this list would silently widen to everyone if it vanished.
    const inUse = await prisma.campaign.findFirst({ where: { businessId, listId: list.id, status: { in: ['DRAFT', 'SENDING'] } } });
    if (inUse) throw conflict(`The list is used by the campaign "${inUse.name}"`);
    await prisma.customerListMember.deleteMany({ where: { listId: list.id } });
    await prisma.campaign.updateMany({ where: { businessId, listId: list.id }, data: { listId: null } });
    await prisma.customerList.deleteMany({ where: { id: list.id, businessId } });
    res.json({ success: true, data: null });
  } catch (e) {
    next(e);
  }
});

listsRouter.post('/:id/members', validateBody(membersSchema), async (req, res, next) => {
  try {
    const businessId = req.auth!.businessId;
    const list = await loadList(businessId, req.params.id);
    const { customerIds, contacts } = req.body as z.infer<typeof membersSchema>;

    const wanted = new Set<string>();
    if (customerIds.length) {
      const own = await prisma.customer.findMany({ where: { businessId, id: { in: customerIds } } });
      own.forEach((c) => wanted.add(c.id)); // ids of other tenants are silently dropped
    }
    let created = 0;
    const invalid: string[] = [];
    for (const c of contacts) {
      const phone = normalizePhone(c.phone);
      if (!phone) { invalid.push(c.phone); continue; }
      const existed = await prisma.customer.findFirst({ where: { businessId, phone } });
      const customer = existed ?? (await findOrCreateCustomerByPhone(businessId, phone, c.name ?? null));
      if (!existed) created++;
      wanted.add(customer.id);
    }

    const current = new Set((await prisma.customerListMember.findMany({ where: { listId: list.id } })).map((m) => m.customerId));
    const fresh = [...wanted].filter((id) => !current.has(id));
    if (fresh.length) await prisma.customerListMember.createMany({ data: fresh.map((customerId) => ({ listId: list.id, customerId, businessId })), skipDuplicates: true });
    logger.info({ event: 'list_members_added', businessId, listId: list.id, added: fresh.length }, 'List members added');
    res.json({ success: true, data: { added: fresh.length, alreadyIn: wanted.size - fresh.length, created, invalid: invalid.slice(0, 20), invalidCount: invalid.length } });
  } catch (e) {
    next(e);
  }
});

listsRouter.delete('/:id/members/:customerId', async (req, res, next) => {
  try {
    const list = await loadList(req.auth!.businessId, req.params.id);
    const { count } = await prisma.customerListMember.deleteMany({ where: { listId: list.id, customerId: parseId(req.params.customerId) } });
    if (!count) throw notFound('Member not found');
    res.json({ success: true, data: null });
  } catch (e) {
    next(e);
  }
});
