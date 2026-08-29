import { prisma } from '../config/prisma';
import { GoogleProfile } from '../integrations/google/googleOAuth';

export async function findOrCreateUserFromGoogleProfile(profile: GoogleProfile) {
  const existing = await prisma.user.findUnique({ where: { googleId: profile.sub } });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { name: profile.name, avatarUrl: profile.picture ?? existing.avatarUrl },
    });
  }

  return prisma.user.create({
    data: {
      googleId: profile.sub,
      name: profile.name,
      email: profile.email,
      avatarUrl: profile.picture,
    },
  });
}
