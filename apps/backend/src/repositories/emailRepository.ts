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
 * Postgres takes a row-level lock for the duration of the UPDATE, so if two
 * workers race to process the same email, the second UPDATE re-evaluates the
 * WHERE clause after the first transaction commits, sees status is no longer
 * `scheduled`, and affects zero rows. This is the mechanism that guarantees
 * only one worker can ever move an email out of `scheduled`.
 */
export async function claimEmailForProcessing(emailId: string): Promise<Email | null> {
  return prisma.$transaction(async (tx) => {
    const result = await tx.email.updateMany({
      where: { id: emailId, status: 'scheduled' },
      data: { status: 'processing' },
    });
    if (result.count === 0) return null;
    return tx.email.findUnique({ where: { id: emailId } });
  });
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
