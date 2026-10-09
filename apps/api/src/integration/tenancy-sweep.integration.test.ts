import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// The tenancy sweep (docs/status/2026-10-09-tenancy-sweep.md). Every route that takes an
// id is called by someone the row does not belong to: studio A's owner with studio B's
// rooms, services, engineers, bookings, issues, policies, team and Circle; artist X with
// artist Y's bookings, deliverables, consents, releases and connections. Each must answer
// as if the row did not exist, change nothing, and no list may carry the other side's
// rows. Where a route deliberately answers 403 instead, the table says so.

type Caller = { id: string; role: string };
type Attempt = { label: string; method: string; path: string; body?: unknown; headers?: Record<string, string>; expect: number };

test('records stay with the studio or person they belong to', async (t) => {
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
  const request = async (method: string, path: string, user: Caller, body?: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${jwt.sign({ sub: user.id, role: user.role, ver: 0 }, process.env.JWT_SECRET!)}`,
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: any = text;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    return { status: response.status, body: parsed, text };
  };
  const runAll = async (caller: Caller, attempts: Attempt[]) => {
    const wrong: string[] = [];
    for (const attempt of attempts) {
      const answer = await request(attempt.method, attempt.path, caller, attempt.body, attempt.headers);
      if (answer.status !== attempt.expect) wrong.push(`${attempt.label}: expected ${attempt.expect}, got ${answer.status} ${answer.text.slice(0, 160)}`);
    }
    assert.deepEqual(wrong, [], wrong.join('\n'));
  };

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let sequence = 0;
  const unique = (label: string) => `${label}-${runId}-${(sequence += 1)}`;
  const email = (label: string) => `${unique(label)}@example.test`;
  const hoursFromNow = (hours: number) => new Date(Date.now() + hours * 3_600_000);

  // ── Two studios, each with everything a staff route can name ───────────────
  const makeStudio = async (label: string) => {
    const studio = await prisma.studio.create({ data: { slug: unique(label), name: `${label} studio` } });
    const room = await prisma.room.create({ data: { studio_id: studio.id, name: unique('room') } });
    const service = await prisma.serviceOffering.create({ data: {
      studio_id: studio.id, category: 'RECORDING', name: unique('service'), min_price_usd: 50, max_price_usd: 50, unit: 'hour',
    } });
    const engineer = await prisma.engineer.create({ data: { studio_id: studio.id, name: unique('engineer'), specialties: [] } });
    const equipment = await prisma.equipment.create({ data: { studio_id: studio.id, room_id: room.id, name: unique('desk'), type: 'Console' } });
    // A legacy-owner membership holds every capability, so only the studio boundary can refuse it.
    const owner = await prisma.user.create({ data: { email: email(`${label}-owner`), role: 'STUDIO_ADMIN', active_studio_id: studio.id } });
    await prisma.studioStaff.create({ data: { user_id: owner.id, studio_id: studio.id, role: 'STUDIO_ADMIN', capabilities: [] } });
    const staffUser = await prisma.user.create({ data: { email: email(`${label}-staff`), role: 'ENGINEER', active_studio_id: studio.id } });
    const member = await prisma.studioStaff.create({ data: { user_id: staffUser.id, studio_id: studio.id, role: 'ENGINEER', position: 'ENGINEER', capabilities: ['VIEW_CALENDAR'] } });
    const invitation = await prisma.studioStaffInvitation.create({ data: {
      studio_id: studio.id, email: email(`${label}-invitee`), position: 'ENGINEER', token_hash: unique('token'), invited_by: owner.id, expires_at: hoursFromNow(48),
    } });
    const policy = await prisma.studioPolicy.create({ data: {
      studio_id: studio.id, domain: 'BOOKING', subject: unique('LATE'), name: 'Late sessions', default_outcome: {},
      enforcement: 'CONTROLLED', override_capability: 'EXTEND_HOURS', created_by: owner.id,
    } });
    const exception = await prisma.policyException.create({ data: {
      studio_id: studio.id, policy_id: policy.id, target_type: 'ARTIST_BOOKING', target_id: 'someone',
      normal_values: {}, requested_values: {}, reason: 'A late finish for a deadline', requested_by: owner.id,
    } });
    const issue = await prisma.maintenanceIssue.create({ data: {
      studio_id: studio.id, room_id: room.id, reported_by: owner.id, symptom: 'Hum', severity: 'MINOR',
    } });
    return { studio, room, service, engineer, equipment, owner, staffUser, member, invitation, policy, exception, issue };
  };
  const a = await makeStudio('tenancy-a');
  const b = await makeStudio('tenancy-b');

  // ── Two artists, each with a booking, a deliverable, a project and the rest ─
  const makeArtist = async (label: string, home: typeof a) => {
    const user = await prisma.user.create({ data: { email: email(label), role: 'ARTIST' } });
    const artist = await prisma.artist.create({ data: { user_id: user.id, name: unique(label) } });
    const startsAt = hoursFromNow(24 * 40 + sequence);
    const booking = await prisma.booking.create({ data: {
      studio_id: home.studio.id, artist_id: artist.id, room_id: home.room.id, service_id: home.service.id,
      starts_at: startsAt, ends_at: new Date(startsAt.getTime() + 3_600_000), total_usd: 50, status: 'PENDING',
    } });
    const deliverable = await prisma.deliverable.create({ data: { booking_id: booking.id, title: 'Rough mix', created_by: home.owner.id } });
    const circle = await prisma.studioCircleMember.create({ data: {
      studio_id: home.studio.id, artist_id: artist.id, first_session_at: startsAt, last_session_at: startsAt,
    } });
    const release = await prisma.artistRelease.create({ data: { artist_id: artist.id, title: unique('single'), release_type: 'SINGLE' } });
    const file = await prisma.artistFile.create({ data: { artist_id: artist.id, name: 'stems.zip', url: 'local:none' } });
    const notification = await prisma.notification.create({ data: { user_id: user.id, type: 'test', title: 'Hello', body: 'Private' } });
    return { user, artist, booking, deliverable, circle, release, file, notification };
  };
  const x = await makeArtist('artist-x', a);
  const y = await makeArtist('artist-y', b);
  const z = await makeArtist('artist-z', b);

  // Artist Y's project with a producer, so Y has consents and a rights agreement to answer.
  const producerUser = await prisma.user.create({ data: { email: email('producer'), role: 'PRODUCER' } });
  const producer = await prisma.producer.create({ data: { user_id: producerUser.id, name: unique('producer') } });
  const projectY = await prisma.project.create({ data: { producer_id: producer.id, artist_id: y.artist.id, title: unique('record') } });
  await prisma.booking.update({ where: { id: y.booking.id }, data: { project_id: projectY.id } });
  const consentY = await prisma.promotionalConsent.create({ data: {
    project_id: projectY.id, subject: 'Cover', purpose: 'Launch post', channels: ['INSTAGRAM'], assets: ['NAME'], requested_by: producerUser.id,
  } });
  const agreementY = await prisma.rightsAgreement.create({ data: {
    project_id: projectY.id, agreement_type: 'MASTER', title: 'Master split', created_by: producerUser.id,
  } });
  const connectionYZ = await prisma.passportConnection.create({ data: { initiator_id: z.artist.id, recipient_id: y.artist.id } });

  const yRowsNow = async () => ({
    booking: await prisma.booking.findUniqueOrThrow({ where: { id: y.booking.id }, select: { status: true, starts_at: true, engineer_id: true, project_id: true } }),
    payment: await prisma.payment.count({ where: { booking_id: y.booking.id } }),
    sessionLog: await prisma.sessionLog.findUnique({ where: { booking_id: y.booking.id } }),
    messages: await prisma.bookingMessage.count({ where: { booking_id: y.booking.id } }),
    deliverable: await prisma.deliverable.findUniqueOrThrow({ where: { id: y.deliverable.id }, select: { status: true } }),
    circle: await prisma.studioCircleMember.findUniqueOrThrow({ where: { id: y.circle.id }, select: { consent_status: true } }),
    consent: await prisma.promotionalConsent.findUniqueOrThrow({ where: { id: consentY.id }, select: { status: true } }),
    agreement: await prisma.rightsAgreement.findUniqueOrThrow({ where: { id: agreementY.id }, select: { status: true } }),
    project: await prisma.project.findUniqueOrThrow({ where: { id: projectY.id }, select: { is_public: true } }),
    release: await prisma.artistRelease.findUnique({ where: { id: y.release.id }, select: { title: true } }),
    connection: await prisma.passportConnection.findUniqueOrThrow({ where: { id: connectionYZ.id }, select: { status: true } }),
    notification: await prisma.notification.findUnique({ where: { id: y.notification.id }, select: { id: true } }),
    projectMessages: await prisma.projectMessage.count({ where: { project_id: projectY.id } }),
  });
  const bRowsNow = async () => ({
    room: await prisma.room.findUnique({ where: { id: b.room.id }, select: { name: true } }),
    service: await prisma.serviceOffering.findUnique({ where: { id: b.service.id }, select: { name: true } }),
    engineer: await prisma.engineer.findUnique({ where: { id: b.engineer.id }, select: { name: true } }),
    member: await prisma.studioStaff.findUnique({ where: { id: b.member.id }, select: { capabilities: true } }),
    invitation: await prisma.studioStaffInvitation.findUniqueOrThrow({ where: { id: b.invitation.id }, select: { status: true } }),
    exception: await prisma.policyException.findUniqueOrThrow({ where: { id: b.exception.id }, select: { status: true } }),
    exceptions: await prisma.policyException.count({ where: { policy_id: b.policy.id } }),
    issue: await prisma.maintenanceIssue.findUniqueOrThrow({ where: { id: b.issue.id }, select: { status: true, assigned_to: true } }),
    bookingsInRoom: await prisma.booking.count({ where: { room_id: b.room.id } }),
  });

  await t.test('studio A\'s owner cannot reach studio B\'s records by their ids', async () => {
    const yBefore = await yRowsNow();
    const bBefore = await bRowsNow();
    const bookingB = y.booking.id;
    const future = hoursFromNow(24 * 60);

    await runAll(a.owner, [
      { label: 'read B booking', method: 'GET', path: `/bookings/${bookingB}`, expect: 404 },
      { label: 'B booking next action', method: 'GET', path: `/bookings/${bookingB}/next-action`, expect: 404 },
      { label: 'B booking summary', method: 'GET', path: `/bookings/${bookingB}/session-summary`, expect: 404 },
      { label: 'B booking card', method: 'GET', path: `/bookings/${bookingB}/card.png`, expect: 404 },
      { label: 'confirm B booking', method: 'PATCH', path: `/bookings/${bookingB}/status`, body: { status: 'CONFIRMED' }, expect: 404 },
      { label: 'assign engineer to B booking', method: 'PATCH', path: `/bookings/${bookingB}/engineer`, body: { engineer_id: a.engineer.id }, expect: 404 },
      { label: 'assign B engineer to A booking', method: 'PATCH', path: `/bookings/${x.booking.id}/engineer`, body: { engineer_id: b.engineer.id }, expect: 404 },
      { label: 'B booking session notes', method: 'PATCH', path: `/bookings/${bookingB}/session-notes`, body: { notes: 'mine now' }, expect: 404 },
      { label: 'deliver to B booking', method: 'POST', path: `/bookings/${bookingB}/deliver`, body: { file_urls: ['https://example.test/a.wav'] }, expect: 404 },
      { label: 'complete B booking', method: 'POST', path: `/bookings/${bookingB}/complete`, body: {}, headers: { 'Idempotency-Key': unique('key') }, expect: 404 },
      { label: 'read B booking thread', method: 'GET', path: `/bookings/${bookingB}/messages`, expect: 404 },
      { label: 'post to B booking thread', method: 'POST', path: `/bookings/${bookingB}/messages`, body: { body: 'hello' }, expect: 404 },
      { label: 'record cash on B booking', method: 'POST', path: `/admin/bookings/${bookingB}/cash-payment`, body: {}, expect: 404 },
      { label: 'walk-in into B room', method: 'POST', path: '/admin/walkin', body: { name: 'Guest', room_id: b.room.id, starts_at: future.toISOString(), duration_minutes: 60 }, expect: 404 },
      { label: 'clock activity on B booking', method: 'POST', path: `/studio-clock/sessions/${bookingB}/activity`, body: { note: 'saved' }, expect: 404 },
      { label: 'checkout for B booking', method: 'POST', path: '/payments/stripe/checkout-session', body: { booking_id: bookingB }, expect: 404 },
      { label: 'rename B room', method: 'PATCH', path: `/studio-setup/rooms/${b.room.id}`, body: { name: unique('taken') }, expect: 404 },
      { label: 'delete B room', method: 'DELETE', path: `/studio-setup/rooms/${b.room.id}`, expect: 404 },
      { label: 'reprice B service', method: 'PATCH', path: `/studio-setup/services/${b.service.id}`, body: { min_price_usd: 1 }, expect: 404 },
      { label: 'delete B service', method: 'DELETE', path: `/studio-setup/services/${b.service.id}`, expect: 404 },
      { label: 'rename B engineer', method: 'PATCH', path: `/studio-setup/engineers/${b.engineer.id}`, body: { name: unique('taken') }, expect: 404 },
      { label: 'delete B engineer', method: 'DELETE', path: `/studio-setup/engineers/${b.engineer.id}`, expect: 404 },
      { label: 'read B engineer', method: 'GET', path: `/engineers/${b.engineer.id}`, expect: 404 },
      { label: 'change B team member', method: 'PATCH', path: `/studio/team/${b.member.id}`, body: { role: 'STUDIO_ADMIN', position: 'OWNER', capabilities: ['MANAGE_STAFF'] }, expect: 404 },
      { label: 'remove B team member', method: 'DELETE', path: `/studio/team/${b.member.id}`, expect: 404 },
      { label: 'revoke B invitation', method: 'DELETE', path: `/studio/team/invitations/${b.invitation.id}`, expect: 404 },
      { label: 'switch into B', method: 'PATCH', path: '/studio/active', body: { studio_id: b.studio.id }, expect: 403 },
      { label: 'advance B issue', method: 'PATCH', path: `/facilities/issues/${b.issue.id}`, body: { status: 'ASSIGNED', assigned_to: a.owner.id }, expect: 404 },
      { label: 'request exception to B policy', method: 'POST', path: '/studio-policies/exceptions', body: {
        policy_id: b.policy.id, target_type: 'ARTIST_BOOKING', target_id: 'x', normal_values: {}, requested_values: {}, reason: 'Please let us',
      }, expect: 404 },
      { label: 'decide B exception', method: 'PATCH', path: `/studio-policies/exceptions/${b.exception.id}/decision`, body: { decision: 'APPROVE' }, expect: 404 },
      { label: 'ask B Circle member', method: 'POST', path: `/studio-circle/${y.circle.id}/request`, expect: 404 },
      { label: 'read B artist with no A booking', method: 'GET', path: `/artists/${y.artist.id}`, expect: 404 },
      { label: 'read B artist brief', method: 'GET', path: `/artists/${y.artist.id}/summary`, expect: 403 },
      { label: 'ticket for B artist file', method: 'POST', path: `/artists/${y.artist.id}/files/${y.file.id}/access-ticket`, expect: 403 },
      { label: 'read B project thread', method: 'GET', path: `/projects/${projectY.id}/messages`, expect: 404 },
      { label: 'post to B project thread', method: 'POST', path: `/projects/${projectY.id}/messages`, body: { body: 'hello' }, expect: 404 },
    ]);

    assert.deepEqual(await yRowsNow(), yBefore, 'nothing of artist Y\'s changed');
    assert.deepEqual(await bRowsNow(), bBefore, 'nothing of studio B\'s changed');
  });

  await t.test('no studio list carries another studio\'s rows', async () => {
    const lists = [
      '/bookings', '/artists', '/engineers', '/facilities/rooms', '/facilities/equipment', '/facilities/issues',
      '/studio-policies', '/studio-policies/exceptions', '/studio/team', '/studio-setup', '/admin/announcements',
      '/studio-circle/studio', '/studio-circle/current-work', `/admin/runsheet?date=${y.booking.starts_at.toISOString().slice(0, 10)}`,
      `/engineers/runsheet?date=${y.booking.starts_at.toISOString().slice(0, 10)}`, '/studio-clock', '/studio/current',
    ];
    const foreign = [b.room.id, b.service.id, b.engineer.id, b.equipment.id, b.issue.id, b.policy.id, b.exception.id,
      b.member.id, b.invitation.id, y.booking.id, y.artist.id, y.circle.id, y.user.email, b.owner.email];
    const leaks: string[] = [];
    for (const path of lists) {
      const listed = await request('GET', path, a.owner);
      if (listed.status !== 200) { leaks.push(`${path}: ${listed.status} ${listed.text.slice(0, 120)}`); continue; }
      for (const id of foreign) if (listed.text.includes(id)) leaks.push(`${path} carries ${id}`);
    }
    assert.deepEqual(leaks, [], leaks.join('\n'));
  });

  await t.test('artist X cannot reach artist Y\'s records by their ids', async () => {
    const before = await yRowsNow();
    const future = hoursFromNow(24 * 70);
    await prisma.booking.update({ where: { id: z.booking.id }, data: { status: 'COMPLETED', engineer_id: b.engineer.id } });

    await runAll(x.user, [
      { label: 'read Y booking', method: 'GET', path: `/bookings/${y.booking.id}`, expect: 404 },
      { label: 'Y booking next action', method: 'GET', path: `/bookings/${y.booking.id}/next-action`, expect: 404 },
      { label: 'Y booking summary', method: 'GET', path: `/bookings/${y.booking.id}/session-summary`, expect: 404 },
      { label: 'Y booking card', method: 'GET', path: `/bookings/${y.booking.id}/card.png`, expect: 404 },
      { label: 'reschedule Y booking', method: 'PATCH', path: `/bookings/${y.booking.id}/reschedule`, body: {
        starts_at: future.toISOString(), ends_at: new Date(future.getTime() + 3_600_000).toISOString(),
      }, expect: 404 },
      { label: 'review Y deliverable', method: 'PATCH', path: `/bookings/${y.booking.id}/deliverables/${y.deliverable.id}/review`, body: { decision: 'APPROVED' }, expect: 404 },
      { label: 'review Z session', method: 'PATCH', path: `/bookings/${z.booking.id}/artist-review`, body: { artist_rating: 1 }, expect: 404 },
      { label: 'read Y booking thread', method: 'GET', path: `/bookings/${y.booking.id}/messages`, expect: 404 },
      { label: 'post to Y booking thread', method: 'POST', path: `/bookings/${y.booking.id}/messages`, body: { body: 'hello' }, expect: 404 },
      { label: 'checkout for Y booking', method: 'POST', path: '/payments/stripe/checkout-session', body: { booking_id: y.booking.id }, expect: 404 },
      { label: 'answer Y Circle invitation', method: 'PATCH', path: `/studio-circle/${y.circle.id}/consent`, body: { action: 'decline' }, expect: 404 },
      { label: 'answer Y promotion request', method: 'PATCH', path: `/artist-projects/${projectY.id}/promotional-consents/${consentY.id}`, body: { action: 'APPROVE' }, expect: 404 },
      { label: 'answer Y rights split', method: 'PATCH', path: `/artist-projects/${projectY.id}/rights-agreements/${agreementY.id}`, body: { action: 'APPROVE' }, expect: 404 },
      { label: 'publish Y project', method: 'PATCH', path: `/passport/projects/${projectY.id}/visibility`, body: { is_public: true }, expect: 404 },
      { label: 'rename Y release', method: 'PATCH', path: `/passport/releases/${y.release.id}`, body: { title: unique('mine') }, expect: 404 },
      { label: 'delete Y release', method: 'DELETE', path: `/passport/releases/${y.release.id}`, expect: 404 },
      { label: 'read Y and Z connection', method: 'GET', path: `/connect/${connectionYZ.id}`, expect: 404 },
      { label: 'post in Y and Z connection', method: 'POST', path: `/connect/${connectionYZ.id}/messages`, body: { body: 'hello' }, expect: 404 },
      { label: 'answer Y connection request', method: 'PATCH', path: `/connect/${connectionYZ.id}/status`, body: { status: 'DECLINED' }, expect: 404 },
      { label: 'read Y notification', method: 'PATCH', path: `/notifications/${y.notification.id}/read`, expect: 404 },
      { label: 'delete Y notification', method: 'DELETE', path: `/notifications/${y.notification.id}`, expect: 404 },
      { label: 'read Y project thread', method: 'GET', path: `/projects/${projectY.id}/messages`, expect: 404 },
      { label: 'ticket for Y file', method: 'POST', path: `/artists/${y.artist.id}/files/${y.file.id}/access-ticket`, expect: 403 },
      { label: 'delete Y file', method: 'DELETE', path: `/artists/${y.artist.id}/files/${y.file.id}`, expect: 403 },
      { label: 'Y brief', method: 'GET', path: `/artists/${y.artist.id}/summary`, expect: 403 },
      { label: 'report on Y booking', method: 'POST', path: '/facilities/issues', body: { booking_id: y.booking.id, symptom: 'Hum', severity: 'MINOR' }, expect: 403 },
    ]);
    assert.deepEqual(await yRowsNow(), before, 'nothing of artist Y\'s changed');
    assert.equal(await prisma.sessionLog.count({ where: { booking_id: z.booking.id } }), 0, 'Z\'s session was not rated');
  });

  await t.test('an artist still reschedules and reviews their own session', async () => {
    const future = hoursFromNow(24 * 80);
    const moved = await request('PATCH', `/bookings/${x.booking.id}/reschedule`, x.user, {
      starts_at: future.toISOString(), ends_at: new Date(future.getTime() + 3_600_000).toISOString(),
    });
    assert.equal(moved.status, 200, moved.text);

    const reviewed = await request('PATCH', `/bookings/${z.booking.id}/artist-review`, z.user, { artist_rating: 5, artist_testimonial: 'Great ears' });
    assert.equal(reviewed.status, 200, reviewed.text);
    assert.deepEqual(reviewed.body, { artist_rating: 5, artist_testimonial: 'Great ears' });
    const log = await prisma.sessionLog.findUniqueOrThrow({ where: { booking_id: z.booking.id } });
    assert.equal(log.artist_rating, 5);
    assert.equal(log.artist_id, z.artist.id);

    // Only an artist reviews, and only a completed session with an engineer.
    assert.equal((await request('PATCH', `/bookings/${z.booking.id}/artist-review`, b.owner, { artist_rating: 1 })).status, 403);
    assert.equal((await request('PATCH', `/bookings/${y.booking.id}/artist-review`, y.user, { artist_rating: 4 })).status, 400);
  });

  await t.test('a producer reading a booking on their project does not get the artist\'s email', async () => {
    const asProducer = await request('GET', `/bookings/${y.booking.id}`, producerUser);
    assert.equal(asProducer.status, 200, asProducer.text);
    assert.equal(asProducer.body.artist.id, y.artist.id);
    assert.ok(!asProducer.text.includes(y.user.email), 'the artist\'s email stays with the artist and the studio');

    // The studio the artist booked still reaches its customer.
    const asStudio = await request('GET', `/bookings/${y.booking.id}`, b.owner);
    assert.equal(asStudio.status, 200);
    assert.equal(asStudio.body.artist.user.email, y.user.email);
  });

  // A producer may still name any artist on a project (POST/PATCH /api/producer/projects
  // take artist_id unchecked), but the name no longer opens anything of the artist's: the
  // routes that listed the named artist's sessions and attached one to the producer's
  // project are gone, and only the artist attaches a session (owner decision 2026-10-09,
  // docs/status/2026-10-09-artist-links-bookings.md).
  await t.test('a producer cannot reach the bookings of an artist who never joined their project', async () => {
    const strangerProject = await request('POST', '/producer/projects', producerUser, { title: unique('claim'), artist_id: x.artist.id });
    assert.equal(strangerProject.status, 201);
    const sessions = await request('GET', `/producer/projects/${strangerProject.body.id}/available-sessions`, producerUser);
    assert.equal(sessions.status, 404);
    assert.ok(!sessions.text.includes(x.booking.id), "artist X's bookings are not listed to a stranger");
    const linked = await request('POST', `/producer/projects/${strangerProject.body.id}/link-booking`, producerUser, { booking_id: x.booking.id });
    assert.equal(linked.status, 404, linked.text);
    const stored = await prisma.booking.findUniqueOrThrow({ where: { id: x.booking.id }, select: { project_id: true } });
    assert.equal(stored.project_id, null, "artist X's booking stays off the producer's project");
    assert.equal((await request('GET', `/bookings/${x.booking.id}`, producerUser)).status, 404);
    const list = await request('GET', '/bookings', producerUser);
    assert.equal(list.status, 200);
    assert.ok(!list.text.includes(x.booking.id), "nor in the producer's booking list");

    // Not even on the producer's own project with artist Y, whose session Y put there.
    assert.equal((await request('GET', `/producer/projects/${projectY.id}/available-sessions`, producerUser)).status, 404);
    assert.equal((await request('POST', `/producer/projects/${projectY.id}/link-booking`, producerUser, { booking_id: y.booking.id })).status, 404);
  });
});
