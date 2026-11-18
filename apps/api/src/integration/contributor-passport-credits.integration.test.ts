import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { collaborationJourney, type RecordState } from './collaborationJourney';

// A credit an invited contributor confirmed on someone else's project reaches their
// Passport. Their own record lists every confirmed credit, marked public or private.
// The public Passport shows one only when both consents hold: the contributor's
// confirmation (ProjectCredit.is_public) and the project's artist making the project
// public (Project.is_public). A visitor learns the project's title and the credit,
// nothing else about the project, and nothing at all about a private one.
test('a contributor\'s confirmed credit reaches their Passport only once publication is authorized', async t => {
  const { prisma, request, lead, artist, contributor, projectId, join } = await collaborationJourney(t);

  const passportFor = async (user: { artist: { id: string } | null }) =>
    (await prisma.artistPassport.create({ data: { artist_id: user.artist!.id, passport_code: `CP-${randomUUID().slice(0, 8)}` } })).passport_code;
  const contributorCode = await passportFor(contributor);
  const artistCode = await passportFor(artist);
  const publicView = async (code: string) => {
    const response = await request<any>('GET', `/passport/public/${code}`);
    assert.equal(response.status, 200);
    return response.body;
  };
  const ownCredits = async () => {
    const response = await request<any>('GET', '/passport/portfolio', contributor);
    assert.equal(response.status, 200);
    return response.body.credits as Array<{ id: string; published: boolean; project: { title: string } }>;
  };
  const credit = async (project: string, participantId: string, role: string) => {
    const made = await request<RecordState>('POST', `/producer/projects/${project}/credits`, lead, {
      credited_name: 'Journey Contributor', participant_id: participantId, role,
    });
    assert.equal(made.status, 201);
    return made.body.id;
  };
  const answer = (creditId: string, decision: 'CONFIRM' | 'DISPUTE') =>
    request('PATCH', `/contributions/credits/${creditId}/respond`, contributor, { decision });
  const setVisibility = (project: string, isPublic: boolean) =>
    request('PATCH', `/passport/projects/${project}/visibility`, artist, { is_public: isPublic });

  const participant = await join();
  const title = (await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).title;
  const confirmed = await credit(projectId, participant.id, 'SONGWRITER');
  assert.equal((await answer(confirmed, 'CONFIRM')).status, 200);
  const unanswered = await credit(projectId, participant.id, 'COMPOSER');
  const disputed = await credit(projectId, participant.id, 'MUSICIAN');
  assert.equal((await answer(disputed, 'DISPUTE')).status, 200);

  // A second project of the same artist with notes, which stays private.
  const secretTitle = `Private album ${randomUUID()}`;
  const secretNotes = `Unreleased plan ${randomUUID()}`;
  const privateProject = await request<RecordState>('POST', '/producer/projects', lead, { title: secretTitle, artist_id: artist.artist!.id, notes: secretNotes });
  assert.equal(privateProject.status, 201);
  const invited = await request<RecordState & { invite_url: string }>('POST', `/producer/projects/${privateProject.body.id}/participants`, lead, {
    display_name: 'Journey Contributor', email: `invite-${randomUUID()}@example.test`, role: 'SONGWRITER',
  });
  const token = new URL(invited.body.invite_url).searchParams.get('token');
  assert.equal((await request('POST', '/contributions/claim', contributor, { token })).status, 200);
  assert.equal((await request('PATCH', `/contributions/${invited.body.id}/respond`, contributor, { decision: 'ACCEPT' })).status, 200);
  const privateCredit = await credit(privateProject.body.id, invited.body.id, 'VOCALS');
  assert.equal((await answer(privateCredit, 'CONFIRM')).status, 200);

  await t.test('before the project is public, the confirmed credit is on the private record only', async () => {
    const own = await ownCredits();
    assert.deepEqual(own.map(row => row.id).sort(), [confirmed, privateCredit].sort(), 'only confirmed credits, unanswered and disputed ones are not listed');
    assert.ok(own.every(row => row.published === false));
    const visitor = await publicView(contributorCode);
    assert.deepEqual(visitor.artist.credits, []);
    assert.ok(!JSON.stringify(visitor).includes(title));
  });

  await t.test('once the project\'s artist makes it public, the credit appears on the contributor\'s public Passport', async () => {
    assert.equal((await setVisibility(projectId, true)).status, 200);
    const visitor = await publicView(contributorCode);
    assert.equal(visitor.artist.credits.length, 1);
    const [shown] = visitor.artist.credits;
    assert.equal(shown.id, confirmed);
    assert.equal(shown.role, 'SONGWRITER');
    assert.deepEqual(shown.project, { title }, 'the visitor gets the project title and nothing more about it');
    assert.ok(!visitor.artist.credits.some((row: { id: string }) => [unanswered, disputed, privateCredit].includes(row.id)));
    const own = await ownCredits();
    assert.equal(own.find(row => row.id === confirmed)?.published, true);
    assert.equal(own.find(row => row.id === privateCredit)?.published, false);
  });

  await t.test('a visitor learns nothing about the private project', async () => {
    const serialized = JSON.stringify(await publicView(contributorCode));
    for (const secret of [secretTitle, secretNotes, privateProject.body.id, privateCredit]) assert.ok(!serialized.includes(secret), `public Passport leaks ${secret}`);
    const artistView = JSON.stringify(await publicView(artistCode));
    assert.ok(!artistView.includes(secretTitle) && !artistView.includes(secretNotes), 'the artist\'s own public Passport keeps the private project hidden');
  });

  await t.test('the contributor\'s own consent is required as well', async () => {
    await prisma.projectCredit.update({ where: { id: confirmed }, data: { is_public: false } });
    assert.deepEqual((await publicView(contributorCode)).artist.credits, []);
    await prisma.projectCredit.update({ where: { id: confirmed }, data: { is_public: true } });
  });

  await t.test('artist-owned project listings and visibility are unchanged, and making it private again withdraws the credit', async () => {
    const artistView = await publicView(artistCode);
    assert.deepEqual(artistView.artist.projects.map((project: { id: string }) => project.id), [projectId]);
    assert.deepEqual((await publicView(contributorCode)).artist.projects, [], 'a credit does not make someone else\'s project the contributor\'s own');
    assert.equal((await request('PATCH', `/passport/projects/${projectId}/visibility`, contributor, { is_public: false })).status, 404, 'a contributor cannot change the project\'s visibility');
    assert.equal((await setVisibility(projectId, false)).status, 200);
    assert.deepEqual((await publicView(contributorCode)).artist.credits, []);
    assert.deepEqual((await publicView(artistCode)).artist.projects, []);
  });

  await t.test('the private record needs the contributor\'s sign-in', async () => {
    assert.equal((await request('GET', '/passport/portfolio')).status, 401);
    const lead_ = await request<any>('GET', '/passport/portfolio', lead);
    assert.notEqual(lead_.status, 200, 'a producer has no artist portfolio to read');
  });
});
