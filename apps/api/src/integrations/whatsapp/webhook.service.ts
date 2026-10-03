import { MessageType, Prisma } from '@prisma/client';
import { z } from 'zod';
import { logger } from '../../lib/logger';
import { normalizePhone } from '../../lib/phone';
import { prisma } from '../../lib/prisma';
import { findOrCreateConversation, addMessage } from '../../modules/conversations/conversations.service';
import { findOrCreateCustomerByPhone } from '../../modules/customers/customers.service';
import { getAutoResponder } from '../../modules/automation/responder';
import { findAutoReply, optOutIntent } from '../../modules/automation/rules.service';
import { canSend } from '../../modules/billing/billing.service';
import { deliverText, markInboundAsRead } from './outbound';

const media = z.object({
  id: z.string().optional(),
  mime_type: z.string().optional(),
  caption: z.string().optional(),
  filename: z.string().optional(),
});

const inboundMessage = z
  .object({
    id: z.string().min(1),
    from: z.string().min(1),
    type: z.string(),
    text: z.object({ body: z.string() }).optional(),
    image: media.optional(),
    video: media.optional(),
    document: media.optional(),
    audio: media.optional(),
    button: z.object({ text: z.string().optional(), payload: z.string().optional() }).optional(),
    interactive: z
      .object({
        type: z.string(),
        button_reply: z.object({ id: z.string(), title: z.string() }).optional(),
        list_reply: z.object({ id: z.string(), title: z.string(), description: z.string().optional() }).optional(),
      })
      .optional(),
  })
  .passthrough();

