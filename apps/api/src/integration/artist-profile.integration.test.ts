import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import type { Prisma } from '@prisma/client';
import jwt from 'jsonwebtoken';

// Who reads what about an artist, against a real database. Signup is open and discovery
// hands out artist ids, so whatever GET /api/artists/:id returns to someone other than
// the artist is public in practice. The brief route calls an outside model and writes to
// the passport, so it answers only people who work with the artist, and only while AI is on.

type PassportChoices = Pick<
  Prisma.ArtistPassportCreateWithoutArtistInput,
  'location' | 'location_public' | 'ai_summary' | 'ai_summary_public' | 'ai_summary_updated_at'
>;
type Place = { studio: { id: string }; room: { id: string }; service: { id: string } };

const PUBLIC_ARTIST_FIELDS = ['alias', 'avatar_url', 'bio', 'created_at', 'id', 'name', 'passport', 'status', 'tier', 'user'];
const PUBLIC_PASSPORT_FIELDS = [
  'ai_summary', 'bio', 'collaboration_interests', 'creative_dna', 'location', 'passport_code',
  'profile_image_url', 'profile_strength', 'social_links',
];
const PRIVATE_LOCATION = 'Hidden Lane, Freetown';
const PRIVATE_BRIEF = 'A brief the artist keeps to themselves';
const GENERATED_BRIEF = 'A brief written by the stand-in model.';

