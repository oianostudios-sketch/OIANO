export type ContributionStatus = 'INVITED' | 'ACTIVE' | 'DECLINED' | 'CORRECTION_REQUESTED' | 'REMOVED';
export type ContributionDecision = 'ACCEPT' | 'DECLINE' | 'REQUEST_CORRECTION';

export function nextContributionStatus(current: string, decision: ContributionDecision): ContributionStatus | null {
  if (current !== 'INVITED') return null;
  if (decision === 'ACCEPT') return 'ACTIVE';
  if (decision === 'DECLINE') return 'DECLINED';
  return 'CORRECTION_REQUESTED';
}

export function participantBelongsToUser(
  participant: { participant_ref_id: string | null; email: string | null },
  user: { id: string; email: string },
): boolean {
  return participant.participant_ref_id === user.id
    || Boolean(participant.email && participant.email.toLowerCase() === user.email.toLowerCase());
}
