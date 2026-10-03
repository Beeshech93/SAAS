import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { getAIProvider } from './integrations/ai/provider';
import { registerAIResponder } from './modules/ai/ai.service';

if (getAIProvider()) registerAIResponder();
else logger.warn('AI_API_KEY not set: automatic replies are disabled');

const server = createApp().listen(env.API_PORT, () =>
  logger.info({ port: env.API_PORT, env: env.NODE_ENV }, 'API listening'),
);

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