test('artist profiles and briefs disclose only what each reader may see', async (t) => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.match(`${database.pathname}/${database.searchParams.get('schema') ?? ''}`, /(^|[/_-])test([/_-]|$)/i);

  // No request in this file reaches Anthropic. Every call is answered here and counted,
  // so a brief generated when it should not be shows up as a count.
  const realFetch = globalThis.fetch;
  const modelCalls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith('https://api.anthropic.com/')) {
      modelCalls.push(url);
      return new Response(JSON.stringify({ content: [{ text: GENERATED_BRIEF }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    return realFetch(input, init);
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = realFetch; });

  const withAi = async (enabled: boolean, run: () => Promise<void>) => {
    const previous = process.env.OIANO_AI_ENABLED;
    process.env.OIANO_AI_ENABLED = enabled ? 'true' : 'false';
    try {
      await run();
    } finally {
      if (previous === undefined) delete process.env.OIANO_AI_ENABLED;
      else process.env.OIANO_AI_ENABLED = previous;
    }
  };

  const [{ app }, { prisma }] = await Promise.all([import('../app'), import('../lib/prisma')]);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await prisma.$disconnect();
  });

  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const read = async (path: string, viewer?: { id: string; role: string }) => {
    const response = await realFetch(`${baseUrl}${path}`, {
      headers: viewer
        ? { authorization: `Bearer ${jwt.sign({ sub: viewer.id, role: viewer.role, ver: 0 }, process.env.JWT_SECRET!)}` }
        : {},
    });
    return { status: response.status, body: (await response.json()) as any };
  };
  const assertCarriesNone = (body: unknown, fragments: string[]) => {
    const text = JSON.stringify(body);
    for (const fragment of fragments) assert.ok(!text.includes(fragment), `the response must not carry "${fragment}"`);
  };
  // The view counter and the brief cache were written without being awaited, so a write
  // that must not happen is given time to land before its absence is asserted.
  const settle = () => new Promise((resolve) => setTimeout(resolve, 250));
  const eventually = async (readValue: () => Promise<unknown>, expected: unknown, message: string) => {
    for (let attempt = 0; attempt < 40 && (await readValue()) !== expected; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(await readValue(), expected, message);
  };
  const storedBrief = async (artistId: string) =>
    (await prisma.artistPassport.findUniqueOrThrow({ where: { artist_id: artistId } })).ai_summary;

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let sequence = 0;
  const unique = (label: string) => `${label}-${runId}-${(sequence += 1)}`;
  const email = (label: string) => `${unique(label)}@example.test`;

  const makeStudio = async (label: string): Promise<Place> => {
    const studio = await prisma.studio.create({ data: { slug: unique(label), name: `Profile ${label}` } });
    const room = await prisma.room.create({ data: { studio_id: studio.id, name: `${label} room` } });
    const service = await prisma.serviceOffering.create({ data: {
      studio_id: studio.id, category: 'RECORDING', name: `${label} session`, min_price_usd: 50, max_price_usd: 50, unit: 'hour',
    } });
    return { studio, room, service };
  };
  const alpha = await makeStudio('alpha');
  const beta = await makeStudio('beta');
  const gamma = await prisma.studio.create({ data: { slug: unique('gamma'), name: 'Profile gamma' } });

  const staffAt = async (label: string, role: 'STUDIO_ADMIN' | 'ENGINEER', studioId: string) => {
    const user = await prisma.user.create({ data: { email: email(label), role } });
    await prisma.studioStaff.create({ data: { user_id: user.id, studio_id: studioId, role } });
    return user;
  };
  const artistAccount = async (label: string, passport: PassportChoices = {}) => {
    const user = await prisma.user.create({
      data: {
        email: email(label), role: 'ARTIST',
        artist: { create: {
          name: `Artist ${label}`,
          wallet: { create: { balance_usd: 250 } },
          passport: { create: { passport_code: unique('OIA').toUpperCase(), ...passport } },
        } },
      },
      include: { artist: true },
    });
    return { user, artist: user.artist! };
  };

  let slot = 0;
  const bookingData = (artistId: string, place: Place, engineerId: string | null = null) => {
    slot += 1;
    const starts_at = new Date(Date.now() - 60 * 86_400_000 + slot * 2 * 3_600_000);
    return {
      studio_id: place.studio.id, artist_id: artistId, room_id: place.room.id, service_id: place.service.id,
      engineer_id: engineerId, starts_at, ends_at: new Date(starts_at.getTime() + 3_600_000),
      total_usd: 50, status: 'COMPLETED' as const,
    };
  };
  const bookAt = (artistId: string, place: Place, engineerId: string | null = null) =>
    prisma.booking.create({ data: bookingData(artistId, place, engineerId) });
  const logFor = (booking: { id: string; artist_id: string }, label: string) => prisma.sessionLog.create({ data: {
    booking_id: booking.id, artist_id: booking.artist_id,
    notes: `${label} engineer notes`, quality_rating: 4, artist_rating: 5,
    artist_testimonial: `Private testimonial about the ${label} engineer`, testimonial_public: false,
    ai_summary: `${label} session summary`,
  } });

  const adminAlpha = await staffAt('admin-alpha', 'STUDIO_ADMIN', alpha.studio.id);
  const adminGamma = await staffAt('admin-gamma', 'STUDIO_ADMIN', gamma.id);
  const engineerUser = await staffAt('engineer-alpha', 'ENGINEER', alpha.studio.id);
  const engineer = await prisma.engineer.create({
    data: { studio_id: alpha.studio.id, user_id: engineerUser.id, name: 'Assigned Engineer', specialties: [] },
  });
  const idleEngineer = await staffAt('idle-engineer-alpha', 'ENGINEER', alpha.studio.id);
  await prisma.engineer.create({ data: { studio_id: alpha.studio.id, user_id: idleEngineer.id, name: 'Idle Engineer', specialties: [] } });
  const stranger = (await artistAccount('stranger')).user;
  const producer = await prisma.user.create({
    data: { email: email('producer'), role: 'PRODUCER', producer: { create: { name: 'Profile Producer' } } },
  });

  // Booked at two studios, with private choices on the passport and in each session log.
  const subject = await artistAccount('subject', {
    location: PRIVATE_LOCATION, location_public: false, ai_summary: PRIVATE_BRIEF, ai_summary_public: false,
  });
  const alphaBooking = await bookAt(subject.artist.id, alpha, engineer.id);
  const betaBooking = await bookAt(subject.artist.id, beta);
  await logFor(alphaBooking, 'alpha');
  await logFor(betaBooking, 'beta');
  await prisma.artistFile.create({ data: { artist_id: subject.artist.id, name: 'demo-take.wav', url: 'private-uploads/demo-take.wav' } });

  await t.test('an account with no relationship to the artist reads only the public profile', async () => {
    for (const viewer of [stranger, producer]) {
      const { status, body } = await read(`/artists/${subject.artist.id}`, viewer);
      assert.equal(status, 200);
      assert.equal(body.session_logs, undefined, 'session logs are not public');
      assert.equal(body.user_id, undefined, 'nor is the account behind the artist');
      assert.equal(body.passport.location, null, 'a location the artist has not published stays private');
      assert.equal(body.passport.ai_summary, null, 'a brief the artist keeps private stays private');
      assert.deepEqual(Object.keys(body).sort(), PUBLIC_ARTIST_FIELDS);
      assert.deepEqual(Object.keys(body.user), ['created_at']);
      assert.deepEqual(Object.keys(body.passport).sort(), PUBLIC_PASSPORT_FIELDS);
      assertCarriesNone(body, [PRIVATE_LOCATION, PRIVATE_BRIEF, 'engineer notes', 'Private testimonial', 'session summary', subject.user.id]);
    }

    const published = await artistAccount('published', {
      location: 'Open Road, Accra', location_public: true, ai_summary: 'A brief the artist shows', ai_summary_public: true,
    });
    const { body } = await read(`/artists/${published.artist.id}`, stranger);
    assert.equal(body.passport.location, 'Open Road, Accra', 'what the artist publishes is shown');
    assert.equal(body.passport.ai_summary, 'A brief the artist shows');
  });

  await t.test('the artist still reads their whole record', async () => {
    const { status, body } = await read(`/artists/${subject.artist.id}`, subject.user);
    assert.equal(status, 200);
    assert.equal(body.user_id, subject.user.id);
    assert.equal(Number(body.wallet.balance_usd), 250);
    assert.deepEqual(body.bookings.map((booking: any) => booking.id).sort(), [alphaBooking.id, betaBooking.id].sort());
    assert.equal(body.session_logs.length, 2);
    assert.equal(body.files.length, 1);
    assert.equal(body.passport.location, PRIVATE_LOCATION);
    assert.equal(body.passport.ai_summary, PRIVATE_BRIEF);
  });

  await t.test("a studio admin reads their own studio's sessions, and no wallet", async () => {
    const { status, body } = await read(`/artists/${subject.artist.id}`, adminAlpha);
    assert.equal(status, 200);
    assert.equal(body.wallet, undefined, "an artist's wallet is not a studio's to read");
    assert.deepEqual(body.bookings.map((booking: any) => booking.id), [alphaBooking.id], "only bookings at the admin's studio");
    assert.deepEqual(body.session_logs.map((log: any) => log.booking_id), [alphaBooking.id], 'and only the session logs of those bookings');
    assert.equal(body.passport.location, null, "the artist's privacy choices hold for staff too");
    assert.equal(body.passport.ai_summary, null);
    assert.equal(body.files.length, 1, 'files stay readable, as the files routes already allow');
    assert.deepEqual(Object.keys(body).sort(), [...PUBLIC_ARTIST_FIELDS, 'bookings', 'files', 'session_logs'].sort());
    assertCarriesNone(body, ['beta engineer notes', 'beta session summary', subject.user.id]);

    assert.equal((await read(`/artists/${subject.artist.id}`, adminGamma)).status, 404, 'a studio the artist never booked reads nothing');
  });

  await t.test("an admin's access does not depend on how recently the artist booked elsewhere", async () => {
    const busy = await artistAccount('busy');
    const early = await bookAt(busy.artist.id, alpha);
    await prisma.booking.createMany({ data: Array.from({ length: 50 }, () => bookingData(busy.artist.id, beta)) });

    const { status, body } = await read(`/artists/${busy.artist.id}`, adminAlpha);
    assert.equal(status, 200, 'the artist booked this studio, however many later bookings are elsewhere');
    assert.deepEqual(body.bookings.map((booking: any) => booking.id), [early.id]);
  });

  await t.test('reading a profile is not a passport view', async () => {
    const viewed = await artistAccount('viewed');
    for (const viewer of [stranger, producer, stranger]) {
      assert.equal((await read(`/artists/${viewed.artist.id}`, viewer)).status, 200);
    }
    await settle();
    const passport = await prisma.artistPassport.findUniqueOrThrow({ where: { artist_id: viewed.artist.id } });
    assert.equal(passport.profile_views, 0, 'signed-in reads of a profile are not counted');

    assert.equal((await read(`/passport/public/${passport.passport_code}`)).status, 200);
    const counted = await prisma.artistPassport.findUniqueOrThrow({ where: { artist_id: viewed.artist.id } });
    assert.equal(counted.profile_views, 1, 'the public passport is the one place a view is counted');
    assert.equal(counted.profile_views, await prisma.passportView.count({ where: { passport_id: passport.id } }));
  });

  await t.test('the brief is closed to accounts with no relationship to the artist', async () => {
    const briefless = await artistAccount('briefless');
    await bookAt(briefless.artist.id, alpha, engineer.id);
    const calls = modelCalls.length;

    await withAi(true, async () => {
      for (const viewer of [stranger, producer, adminGamma, idleEngineer]) {
        const { status, body } = await read(`/artists/${briefless.artist.id}/summary`, viewer);
        assert.equal(status, 403, `${viewer.email} has no relationship to the artist`);
        assert.equal(body.summary, undefined);
      }
    });
    await settle();
    assert.equal(modelCalls.length, calls, 'none of them made the model write a brief');
    assert.equal(await storedBrief(briefless.artist.id), null);
  });

  await t.test('staff who work with the artist read the brief only if the artist shows it', async () => {
    // Stored as fresh, so the route's cache would serve it without calling the model.
    const hidden = await artistAccount('hidden', {
      ai_summary: PRIVATE_BRIEF, ai_summary_public: false, ai_summary_updated_at: new Date(Date.now() + 86_400_000),
    });
    const shown = await artistAccount('shown');
    for (const artist of [hidden, shown]) await bookAt(artist.artist.id, alpha, engineer.id);

    await withAi(true, async () => {
      for (const reader of [adminAlpha, engineerUser]) {
        const refused = await read(`/artists/${hidden.artist.id}/summary`, reader);
        assert.equal(refused.status, 403, 'a brief the artist keeps private is not served to staff');
        assertCarriesNone(refused.body, [PRIVATE_BRIEF]);

        const generated = await read(`/artists/${shown.artist.id}/summary`, reader);
        assert.equal(generated.status, 200, 'staff at a studio the artist booked may read a brief the artist shows');
        assert.equal(generated.body.summary, GENERATED_BRIEF);
      }
      const own = await read(`/artists/${hidden.artist.id}/summary`, hidden.user);
      assert.equal(own.status, 200, 'the artist always reads their own brief');
      assert.equal(own.body.summary, PRIVATE_BRIEF);
    });
    await settle();
    assert.equal(await storedBrief(hidden.artist.id), PRIVATE_BRIEF, 'and no reader replaced it');
  });

  await t.test('no brief is generated while AI is switched off', async () => {
    const waiting = await artistAccount('waiting');
    const calls = modelCalls.length;

    await withAi(false, async () => {
      const refused = await read(`/artists/${waiting.artist.id}/summary`, waiting.user);
      assert.equal(refused.status, 501, 'the brief is an AI capability, gated like the others');
    });
    await settle();
    assert.equal(modelCalls.length, calls, 'the model is not called while OIANO_AI_ENABLED is off');
    assert.equal(await storedBrief(waiting.artist.id), null, 'and nothing is stored');

    await withAi(true, async () => {
      const generated = await read(`/artists/${waiting.artist.id}/summary`, waiting.user);
      assert.equal(generated.status, 200);
      assert.equal(generated.body.summary, GENERATED_BRIEF);
    });
    assert.equal(modelCalls.length, calls + 1, 'switched on, one request makes one call');
    await eventually(() => storedBrief(waiting.artist.id), GENERATED_BRIEF, 'the generated brief is stored on the passport');
  });
});
