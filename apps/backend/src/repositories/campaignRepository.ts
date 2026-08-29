import { prisma } from '../config/prisma';

export interface CreateCampaignInput {
  userId: string;
  senderId: string;
  subject: string;
  body: string;
  startTime: Date;
  delayBetweenEmails: number;
  hourlyLimit: number;
}

export function createCampaign(input: CreateCampaignInput) {
  return prisma.campaign.create({ data: input });
}

export function listCampaignsForUser(userId: string) {
  return prisma.campaign.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      sender: { select: { email: true, displayName: true } },
      _count: { select: { emails: true } },
    },
  });
}

export function findCampaignForUser(campaignId: string, userId: string) {
  return prisma.campaign.findFirst({
    where: { id: campaignId, userId },
    include: {
      sender: { select: { email: true, displayName: true } },
      emails: { orderBy: { scheduledAt: 'asc' } },
    },
  });
}
