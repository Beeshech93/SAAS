import { PlanCode } from '@prisma/client';

export interface FeatureFlags {
  ai: boolean;
  analytics: boolean;
  customBranding: boolean;
  prioritySupport: boolean;
}

/**
 * Default catalog. PLACEHOLDER prices/limits: adjust them (here before first run, or in the Plan
 * table afterwards) once pricing is decided. Prices are in cents.
 */
export const PLAN_DEFAULTS: Record<PlanCode, { name: string; priceCents: number; messageLimit: number; userLimit: number; featureFlags: FeatureFlags }> = {
  STARTER: { name: 'Starter', priceCents: 2900, messageLimit: 500, userLimit: 3, featureFlags: { ai: true, analytics: true, customBranding: false, prioritySupport: false } },
  BUSINESS: { name: 'Business', priceCents: 7900, messageLimit: 3000, userLimit: 10, featureFlags: { ai: true, analytics: true, customBranding: true, prioritySupport: false } },
  PRO: { name: 'Pro', priceCents: 19900, messageLimit: 15000, userLimit: 30, featureFlags: { ai: true, analytics: true, customBranding: true, prioritySupport: true } },
};

export const PLAN_ORDER: PlanCode[] = ['STARTER', 'BUSINESS', 'PRO'];
export const TRIAL_DAYS = 14;
