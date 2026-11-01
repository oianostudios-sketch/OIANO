import assert from 'node:assert/strict';
import test from 'node:test';
import { collaborationJourney, type RecordState } from './collaborationJourney';

test('decline and correction remain distinct from accepted work and can be superseded by a new invitation', async t => {
  const { prisma, request, lead, contributor, outsider, projectId, invite, claim, respond } = await collaborationJourney(t);
  for (const decision of ['DECLINE', 'REQUEST_CORRECTION']) {
    const invitation = await invite(decision);
    assert.equal((await request('POST', '/contributions/claim', undefined, { token: invitation.token })).status, 401);
    assert.equal((await claim(invitation)).status, 200);
    assert.equal((await claim(invitation, outsider)).status, 410, 'a claimed link cannot be reused');
    if (decision === 'REQUEST_CORRECTION') {
      assert.equal((await respond(invitation.id, decision)).status, 400, 'correction needs an explanation');
      assert.equal((await prisma.projectParticipant.findUniqueOrThrow({ where: { id: invitation.id } })).status, 'INVITED');
    }
    const note = `${decision}: please retain this response`;
    const response = await respond(invitation.id, decision, note);
    assert.equal(response.status, 200);
    const expected = decision === 'DECLINE' ? 'DECLINED' : 'CORRECTION_REQUESTED';
    assert.equal(response.body.status, expected);
    const inbox = await request<RecordState[]>('GET', '/contributions/inbox', contributor);
    assert.equal(inbox.body.find(row => row.id === invitation.id)?.status, expected);
    assert.equal((await request('GET', `/contributions/${invitation.id}/workspace`, contributor)).status, 404);
    assert.equal((await request('POST', `/projects/${projectId}/messages`, contributor, { body: 'Should not be allowed' })).status, 404);
    assert.equal((await respond(invitation.id, 'ACCEPT')).status, 409, 'an answered invitation is not silently reopened');
    assert.equal(await prisma.projectMessage.count({ where: { project_id: projectId, kind: 'CONTRIBUTION_RESPONSE', body: note } }), 1);
    assert.equal((await request('POST', `/producer/projects/${projectId}/participants/${invitation.id}/invitation`, lead)).status, 409);
    assert.equal((await request('DELETE', `/producer/projects/${projectId}/participants/${invitation.id}`, lead)).status, 200);
  }
  const replacement = await invite('REQUEST_CORRECTION');
  assert.equal((await claim(replacement)).status, 200);
  assert.equal((await respond(replacement.id, 'ACCEPT')).body.status, 'ACTIVE');
  assert.equal((await request('GET', `/contributions/${replacement.id}/workspace`, contributor)).status, 200);
  const rows = await prisma.projectParticipant.findMany({ where: { project_id: projectId } });
  assert.deepEqual(rows.map(row => row.status).sort(), ['ACTIVE', 'REMOVED', 'REMOVED'], 'a new agreement to participate does not rewrite the old responses');
  assert.equal(await prisma.projectMessage.count({ where: { project_id: projectId } }), 2);
});
