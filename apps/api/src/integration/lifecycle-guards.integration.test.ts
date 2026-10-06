import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// Promotional consent, message requests, facility issues and Studio Circle
// consent are each answered or advanced from a status that was just read. These
// hold that the write is conditional on that status: an answer is applied once,
// a repeat is refused without changing anything, and answers arriving together
// produce exactly one success and exactly one notification.
test('status lifecycles apply each answer once, even under concurrency', async (t) => {
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
  const auth = (user: { id: string; role: string }) => ({
    authorization: `Bearer ${jwt.sign({ sub: user.id, role: user.role, ver: 0 }, process.env.JWT_SECRET!)}`,
  });
  const send = (method: string, path: string, user: { id: string; role: string }, body?: unknown) =>
    request(path, { method, headers: auth(user), body: body === undefined ? undefined : JSON.stringify(body) });
  const statuses = (results: Array<{ status: number }>) => results.map((result) => result.status).sort();
  const ONE_WINNER = [200, 409, 409, 409, 409];
  const ROUNDS = 4;

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let counter = 0;
  const email = (label: string) => `${label}-${runId}-${(counter += 1)}@example.test`;
  const studio = await prisma.studio.create({ data: { slug: `lifecycle-${runId}`, name: 'Lifecycle Studio' } });
  const room = await prisma.room.create({ data: { studio_id: studio.id, name: 'Lifecycle Room' } });
  const admin = await prisma.user.create({ data: { email: email('admin'), role: 'STUDIO_ADMIN' } });
  await prisma.studioStaff.create({ data: { user_id: admin.id, studio_id: studio.id, role: 'STUDIO_ADMIN' } });
  const artistUser = (label: string) => prisma.user.create({
    data: { email: email(label), role: 'ARTIST', artist: { create: { name: `Lifecycle ${label}` } } },
    include: { artist: true },
  });
  const producerUser = await prisma.user.create({
    data: { email: email('producer'), role: 'PRODUCER', producer: { create: { name: 'Lifecycle Producer' } } },
    include: { producer: true },
  });
  const owner = await artistUser('owner');
  const project = await prisma.project.create({
    data: { title: 'Lifecycle Project', producer_id: producerUser.producer!.id, artist_id: owner.artist!.id },
  });

  // ─── Promotional consent ──────────────────────────────────────────────────
  const consentRequest = () => prisma.promotionalConsent.create({
    data: { project_id: project.id, subject: 'Teaser', purpose: 'Launch', channels: ['social'], assets: ['clip'], requested_by: producerUser.id },
  });
  const answerConsent = (consentId: string, action: string) =>
    send('PATCH', `/artist-projects/${project.id}/promotional-consents/${consentId}`, owner, { action });

  await t.test('promotional consent: an answer applies once and a repeat changes nothing', async () => {
    const consent = await consentRequest();
    const approved = await answerConsent(consent.id, 'APPROVE');
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(approved.body.status, 'APPROVED');
    const before = await prisma.promotionalConsent.findUniqueOrThrow({ where: { id: consent.id } });

    for (const action of ['APPROVE', 'DECLINE']) {
      const repeat = await answerConsent(consent.id, action);
      assert.equal(repeat.status, 409, `${action} after APPROVE`);
    }
    assert.deepEqual(await prisma.promotionalConsent.findUniqueOrThrow({ where: { id: consent.id } }), before);

    const withdrawn = await answerConsent(consent.id, 'WITHDRAW');
    assert.equal(withdrawn.status, 200);
    assert.equal(withdrawn.body.status, 'WITHDRAWN');
    assert.equal((await answerConsent(consent.id, 'WITHDRAW')).status, 409);
  });

  await t.test('promotional consent: answers sent together produce one decision', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const consent = await consentRequest();
      const actions = ['APPROVE', 'DECLINE', 'APPROVE', 'DECLINE', 'APPROVE'];
      const results = await Promise.all(actions.map((action) => answerConsent(consent.id, action)));
      assert.deepEqual(statuses(results), ONE_WINNER, `round ${round}: ${JSON.stringify(results.map((r) => r.status))}`);
      const winner = results.find((result) => result.status === 200)!;
      const stored = await prisma.promotionalConsent.findUniqueOrThrow({ where: { id: consent.id } });
      assert.equal(stored.status, winner.body.status, `round ${round}: the stored decision is the one that succeeded`);
    }
  });

  // ─── Message requests (Connect) ───────────────────────────────────────────
  const messageRequest = async () => {
    const [initiator, recipient] = await Promise.all([artistUser('initiator'), artistUser('recipient')]);
    const connection = await prisma.passportConnection.create({
      data: { initiator_id: initiator.artist!.id, recipient_id: recipient.artist!.id, status: 'PENDING' },
    });
    return { initiator, recipient, connection };
  };
  const answerRequest = (connectionId: string, user: { id: string; role: string }, status: string) =>
    send('PATCH', `/connect/${connectionId}/status`, user, { status });

  await t.test('message request: an answer applies once and a repeat changes nothing', async () => {
    const { recipient, connection } = await messageRequest();
    const accepted = await answerRequest(connection.id, recipient, 'ACCEPTED');
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.status, 'ACCEPTED');
    for (const status of ['DECLINED', 'ACCEPTED']) {
      assert.equal((await answerRequest(connection.id, recipient, status)).status, 409, `${status} after ACCEPTED`);
    }
    assert.equal((await prisma.passportConnection.findUniqueOrThrow({ where: { id: connection.id } })).status, 'ACCEPTED');
  });

  await t.test('message request: answers sent together produce one decision', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const { recipient, connection } = await messageRequest();
      const answers = ['ACCEPTED', 'DECLINED', 'ACCEPTED', 'DECLINED', 'DECLINED'];
      const results = await Promise.all(answers.map((status) => answerRequest(connection.id, recipient, status)));
      assert.deepEqual(statuses(results), ONE_WINNER, `round ${round}: ${JSON.stringify(results.map((r) => r.status))}`);
      const winner = results.find((result) => result.status === 200)!;
      const stored = await prisma.passportConnection.findUniqueOrThrow({ where: { id: connection.id } });
      assert.equal(stored.status, winner.body.status, `round ${round}: the stored decision is the one that succeeded`);
    }
  });

  await t.test('message request: a reply racing a decline never overturns the decline', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const { recipient, connection } = await messageRequest();
      const [decline, reply] = await Promise.all([
        answerRequest(connection.id, recipient, 'DECLINED'),
        send('POST', `/connect/${connection.id}/messages`, recipient, { body: `round ${round}` }),
      ]);
      assert.equal(reply.status, 201);
      assert.ok([200, 409].includes(decline.status), `round ${round}: ${decline.status}`);
      const stored = await prisma.passportConnection.findUniqueOrThrow({ where: { id: connection.id } });
      assert.equal(stored.status, decline.status === 200 ? 'DECLINED' : 'ACCEPTED', `round ${round}`);
    }
  });

  // ─── Facility issues ──────────────────────────────────────────────────────
  const facilityIssue = (status: 'REPORTED' | 'VERIFY' = 'REPORTED') => prisma.maintenanceIssue.create({
    data: { studio_id: studio.id, room_id: room.id, reported_by: admin.id, symptom: 'Hum on line 3', severity: 'DEGRADED', status },
  });
  const advance = (issueId: string, body: Record<string, unknown>) => send('PATCH', `/facilities/issues/${issueId}`, admin, body);

  await t.test('facility issue: each step applies once and a repeat changes nothing', async () => {
    const issue = await facilityIssue();
    assert.equal((await advance(issue.id, { status: 'ASSIGNED' })).status, 200);
    assert.equal((await advance(issue.id, { status: 'ASSIGNED' })).status, 409, 'assigning an assigned issue again');
    for (const status of ['REPAIRING', 'VERIFY', 'RESTORED']) {
      const step = await advance(issue.id, { status });
      assert.equal(step.status, 200, `${status}: ${JSON.stringify(step.body)}`);
      assert.equal(step.body.status, status);
    }
    const restored = await prisma.maintenanceIssue.findUniqueOrThrow({ where: { id: issue.id } });
    assert.equal((await advance(issue.id, { status: 'RESTORED' })).status, 409, 'restoring a restored issue again');
    assert.deepEqual(await prisma.maintenanceIssue.findUniqueOrThrow({ where: { id: issue.id } }), restored);
  });

  await t.test('facility issue: confirmations sent together restore it once', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const issue = await facilityIssue('VERIFY');
      const results = await Promise.all([1, 2, 3, 4, 5].map(() => advance(issue.id, { status: 'RESTORED' })));
      assert.deepEqual(statuses(results), ONE_WINNER, `round ${round}: ${JSON.stringify(results.map((r) => r.status))}`);
      const winner = results.find((result) => result.status === 200)!;
      const stored = await prisma.maintenanceIssue.findUniqueOrThrow({ where: { id: issue.id } });
      assert.equal(stored.status, 'RESTORED');
      assert.equal(stored.resolved_at?.toISOString(), winner.body.resolved_at, `round ${round}: one restoration recorded`);
    }
  });

  // ─── Studio Circle consent ────────────────────────────────────────────────
  const circleMember = async (consent_status: 'ELIGIBLE' | 'REQUESTED' = 'ELIGIBLE') => {
    const artist = await artistUser('circle');
    const member = await prisma.studioCircleMember.create({
      data: { studio_id: studio.id, artist_id: artist.artist!.id, consent_status, first_session_at: new Date(), last_session_at: new Date() },
    });
    return { artist, member };
  };
  const invite = (memberId: string) => send('POST', `/studio-circle/${memberId}/request`, admin);
  const invitations = (userId: string) => prisma.notification.count({ where: { user_id: userId, type: 'studio_circle_consent' } });
  const answerCircle = (memberId: string, user: { id: string; role: string }, body: Record<string, unknown>) =>
    send('PATCH', `/studio-circle/${memberId}/consent`, user, body);
  const ACCEPT = { action: 'accept', visibility: 'STAGE_NAME' };

  await t.test('Studio Circle: a request notifies once and a repeat changes nothing', async () => {
    const { artist, member } = await circleMember();
    const requested = await invite(member.id);
    assert.equal(requested.status, 200, JSON.stringify(requested.body));
    assert.equal(requested.body.consent_status, 'REQUESTED');
    assert.equal(await invitations(artist.id), 1);
    assert.equal((await invite(member.id)).status, 409, 'requesting a requested membership again');
    assert.equal(await invitations(artist.id), 1, 'the repeat sends no second invitation');
  });

  await t.test('Studio Circle: requests sent together notify once', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const { artist, member } = await circleMember();
      const results = await Promise.all([1, 2, 3, 4, 5].map(() => invite(member.id)));
      assert.deepEqual(statuses(results), ONE_WINNER, `round ${round}: ${JSON.stringify(results.map((r) => r.status))}`);
      assert.equal(await invitations(artist.id), 1, `round ${round}: one invitation`);
    }
  });

  await t.test('Studio Circle: an answer applies once and a repeat changes nothing', async () => {
    const { artist, member } = await circleMember('REQUESTED');
    const accepted = await answerCircle(member.id, artist, ACCEPT);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    assert.equal(accepted.body.consent_status, 'ACCEPTED');
    const before = await prisma.studioCircleMember.findUniqueOrThrow({ where: { id: member.id } });
    assert.equal((await answerCircle(member.id, artist, { ...ACCEPT, visibility: 'FULL_PROFILE' })).status, 409, 'accepting again');
    assert.deepEqual(await prisma.studioCircleMember.findUniqueOrThrow({ where: { id: member.id } }), before);

    assert.equal((await answerCircle(member.id, artist, { action: 'withdraw' })).status, 200);
    assert.equal((await answerCircle(member.id, artist, { action: 'withdraw' })).status, 409, 'withdrawing again');
    assert.equal((await answerCircle(member.id, artist, { action: 'decline' })).status, 200, 'a withdrawn membership can be kept private');
    assert.equal((await answerCircle(member.id, artist, { action: 'decline' })).status, 409, 'declining again');
    assert.equal((await prisma.studioCircleMember.findUniqueOrThrow({ where: { id: member.id } })).consent_status, 'DECLINED');
  });

  await t.test('Studio Circle: answers sent together produce one decision', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const { artist, member } = await circleMember('REQUESTED');
      const bodies = [ACCEPT, { action: 'decline' }, ACCEPT, { action: 'decline' }, ACCEPT];
      const results = await Promise.all(bodies.map((body) => answerCircle(member.id, artist, body)));
      assert.deepEqual(statuses(results), ONE_WINNER, `round ${round}: ${JSON.stringify(results.map((r) => r.status))}`);
      const winner = results.find((result) => result.status === 200)!;
      const stored = await prisma.studioCircleMember.findUniqueOrThrow({ where: { id: member.id } });
      assert.equal(stored.consent_status, winner.body.consent_status, `round ${round}: the stored decision is the one that succeeded`);
    }
  });

  await t.test('Studio Circle: a request racing the artist\'s answer never overwrites it', async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const { artist, member } = await circleMember();
      const [answer, requested] = await Promise.all([answerCircle(member.id, artist, ACCEPT), invite(member.id)]);
      assert.ok([200, 409].includes(answer.status) && [200, 409].includes(requested.status), `round ${round}: ${answer.status}/${requested.status}`);
      const stored = await prisma.studioCircleMember.findUniqueOrThrow({ where: { id: member.id } });
      if (answer.status === 200) assert.equal(stored.consent_status, 'ACCEPTED', `round ${round}: the acceptance stands`);
      else assert.equal(stored.consent_status, 'REQUESTED', `round ${round}`);
    }
  });
});
