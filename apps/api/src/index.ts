import { createApp } from './app';
import { env } from './config/env';
import { getAIProvider } from './integrations/ai/provider';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { registerAIResponder } from './modules/ai/ai.service';

if (getAIProvider()) registerAIResponder();
else logger.warn('AI_API_KEY not set: automatic replies are disabled');

const app = createApp();

// On Vercel the platform invokes the exported app as a function; everywhere else we run a server.
if (!process.env.VERCEL) {
  const server = app.listen(env.API_PORT, () =>
    logger.info({ port: env.API_PORT, env: env.NODE_ENV }, 'API listening'),
  );

  const shutdown = async () => {
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

export default app;
