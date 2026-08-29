import { NextFunction, Request, Response } from 'express';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

export interface AuthedUser {
  id: string;
  googleId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

/**
 * Derives the authenticated user strictly from the signed, HTTP-only cookie
 * session — never from a userId supplied in the request body/query, so a
 * client can never impersonate another user's data.
 */
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const userId = req.session?.userId;
  if (!userId) {
    throw ApiError.unauthorized();
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw ApiError.unauthorized('Session user no longer exists');
  }

  req.user = {
    id: user.id,
    googleId: user.googleId,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
  };
  next();
});
