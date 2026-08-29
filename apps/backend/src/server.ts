import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/prisma';
import { ensureEmailsIndex } from './integrations/elasticsearch/client';
import { reconcileOrphanedEmailJobs } from './services/schedulingService';

async function main() {
  await prisma.$connect();
  logger.info('Connected to PostgreSQL');

  await ensureEmailsIndex();

  const reconciled = await reconcileOrphanedEmailJobs();
  logger.info({ reconciled }, 'Startup reconciliation complete');

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'ReachInbox API server started');
    logger.info(`BullMQ dashboard available at http://localhost:${env.PORT}/admin/queues`);
    logger.info(`API docs available at http://localhost:${env.PORT}/api-docs`);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down server');
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during server startup');
  process.exit(1);
});
