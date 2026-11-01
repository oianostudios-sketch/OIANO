import assert from 'node:assert/strict';
import test from 'node:test';
import { collaborationJourney, type RecordState, type Workspace } from './collaborationJourney';

test('accepted work supports separate confirmed credits and disputed or approved rights decisions', async t => {
  const { prisma, request, lead, artist, contributor, outsider, projectId, join } = await collaborationJourney(t);
  const participant = await join();
  const credits = `/producer/projects/${projectId}/credits`;
  const draft = await request('POST', credits, lead, {
    credited_name: 'Journey Contributor', participant_id: participant.id, role: 'SONGWRITER',
  });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.status, 'DRAFT');
  const answer = `/contributions/credits/${draft.body.id}/respond`;
  assert.equal((await request('PATCH', answer, undefined, { decision: 'CONFIRM' })).status, 401);
  assert.equal((await request('PATCH', answer, outsider, { decision: 'CONFIRM' })).status, 404);
  assert.equal((await request('PATCH', answer, contributor, { decision: 'CONFIRM' })).body.status, 'CONFIRMED');
  assert.equal((await request('PATCH', answer, contributor, { decision: 'DISPUTE' })).status, 409);
  assert.equal((await request('DELETE', `${credits}/${draft.body.id}`, lead)).status, 409);
  const second = await request('POST', credits, lead, {
    credited_name: 'Journey Contributor', participant_id: participant.id, role: 'COMPOSER',
  });
  assert.equal(second.status, 201);
  assert.equal((await request('PATCH', `/contributions/credits/${second.body.id}/respond`, contributor, { decision: 'DISPUTE' })).body.status, 'DISPUTED');

  for (const [agreementType, action] of [['MASTER', 'DISPUTE'], ['PUBLISHING', 'APPROVE']]) {
    const proposal = await request<RecordState & { decisions: { holder_user_id: string; status: string }[] }>(
      'POST', `/producer/projects/${projectId}/rights-agreements`, lead, {
        agreement_type: agreementType, title: `${agreementType} proposal`,
        shares: [
          { holder_name: 'Journey Lead', holder_type: 'PRODUCER', holder_ref_id: lead.producer!.id, role: 'Producer', percentage: 60 },
          { holder_name: 'Journey Contributor', holder_type: 'PARTICIPANT', holder_ref_id: participant.id, role: 'Writer', percentage: 40 },
        ],
      });
    assert.equal(proposal.status, 201);
    assert.equal(proposal.body.status, 'PROPOSED');
    assert.equal(proposal.body.decisions.find(row => row.holder_user_id === contributor.id)?.status, 'PENDING');
    const respond = `/contributions/rights/${proposal.body.id}/respond`;
    assert.equal((await request('PATCH', respond, undefined, { action })).status, 401);
    assert.equal((await request('PATCH', respond, outsider, { action })).status, 404);
    assert.equal((await request('PATCH', respond, artist, { action })).status, 404, 'project association alone is not a named rights decision');
    if (action === 'DISPUTE') assert.equal((await request('PATCH', respond, contributor, { action })).status, 400);
    const result = await request('PATCH', respond, contributor, { action, note: action === 'DISPUTE' ? 'The proposed share needs revision' : undefined });
    assert.equal(result.status, 200);
    assert.equal(result.body.status, action === 'APPROVE' ? 'APPROVED' : 'DISPUTED');
    assert.equal((await request('PATCH', respond, contributor, { action: 'APPROVE' })).status, 409);
    const stored = await prisma.rightsDecision.findUniqueOrThrow({
      where: { agreement_id_holder_user_id: { agreement_id: proposal.body.id, holder_user_id: contributor.id } },
    });
    assert.equal(stored.status, action === 'APPROVE' ? 'APPROVED' : 'DISPUTED');
    assert.ok(stored.responded_at);
  }
  const persisted = await request<Workspace>('GET', `/contributions/${participant.id}/workspace`, contributor);
  assert.equal(persisted.status, 200);
  assert.deepEqual(persisted.body.project.credits.map(row => row.status).sort(), ['CONFIRMED', 'DISPUTED']);
  assert.deepEqual(persisted.body.project.rights_agreements.map(row => row.status).sort(), ['APPROVED', 'DISPUTED']);
  const records = await prisma.projectCredit.findMany({ where: { project_id: projectId } });
  assert.equal(records.find(row => row.id === draft.body.id)?.is_public, true);
  assert.equal(records.find(row => row.id === second.body.id)?.is_public, false);
});
