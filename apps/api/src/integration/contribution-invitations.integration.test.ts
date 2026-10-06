import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// A contribution invitation used to belong to whoever held an account at the
// invited email address, and signup never checks that an address belongs to the
// person registering it. Anyone who registered an invited address could accept
// the invitation, open the project's workspace and messages, and be named in its
// rights. An invitation is now claimed with the link its project lead passes on,
// once, before it expires.
test('contribution invitations are claimed with their link, never by an email match', async (t) => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.match(`${database.pathname}/${database.searchParams.get('schema') ?? ''}`, /(^|[/_-])test([/_-]|$)/i);

  const [{ app }, { prisma }] = await Promise.all([import('../app'), import('../lib/prisma')]);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await prisma.$disconnect();
  });

  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    });
    return { status: response.status, body: (await response.json()) as any };
  };
  const send = (method: string, headers: Record<string, string>, body: unknown) => ({ method, headers, body: JSON.stringify(body) });
  const auth = (user: { id: string; role: string }) => ({
    authorization: `Bearer ${jwt.sign({ sub: user.id, role: user.role, ver: 0 }, process.env.JWT_SECRET!)}`,
  });

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let sequence = 0;
  const address = (label: string) => `${label}-${runId}-${(sequence += 1)}@example.test`;

  const lead = await prisma.user.create({
    data: { email: address('lead'), role: 'PRODUCER', producer: { create: { name: 'Invitation Lead' } } },
    include: { producer: true },
  });
  const artist = await prisma.user.create({
    data: { email: address('artist'), role: 'ARTIST', artist: { create: { name: 'Invitation Artist' } } },
    include: { artist: true },
  });
  const project = (title: string) => prisma.project.create({
    data: { producer_id: lead.producer!.id, artist_id: artist.artist!.id, title: `${title} ${runId}` },
  });
  const invite = (projectId: string, email: string) => request(`/producer/projects/${projectId}/participants`,
    send('POST', auth(lead), { display_name: 'Invited Songwriter', email, role: 'SONGWRITER' }));
  // Registers an address through a public path, as anyone can.
  const register = async (path: '/auth/signup' | '/auth/enter', email: string) => {
    const credentials = { email, password: 'IntegrationPass123!' };
    const created = await request(path, send('POST', {}, path === '/auth/signup' ? { ...credentials, name: 'Somebody Else' } : credentials));
    assert.equal(created.status, 201, `${path} creates the account`);
    return { id: created.body.user.id as string, headers: { authorization: `Bearer ${created.body.token}` } };
  };
  const tokenOf = (inviteUrl: string) => new URL(inviteUrl).searchParams.get('token')!;
  const claim = (headers: Record<string, string>, token: string) => request('/contributions/claim', send('POST', headers, { token }));
  const proposeSplitNaming = (projectId: string, participantId: string) => request(`/producer/projects/${projectId}/rights-agreements`, send('POST', auth(lead), {
    agreement_type: 'MASTER', title: 'Master split',
    shares: [
      { holder_name: 'Invitation Artist', holder_type: 'ARTIST', holder_ref_id: artist.artist!.id, role: 'Master owner', percentage: 60 },
      { holder_name: 'Invited Songwriter', holder_type: 'PARTICIPANT', holder_ref_id: participantId, role: 'Writer', percentage: 40 },
    ],
  }));
  const storedState = async (participantId: string) => {
    const [invitation, participant] = await Promise.all([
      prisma.contributionInvitation.findFirstOrThrow({ where: { participant_id: participantId }, orderBy: { created_at: 'asc' } }),
      prisma.projectParticipant.findUniqueOrThrow({ where: { id: participantId } }),
    ]);
    return { link: invitation.status, claimedBy: invitation.claimed_by, boundTo: participant.participant_ref_id };
  };

  await t.test('registering an invited address does not let that account accept the invitation', async () => {
    const work = await project('Registered after the invitation');
    const invitedAddress = address('invited');
    const invitation = await invite(work.id, invitedAddress);
    assert.equal(invitation.status, 201);
    assert.equal(invitation.body.status, 'INVITED');

    const impostor = await register('/auth/signup', invitedAddress);
    const inbox = await request('/contributions/inbox', { headers: impostor.headers });
    const accept = await request(`/contributions/${invitation.body.id}/respond`, send('PATCH', impostor.headers, { decision: 'ACCEPT' }));
    const workspace = await request(`/contributions/${invitation.body.id}/workspace`, { headers: impostor.headers });
    const messages = await request(`/projects/${work.id}/messages`, { headers: impostor.headers });
    const rights = await proposeSplitNaming(work.id, invitation.body.id);

    // Gathered before asserting, so a failure shows everything the address reached.
    assert.deepEqual({
      inInbox: inbox.body.some((item: any) => item.id === invitation.body.id),
      accept: accept.status,
      workspace: workspace.status,
      projectMessages: messages.status,
      rightsProposalNamingThem: rights.status,
      rightsDecisionsForThem: await prisma.rightsDecision.count({ where: { holder_user_id: impostor.id } }),
    }, { inInbox: false, accept: 404, workspace: 404, projectMessages: 404, rightsProposalNamingThem: 400, rightsDecisionsForThem: 0 });

    const stored = await prisma.projectParticipant.findUniqueOrThrow({ where: { id: invitation.body.id } });
    assert.equal(stored.status, 'INVITED', 'the invitation still waits for the person it was meant for');
    assert.equal(stored.participant_ref_id, null);
  });

  await t.test('an account registered at an address before the invitation is neither bound to it nor told about it', async () => {
    const work = await project('Registered before the invitation');
    const invitedAddress = address('registered-first');
    const earlier = await register('/auth/enter', invitedAddress);
    const invitation = await invite(work.id, invitedAddress);
    assert.equal(invitation.status, 201);

    const inbox = await request('/contributions/inbox', { headers: earlier.headers });
    const accept = await request(`/contributions/${invitation.body.id}/respond`, send('PATCH', earlier.headers, { decision: 'ACCEPT' }));
    assert.deepEqual({
      boundWhenInvited: invitation.body.participant_ref_id,
      notified: await prisma.notification.count({ where: { user_id: earlier.id, type: 'CONTRIBUTION_INVITATION' } }),
      inInbox: inbox.body.some((item: any) => item.id === invitation.body.id),
      accept: accept.status,
    }, { boundWhenInvited: null, notified: 0, inInbox: false, accept: 404 });
  });

  await t.test('the person given the link claims it under any address, and joins once they accept', async () => {
    const work = await project('Claimed with the link');
    const invitedAddress = address('invited-hint');
    const invitation = await invite(work.id, invitedAddress);
    assert.equal(invitation.status, 201);
    assert.match(invitation.body.invite_url, /\/accept-contribution\?token=/, 'the lead gets a link to pass on');
    const token = tokenOf(invitation.body.invite_url);

    const stored = await prisma.contributionInvitation.findFirstOrThrow({ where: { participant_id: invitation.body.id } });
    assert.match(stored.token_hash, /^[0-9a-f]{64}$/, 'the link is kept as a SHA-256 digest');
    assert.notEqual(stored.token_hash, token, 'the raw link is never stored');

    assert.equal((await claim(auth(lead), token)).status, 409, 'the lead cannot claim their own invitation');

    const invited = await register('/auth/signup', address('the-invited-person'));
    const claimed = await claim(invited.headers, token);
    assert.equal(claimed.status, 200);
    assert.equal(claimed.body.id, invitation.body.id);
    const inbox = await request('/contributions/inbox', { headers: invited.headers });
    assert.ok(inbox.body.some((item: any) => item.id === invitation.body.id && item.status === 'INVITED'), 'a claimed invitation waits in the inbox for an answer');
    assert.equal((await request(`/contributions/${invitation.body.id}/workspace`, { headers: invited.headers })).status, 404, 'claiming alone does not join the project');

    const accepted = await request(`/contributions/${invitation.body.id}/respond`, send('PATCH', invited.headers, { decision: 'ACCEPT' }));
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.status, 'ACTIVE');
    assert.equal((await request(`/contributions/${invitation.body.id}/workspace`, { headers: invited.headers })).status, 200);
    assert.equal((await request(`/projects/${work.id}/messages`, { headers: invited.headers })).status, 200);
    const rights = await proposeSplitNaming(work.id, invitation.body.id);
    assert.equal(rights.status, 201);
    assert.ok(rights.body.decisions.some((decision: any) => decision.holder_user_id === invited.id), 'the person who claimed the link holds the named share');

    const leadView = await request('/producer/projects', { headers: auth(lead) });
    const listed = leadView.body.find((item: any) => item.id === work.id).participants.find((item: any) => item.id === invitation.body.id);
    assert.equal(listed.email, invitedAddress, 'the address stays with the participant, as a hint for the lead');
    assert.ok(!JSON.stringify(leadView.body).includes(stored.token_hash), 'the project view never carries the link');

    // Whoever registers the invited address afterwards reaches none of it.
    const later = await register('/auth/enter', invitedAddress);
    const draftCredit = await request(`/producer/projects/${work.id}/credits`, send('POST', auth(lead), {
      credited_name: 'Invited Songwriter', role: 'SONGWRITER', participant_id: invitation.body.id,
    }));
    assert.equal(draftCredit.status, 201);
    assert.deepEqual({
      inInbox: (await request('/contributions/inbox', { headers: later.headers })).body.some((item: any) => item.id === invitation.body.id),
      workspace: (await request(`/contributions/${invitation.body.id}/workspace`, { headers: later.headers })).status,
      confirmCredit: (await request(`/contributions/credits/${draftCredit.body.id}/respond`, send('PATCH', later.headers, { decision: 'CONFIRM' }))).status,
      claimSpentLink: (await claim(later.headers, token)).status,
    }, { inInbox: false, workspace: 404, confirmCredit: 404, claimSpentLink: 410 });
  });

  await t.test('an expired or guessed link claims nothing and changes nothing', async () => {
    const work = await project('Expired link');
    const invitation = await invite(work.id, address('expired'));
    await prisma.contributionInvitation.updateMany({
      where: { participant_id: invitation.body.id },
      data: { expires_at: new Date(Date.now() - 60_000) },
    });
    const invited = await register('/auth/signup', address('too-late'));

    assert.equal((await claim(invited.headers, tokenOf(invitation.body.invite_url))).status, 410, 'an expired link is no longer valid');
    assert.equal((await claim(invited.headers, 'x'.repeat(43))).status, 410, 'a guess is answered like a spent link');
    assert.deepEqual(await storedState(invitation.body.id), { link: 'PENDING', claimedBy: null, boundTo: null });
  });

  await t.test('of two people claiming one link at the same moment, exactly one gets it', async () => {
    const first = await register('/auth/signup', address('first-claimant'));
    const second = await register('/auth/signup', address('second-claimant'));
    // Two claims must overlap to collide, and timing decides that, so they get several chances.
    for (let round = 1; round <= 6; round += 1) {
      const work = await project(`Contested link ${round}`);
      const invitation = await invite(work.id, address('contested'));
      const token = tokenOf(invitation.body.invite_url);
      const [a, b] = await Promise.all([claim(first.headers, token), claim(second.headers, token)]);
      assert.deepEqual([a.status, b.status].sort(), [200, 410], `round ${round}: one claim wins and the other is refused`);
      const winner = a.status === 200 ? first : second;
      assert.deepEqual(await storedState(invitation.body.id), { link: 'CLAIMED', claimedBy: winner.id, boundTo: winner.id },
        `round ${round}: the link and the participant name the same winner`);
    }
  });

  await t.test('a new link replaces the old one, only for its own lead, and only until the invitation is claimed', async () => {
    const work = await project('Sent again');
    const invitation = await invite(work.id, address('lost-link'));
    const sendAgain = (headers: Record<string, string>) =>
      request(`/producer/projects/${work.id}/participants/${invitation.body.id}/invitation`, send('POST', headers, {}));

    const otherLead = await prisma.user.create({
      data: { email: address('other-lead'), role: 'PRODUCER', producer: { create: { name: 'Other Lead' } } },
    });
    assert.equal((await sendAgain(auth(otherLead))).status, 404, "a lead cannot make links for another lead's project");

    const replacement = await sendAgain(auth(lead));
    assert.equal(replacement.status, 201);
    const invited = await register('/auth/signup', address('found-link'));
    assert.equal((await claim(invited.headers, tokenOf(invitation.body.invite_url))).status, 410, 'the replaced link no longer works');
    assert.equal((await claim(invited.headers, tokenOf(replacement.body.invite_url))).status, 200);
    assert.equal((await sendAgain(auth(lead))).status, 409, 'a claimed invitation cannot be sent to someone else');
  });

  await t.test("removing a participant withdraws their invitation's link", async () => {
    const work = await project('Withdrawn');
    const invitation = await invite(work.id, address('withdrawn'));
    const removed = await request(`/producer/projects/${work.id}/participants/${invitation.body.id}`, { method: 'DELETE', headers: auth(lead) });
    assert.equal(removed.status, 200);

    const invited = await register('/auth/signup', address('withdrawn-person'));
    assert.equal((await claim(invited.headers, tokenOf(invitation.body.invite_url))).status, 410);
    assert.deepEqual(await storedState(invitation.body.id), { link: 'REVOKED', claimedBy: null, boundTo: null });
  });
});
