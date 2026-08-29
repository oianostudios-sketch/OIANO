import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

test('auth, booking payment, and rights operate through real database transactions', async (t) => {
  const databaseUrl = new URL(process.env.DATABASE_URL!);
  const databaseName = databaseUrl.pathname.replace(/^\//, '');
  const schemaName = databaseUrl.searchParams.get('schema') || 'public';
  assert.ok(
    /(^|[_-])test([_-]|$)/i.test(databaseName) || /(^|[_-])test([_-]|$)/i.test(schemaName),
    'integration database or schema must contain a standalone test segment',
  );

  const [{ app }, { prisma }, { issuePasswordResetToken }] = await Promise.all([
    import('../app'),
    import('../lib/prisma'),
    import('../lib/passwordResetToken'),
  ]);

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  });

  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    });
    const body = await response.json() as any;
    return { response, body };
  };

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const studio = await prisma.studio.upsert({
    where: { slug: 'dreamz-music-lab' },
    update: {},
    create: { slug: 'dreamz-music-lab', name: 'Integration Studio' },
  });
  const room = await prisma.room.create({ data: { studio_id: studio.id, name: 'Integration Room', hourly_rate: 50 } });
  const service = await prisma.serviceOffering.create({
    data: { studio_id: studio.id, category: 'RECORDING', name: 'Integration Recording', min_price_usd: 50, max_price_usd: 50, unit: 'hour' },
  });

  const password = 'IntegrationPass123!';
  const enteredEmail = `entered-${runId}@example.test`;
  const entered = await request('/auth/enter', { method: 'POST', body: JSON.stringify({ email: enteredEmail, password }) });
  assert.equal(entered.response.status, 201);
  assert.equal(entered.body.created, true);
  assert.equal(Number(entered.body.user.artist.wallet.balance_usd), 0, 'public account creation must not invent wallet value');
  assert.equal(await prisma.walletTransaction.count({ where: { wallet_id: entered.body.user.artist.wallet.id } }), 0);

  const email = `artist-${runId}@example.test`;
  const signup = await request('/auth/signup', { method: 'POST', body: JSON.stringify({ email, password, name: 'Integration Artist', role: 'ARTIST' }) });
  assert.equal(signup.response.status, 201);
  assert.ok(signup.body.token);
  const artistToken = signup.body.token as string;
  const artistId = signup.body.user.artist.id as string;

  const login = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.user.email, email);

  await prisma.wallet.update({ where: { artist_id: artistId }, data: { balance_usd: 500 } });
  const producerUser = await prisma.user.create({
    data: { email: `producer-${runId}@example.test`, role: 'PRODUCER', password_hash: await bcrypt.hash(password, 4), producer: { create: { name: 'Integration Producer' } } },
    include: { producer: true },
  });
  const producerLogin = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email: producerUser.email, password }) });
  assert.equal(producerLogin.response.status, 200);
  const project = await prisma.project.create({ data: { producer_id: producerUser.producer!.id, artist_id: artistId, title: 'Integration Project' } });

  const startsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  startsAt.setMinutes(0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const bookingResult = await request('/bookings', {
    method: 'POST',
    headers: { authorization: `Bearer ${artistToken}` },
    body: JSON.stringify({ studio_id: studio.id, room_id: room.id, service_id: service.id, project_id: project.id, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() }),
  });
  assert.equal(bookingResult.response.status, 201);
  const bookingId = bookingResult.body.id as string;
  const persistedBooking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId }, include: { payment: true } });
  assert.equal(persistedBooking.payment?.provider, 'wallet');
  assert.equal(persistedBooking.payment?.status, 'PAID');
  assert.equal(Number((await prisma.wallet.findUniqueOrThrow({ where: { artist_id: artistId } })).balance_usd), 450);
  const bookingLedger = await prisma.financialTransaction.findUnique({ where: { source_type_source_id: { source_type: 'BOOKING_PAYMENT', source_id: persistedBooking.payment!.id } }, include: { entries: true } });
  assert.ok(bookingLedger);
  assert.equal(bookingLedger.entries.reduce((sum, entry) => sum + (entry.direction === 'DEBIT' ? Number(entry.amount_usd) : -Number(entry.amount_usd)), 0), 0);

  const adminUser = await prisma.user.create({
    data: {
      email: `operator-${runId}@example.test`,
      role: 'STUDIO_ADMIN',
      password_hash: await bcrypt.hash(password, 4),
      active_studio_id: studio.id,
      studio_staff: { create: { studio_id: studio.id, role: 'STUDIO_ADMIN' } },
    },
  });
  const adminLogin = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email: adminUser.email, password }) });
  assert.equal(adminLogin.response.status, 200);

  // Multi-studio tenant boundary: a second operator, artist, booking and
  // engineer must remain invisible to the first studio's staff endpoints.
  const secondStudio = await prisma.studio.create({
    data: { slug: `tenant-b-${runId}`, name: 'Tenant B Studio' },
  });
  const secondArtistUser = await prisma.user.create({
    data: {
      email: `tenant-b-artist-${runId}@example.test`,
      role: 'ARTIST',
      password_hash: await bcrypt.hash(password, 4),
      artist: { create: { name: 'Tenant B Artist' } },
    },
    include: { artist: true },
  });
  const secondRoom = await prisma.room.create({ data: { studio_id: secondStudio.id, name: 'Tenant B Room', hourly_rate: 75 } });
  const secondService = await prisma.serviceOffering.create({
    data: { studio_id: secondStudio.id, category: 'RECORDING', name: 'Tenant B Recording', min_price_usd: 75, max_price_usd: 75, unit: 'hour' },
  });
  const secondBooking = await prisma.booking.create({
    data: {
      studio_id: secondStudio.id,
      artist_id: secondArtistUser.artist!.id,
      room_id: secondRoom.id,
      service_id: secondService.id,
      starts_at: startsAt,
      ends_at: endsAt,
      total_usd: 75,
    },
  });
  await prisma.engineer.create({ data: { studio_id: secondStudio.id, name: 'Tenant B Engineer' } });

  const scopedArtists = await request('/artists', { headers: { authorization: `Bearer ${adminLogin.body.token}` } });
  assert.equal(scopedArtists.response.status, 200);
  assert.ok(scopedArtists.body.data.some((item: any) => item.id === artistId));
  assert.ok(!scopedArtists.body.data.some((item: any) => item.id === secondArtistUser.artist!.id));

  const forbiddenCard = await request(`/bookings/${secondBooking.id}/card.png`, {
    headers: { authorization: `Bearer ${adminLogin.body.token}` },
  });
  assert.equal(forbiddenCard.response.status, 404);

  const scopedEngineers = await request('/engineers', { headers: { authorization: `Bearer ${adminLogin.body.token}` } });
  assert.equal(scopedEngineers.response.status, 200);
  assert.ok(!scopedEngineers.body.some((item: any) => item.name === 'Tenant B Engineer'));

  const scopedClock = await request('/studio-clock', { headers: { authorization: `Bearer ${adminLogin.body.token}` } });
  assert.equal(scopedClock.response.status, 200);
  assert.equal(scopedClock.body.studioLoad, 0);

  const policy = await request('/studio-policies', {
    method: 'POST', headers: { authorization: `Bearer ${adminLogin.body.token}` },
    body: JSON.stringify({ domain: 'PAYMENT', subject: 'BOOKING_DEPOSIT', name: 'Integration deposit standard', conditions: {}, default_outcome: { requirements: [{ field: 'payment.deposit_percent', operator: 'GTE', value: 50 }], consequence: { outstanding_balance: true } }, enforcement: 'CONTROLLED', override_capability: 'WAIVE_DEPOSIT' }),
  });
  assert.equal(policy.response.status, 201);
  const evaluation = await request('/studio-policies/evaluate', {
    method: 'POST', headers: { authorization: `Bearer ${adminLogin.body.token}` },
    body: JSON.stringify({ context: {}, proposed: { payment: { deposit_percent: 0 } } }),
  });
  assert.equal(evaluation.response.status, 200);
  assert.equal(evaluation.body.decisions[0].result, 'OVERRIDE_REQUIRED');
  const exception = await request('/studio-policies/exceptions', {
    method: 'POST', headers: { authorization: `Bearer ${adminLogin.body.token}` },
    body: JSON.stringify({ policy_id: policy.body.id, target_type: 'ARTIST_BOOKING', target_id: artistId, normal_values: { deposit_percent: 50 }, requested_values: { deposit_percent: 0 }, consequence: { outstanding_balance: 50 }, reason: 'Trusted integration client' }),
  });
  assert.equal(exception.response.status, 201);
  const approvedException = await request(`/studio-policies/exceptions/${exception.body.id}/decision`, {
    method: 'PATCH', headers: { authorization: `Bearer ${adminLogin.body.token}` }, body: JSON.stringify({ decision: 'APPROVE', note: 'Approved in isolated integration test' }),
  });
  assert.equal(approvedException.response.status, 200);
  assert.equal(approvedException.body.status, 'APPROVED');

  const completion = await request(`/bookings/${bookingId}/complete`, {
    method: 'POST',
    headers: { authorization: `Bearer ${adminLogin.body.token}`, 'idempotency-key': `integration-${runId}` },
    body: JSON.stringify({
      session_notes: { notes: 'Integration completion', quality_rating: 5, tracks_worked: ['Test Track'] },
      rights: {
        agreement_type: 'MASTER',
        shares: [
          { holder_name: 'Integration Artist', holder_type: 'ARTIST', holder_ref_id: artistId, role: 'Master owner', percentage: 70 },
          { holder_name: 'Integration Producer', holder_type: 'PRODUCER', holder_ref_id: producerUser.producer!.id, role: 'Producer', percentage: 30 },
        ],
      },
    }),
  });
  assert.equal(completion.response.status, 200);
  assert.equal(completion.body.updatedBooking.status, 'COMPLETED');
  assert.equal(completion.body.rightsAgreement.shares.length, 2);
  assert.equal(completion.body.rightsAgreement.decisions.length, 2);
  assert.equal(await prisma.sessionCompletionRequest.count({ where: { booking_id: bookingId } }), 1);

  const artistMetrics = await request('/network-metrics', { headers: { authorization: `Bearer ${artistToken}` } });
  assert.equal(artistMetrics.response.status, 200);
  assert.equal(artistMetrics.body.pole, 'ARTIST');
  assert.ok(artistMetrics.body.metrics.some((metric: any) => metric.key === 'completed_sessions' && metric.value >= 1));

  const producerMetrics = await request('/network-metrics', { headers: { authorization: `Bearer ${producerLogin.body.token}` } });
  assert.equal(producerMetrics.response.status, 200);
  assert.equal(producerMetrics.body.pole, 'CREATIVE');
  assert.ok(producerMetrics.body.metrics.some((metric: any) => metric.key === 'active_projects' && metric.value >= 1));

  const invitation = await request(`/producer/projects/${project.id}/participants`, {
    method: 'POST',
    headers: { authorization: `Bearer ${producerLogin.body.token}` },
    body: JSON.stringify({ display_name: 'Integration Artist', email, role: 'SONGWRITER' }),
  });
  assert.equal(invitation.response.status, 201);
  assert.equal(invitation.body.status, 'INVITED');
  assert.equal(invitation.body.participant_ref_id, artistUserIdFromToken(artistToken));

  const contributionInbox = await request('/contributions/inbox', { headers: { authorization: `Bearer ${artistToken}` } });
  assert.equal(contributionInbox.response.status, 200);
  assert.ok(contributionInbox.body.some((item: any) => item.id === invitation.body.id && item.status === 'INVITED'));
  const acceptedContribution = await request(`/contributions/${invitation.body.id}/respond`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${artistToken}` },
    body: JSON.stringify({ decision: 'ACCEPT' }),
  });
  assert.equal(acceptedContribution.response.status, 200);
  assert.equal(acceptedContribution.body.status, 'ACTIVE');
  const contributionWorkspace = await request(`/contributions/${invitation.body.id}/workspace`, { headers: { authorization: `Bearer ${artistToken}` } });
  assert.equal(contributionWorkspace.response.status, 200);
  assert.equal(contributionWorkspace.body.project.id, project.id);
  assert.equal(contributionWorkspace.body.role, 'SONGWRITER');

  const draftCredit = await request(`/producer/projects/${project.id}/credits`, {
    method: 'POST',
    headers: { authorization: `Bearer ${producerLogin.body.token}` },
    body: JSON.stringify({ credited_name: 'Integration Artist', role: 'SONGWRITER', scope: 'Words and topline', participant_id: invitation.body.id }),
  });
  assert.equal(draftCredit.response.status, 201);
  const confirmedCredit = await request(`/contributions/credits/${draftCredit.body.id}/respond`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${artistToken}` },
    body: JSON.stringify({ decision: 'CONFIRM' }),
  });
  assert.equal(confirmedCredit.response.status, 200);
  assert.equal(confirmedCredit.body.status, 'CONFIRMED');
  assert.equal(confirmedCredit.body.is_public, true);

  const operatorAnalytics = await request('/admin/analytics', { headers: { authorization: `Bearer ${adminLogin.body.token}` } });
  assert.equal(operatorAnalytics.response.status, 200);
  const operatorMetrics = await request('/network-metrics', { headers: { authorization: `Bearer ${adminLogin.body.token}` } });
  assert.equal(operatorMetrics.response.status, 200);
  assert.equal(operatorMetrics.body.pole, 'STUDIO');
  assert.ok(operatorMetrics.body.metrics.some((metric: any) => metric.key === 'completed_sessions'));
  const artistAdminAttempt = await request('/admin/analytics', { headers: { authorization: `Bearer ${artistToken}` } });
  assert.equal(artistAdminAttempt.response.status, 403);

  const maintenanceUser = await prisma.user.create({
    data: { email: `maintenance-${runId}@example.test`, role: 'OIANO_ADMIN', password_hash: await bcrypt.hash(password, 4) },
  });
  const maintenanceToken = jwt.sign(
    { sub: maintenanceUser.id, role: maintenanceUser.role, ver: maintenanceUser.auth_version },
    process.env.JWT_SECRET!,
    { expiresIn: '5m' },
  );
  const maintenanceSummary = await request('/maintenance/summary', { headers: { authorization: `Bearer ${maintenanceToken}` } });
  assert.equal(maintenanceSummary.response.status, 200);
  assert.ok(maintenanceSummary.body.network.studios >= 1);
  const maintenanceMetrics = await request('/network-metrics', { headers: { authorization: `Bearer ${maintenanceToken}` } });
  assert.equal(maintenanceMetrics.response.status, 200);
  assert.equal(maintenanceMetrics.body.pole, 'OIANO');
  assert.ok(maintenanceMetrics.body.metrics.some((metric: any) => metric.key === 'trusted_records'));
  const artistMaintenanceAttempt = await request('/maintenance/summary', { headers: { authorization: `Bearer ${artistToken}` } });
  assert.equal(artistMaintenanceAttempt.response.status, 403);

  const artistUser = await prisma.user.findUniqueOrThrow({ where: { email } });
  const resetToken = issuePasswordResetToken(artistUser.id, artistUser.password_hash!);
  const reset = await request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token: resetToken, password: 'ReplacementPass123!' }) });
  assert.equal(reset.response.status, 200);
  const oldSession = await request('/auth/me', { headers: { authorization: `Bearer ${artistToken}` } });
  assert.equal(oldSession.response.status, 401, 'password reset must revoke the old access token');
});

function artistUserIdFromToken(token: string): string {
  const decoded = jwt.decode(token);
  assert.ok(decoded && typeof decoded === 'object' && typeof decoded.sub === 'string');
  return decoded.sub;
}
