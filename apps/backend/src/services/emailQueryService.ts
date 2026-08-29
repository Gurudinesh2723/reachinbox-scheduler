import { EmailStatus } from '@prisma/client';
import { listEmails, listEmailsByIds, findEmailForUser } from '../repositories/emailRepository';
import { searchEmails as esSearchEmails } from '../integrations/elasticsearch/emailIndex';
import { logger } from '../config/logger';
import { ApiError } from '../utils/ApiError';

export interface Pagination {
  page: number;
  pageSize: number;
}

export async function getScheduledEmails(userId: string, pagination: Pagination) {
  const { items, total } = await listEmails({ userId, status: 'scheduled', ...pagination });
  return { items, total, page: pagination.page, pageSize: pagination.pageSize };
}

export async function getSentEmails(userId: string, pagination: Pagination) {
  const { items, total } = await listEmails({
    userId,
    status: ['sent', 'failed'],
    ...pagination,
  });
  return { items, total, page: pagination.page, pageSize: pagination.pageSize };
}

/**
 * Search always goes through Elasticsearch, never SQL LIKE. Postgres remains
 * authoritative for the actual email content returned to the client - ES
 * hits give us matching ids + relevance order, which we then hydrate from
 * Postgres and re-sort into that same order.
 */
export async function searchEmails(params: {
  userId: string;
  query?: string;
  status?: EmailStatus;
  page: number;
  pageSize: number;
}) {
  try {
    const { ids, total } = await esSearchEmails(params);
    if (ids.length === 0) return { items: [], total: 0, page: params.page, pageSize: params.pageSize };

    const rows = await listEmailsByIds(ids, params.userId);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = ids.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => Boolean(row));

    return { items: ordered, total, page: params.page, pageSize: params.pageSize };
  } catch (err) {
    logger.error({ err }, 'Elasticsearch search failed');
    throw new ApiError('UPSTREAM_ERROR', 'Search is temporarily unavailable, please try again shortly');
  }
}

export async function getEmailByIdForUser(emailId: string, userId: string) {
  const email = await findEmailForUser(emailId, userId);
  if (!email) throw ApiError.notFound('Email not found');
  return email;
}
