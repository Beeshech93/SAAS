import { Router } from 'express';
import { z } from 'zod';
import { AppError, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { authenticate } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { deliverText } from '../../integrations/whatsapp/outbound';
import { canSend, planLimitError } from '../billing/billing.service';
import { addMessage } from '../conversations/conversations.service';

const idSchema = z.string().uuid();
const createSchema = z
  .object({ conversationId: z.string().uuid(), content: z.string().trim().min(1).max(4096) })
  .strict();

export const messagesRouter = Router();
messagesRouter.use(authenticate);

async function loadConversation(auth: { businessId: string; userId: string; role: string }, id: string) {
  const conv = await prisma.conversation.findFirst({
    where: { id, businessId: auth.businessId, ...(auth.role === 'AGENT' ? { assignedToId: auth.userId } : {}) },
  });
  if (!conv) throw notFound('Conversation not found');
  return conv;
}

messagesRouter.get('/', async (req, res, next) => {
  try {
    const id = idSchema.safeParse(req.query.conversationId);
    if (!id.success) throw new AppError(400, 'VALIDATION_ERROR', 'conversationId is required');
    const conv = await loadConversation(req.auth!, id.data);
    const data = await prisma.message.findMany({
      where: { conversationId: conv.id, businessId: conv.businessId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
});

// Sends the agent's reply through the business's WhatsApp number and stores it with its delivery result.
messagesRouter.post('/', validateBody(createSchema), async (req, res, next) => {
  try {
    const auth = req.auth!;
    const conv = await loadConversation(auth, req.body.conversationId);
    const allowed = await canSend(conv.businessId);
    if (!allowed.ok) throw planLimitError(allowed.reason);
    const customer = await prisma.customer.findFirst({ where: { id: conv.customerId, businessId: conv.businessId } });
    if (!customer) throw notFound('Customer not found');
    const result = await deliverText(conv.businessId, customer.phone, req.body.content);
    const message = await addMessage({
      businessId: conv.businessId,
      conversationId: conv.id,
      senderType: 'AGENT',
      senderId: auth.userId,
      content: req.body.content,
      direction: 'OUTBOUND',
      metadata: { delivery: result.delivery, ...(result.error ? { error: result.error } : {}) },
      externalId: result.messageId ?? null,
    });
    // A human replying takes over an unassigned conversation and pauses the AI.
    if (!conv.assignedToId) {
      await prisma.conversation.updateMany({
        where: { id: conv.id, businessId: conv.businessId },
        data: { assignedToId: auth.userId, aiActive: false },
      });
    }
    res.status(201).json({ success: true, data: message });
  } catch (e) {
    next(e);
  }
});
