import { Email, EmailStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';

export interface CreateEmailInput {
  campaignId: string;
  userId: string;
  senderId: string;
  recipient: string;
  subject: string;
  body: string;
  scheduledAt: Date;
}

export function createEmails(inputs: CreateEmailInput[]) {
  return prisma.$transaction(
    inputs.map((input) => prisma.email.create({ data: { ...input, status: 'scheduled' } })),
  );
}

export function attachBullJobId(emailId: string, bullJobId: string) {
  return prisma.email.update({ where: { id: emailId }, data: { bullJobId } });
}

export function findEmailById(emailId: string) {
  return prisma.email.findUnique({ where: { id: emailId } });
}

/**
 * Atomic compare-and-swap: only succeeds if the row is still `scheduled`.
 * The single `updateMany` statement is what's atomic - Postgres takes a
 * row-level lock for its duration, so if two workers race to process the
 * same email, the second UPDATE re-evaluates the WHERE clause after the
 * first commits, sees status is no longer `scheduled`, and affects zero
 * rows. This is the mechanism that guarantees only one worker can ever move
 * an email out of `scheduled`.
 *
 * Deliberately NOT wrapped in an interactive `prisma.$transaction()`: the
 * follow-up `findUnique` doesn't need snapshot isolation with the write (we
 * already know we're the one who claimed it), and an interactive
 * transaction holds a dedicated connection from Prisma's pool for its full
 * duration. Under concurrent worker jobs that was enough to exhaust a small
 * pool and throw "Unable to start a transaction in the given time" - two
 * independent, short-lived calls avoid that class of contention entirely.
 */
export async function claimEmailForProcessing(emailId: string): Promise<Email | null> {
  const result = await prisma.email.updateMany({
    where: { id: emailId, status: 'scheduled' },
    data: { status: 'processing' },
  });
  if (result.count === 0) return null;
  return prisma.email.findUnique({ where: { id: emailId } });
}

export function markEmailSent(emailId: string, providerMessageId: string) {
  return prisma.email.update({
    where: { id: emailId },
    data: {
      status: 'sent',
      sentAt: new Date(),
      providerMessageId,
      errorMessage: null,
    },
  });
}

export function markEmailFailed(emailId: string, errorMessage: string) {
  return prisma.email.update({
    where: { id: emailId },
    data: {
      status: 'failed',
      failedAt: new Date(),
      errorMessage,
    },
  });
}

/** Releases a claimed email back to `scheduled` so it can be retried/rescheduled (e.g. rate limited). */
export function releaseEmailToScheduled(emailId: string, scheduledAt?: Date) {
  return prisma.email.update({
    where: { id: emailId },
    data: {
      status: 'scheduled',
      ...(scheduledAt ? { scheduledAt } : {}),
    },
  });
}

export function incrementAttempts(emailId: string) {
  return prisma.email.update({ where: { id: emailId }, data: { attempts: { increment: 1 } } });
}

export interface PaginatedQuery {
  userId: string;
  status?: EmailStatus | EmailStatus[];
  page: number;
  pageSize: number;
}

export async function listEmails(query: PaginatedQuery) {
  const where: Prisma.EmailWhereInput = {
    userId: query.userId,
    ...(query.status ? { status: Array.isArray(query.status) ? { in: query.status } : query.status } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.email.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { sender: { select: { email: true, displayName: true } } },
    }),
    prisma.email.count({ where }),
  ]);

  return { items, total };
}

export async function listEmailsByIds(ids: string[], userId: string) {
  return prisma.email.findMany({
    where: { id: { in: ids }, userId },
    include: { sender: { select: { email: true, displayName: true } } },
  });
}

export function findEmailForUser(emailId: string, userId: string) {
  return prisma.email.findFirst({ where: { id: emailId, userId } });
}
