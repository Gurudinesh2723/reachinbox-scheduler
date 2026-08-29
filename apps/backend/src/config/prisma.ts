import { PrismaClient } from '@prisma/client';
import { isProduction } from './env';

// A single pooled Prisma client is reused across the app (Prisma manages its
// own connection pool internally) instead of creating a client per request.
export const prisma = new PrismaClient({
  log: isProduction ? ['error', 'warn'] : ['error', 'warn'],
});
