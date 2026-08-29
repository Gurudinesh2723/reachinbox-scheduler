import { Request, Response } from 'express';
import { sendSuccess } from '../utils/apiResponse';
import { listSendersForUser, getOrCreateDefaultSender } from '../repositories/senderRepository';

export async function list(req: Request, res: Response) {
  const user = req.user!;
  let senders = await listSendersForUser(user.id);
  if (senders.length === 0) {
    await getOrCreateDefaultSender(user.id, user.email, user.name);
    senders = await listSendersForUser(user.id);
  }
  return sendSuccess(res, senders);
}
