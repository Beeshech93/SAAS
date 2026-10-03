import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { authRouter } from './modules/auth/auth.routes';
import { businessRouter } from './modules/business/business.routes';
import { whatsappWebhookRouter } from './integrations/whatsapp/webhook.routes';
import { evolutionWebhookRouter } from './integrations/whatsapp/evolution.webhook';
import { plansRouter, subscriptionRouter } from './modules/billing/billing.routes';
import { analyticsRouter } from './modules/analytics/analytics.routes';
import { teamRouter } from './modules/team/team.routes';
import { aiRouter } from './modules/ai/ai.routes';
import { whatsappRouter } from './modules/whatsapp/whatsapp.routes';
import { conversationsRouter } from './modules/conversations/conversations.routes';
import { customersRouter } from './modules/customers/customers.routes';
import { messagesRouter } from './modules/messages/messages.routes';
import { faqRouter } from './modules/faq/faq.routes';
import { servicesRouter } from './modules/services/services.routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Needed so rate limits key on the real client IP (X-Forwarded-For) behind the web proxy.
  app.set('trust proxy', env.TRUST_PROXY);
  app.use(helmet());
  app.use(cors({ origin: env.APP_URL, credentials: true }));
  // Keep the raw body: the WhatsApp webhook signature is computed over it.
  app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { (req as unknown as { rawBody: Buffer }).rawBody = buf; } }));
  app.use(cookieParser());

  // Generic abuse protection for the whole API; auth routes have a stricter limiter of their own.
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: env.RATE_LIMIT_API_PER_MIN,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      skip: (req) => req.path.startsWith('/webhooks/'), // Meta's traffic is authenticated by signature
      handler: (_req, res) =>
        res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } }),
    }),
  );

  const health: express.RequestHandler = (_req, res) => res.json({ success: true, data: { status: 'ok' } });
  app.get('/health', health);
  app.get('/api/health', health); // reachable through the /api/* public route on Vercel
  app.use('/api/auth', authRouter);
  app.use('/api/business', businessRouter);
  app.use('/api/faqs', faqRouter);
  app.use('/api/services', servicesRouter);
  app.use('/api/customers', customersRouter);
  app.use('/api/conversations', conversationsRouter);
  app.use('/api/messages', messagesRouter);
  app.use('/api/whatsapp', whatsappRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/team', teamRouter);
  app.use('/api/plans', plansRouter);
  app.use('/api/subscription', subscriptionRouter);
  app.use('/api/webhooks/whatsapp', whatsappWebhookRouter);
  app.use('/webhooks/whatsapp', whatsappWebhookRouter);
  app.use('/api/webhooks/evolution', evolutionWebhookRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
