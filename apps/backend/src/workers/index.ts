import { env } from '../config/env';
import { logger } from '../config/logger';
import { prisma } from '../config/prisma';
import { startEmailWorker } from './emailWorker';
import { reconcileOrphanedEmailJobs } from '../services/schedulingService';

async function main() {
  await prisma.$connect();
  logger.info('Worker process connected to PostgreSQL');

  await reconcileOrphanedEmailJobs();

  const worker = startEmailWorker();
  logger.info({ concurrency: env.WORKER_CONCURRENCY }, 'Email worker started');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down worker');
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error during worker startup');
  process.exit(1);
});
