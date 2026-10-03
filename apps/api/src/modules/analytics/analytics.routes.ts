import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { requireFeature } from '../billing/billing.service';

export const analyticsRouter = Router();
analyticsRouter.use(authenticate, requireRole('OWNER', 'ADMIN'), requireFeature('analytics'));

const DAY = 86_400_000;

/** Average seconds between a conversation's first customer message and the first AI/agent reply. */
export function firstResponseStats(
  msgs: { conversationId: string; direction: string; senderType: string; createdAt: Date }[],
) {
  const byConv = new Map<string, typeof msgs>();
  for (const m of msgs) {
    if (m.senderType === 'SYSTEM') continue;
    (byConv.get(m.conversationId) ?? byConv.set(m.conversationId, []).get(m.conversationId)!).push(m);
  }
  const all: number[] = [];
  const ai: number[] = [];
  const agent: number[] = [];
  for (const list of byConv.values()) {
    list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const first = list.find((m) => m.direction === 'INBOUND');
    if (!first) continue;
    const reply = list.find((m) => m.direction === 'OUTBOUND' && m.createdAt >= first.createdAt);
    if (!reply) continue;
    const secs = (reply.createdAt.getTime() - first.createdAt.getTime()) / 1000;
    all.push(secs);
    (reply.senderType === 'AI' ? ai : agent).push(secs);
  }
  const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
  return { averageSeconds: avg(all), aiAverageSeconds: avg(ai), agentAverageSeconds: avg(agent), sampleSize: all.length };
}

analyticsRouter.get('/', async (req, res, next) => {
  try {
    const businessId = req.auth!.businessId;
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    const tz = business?.timezone ?? 'UTC';
    const humanOrAi = { in: ['AI', 'AGENT'] as ('AI' | 'AGENT')[] };

    const count = {
      total: prisma.conversation.count({ where: { businessId } }),
      open: prisma.conversation.count({ where: { businessId, status: 'OPEN' } }),
      pending: prisma.conversation.count({ where: { businessId, status: 'PENDING' } }),
      resolved: prisma.conversation.count({ where: { businessId, status: 'RESOLVED' } }),
      closed: prisma.conversation.count({ where: { businessId, status: 'CLOSED' } }),
      customers: prisma.customer.count({ where: { businessId } }),
      inbound: prisma.message.count({ where: { businessId, direction: 'INBOUND' } }),
      outbound: prisma.message.count({ where: { businessId, direction: 'OUTBOUND', senderType: humanOrAi } }),
      byAI: prisma.message.count({ where: { businessId, senderType: 'AI' } }),
      byAgent: prisma.message.count({ where: { businessId, senderType: 'AGENT' } }),
    };
    const since = new Date(Date.now() - 30 * DAY);
    const recentMsgs = prisma.message.findMany({
      where: { businessId, createdAt: { gte: since }, senderType: { in: ['CUSTOMER', 'AI', 'AGENT'] } },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const [total, open, pending, resolved, closed, customers, inbound, outbound, byAI, byAgent, msgs] = await Promise.all([
      count.total, count.open, count.pending, count.resolved, count.closed, count.customers,
      count.inbound, count.outbound, count.byAI, count.byAgent, recentMsgs,
    ]);

    // Last 7 days, bucketed in the business time zone.
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    const days: Record<string, { date: string; inbound: number; outbound: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const date = fmt.format(new Date(Date.now() - i * DAY));
      days[date] = { date, inbound: 0, outbound: 0 };
    }
    for (const m of msgs) {
      const bucket = days[fmt.format(m.createdAt)];
      if (bucket) bucket[m.direction === 'INBOUND' ? 'inbound' : 'outbound']++;
    }

    res.json({
      success: true,
      data: {
        conversations: { total, open, pending, resolved, closed },
        customers,
        messages: { total: inbound + outbound, inbound, outbound, byAI, byAgent },
        firstResponse: firstResponseStats(msgs),
        daily: Object.values(days),
        timezone: tz,
      },
    });
  } catch (e) {
    next(e);
  }
});
