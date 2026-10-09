import { prisma } from './prisma';
import { AppError } from './errors';

// The account role (requireRole('STUDIO_ADMIN')) says only that a person works at a
// studio; what they may do there is their membership's (C34). A sensitive operator
// action needs the caller's StudioStaff row for that studio to hold the capability,
// or to be a STUDIO_ADMIN membership with no capabilities at all: the legacy owner,
// which is how a self-registered owner is created (studio-policy.routes.ts).
export type StaffMembership = { role: string; capabilities: string[] };

export function membershipHolds(membership: StaffMembership | null | undefined, capability: string): boolean {
  if (!membership) return false;
  return membership.capabilities.includes(capability)
    || (membership.capabilities.length === 0 && membership.role === 'STUDIO_ADMIN');
}

export async function requireStudioCapability(userId: string, studioId: string, capability: string, refusal: string) {
  const membership = await prisma.studioStaff.findUnique({ where: { user_id_studio_id: { user_id: userId, studio_id: studioId } } });
  if (!membershipHolds(membership, capability)) throw new AppError(refusal, 403);
  return membership!;
}
