import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { getAIProvider } from '../../integrations/ai/provider';
import { authenticate, requireRole } from '../../middleware/auth';
import { validateBody } from '../../middleware/validate';
import { requireFeature } from '../billing/billing.service';
import { answer } from './ai.service';

const previewSchema = z
  .object({
    message: z.string().trim().min(1).max(1000),
    history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(1000) })).max(10).default([]),
  })
  .strict();

export const aiRouter = Router();
aiRouter.use(authenticate, requireRole('OWNER', 'ADMIN'));
aiRouter.use(rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false,
  keyGenerator: (req) => req.auth?.userId ?? req.ip ?? 'anon',
  handler: (_req, res) => res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } }) }));

aiRouter.get('/status', (_req, res) => {
  res.json({ success: true, data: { available: !!getAIProvider() } });
});

// Dry run for the dashboard: nothing is stored or sent to WhatsApp.
aiRouter.post('/preview', requireFeature('ai'), validateBody(previewSchema), async (req, res, next) => {
  try {
    const history = req.body.history.map((h: { role: string; content: string }) => ({
      content: h.content,
      direction: h.role === 'user' ? 'INBOUND' : 'OUTBOUND',
    }));
    res.json({ success: true, data: await answer(req.auth!.businessId, req.body.message, history) });
  } catch (e) {
    next(e);
  }
});
