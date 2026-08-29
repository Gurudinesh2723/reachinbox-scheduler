import { prisma } from '../config/prisma';

// Fields intentionally selected to exclude smtpUser/smtpPassword from ever
// reaching a controller/DTO - sender SMTP credentials must never be exposed.
const PUBLIC_SENDER_SELECT = {
  id: true,
  userId: true,
  email: true,
  displayName: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function listSendersForUser(userId: string) {
  return prisma.sender.findMany({
    where: { userId, active: true },
    select: PUBLIC_SENDER_SELECT,
    orderBy: { createdAt: 'asc' },
  });
}

export function findSenderForUser(senderId: string, userId: string) {
  return prisma.sender.findFirst({ where: { id: senderId, userId }, select: PUBLIC_SENDER_SELECT });
}

/** Ensures every user has at least one usable sender identity to compose from. */
export async function getOrCreateDefaultSender(userId: string, fallbackEmail: string, fallbackName: string) {
  const existing = await prisma.sender.findFirst({ where: { userId, active: true } });
  if (existing) return existing;

  return prisma.sender.create({
    data: {
      userId,
      email: fallbackEmail,
      displayName: fallbackName,
    },
  });
}
