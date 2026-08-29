import IORedis, { Redis } from 'ioredis';
import { env } from './env';
import { logger } from './logger';

/**
 * BullMQ requires maxRetriesPerRequest to be null on connections it manages.
 * We reuse a single connection factory so every queue/worker/rate-limit
 * consumer talks to the same Redis instance that backs BullMQ's durable state.
 */
export function createRedisConnection(name: string): Redis {
  const client = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  client.on('error', (err) => logger.error({ err, connection: name }, 'Redis connection error'));
  client.on('connect', () => logger.info({ connection: name }, 'Redis connected'));

  return client;
}

export const redis = createRedisConnection('shared');
