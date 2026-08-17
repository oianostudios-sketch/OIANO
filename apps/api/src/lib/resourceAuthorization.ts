export type BookingMessageAccessInput = {
  artistUserId: string | null;
  engineerUserId: string | null;
  bookingStudioId: string;
  actorId: string;
  actorRole: string;
  actorStudioId?: string | null;
  // The user_id of the Producer who owns this booking's linked project (if
  // any). A Producer isn't a party to a booking directly -- they only ever
  // reach one through a project they own (see producer.routes.ts's
  // link-booking endpoint) -- so this is the only way a Producer can
  // legitimately access the thread.
  projectProducerUserId?: string | null;
};

export function canAccessBookingMessages(input: BookingMessageAccessInput) {
  if (input.actorRole === 'OIANO_ADMIN') return true;
  if (input.actorRole === 'ARTIST') return input.artistUserId === input.actorId;
  if (input.actorRole === 'ENGINEER') return input.engineerUserId === input.actorId;
  if (input.actorRole === 'PRODUCER') return input.projectProducerUserId === input.actorId;
  if (input.actorRole === 'STUDIO_ADMIN') {
    return Boolean(input.actorStudioId && input.bookingStudioId === input.actorStudioId);
  }
  return false;
}

export function canManageOwnedProject(actorRole: string, actorProducerId: string | null, projectProducerId: string) {
  return actorRole === 'PRODUCER' && Boolean(actorProducerId && actorProducerId === projectProducerId);
}

export function canArtistActOnProject(actorRole: string, actorArtistId: string | null, projectArtistId: string | null) {
  return actorRole === 'ARTIST' && Boolean(actorArtistId && actorArtistId === projectArtistId);
}

export function isConsentTransitionAllowed(current: string, action: 'APPROVE' | 'DECLINE' | 'WITHDRAW') {
  if (action === 'WITHDRAW') return current === 'APPROVED';
  return current === 'REQUESTED';
}

export function isRightsTransitionAllowed(current: string, action: 'APPROVE' | 'DISPUTE') {
  return current === 'PROPOSED' && ['APPROVE', 'DISPUTE'].includes(action);
}

export function ownershipSharesAreValid(shares: Array<{ holder_name: string; percentage: number }>) {
  if (shares.length < 2 || shares.some(share => !Number.isFinite(share.percentage) || share.percentage <= 0 || share.percentage > 100)) return false;
  const names = shares.map(share => share.holder_name.trim().toLowerCase());
  return new Set(names).size === names.length && Math.abs(shares.reduce((sum, share) => sum + share.percentage, 0) - 100) <= 0.001;
}
