import assert from 'node:assert/strict';
import test from 'node:test';
import { collaborationJourney, type Workspace } from './collaborationJourney';

test('claim, accept, collaborate and removal preserve the participation boundary', async t => {
  const { prisma, request, lead, contributor, outsider, projectId, invite, claim, respond } = await collaborationJourney(t);
  const invitation = await invite();
  const workspace = `/contributions/${invitation.id}/workspace`;
  const messages = `/projects/${projectId}/messages`;
  assert.equal((await request('GET', workspace)).status, 401);
  assert.equal((await request('GET', workspace, contributor)).status, 404);
  assert.equal((await claim(invitation)).status, 200);
  assert.equal((await request('GET', workspace, contributor)).status, 404, 'claiming is not acceptance');
  assert.equal((await request('GET', messages, contributor)).status, 404);
  assert.equal((await respond(invitation.id, 'ACCEPT')).body.status, 'ACTIVE');
  assert.equal((await request<Workspace>('GET', workspace, contributor)).body.project.id, projectId);

  assert.equal((await request('POST', messages, lead, { body: 'A brief for our collaboration' })).status, 201);
  assert.equal((await request('POST', messages, contributor, { body: 'My contribution is ready for review' })).status, 201);
  const thread = await request<{ body: string; sender: { id: string } }[]>('GET', messages, contributor);
  assert.equal(thread.status, 200);
  assert.deepEqual(thread.body.map(message => message.body), ['A brief for our collaboration', 'My contribution is ready for review']);
  assert.deepEqual(new Set(thread.body.map(message => message.sender.id)), new Set([lead.id, contributor.id]));
  assert.equal(await prisma.projectMessage.count({ where: { project_id: projectId } }), 2);

  for (const user of [undefined, outsider]) {
    const expected = user ? 404 : 401;
    assert.equal((await request('GET', messages, user)).status, expected);
    assert.equal((await request('POST', messages, user, { body: 'Not authorized' })).status, expected);
  }
  assert.equal((await request('DELETE', `/producer/projects/${projectId}/participants/${invitation.id}`, lead)).status, 200);
  assert.equal((await request('GET', workspace, contributor)).status, 404);
  assert.equal((await request('POST', messages, contributor, { body: 'After removal' })).status, 404);
  assert.equal((await respond(invitation.id, 'ACCEPT')).status, 409);
  assert.equal((await prisma.projectParticipant.findUniqueOrThrow({ where: { id: invitation.id } })).status, 'REMOVED');
  assert.equal(await prisma.projectMessage.count({ where: { project_id: projectId } }), 2, 'rejected writes never persist');
  assert.equal((await request<{ body: string }[]>('GET', messages, lead)).body.length, 2, 'removal does not erase the conversation');
});
