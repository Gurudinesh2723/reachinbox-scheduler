import { describe, expect, it, afterAll } from 'vitest';
import IORedis from 'ioredis';

/**
 * This suite exercises the real Redis Lua script (services/rateLimiter.ts)
 * against a real Redis instance, since the whole point of that module is
 * atomicity guarantees that a mock cannot faithfully represent. It requires
 * `docker compose up -d` (or any reachable REDIS_URL) and is skipped
 * automatically when Redis isn't reachable, so `npm test` still passes in an
 * environment with no infra running.
 */
const probe = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  lazyConnect: true,
  retryStrategy: () => null,
  maxRetriesPerRequest: 1,
});

let redisAvailable = false;
try {
  await probe.connect();
  await probe.ping();
  redisAvailable = true;
} catch {
  redisAvailable = false;
} finally {
  probe.disconnect();
}

describe.skipIf(!redisAvailable)('reserveSendSlot (real Redis)', () => {
  afterAll(async () => {
    const { redis } = await import('../../src/config/redis');
    await redis.quit();
  });

  it('allows sends up to the hourly limit and denies the next one', async () => {
    const { reserveSendSlot } = await import('../../src/services/rateLimiter');
    const senderId = `test-sender-${Date.now()}`;
    const now = new Date();

    for (let i = 0; i < 5; i++) {
      const result = await reserveSendSlot({ senderId, hourlyLimit: 5, minEmailDelayMs: 0, now });
      expect(result.allowed).toBe(true);
    }

    const sixth = await reserveSendSlot({ senderId, hourlyLimit: 5, minEmailDelayMs: 0, now });
    expect(sixth.allowed).toBe(false);
    expect(sixth.reason).toBe('rate_limited');
  });

  it('never allows more than the limit under concurrent callers', async () => {
    const { reserveSendSlot } = await import('../../src/services/rateLimiter');
    const senderId = `test-sender-concurrent-${Date.now()}`;
    const now = new Date();

    const results = await Promise.all(
      Array.from({ length: 20 }, () => reserveSendSlot({ senderId, hourlyLimit: 10, minEmailDelayMs: 0, now })),
    );

    const allowedCount = results.filter((r) => r.allowed).length;
    expect(allowedCount).toBe(10);
  });

  it('enforces the minimum delay between sends for the same sender', async () => {
    const { reserveSendSlot } = await import('../../src/services/rateLimiter');
    const senderId = `test-sender-delay-${Date.now()}`;
    const now = new Date();

    const first = await reserveSendSlot({ senderId, hourlyLimit: 100, minEmailDelayMs: 2000, now });
    expect(first.allowed).toBe(true);

    const second = await reserveSendSlot({ senderId, hourlyLimit: 100, minEmailDelayMs: 2000, now });
    expect(second.allowed).toBe(false);
    expect(second.reason).toBe('min_delay');

    const afterDelay = await reserveSendSlot({
      senderId,
      hourlyLimit: 100,
      minEmailDelayMs: 2000,
      now: new Date(now.getTime() + 2100),
    });
    expect(afterDelay.allowed).toBe(true);
  });
});
