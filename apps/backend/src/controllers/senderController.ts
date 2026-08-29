import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { listSendersForUser, getOrCreateDefaultSender, createSender } from '../repositories/senderRepository';
import { CreateSenderBody } from '../validation/senderSchemas';

export async function list(req: Request, res: Response) {
  const user = req.user!;
  let senders = await listSendersForUser(user.id);
  if (senders.length === 0) {
    await getOrCreateDefaultSender(user.id, user.email, user.name);
    senders = await listSendersForUser(user.id);
  }
  return sendSuccess(res, senders);
}

export async function create(req: Request, res: Response) {
  const body = req.body as CreateSenderBody;

  try {
    const sender = await createSender(req.user!.id, body.email, body.displayName);
    return sendSuccess(res, sender, { status: 201, message: 'Sender added' });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw ApiError.conflict('You already have a sender with this email address');
    }
    throw err;
  }
}