const payloadSchema = z.object({
  entry: z
    .array(
      z.object({
        changes: z
          .array(
            z.object({
              field: z.string(),
              value: z
                .object({
                  metadata: z.object({ phone_number_id: z.string() }).passthrough().optional(),
                  contacts: z.array(z.object({ wa_id: z.string().optional(), profile: z.object({ name: z.string().optional() }).optional() })).optional(),
                  messages: z.array(inboundMessage).optional(),
                  statuses: z.array(z.unknown()).optional(),
                })
                .passthrough(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

export type Inbound = z.infer<typeof inboundMessage>;

const MAX = 4096;

/** Maps a WhatsApp message to our model. Unsupported kinds are kept as a readable placeholder. */
export function toStoredMessage(m: Inbound): { type: MessageType; content: string; metadata: Prisma.InputJsonValue } {
  const mediaOf = (kind: 'image' | 'video' | 'document' | 'audio') => {
    const x = m[kind];
    return { type: kind.toUpperCase() as MessageType, content: x?.caption ?? x?.filename ?? `[${kind}]`, metadata: { waType: m.type, mediaId: x?.id ?? null, mimeType: x?.mime_type ?? null } };
  };
  switch (m.type) {
    case 'text':
      return { type: 'TEXT', content: (m.text?.body ?? '').slice(0, MAX), metadata: { waType: 'text' } };
    case 'image':
    case 'video':
    case 'document':
    case 'audio':
      return mediaOf(m.type);
    case 'button':
      return { type: 'BUTTON', content: m.button?.text ?? m.button?.payload ?? '[button]', metadata: { waType: 'button', payload: m.button?.payload ?? null } };
    case 'interactive': {
      const b = m.interactive?.button_reply;
      const l = m.interactive?.list_reply;
      if (b) return { type: 'BUTTON', content: b.title, metadata: { waType: 'interactive', replyId: b.id } };
      if (l) return { type: 'LIST', content: l.title, metadata: { waType: 'interactive', replyId: l.id } };
      return { type: 'TEXT', content: '[interactive]', metadata: { waType: 'interactive' } };
    }
    default:
      return { type: 'TEXT', content: `[${m.type}]`, metadata: { waType: m.type, unsupported: true } };
  }
}

/**
 * Entry point for a (signature-verified) webhook payload. Never throws: Meta must get a 200
 * or it keeps retrying; failures are logged and one bad message does not block the others.
 */
export async function handleWebhookPayload(payload: unknown): Promise<{ processed: number }> {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn({ event: 'whatsapp_webhook_malformed' }, 'Malformed WhatsApp payload ignored');
    return { processed: 0 };
  }
  let processed = 0;

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') continue;
      const { metadata, contacts, messages, statuses } = change.value;
      if (statuses?.length) logger.debug({ event: 'whatsapp_status_updates', count: statuses.length }, 'Status updates received');
      if (!messages?.length || !metadata) continue;

      // Tenant identification: the receiving number maps to exactly one business.
      const integration = await prisma.whatsAppIntegration.findFirst({
        where: { phoneNumberId: metadata.phone_number_id, status: 'ACTIVE' },
      });
      if (!integration) {
        logger.warn({ event: 'whatsapp_unknown_number', phoneNumberId: metadata.phone_number_id }, 'No active integration for number');
        continue;
      }

      for (const msg of messages) {
        const name = contacts?.find((c) => c.wa_id === msg.from)?.profile?.name ?? null;
        try {
          if (await processInbound(integration.businessId, msg, name)) processed++;
        } catch (err) {
          logger.error({ event: 'whatsapp_inbound_failed', businessId: integration.businessId, waMessageId: msg.id, error: (err as Error).message }, 'Inbound processing failed');
        }
      }
    }
  }
  return { processed };
}

export async function processInbound(businessId: string, msg: Inbound, profileName: string | null): Promise<boolean> {
  // Idempotency: Meta retries deliveries.
  if (await prisma.message.findFirst({ where: { businessId, externalId: msg.id } })) return false;

  const phone = normalizePhone(msg.from);
  if (!phone) {
    logger.warn({ event: 'whatsapp_bad_sender', businessId }, 'Invalid sender number');
    return false;
  }

  const customer = await findOrCreateCustomerByPhone(businessId, phone, profileName);
  const conversation = await findOrCreateConversation(businessId, customer.id, 'WHATSAPP');
  const stored = toStoredMessage(msg);

  await addMessage({
    businessId,
    conversationId: conversation.id,
    senderType: 'CUSTOMER',
    senderId: customer.id,
    content: stored.content,
    messageType: stored.type,
    direction: 'INBOUND',
    metadata: stored.metadata,
    externalId: msg.id,
  });
  logger.info({ event: 'whatsapp_inbound', businessId, conversationId: conversation.id, type: msg.type }, 'Inbound message stored');
  void markInboundAsRead(businessId, msg.id);

  // Marketing opt-out / opt-in keywords are handled first and never reach the rules or the AI.
  const intent = stored.type === 'TEXT' ? optOutIntent(stored.content) : null;
  if (intent) {
    await prisma.customer.updateMany({ where: { id: customer.id, businessId }, data: { marketingOptOut: intent === 'STOP' } });
    await sendAuto(businessId, conversation.id, phone, intent === 'STOP'
      ? 'Vous ne recevrez plus nos messages promotionnels. Répondez START pour vous réabonner.'
      : 'Merci, vous recevrez à nouveau nos messages.', { auto: 'optout', optOut: intent === 'STOP' });
    return true;
  }

  // Who answers? Only while the conversation's automation is ACTIVE; otherwise a human does.
  // Order: automatic-reply rules (keyword / away / welcome), then the AI.
  if (conversation.aiActive && stored.type === 'TEXT') {
    const hit = await findAutoReply({ businessId, conversationId: conversation.id, text: stored.content, customerName: customer.name });
    if (hit) {
      if ((await canSend(businessId)).ok) await sendAuto(businessId, conversation.id, phone, hit.reply, { auto: 'rule', ruleId: hit.ruleId });
      return true;
    }
    const responder = getAutoResponder();
    if (responder) {
      const reply = await responder.respond({ businessId, conversationId: conversation.id, customerId: customer.id, text: stored.content });
      if (reply) await sendAuto(businessId, conversation.id, phone, reply);
    }
  }
  return true;
}

/** Sends an automatic reply through the business's number and records it with its delivery result. */
async function sendAuto(businessId: string, conversationId: string, phone: string, text: string, metadata: Record<string, unknown> = {}) {
  const result = await deliverText(businessId, phone, text);
  await addMessage({
    businessId,
    conversationId,
    senderType: 'AI',
    content: text,
    direction: 'OUTBOUND',
    metadata: { ...metadata, delivery: result.delivery, ...(result.error ? { error: result.error } : {}) } as Prisma.InputJsonValue,
    externalId: result.messageId ?? null,
  });
}
