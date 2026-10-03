import { Channel, Direction, MessageType, Prisma, SenderType } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { recordOutboundMessage } from '../billing/billing.service';

/** Returns the open (OPEN/PENDING) conversation of a customer on a channel, or creates one. */
export async function findOrCreateConversation(businessId: string, customerId: string, channel: Channel = 'WHATSAPP') {
  const existing = await prisma.conversation.findFirst({
    where: { businessId, customerId, channel, status: { in: ['OPEN', 'PENDING'] } },
  });
  if (existing) return existing;
  return prisma.conversation.create({ data: { businessId, customerId, channel } });
}

export interface NewMessage {
  businessId: string;
  conversationId: string;
  senderType: SenderType;
  senderId?: string | null;
  content: string;
  messageType?: MessageType;
  direction: Direction;
  metadata?: Prisma.InputJsonValue;
  externalId?: string | null;
}

/** Stores a message and refreshes the conversation's last-message info. Shared with the webhook. */
export async function addMessage(m: NewMessage) {
  const message = await prisma.message.create({
    data: {
      businessId: m.businessId,
      conversationId: m.conversationId,
      senderType: m.senderType,
      senderId: m.senderId ?? null,
      content: m.content,
      messageType: m.messageType ?? 'TEXT',
      direction: m.direction,
      ...(m.metadata !== undefined ? { metadata: m.metadata } : {}),
      externalId: m.externalId ?? null,
    },
  });
  await prisma.conversation.updateMany({
    where: { id: m.conversationId, businessId: m.businessId },
    data: { lastMessageAt: message.createdAt, lastMessagePreview: m.content.slice(0, 120) },
  });
  // Billing: every customer-facing AI/agent message counts toward the monthly quota.
  if (m.direction === 'OUTBOUND' && (m.senderType === 'AI' || m.senderType === 'AGENT')) {
    await recordOutboundMessage(m.businessId);
  }
  return message;
}

/**
 * Hands a conversation over to humans: AI paused, status PENDING so it stands out in the inbox,
 * plus an internal SYSTEM note. Shared by the AI service and (later) other triggers.
 */
export async function transferToHuman(businessId: string, conversationId: string, reason: string) {
  await prisma.conversation.updateMany({
    where: { id: conversationId, businessId },
    data: { aiActive: false, status: 'PENDING' },
  });
  await addMessage({
    businessId,
    conversationId,
    senderType: 'SYSTEM',
    content: 'Conversation transmise à l’équipe.',
    direction: 'OUTBOUND',
    metadata: { internal: true, event: 'handoff', reason },
  });
}
