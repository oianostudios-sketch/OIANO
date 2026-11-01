import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';

type Identity = { id: string; role: string };
export type RecordState = { id: string; status: string };
export type Workspace = RecordState & { project: { id: string; credits: RecordState[]; rights_agreements: RecordState[] } };

export async function collaborationJourney(t: TestContext) {
  assert.equal(process.env.NODE_ENV, 'test');
  const database = new URL(process.env.DATABASE_URL!);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(database.hostname), 'journeys require local PostgreSQL');
  assert.match(database.pathname, /[_-]test$/i);
  const [{ app }, { prisma }] = await Promise.all([import('../app'), import('../lib/prisma')]);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  const request = async <T = RecordState>(method: string, path: string, user?: Identity, body?: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(user ? { authorization: `Bearer ${jwt.sign({ sub: user.id, role: user.role, ver: 0 }, process.env.JWT_SECRET!)}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() as T };
  };
  const identity = async (label: string, role: 'ARTIST' | 'PRODUCER' = 'ARTIST') =>
    prisma.user.create({
      data: {
        email: `${label}-${randomUUID()}@example.test`, role,
        ...(role === 'PRODUCER' ? { producer: { create: { name: label } } } : { artist: { create: { name: label } } }),
      },
      include: { artist: true, producer: true },
    });
  const lead = await identity('Journey Lead', 'PRODUCER');
  const artist = await identity('Journey Artist');
  const contributor = await identity('Journey Contributor');
  const outsider = await identity('Journey Outsider');
  const created = await request('POST', '/producer/projects', lead, { title: `Journey ${randomUUID()}`, artist_id: artist.artist!.id });
  assert.equal(created.status, 201);
  const projectId = created.body.id;
  const invite = async (name = 'Journey Contributor') => {
    const response = await request<RecordState & { invite_url: string }>('POST', `/producer/projects/${projectId}/participants`, lead, {
      display_name: name, email: `invite-${randomUUID()}@example.test`, role: 'SONGWRITER',
    });
    assert.equal(response.status, 201);
    const token = new URL(response.body.invite_url).searchParams.get('token');
    assert.ok(token);
    return { id: response.body.id, token };
  };
  const claim = (id: { token: string }, user = contributor) => request('POST', '/contributions/claim', user, { token: id.token });
  const respond = (id: string, decision: string, note?: string) =>
    request('PATCH', `/contributions/${id}/respond`, contributor, { decision, note });
  const join = async () => {
    const invitation = await invite();
    assert.equal((await claim(invitation)).status, 200);
    const accepted = await respond(invitation.id, 'ACCEPT');
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.status, 'ACTIVE');
    return invitation;
  };
  return { prisma, request, lead, artist, contributor, outsider, projectId, invite, claim, respond, join };
}
