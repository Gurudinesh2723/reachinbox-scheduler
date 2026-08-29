import { Request, Response } from 'express';
import { sendSuccess } from '../utils/apiResponse';
import { ApiError } from '../utils/ApiError';
import { listCampaignsForUser, findCampaignForUser } from '../repositories/campaignRepository';

export async function list(req: Request, res: Response) {
  const campaigns = await listCampaignsForUser(req.user!.id);
  return sendSuccess(res, campaigns);
}

export async function getById(req: Request, res: Response) {
  const campaign = await findCampaignForUser(req.params.id, req.user!.id);
  if (!campaign) throw ApiError.notFound('Campaign not found');
  return sendSuccess(res, campaign);
}
