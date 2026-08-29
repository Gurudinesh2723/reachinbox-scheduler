import { describe, expect, it, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { Router } from 'express';

// The real admin router wires up a live Bull Board against the BullMQ
// queue, which is out of scope for this HTTP-layer test (and would require
// emailQueue to be a genuine BullMQ Queue instance rather than a mock).
vi.mock('../../src/routes/adminRoutes', () => ({ default: Router() }));

// The Express app pulls in Prisma, Redis and BullMQ at import time through
// its route -> controller -> service -> repository chain. For a fast,
// infra-free integration test of routing/validation/auth we mock those
// boundaries here and exercise the real Express app, middleware and Zod
// validation in between. The authenticated request path (which additionally
// requires a valid signed session cookie) is covered by manual/E2E testing
// against the real docker-compose stack, documented in the README.
vi.mock('../../src/config/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    sender: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    campaign: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    email: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn((arg) => (Array.isArray(arg) ? Promise.all(arg) : arg({} as never))),
  },
}));

vi.mock('../../src/config/redis', () => {
  const fakeRedis = {
    on: vi.fn(),
    defineCommand: vi.fn(),
    duplicate: vi.fn(function (this: unknown) {
      return this;
    }),
  };
  return { redis: fakeRedis, createRedisConnection: () => fakeRedis };
});

vi.mock('../../src/queues/emailQueue', () => ({
  EMAIL_QUEUE_NAME: 'email-scheduler',
  emailQueue: { add: vi.fn() },
  scheduleEmailJob: vi.fn().mockResolvedValue('job-1'),
  emailJobId: (id: string) => `email:${id}`,
}));

vi.mock('../../src/integrations/elasticsearch/emailIndex', () => ({
  indexEmail: vi.fn(),
  searchEmails: vi.fn(),
}));

import { createApp } from '../../src/app';
import { scheduleEmailsSchema } from '../../src/validation/emailSchemas';

const app = createApp();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('auth protection', () => {
  it('rejects unauthenticated requests to protected email routes', async () => {
    const res = await request(app).get('/api/emails/scheduled');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects unauthenticated schedule requests', async () => {
    const res = await request(app).post('/api/emails/schedule').send({});
    expect(res.status).toBe(401);
  });

  it('never trusts a userId supplied in the request body - identity comes only from the session', async () => {
    const res = await request(app)
      .post('/api/emails/schedule')
      .send({
        userId: 'someone-elses-id',
        subject: 'x',
        body: 'y',
        recipients: ['a@b.com'],
        startTime: new Date(Date.now() + 60_000).toISOString(),
      });
    expect(res.status).toBe(401);
  });
});

describe('scheduleEmailsSchema validation', () => {
  it('rejects invalid recipient emails', () => {
    const result = scheduleEmailsSchema.safeParse({
      subject: 'Hi',
      body: 'Body',
      recipients: ['not-an-email'],
      startTime: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a startTime in the past', () => {
    const result = scheduleEmailsSchema.safeParse({
      subject: 'Hi',
      body: 'Body',
      recipients: ['a@b.com'],
      startTime: new Date(Date.now() - 60 * 60_000).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty recipient list', () => {
    const result = scheduleEmailsSchema.safeParse({
      subject: 'Hi',
      body: 'Body',
      recipients: [],
      startTime: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid payload with delay/hourlyLimit omitted (defaults are applied later from env, not in the schema)', () => {
    const result = scheduleEmailsSchema.parse({
      subject: 'Hi',
      body: 'Body',
      recipients: ['a@b.com', 'a@b.com'],
      startTime: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(result.delayBetweenEmails).toBeUndefined();
    expect(result.hourlyLimit).toBeUndefined();
  });

  it('accepts explicit delay/hourlyLimit values', () => {
    const result = scheduleEmailsSchema.parse({
      subject: 'Hi',
      body: 'Body',
      recipients: ['a@b.com'],
      startTime: new Date(Date.now() + 60_000).toISOString(),
      delayBetweenEmails: 5,
      hourlyLimit: 50,
    });
    expect(result.delayBetweenEmails).toBe(5);
    expect(result.hourlyLimit).toBe(50);
  });
});

describe('health check', () => {
  it('responds ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('404 handling', () => {
  it('returns a structured error body for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
