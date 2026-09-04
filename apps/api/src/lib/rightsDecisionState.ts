export type RightsDecisionStatus = 'PENDING' | 'APPROVED' | 'DISPUTED';

// Canonical persisted vocabulary for the rights and consent lifecycle.
//
// Both are approval lifecycles, not acceptance ones: a named rights holder
// reviews the split proposed for them and APPROVEs or DISPUTEs it, and an
// artist reviews a promotional request and APPROVEs, DECLINEs or later
// WITHDRAWs it. The API actions, the transition guards in
// resourceAuthorization.ts and the UI all already say "approve".
//
// These are declared here because three read-side counters previously queried
// 'ACCEPTED', a value nothing in the system has ever written — the agreement
// and consent totals they fed were structurally always zero. 'ACCEPTED' is
// still correct elsewhere (CircleConsentStatus, ConnectStatus, staff
// invitations); it was never correct for these two models.
export type RightsAgreementStatus = 'PROPOSED' | 'APPROVED' | 'DISPUTED';
export type PromotionalConsentStatus = 'REQUESTED' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN';

export const RIGHTS_AGREEMENT_APPROVED = 'APPROVED' satisfies RightsAgreementStatus;
export const PROMOTIONAL_CONSENT_APPROVED = 'APPROVED' satisfies PromotionalConsentStatus;

export function agreementStatusFromDecisions(decisions: Array<{ status: string }>): RightsAgreementStatus {
  if (decisions.some(decision => decision.status === 'DISPUTED')) return 'DISPUTED';
  if (decisions.length > 0 && decisions.every(decision => decision.status === 'APPROVED')) return RIGHTS_AGREEMENT_APPROVED;
  return 'PROPOSED';
}
