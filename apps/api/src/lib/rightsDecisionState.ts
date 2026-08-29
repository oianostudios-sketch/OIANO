export type RightsDecisionStatus = 'PENDING' | 'APPROVED' | 'DISPUTED';

export function agreementStatusFromDecisions(decisions: Array<{ status: string }>): 'PROPOSED' | 'APPROVED' | 'DISPUTED' {
  if (decisions.some(decision => decision.status === 'DISPUTED')) return 'DISPUTED';
  if (decisions.length > 0 && decisions.every(decision => decision.status === 'APPROVED')) return 'APPROVED';
  return 'PROPOSED';
}
