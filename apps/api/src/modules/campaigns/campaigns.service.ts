import { env } from '../../config/env';
import { AppError, conflict, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { deliverText, loadActiveIntegration } from '../../integrations/whatsapp/outbound';
import { canSend, getEntitlements, planLimitError, recordOutboundMessage } from '../billing/billing.service';
import { renderTemplate } from '../automation/rules.service';

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/** Customers a campaign would reach right now: not opted out, optionally active in the last N days. */
export async function audience(businessId: string, recentDays?: number | null) {
  let customers = await prisma.customer.findMany({ where: { businessId, marketingOptOut: false } });
  if (recentDays) {
    const since = new Date(Date.now() - recentDays * 86400_000);
    const active = await prisma.conversation.findMany({ where: { businessId, lastMessageAt: { gte: since } } });
    const ids = new Set(active.map((c) => c.customerId));
    customers = customers.filter((c) => ids.has(c.id));
  }
  return customers;
}

async function load(businessId: string, id: string) {
  const c = await prisma.campaign.findFirst({ where: { id, businessId } });
  if (!c) throw notFound('Campaign not found');
  return c;
}

/** DRAFT -> SENDING: snapshots the audience as PENDING recipients. Nothing is sent yet. */
export async function startCampaign(businessId: string, id: string) {
  const campaign = await load(businessId, id);
  if (campaign.status !== 'DRAFT') throw conflict('Campaign already started');
  if (!(await loadActiveIntegration(businessId))) throw conflict('WhatsApp is not connected');
  const allowed = await canSend(businessId);
  if (!allowed.ok) throw planLimitError(allowed.reason);

  const customers = await audience(businessId, campaign.recentDays);
  if (!customers.length) throw new AppError(400, 'VALIDATION_ERROR', 'No recipients for this audience');
  const e = await getEntitlements(businessId);
  const remaining = e.limits.messages - e.usage.messages;
  if (customers.length > remaining) throw new AppError(402, 'PLAN_LIMIT', `Not enough messages left in your plan (${remaining} left, ${customers.length} recipients)`, { reason: 'MESSAGE_LIMIT_REACHED', remaining, recipients: customers.length });

  // Claim the DRAFT -> SENDING transition atomically so a double click cannot snapshot twice.
  const { count } = await prisma.campaign.updateMany({
    where: { id, businessId, status: 'DRAFT' },
    data: { status: 'SENDING', startedAt: new Date(), totalCount: customers.length, sentCount: 0, failedCount: 0 },
  });
  if (!count) throw conflict('Campaign already started');
  await prisma.campaignRecipient.createMany({
    data: customers.map((c) => ({ campaignId: id, businessId, customerId: c.id, phone: c.phone, name: c.name })),
  });
  logger.info({ event: 'campaign_started', businessId, campaignId: id, recipients: customers.length }, 'Campaign started');
  return load(businessId, id);
}

export interface BatchResult {
  campaign: Awaited<ReturnType<typeof load>>;
  remaining: number;
  /** Why the batch stopped early (sending can be resumed later). */
  blocked?: 'MESSAGE_LIMIT_REACHED' | 'SUBSCRIPTION_INACTIVE' | 'WHATSAPP_NOT_CONNECTED';
}

/** Sends the next small batch. Safe to call repeatedly and concurrently: each recipient is claimed first. */
export async function processBatch(businessId: string, id: string, size = env.CAMPAIGN_BATCH_SIZE): Promise<BatchResult> {
  let campaign = await load(businessId, id);
  if (campaign.status !== 'SENDING') return { campaign, remaining: 0 };

  const pending = await prisma.campaignRecipient.findMany({ where: { campaignId: id, businessId, status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: size });
  let blocked: BatchResult['blocked'];
  let first = true;

  for (const r of pending) {
    const { count } = await prisma.campaignRecipient.updateMany({ where: { id: r.id, status: 'PENDING' }, data: { status: 'SENDING' } });
    if (!count) continue; // another worker took it
    const release = () => prisma.campaignRecipient.updateMany({ where: { id: r.id }, data: { status: 'PENDING' } });

    const allowed = await canSend(businessId);
    if (!allowed.ok) { await release(); blocked = allowed.reason; break; }

    // The customer may have said STOP since the snapshot.
    const customer = await prisma.customer.findFirst({ where: { id: r.customerId, businessId } });
    if (!customer || customer.marketingOptOut) {
      await prisma.campaignRecipient.updateMany({ where: { id: r.id }, data: { status: 'SKIPPED', error: 'Opted out' } });
      continue;
    }

    if (!first) await sleep(env.CAMPAIGN_SEND_DELAY_MS);
    first = false;
    const result = await deliverText(businessId, r.phone, renderTemplate(campaign.message, customer.name));
    if (result.delivery === 'not_configured') { await release(); blocked = 'WHATSAPP_NOT_CONNECTED'; break; }
    if (result.delivery === 'sent') {
      await prisma.campaignRecipient.updateMany({ where: { id: r.id }, data: { status: 'SENT', externalId: result.messageId ?? null, sentAt: new Date() } });
      await prisma.campaign.updateMany({ where: { id, businessId }, data: { sentCount: { increment: 1 } } });
      await recordOutboundMessage(businessId);
    } else {
      await prisma.campaignRecipient.updateMany({ where: { id: r.id }, data: { status: 'FAILED', error: (result.error ?? 'Send failed').slice(0, 300) } });
      await prisma.campaign.updateMany({ where: { id, businessId }, data: { failedCount: { increment: 1 } } });
    }
  }

  const remaining = await prisma.campaignRecipient.count({ where: { campaignId: id, status: 'PENDING' } });
  const inFlight = await prisma.campaignRecipient.count({ where: { campaignId: id, status: 'SENDING' } });
  if (remaining === 0 && inFlight === 0 && !blocked) {
    await prisma.campaign.updateMany({ where: { id, businessId, status: 'SENDING' }, data: { status: 'COMPLETED', completedAt: new Date() } });
    logger.info({ event: 'campaign_completed', businessId, campaignId: id }, 'Campaign completed');
  }
  campaign = await load(businessId, id);
  return { campaign, remaining, ...(blocked ? { blocked } : {}) };
}

/** Stops sending; recipients not yet processed are marked SKIPPED. */
export async function cancelCampaign(businessId: string, id: string) {
  const c = await load(businessId, id);
  if (c.status !== 'SENDING' && c.status !== 'DRAFT') throw conflict('Campaign is not running');
  await prisma.campaign.updateMany({ where: { id, businessId }, data: { status: 'CANCELLED', completedAt: new Date() } });
  await prisma.campaignRecipient.updateMany({ where: { campaignId: id, status: 'PENDING' }, data: { status: 'SKIPPED', error: 'Cancelled' } });
  return load(businessId, id);
}
