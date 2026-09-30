import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// The AI brief on an artist's passport, against a real database. GET /api/artists/:id/summary
// asks an outside model for the brief and stores it on the passport. It served a stored brief
// only when that was newer than passport.updated_at, which Prisma moves on every write to the
// passport, storing the brief included: every request paid the model again, and the first one
// after an artist edited their brief replaced the edit. The owner's rule since 2026-09-15: a
// stored brief stands until the artist changes it, and a brief is written only for a passport
// with none, which includes one the artist emptied.

const OWN_WORDS = 'My brief, in my own words.';
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('an artist brief is written once and never replaces what the artist wrote', async (t) => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.match(`${database.pathname}/${database.searchParams.get('schema') ?? ''}`, /(^|[/_-])test([/_-]|$)/i);

  // No request in this file reaches Anthropic. Every call is answered here and counted, and
  // each answer is numbered so a test can tell one brief from the next. A test can also act
  // while the model is writing, or have the next answer carry no text.
  const realFetch = globalThis.fetch;
  let modelCalls = 0;
  let whileWriting: (() => Promise<void>) | null = null;
  let answerWithoutText = false;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith('https://api.anthropic.com/')) return realFetch(input, init);
    modelCalls += 1;
    const content = answerWithoutText ? [] : [{ type: 'text', text: `Brief ${modelCalls}, written by the stand-in model.` }];
    const during = whileWriting;
    whileWriting = null;
    if (during) await during();
    return new Response(JSON.stringify({ content }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = realFetch; });

  const [{ app }, { prisma }] = await Promise.all([import('../app'), import('../lib/prisma')]);
  // lib/env.ts will not start the app with AI on and no ANTHROPIC_API_KEY, so AI is switched
  // on only once the app has loaded, for a brief route gated on it.
  const aiWas = process.env.OIANO_AI_ENABLED;
  process.env.OIANO_AI_ENABLED = 'true';
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    if (aiWas === undefined) delete process.env.OIANO_AI_ENABLED;
    else process.env.OIANO_AI_ENABLED = aiWas;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await prisma.$disconnect();
  });

  type Account = { user: { id: string; role: string }; artistId: string; passportCode: string };
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const call = async (method: string, path: string, options: { as?: Account; body?: unknown; headers?: Record<string, string> } = {}) => {
    const headers: Record<string, string> = { ...options.headers };
    if (options.as) {
      headers.authorization = `Bearer ${jwt.sign({ sub: options.as.user.id, role: options.as.user.role, ver: 0 }, process.env.JWT_SECRET!)}`;
    }
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    const response = await realFetch(`${baseUrl}${path}`, {
      method, headers, body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    return { status: response.status, body: (await response.json()) as any };
  };
  const readBrief = (artist: Account) => call('GET', `/artists/${artist.artistId}/summary`, { as: artist });
  const editBrief = (artist: Account, text: string) => call('PATCH', '/passport/summary', { as: artist, body: { ai_summary: text } });
  // Each new visitor to the public passport rewrites its view count.
  const visitPassport = (artist: Account, visitor: string) =>
    call('GET', `/passport/public/${artist.passportCode}`, { headers: { 'user-agent': visitor } });
  const storedBrief = (artist: Account) => prisma.artistPassport.findUniqueOrThrow({
    where: { artist_id: artist.artistId }, select: { ai_summary: true, ai_summary_edited: true },
  });
  // The brief used to be stored without being awaited, so a write that must not happen is
  // given time to land before its absence is asserted.
  const settle = () => delay(250);

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let sequence = 0;
  const unique = (label: string) => `${label}-${runId}-${(sequence += 1)}`;
  const artistAccount = async (label: string): Promise<Account> => {
    const user = await prisma.user.create({
      data: {
        email: `${unique(label)}@example.test`, role: 'ARTIST',
        artist: { create: {
          name: `Artist ${label}`, bio: `Makes records about ${label}.`,
          passport: { create: { passport_code: unique('OIA').toUpperCase(), creative_dna: { genres: ['Highlife'] } } },
        } },
      },
      include: { artist: { include: { passport: true } } },
    });
    return { user, artistId: user.artist!.id, passportCode: user.artist!.passport!.passport_code };
  };

  await t.test('a stored brief is served again without asking the model to write it again', async () => {
    const artist = await artistAccount('repeat');
    const calls = modelCalls;
    const first = await readBrief(artist);
    assert.equal(first.status, 200);
    assert.equal(modelCalls, calls + 1, 'an artist with no brief has one written');
    const written = first.body.summary;

    assert.equal((await readBrief(artist)).body.summary, written, 'the next request is served the stored brief');
    // Writing the passport moves updated_at past the brief, which made every stored brief look stale.
    for (const visitor of ['visitor-1', 'visitor-2']) {
      assert.equal((await visitPassport(artist, visitor)).status, 200);
      assert.equal((await readBrief(artist)).body.summary, written, `the brief still stands after ${visitor}`);
    }
    const passport = await prisma.artistPassport.findUniqueOrThrow({ where: { artist_id: artist.artistId } });
    assert.ok(passport.updated_at > passport.ai_summary_updated_at!, 'the passport was written after its brief');
    assert.equal(passport.ai_summary, written);
    assert.equal(modelCalls, calls + 1, 'the model wrote the brief once');
  });

  await t.test('a stored brief stands when what it was written from changes', async () => {
    const artist = await artistAccount('changing');
    const written = (await readBrief(artist)).body.summary;
    const calls = modelCalls;
    const { profile_strength: strengthBefore } = await prisma.artistPassport.findUniqueOrThrow({ where: { artist_id: artist.artistId } });

    // Every input the brief is written from moves: name, alias, bio and creative DNA, with
    // them the profile strength, and then the session count.
    const profile = await call('PATCH', '/passport/profile', { as: artist, body: {
      name: 'Renamed Artist', alias: 'Renamed', bio: 'A different bio.', creative_dna: { genres: ['Jazz'], vocal_type: 'Alto' },
    } });
    assert.equal(profile.status, 200);
    assert.notEqual(profile.body.passport.profile_strength, strengthBefore, 'the profile strength moved with the profile');
    const studio = await prisma.studio.create({ data: { slug: unique('brief-studio'), name: 'Brief Studio' } });
    const room = await prisma.room.create({ data: { studio_id: studio.id, name: 'Brief Room' } });
    const service = await prisma.serviceOffering.create({ data: {
      studio_id: studio.id, category: 'RECORDING', name: 'Brief Session', min_price_usd: 50, max_price_usd: 50, unit: 'hour',
    } });
    const starts_at = new Date(Date.now() - 7 * 86_400_000);
    const booking = await prisma.booking.create({ data: {
      studio_id: studio.id, artist_id: artist.artistId, room_id: room.id, service_id: service.id,
      starts_at, ends_at: new Date(starts_at.getTime() + 3_600_000), total_usd: 50, status: 'COMPLETED',
    } });
    await prisma.sessionLog.create({ data: { booking_id: booking.id, artist_id: artist.artistId, notes: 'A session after the brief' } });

    assert.equal((await readBrief(artist)).body.summary, written, 'the stored brief is served until the artist changes it');
    assert.equal(modelCalls, calls, 'and the model is not asked to write it again');
  });

  await t.test('a brief the artist edited is served, and never replaced', async () => {
    const artist = await artistAccount('edited');
    assert.equal((await readBrief(artist)).status, 200);
    const calls = modelCalls;

    assert.equal((await editBrief(artist, OWN_WORDS)).status, 200);
    const served = await readBrief(artist);
    assert.equal(served.status, 200);
    assert.equal(served.body.summary, OWN_WORDS, "the artist's words are served, not a new brief");

    // Something the brief is written from changes, and the edit still stands.
    assert.equal((await call('PATCH', '/passport/profile', { as: artist, body: { bio: 'A bio written after the edit.' } })).status, 200);
    assert.equal((await readBrief(artist)).body.summary, OWN_WORDS, 'a changed profile does not replace an edited brief');

    await settle();
    assert.equal(modelCalls, calls, 'the model is not asked to write over an edit');
    assert.deepEqual(await storedBrief(artist), { ai_summary: OWN_WORDS, ai_summary_edited: true }, 'the edit is stored, still marked as edited');
  });

  await t.test('a brief the artist emptied counts as none: one is written, and then it stands', async () => {
    const artist = await artistAccount('emptied');
    const first = (await readBrief(artist)).body.summary;
    assert.equal((await editBrief(artist, '')).status, 200);
    const calls = modelCalls;

    const rewritten = await readBrief(artist);
    assert.equal(rewritten.status, 200);
    assert.equal(modelCalls, calls + 1, 'an emptied brief has a new one written');
    assert.notEqual(rewritten.body.summary, first);
    assert.equal((await readBrief(artist)).body.summary, rewritten.body.summary, 'which then stands');
    assert.equal(modelCalls, calls + 1);
    assert.deepEqual(await storedBrief(artist), { ai_summary: rewritten.body.summary, ai_summary_edited: false }, "the stored brief is the model's, not an edit");
  });

  await t.test('an edit saved while the model is writing is kept', async () => {
    const artist = await artistAccount('overlap');
    let editStatus = 0;
    whileWriting = async () => { editStatus = (await editBrief(artist, OWN_WORDS)).status; };
    const reading = await readBrief(artist);
    whileWriting = null;

    assert.equal(editStatus, 200, 'the artist saved an edit while the brief was being written');
    assert.equal(reading.status, 200);
    await settle();
    assert.deepEqual(await storedBrief(artist), { ai_summary: OWN_WORDS, ai_summary_edited: true }, 'the brief the model finished afterwards does not replace the edit');
  });

  await t.test('a brief is stored before it is served, so the next request finds it', async () => {
    const artist = await artistAccount('ordered');
    // Hold the passport row, so the brief cannot be stored until it is let go.
    let letGo!: () => void;
    let rowHeld!: () => void;
    const held = new Promise<void>((resolve) => { rowHeld = resolve; });
    const holding = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM artist_passports WHERE artist_id::text = ${artist.artistId} FOR UPDATE`;
      rowHeld();
      await new Promise<void>((resolve) => { letGo = resolve; });
    }, { timeout: 20_000 });
    await Promise.race([held, holding]);

    const reading = readBrief(artist);
    let answeredWhileHeld: boolean;
    try {
      answeredWhileHeld = await Promise.race([reading.then(() => true), delay(1_000).then(() => false)]);
    } finally {
      letGo();
      await holding;
    }
    const answered = await reading;
    assert.equal(answeredWhileHeld, false, 'no brief is served while it cannot be stored');
    assert.equal(answered.status, 200);
    assert.equal((await storedBrief(artist)).ai_summary, answered.body.summary, 'the brief served is the brief stored');
  });

  await t.test('an answer with no text is not stored as a brief', async () => {
    const artist = await artistAccount('unanswered');
    answerWithoutText = true;
    const unanswered = await readBrief(artist);
    answerWithoutText = false;
    assert.equal(unanswered.status, 200);
    await settle();
    assert.equal((await storedBrief(artist)).ai_summary, null, 'nothing is stored, so the passport still has no brief');

    const calls = modelCalls;
    const written = await readBrief(artist);
    assert.equal(modelCalls, calls + 1, 'and the next request has one written');
    assert.equal((await storedBrief(artist)).ai_summary, written.body.summary);
  });
});
