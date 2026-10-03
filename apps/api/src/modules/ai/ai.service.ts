import { getAIProvider, ChatTurn } from '../../integrations/ai/provider';
import { logger, securityLog } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { canSend, getEntitlements } from '../billing/billing.service';
import { AutoResponder, InboundContext, setAutoResponder } from '../automation/responder';
import { transferToHuman } from '../conversations/conversations.service';
import {
  buildSystemPrompt, CANARY, cleanUserText, FALLBACK_HANDOFF, FALLBACK_NO_INFO, HANDOFF,
  looksLikeInjection, NO_INFO, outOfScope, wantsHuman,
} from './prompt';

export type AIAction = 'answer' | 'no_info' | 'handoff' | 'blocked' | 'disabled' | 'error';
export interface AIAnswer {
  action: AIAction;
  reply: string | null;
}

const HISTORY_LIMIT = 12;
const MAX_REPLIES_PER_HOUR = 30;
const recent = new Map<string, number[]>(); // per conversation; move to Redis when scaling out

function overRateLimit(conversationId: string): boolean {
  const now = Date.now();
  const hits = (recent.get(conversationId) ?? []).filter((t) => now - t < 3_600_000);
  if (hits.length >= MAX_REPLIES_PER_HOUR) return true;
  hits.push(now);
  recent.set(conversationId, hits);
  return false;
}

/** Roles must alternate and start with "user" (provider requirement). */
export function toTurns(history: { content: string; direction: string }[]): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const m of history) {
    const role = m.direction === 'INBOUND' ? 'user' : 'assistant';
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n${m.content}`;
    else turns.push({ role, content: m.content });
  }
  while (turns.length && turns[0]!.role !== 'user') turns.shift();
  return turns;
}

/**
 * Pure decision: what should the assistant say to `text`? No side effects, so it also
 * powers the dashboard preview. Only data of `businessId` is ever loaded into the prompt.
 */
export async function answer(
  businessId: string,
  text: string,
  history: { content: string; direction: string }[] = [],
): Promise<AIAnswer & { businessName?: string }> {
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  if (!business || !business.aiEnabled) return { action: 'disabled', reply: null };
  const provider = getAIProvider();
  if (!provider) return { action: 'disabled', reply: null };

  const clean = cleanUserText(text);
  if (!clean) return { action: 'disabled', reply: null };

  // Deterministic rules run before the model: they cannot be talked out of.
  if (wantsHuman(clean)) return { action: 'handoff', reply: FALLBACK_HANDOFF };
  if (looksLikeInjection(clean)) {
    securityLog.warn({ event: 'prompt_injection_suspected', businessId }, 'Possible prompt injection blocked');
    return { action: 'blocked', reply: outOfScope(business.name) };
  }

  const [faqs, services] = await Promise.all([
    prisma.faq.findMany({ where: { businessId, active: true }, orderBy: { createdAt: 'asc' }, take: 100 }),
    prisma.service.findMany({ where: { businessId, available: true }, orderBy: { createdAt: 'asc' }, take: 100 }),
  ]);

  const system = buildSystemPrompt({ business, rules: business.aiRules, faqs, services });
  const turns = toTurns([...history.map((h) => ({ ...h, content: cleanUserText(h.content) })), { content: clean, direction: 'INBOUND' }]);

  let raw: string;
  try {
    raw = await provider.complete({ system, messages: turns });
  } catch (err) {
    logger.error({ event: 'ai_provider_failed', businessId, error: (err as Error).message }, 'AI provider failed');
    return { action: 'error', reply: null };
  }

  const out = raw.trim();
  if (out.includes(CANARY)) {
    securityLog.warn({ event: 'ai_prompt_leak_blocked', businessId }, 'Model output contained the prompt canary');
    return { action: 'blocked', reply: outOfScope(business.name) };
  }
  if (out.startsWith(NO_INFO)) return { action: 'no_info', reply: FALLBACK_NO_INFO };
  if (out.startsWith(HANDOFF)) return { action: 'handoff', reply: FALLBACK_HANDOFF };
  return { action: 'answer', reply: out };
}

/** Webhook integration: loads history, answers, and performs the handoff when required. */
export const aiResponder: AutoResponder = {
  async respond(ctx: InboundContext) {
    if (overRateLimit(ctx.conversationId)) {
      logger.warn({ event: 'ai_rate_limited', conversationId: ctx.conversationId }, 'AI reply limit reached');
      return null;
    }
    // Subscription / quota / feature flag gate: no model call (and no cost) when not entitled.
    const [allowed, ent] = await Promise.all([canSend(ctx.businessId), getEntitlements(ctx.businessId)]);
    if (!allowed.ok || !ent.flags.ai) {
      logger.warn({ event: 'ai_blocked_by_plan', businessId: ctx.businessId, reason: allowed.ok ? 'FEATURE_NOT_IN_PLAN' : allowed.reason }, 'AI reply blocked by plan');
      await prisma.conversation.updateMany({ where: { id: ctx.conversationId, businessId: ctx.businessId }, data: { status: 'PENDING' } });
      return null;
    }
    // Newest messages first, then flip; skip internal notes. The current message is the last inbound one.
    const rows = await prisma.message.findMany({
      where: { conversationId: ctx.conversationId, businessId: ctx.businessId },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT + 1,
    });
    const history = rows
      .reverse()
      .filter((m: any) => !(m.metadata as any)?.internal)
      .map((m: any) => ({ content: m.content, direction: m.direction as string }));
    // Drop the current inbound message from history (answer() appends it from ctx.text).
    if (history.length && history[history.length - 1]!.direction === 'INBOUND') history.pop();

    const result = await answer(ctx.businessId, ctx.text, history);

    if (result.action === 'no_info' || result.action === 'handoff') {
      await transferToHuman(ctx.businessId, ctx.conversationId, result.action);
    } else if (result.action === 'error') {
      // Make sure staff notices an unanswered customer.
      await prisma.conversation.updateMany({ where: { id: ctx.conversationId, businessId: ctx.businessId }, data: { status: 'PENDING' } });
    }
    return result.reply;
  },
};

export const registerAIResponder = () => setAutoResponder(aiResponder);
