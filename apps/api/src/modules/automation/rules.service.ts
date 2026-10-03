import { AutoReplyRule } from '@prisma/client';
import { prisma } from '../../lib/prisma';

const AWAY_REPEAT_MS = 12 * 3600_000;
const TRIGGER_RANK = { KEYWORD: 0, AWAY: 1, WELCOME: 2 } as const;

/** Lowercase, accent-free, trimmed: "Réservation ?" -> "reservation ?". */
export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};

/** Minutes since local midnight in an IANA timezone. Falls back to UTC on a bad timezone. */
export function localMinutes(now: Date, timezone: string): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

/** [from, to) in minutes; a window that wraps midnight (22:00-07:00) is supported. */
export function inWindow(from: string, to: string, minutes: number) {
  const a = minutesOf(from);
  const b = minutesOf(to);
  if (a === b) return false;
  return a < b ? minutes >= a && minutes < b : minutes >= a || minutes < b;
}

export const firstName = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] ?? '';

/** Fills {{name}} with the customer's first name; without a name the placeholder and its leading space vanish. */
export function renderTemplate(text: string, name?: string | null) {
  const first = firstName(name);
  return text.replace(/([ \t]*)\{\{\s*name\s*\}\}/gi, (_m, space: string) => (first ? `${space}${first}` : '')).trim();
}

export interface MatchContext {
  text: string;
  isFirstMessage: boolean;
  now: Date;
  timezone: string;
  /** Rules already sent recently in this conversation (AWAY is not repeated for 12 h). */
  recentRuleIds?: Set<string>;
}

type RuleLike = Pick<AutoReplyRule, 'id' | 'trigger' | 'keywords' | 'activeFrom' | 'activeTo' | 'priority' | 'active'> & { createdAt?: Date };

/** Pure: which rule answers this message? Keyword rules win, then away, then welcome; ties by priority. */
export function pickRule<T extends RuleLike>(rules: T[], ctx: MatchContext): T | null {
  const text = normalize(ctx.text);
  const minutes = localMinutes(ctx.now, ctx.timezone);
  const ordered = rules
    .filter((r) => r.active)
    .sort((a, b) => TRIGGER_RANK[a.trigger] - TRIGGER_RANK[b.trigger] || b.priority - a.priority || +(a.createdAt ?? 0) - +(b.createdAt ?? 0));
  for (const r of ordered) {
    const windowOk = !r.activeFrom || !r.activeTo || inWindow(r.activeFrom, r.activeTo, minutes);
    if (r.trigger === 'KEYWORD') {
      if (r.keywords.some((k) => k.trim() && new RegExp(`(^|[^a-z0-9])${escapeRe(normalize(k))}($|[^a-z0-9])`).test(text))) return r;
    } else if (r.trigger === 'WELCOME') {
      if (ctx.isFirstMessage && windowOk) return r;
    } else if (r.trigger === 'AWAY') {
      if (r.activeFrom && r.activeTo && windowOk && !ctx.recentRuleIds?.has(r.id)) return r;
    }
  }
  return null;
}

/** Loads what the matcher needs for one inbound message and returns the reply to send, if any. */
export async function findAutoReply(args: { businessId: string; conversationId: string; text: string; customerName?: string | null; now?: Date }) {
  const { businessId, conversationId } = args;
  const rules = await prisma.autoReplyRule.findMany({ where: { businessId, active: true } });
  if (!rules.length) return null;
  const now = args.now ?? new Date();
  const business = await prisma.business.findUnique({ where: { id: businessId } });
  const inbound = await prisma.message.findMany({ where: { conversationId, businessId, senderType: 'CUSTOMER' } });
  const outbound = await prisma.message.findMany({ where: { conversationId, businessId, direction: 'OUTBOUND' }, orderBy: { createdAt: 'desc' }, take: 20 });
  const recentRuleIds = new Set<string>();
  for (const m of outbound) {
    const ruleId = (m.metadata as { ruleId?: string } | null)?.ruleId;
    if (ruleId && now.getTime() - m.createdAt.getTime() < AWAY_REPEAT_MS) recentRuleIds.add(ruleId);
  }
  const rule = pickRule(rules, { text: args.text, isFirstMessage: inbound.length <= 1, now, timezone: business?.timezone ?? 'UTC', recentRuleIds });
  return rule ? { ruleId: rule.id, reply: renderTemplate(rule.reply, args.customerName) } : null;
}

const STOP = new Set(['stop', 'arret', 'arreter', 'desabonner', 'desabonnement', 'unsubscribe', 'annuler abonnement']);
const START = new Set(['start', 'reabonner', 'subscribe']);

/** Exact-match only ("stop"), so a sentence containing the word never unsubscribes someone. */
export function optOutIntent(text: string): 'STOP' | 'START' | null {
  const t = normalize(text).replace(/[.!?]+$/g, '');
  return STOP.has(t) ? 'STOP' : START.has(t) ? 'START' : null;
}
