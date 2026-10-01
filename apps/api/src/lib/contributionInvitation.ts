import crypto from 'crypto';

export type ContributionStatus = 'INVITED' | 'ACTIVE' | 'DECLINED' | 'CORRECTION_REQUESTED' | 'REMOVED';
export type ContributionDecision = 'ACCEPT' | 'DECLINE' | 'REQUEST_CORRECTION';

// How long an invitation's link can be claimed.
export const CONTRIBUTION_INVITATION_TTL_DAYS = 14;

export function nextContributionStatus(current: string, decision: ContributionDecision): ContributionStatus | null {
  if (current !== 'INVITED') return null;
  if (decision === 'ACCEPT') return 'ACTIVE';
  if (decision === 'DECLINE') return 'DECLINED';
  return 'CORRECTION_REQUESTED';
}

// A participant belongs to the identity that claimed its invitation's link, and
// to nobody else. It used to belong to any account at the invited email address
// as well, but signup never proves an address, so an email match is not a
// credential.
export function participantBelongsToUser(participant: { participant_ref_id: string | null }, userId: string): boolean {
  return participant.participant_ref_id === userId;
}

// The link is the credential, so only its SHA-256 is stored, as
// StudioStaffInvitation and CreatorInvitation already store theirs.
export function hashInvitationToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function newContributionInvitation(now = new Date()) {
  const token = crypto.randomBytes(32).toString('base64url');
  return {
    token,
    token_hash: hashInvitationToken(token),
    expires_at: new Date(now.getTime() + CONTRIBUTION_INVITATION_TTL_DAYS * 86_400_000),
  };
}

export function contributionInvitationUrl(token: string): string {
  return `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/accept-contribution?token=${encodeURIComponent(token)}`;
}
