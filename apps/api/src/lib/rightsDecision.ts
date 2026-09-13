import { prisma } from './prisma';
import { AppError } from './errors';
import { agreementStatusFromDecisions } from './rightsDecisionState';

// A holder's decision is recorded once, and an agreement settles from every
// decision already recorded (A04). The decision used to be checked here and then
// written unconditionally, so two answers from the same holder could both be
// recorded, and two holders answering at the same moment could each settle the
// agreement from a view that lacked the other's decision.
export async function respondToNamedRightsShare(input: { agreementId: string; userId: string; action: 'APPROVE' | 'DISPUTE'; note?: string; requestId?: string }) {
  const decision = await prisma.rightsDecision.findUnique({ where: { agreement_id_holder_user_id: { agreement_id: input.agreementId, holder_user_id: input.userId } } });
  if (!decision) throw new AppError('No rights decision is assigned to this identity', 404);
  if (decision.status !== 'PENDING') throw new AppError('Your rights decision has already been recorded', 409);
  if (input.action === 'DISPUTE' && !input.note) throw new AppError('Explain what should change', 400);
  return prisma.$transaction(async tx => {
    // One decision on an agreement settles at a time, so the recount below sees
    // every decision recorded before this one.
    await tx.$queryRaw`SELECT id FROM rights_agreements WHERE id = ${input.agreementId} FOR UPDATE`;
    const now = new Date();
    // Written only while still pending: of two answers from one holder, the second
    // loses here.
    const recorded = await tx.rightsDecision.updateMany({
      where: { id: decision.id, status: 'PENDING' },
      data: { status: input.action === 'APPROVE' ? 'APPROVED' : 'DISPUTED', note: input.note, responded_at: now, evidence: { method: 'AUTHENTICATED_ACCOUNT', request_id: input.requestId ?? null } },
    });
    if (recorded.count === 0) throw new AppError('Your rights decision has already been recorded', 409);
    const decisions = await tx.rightsDecision.findMany({ where: { agreement_id: input.agreementId } });
    const status = agreementStatusFromDecisions(decisions);
    return tx.rightsAgreement.update({ where: { id: input.agreementId }, data: { status, responded_by: status === 'PROPOSED' ? null : input.userId, response_note: status === 'DISPUTED' ? input.note : null, responded_at: status === 'PROPOSED' ? null : now, effective_at: status === 'APPROVED' ? now : null }, include: { shares: true, decisions: true } });
  });
}
