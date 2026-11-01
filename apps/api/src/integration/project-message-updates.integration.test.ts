import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// IR-01: a new project message was sent live only to the project's artist and
// producer, though everyone who can read the conversation includes accepted
// contributors, engineers on its bookings and that studio's admins. A
// contributor's open workspace refreshes its conversation only on that event, so
// it never showed a message until reloaded. Delivery now reaches exactly the
// people who can read the conversation through their part in the work, once each.
test('a project message reaches every member of its conversation live, once, and no one else', async (t) => {
  const database = new URL(process.env.DATABASE_URL!);
  assert.match(`${database.pathname}/${database.searchParams.get('schema') ?? ''}`, /(^|[/_-])test([/_-]|$)/i);

  const [{ app }, { prisma }, { broadcastToUser }] = await Promise.all([
    import('../app'), import('../lib/prisma'), import('../routes/notifications.routes'),
  ]);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await prisma.$disconnect();
  });

  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const request = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } });
    return { status: response.status, body: (await response.json()) as any };
  };
  const auth = (user: { id: string; role: string }) => ({
    authorization: `Bearer ${jwt.sign({ sub: user.id, role: user.role, ver: 0 }, process.env.JWT_SECRET!)}`,
  });
  const post = (user: { id: string; role: string }, path: string, body: unknown) =>
    request(path, { method: 'POST', headers: auth(user), body: JSON.stringify(body) });

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let sequence = 0;
  const unique = (label: string) => `${label}-${runId}-${(sequence += 1)}`;
  const user = (label: string, role: 'ARTIST' | 'PRODUCER' | 'ENGINEER' | 'STUDIO_ADMIN' | 'OIANO_ADMIN') =>
    prisma.user.create({ data: { email: `${unique(label)}@example.test`, role } });

  const studioAt = async (label: string) => {
    const studio = await prisma.studio.create({ data: { slug: unique(label), name: `${label} studio` } });
    const admin = await user(`${label}-admin`, 'STUDIO_ADMIN');
    await prisma.studioStaff.create({ data: { user_id: admin.id, studio_id: studio.id, role: 'STUDIO_ADMIN' } });
    return { studio, admin };
  };
  const alpha = await studioAt('alpha');
  const beta = await studioAt('beta');

  const lead = await prisma.user.create({ data: { email: `${unique('lead')}@example.test`, role: 'PRODUCER', producer: { create: { name: 'Message Lead' } } }, include: { producer: true } });
  const artist = await prisma.user.create({ data: { email: `${unique('artist')}@example.test`, role: 'ARTIST', artist: { create: { name: 'Message Artist' } } }, include: { artist: true } });
  const engineer = await user('engineer', 'ENGINEER');
  const engineerRecord = await prisma.engineer.create({ data: { studio_id: alpha.studio.id, user_id: engineer.id, name: 'Alpha Engineer', specialties: [] } });
  const project = await prisma.project.create({ data: { producer_id: lead.producer!.id, artist_id: artist.artist!.id, title: unique('Conversation') } });
  const room = await prisma.room.create({ data: { studio_id: alpha.studio.id, name: unique('room') } });
  const service = await prisma.serviceOffering.create({ data: { studio_id: alpha.studio.id, category: 'RECORDING', name: unique('service'), min_price_usd: 50, max_price_usd: 50, unit: 'hour' } });
  const startsAt = new Date(Date.now() + 86_400_000);
  await prisma.booking.create({ data: {
    studio_id: alpha.studio.id, artist_id: artist.artist!.id, room_id: room.id, service_id: service.id, project_id: project.id,
    engineer_id: engineerRecord.id, starts_at: startsAt, ends_at: new Date(startsAt.getTime() + 3_600_000), total_usd: 50, status: 'CONFIRMED',
  } });

  // The contributor joins the way a real one does: invited, claims the link, accepts.
  const contributor = await user('contributor', 'ARTIST');
  const invited = await post(lead, `/producer/projects/${project.id}/participants`, { display_name: 'Accepted Poet', email: `${unique('poet')}@example.test`, role: 'OTHER' });
  assert.equal(invited.status, 201);
  const token = new URL(invited.body.invite_url).searchParams.get('token');
  assert.equal((await post(contributor, '/contributions/claim', { token })).status, 200);
  const accepted = await request(`/contributions/${invited.body.id}/respond`, { method: 'PATCH', headers: auth(contributor), body: JSON.stringify({ decision: 'ACCEPT' }) });
  assert.equal(accepted.body.status, 'ACTIVE');

  // People bound to the work who must not hear it: each status a claimed contribution can rest in.
  const participant = async (label: string, status: string) => {
    const person = await user(label, 'ARTIST');
    const row = await prisma.projectParticipant.create({ data: {
      project_id: project.id, display_name: label, role: 'OTHER', participant_type: 'OIANO_USER', participant_ref_id: person.id, status, added_by: lead.id,
    } });
    return { person, row };
  };
  const pending = (await participant('claimed-not-accepted', 'INVITED')).person;
  const declined = (await participant('declined', 'DECLINED')).person;
  const correcting = (await participant('correction-requested', 'CORRECTION_REQUESTED')).person;
  const removedEntry = await participant('removed', 'ACTIVE');
  const removedResponse = await request(`/producer/projects/${project.id}/participants/${removedEntry.row.id}`, { method: 'DELETE', headers: auth(lead) });
  assert.equal(removedResponse.status, 200, 'the lead removes a contributor who had joined');
  const removed = removedEntry.person;
  // The alpha admin also joins as a contributor, so they qualify twice.
  await prisma.projectParticipant.create({ data: {
    project_id: project.id, display_name: 'Admin As Contributor', role: 'OTHER', participant_type: 'OIANO_USER', participant_ref_id: alpha.admin.id, status: 'ACTIVE', added_by: lead.id,
  } });
  const unrelated = await user('unrelated', 'ARTIST');
  const operator = await user('operator', 'OIANO_ADMIN');

  const people = {
    lead, artist, contributor, engineer, alphaAdmin: alpha.admin,
    pending, declined, correcting, removed, unrelated, betaAdmin: beta.admin, operator,
  };

  const listen = async (person: { id: string; role: string }) => {
    const ticket = await request('/notifications/stream-ticket', { method: 'POST', headers: auth(person) });
    const aborter = new AbortController();
    const response = await fetch(`${baseUrl}/notifications/stream?ticket=${encodeURIComponent(ticket.body.ticket)}`, { signal: aborter.signal });
    assert.equal(response.status, 200);
    const events: any[] = [];
    let onChunk = () => {};
    void (async () => {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        for (let end = buffer.indexOf('\n\n'); end !== -1; end = buffer.indexOf('\n\n')) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (frame.startsWith('data: ')) events.push(JSON.parse(frame.slice('data: '.length)));
        }
        onChunk();
      }
    })().catch(() => { /* the test closed the stream */ });
    const received = (type: string) => new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${person.id} never received ${type}`)), 5_000);
      onChunk = () => {
        if (!events.some((event) => event.type === type)) return;
        clearTimeout(timer);
        resolve();
      };
      onChunk();
    });
    await received('connected');
    return { events, received, close: () => aborter.abort() };
  };
  // The project messages a stream heard before the marker, by body.
  const heard = async (stream: Awaited<ReturnType<typeof listen>>) => {
    await stream.received('marker');
    return stream.events
      .slice(0, stream.events.findIndex((event) => event.type === 'marker'))
      .filter((event) => event.type === 'new_project_message' && event.projectId === project.id)
      .map((event) => event.message.body);
  };

  await t.test('members hear each message once; the sender and everyone outside the work do not', async () => {
    const streams = new Map<string, Awaited<ReturnType<typeof listen>>>();
    try {
      for (const [name, person] of Object.entries(people)) streams.set(name, await listen(person));

      assert.equal((await post(lead, `/projects/${project.id}/messages`, { body: 'From the lead' })).status, 201);
      assert.equal((await post(contributor, `/projects/${project.id}/messages`, { body: 'From the poet' })).status, 201);
      // Each message was written to its streams before its request returned.
      for (const person of Object.values(people)) broadcastToUser(person.id, { type: 'marker' });

      const both = ['From the lead', 'From the poet'];
      const expected: Record<keyof typeof people, string[]> = {
        lead: ['From the poet'],
        artist: both,
        contributor: ['From the lead'],
        engineer: both,
        alphaAdmin: both,
        pending: [], declined: [], correcting: [], removed: [], unrelated: [], betaAdmin: [], operator: [],
      };
      const actual: Record<string, string[]> = {};
      for (const name of Object.keys(people)) actual[name] = await heard(streams.get(name)!);
      assert.deepEqual(actual, expected);
    } finally {
      for (const stream of streams.values()) stream.close();
    }
  });

  await t.test('the same people can read the conversation, plus platform operators', async () => {
    const reads: Record<string, number> = {};
    for (const [name, person] of Object.entries(people)) reads[name] = (await request(`/projects/${project.id}/messages`, { headers: auth(person) })).status;
    assert.deepEqual(reads, {
      lead: 200, artist: 200, contributor: 200, engineer: 200, alphaAdmin: 200, operator: 200,
      pending: 404, declined: 404, correcting: 404, removed: 404, unrelated: 404, betaAdmin: 404,
    });
  });

  await t.test('a message sent while a member was disconnected is there when they read again', async () => {
    const offline = await listen(contributor);
    offline.close();
    assert.equal((await post(lead, `/projects/${project.id}/messages`, { body: 'Sent while you were away' })).status, 201);

    const back = await listen(contributor);
    try {
      broadcastToUser(contributor.id, { type: 'marker' });
      assert.deepEqual(await heard(back), [], 'the stream has no replay, which is why the client re-reads on reconnect');
    } finally {
      back.close();
    }
    const thread = await request(`/projects/${project.id}/messages`, { headers: auth(contributor) });
    assert.equal(thread.status, 200);
    assert.ok(thread.body.some((message: any) => message.body === 'Sent while you were away'));
  });
});
