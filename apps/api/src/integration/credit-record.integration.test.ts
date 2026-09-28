import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// A credit is proposed by the project lead and answered once by the credited
// contributor. Once confirmed it is part of the contributor's professional record:
// the lead can no longer delete it, and it counts toward the contributor's own
// confirmed credits, never toward someone who merely shares their name.
test('a confirmed credit stays on the contributor\'s record', async (t) => {
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

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const producer = (label: string) => prisma.user.create({
    data: { email: `${label}-${runId}@example.test`, role: 'PRODUCER', producer: { create: { name: `Lead ${label}` } } },
    include: { producer: true },
  });
  const contributor = (label: string) => prisma.user.create({
    data: { email: `${label}-${runId}@example.test`, role: 'ARTIST', artist: { create: { name: `Contributor ${label}` } } },
  });
  // An accepted participation: the contributor's account is linked to it, which
  // is what lets them answer its credits.
  const participation = (projectId: string, userId: string, addedBy: string, name: string) => prisma.projectParticipant.create({
    data: { project_id: projectId, display_name: name, role: 'MIX_ENGINEER', status: 'ACTIVE', participant_type: 'OIANO_USER', participant_ref_id: userId, added_by: addedBy },
  });
  const propose = async (lead: { id: string; role: string }, projectId: string, participantId: string, name: string, role = 'MIX_ENGINEER') => {
    const created = await request(`/producer/projects/${projectId}/credits`, {
      method: 'POST', headers: auth(lead), body: JSON.stringify({ credited_name: name, role, participant_id: participantId }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    return created.body.id as string;
  };
  const answer = (user: { id: string; role: string }, creditId: string, decision: 'CONFIRM' | 'DISPUTE') =>
    request(`/contributions/credits/${creditId}/respond`, { method: 'PATCH', headers: auth(user), body: JSON.stringify({ decision }) });
  const withdraw = (lead: { id: string; role: string }, projectId: string, creditId: string) =>
    request(`/producer/projects/${projectId}/credits/${creditId}`, { method: 'DELETE', headers: auth(lead) });

  const lead = await producer('lead');
  const project = await prisma.project.create({ data: { producer_id: lead.producer!.id, title: `Credit record ${runId}` } });

  await t.test('the lead withdraws a credit nobody has confirmed, and cannot remove a confirmed one', async () => {
    const mixer = await contributor('mixer');
    const participant = await participation(project.id, mixer.id, lead.id, 'Mixer');

    const draft = await propose(lead, project.id, participant.id, 'Mixer', 'MIX_ENGINEER');
    assert.equal((await withdraw(lead, project.id, draft)).status, 200, 'an unanswered credit is still the lead\'s draft');
    assert.equal(await prisma.projectCredit.count({ where: { id: draft } }), 0);

    const disputed = await propose(lead, project.id, participant.id, 'Mixer', 'ENGINEER');
    assert.equal((await answer(mixer, disputed, 'DISPUTE')).status, 200);
    assert.equal((await withdraw(lead, project.id, disputed)).status, 200, 'a credit the contributor rejected can be withdrawn');

    const confirmed = await propose(lead, project.id, participant.id, 'Mixer', 'MASTERING_ENGINEER');
    assert.equal((await answer(mixer, confirmed, 'CONFIRM')).status, 200);
    const refused = await withdraw(lead, project.id, confirmed);
    assert.equal(refused.status, 409, 'a confirmed credit belongs to the contributor');
    const kept = await prisma.projectCredit.findUnique({ where: { id: confirmed } });
    assert.equal(kept?.status, 'CONFIRMED');
    assert.equal(kept?.is_public, true);
  });

  await t.test('another lead cannot withdraw a credit on a project they do not own', async () => {
    const outsider = await producer('outsider');
    const singer = await contributor('singer');
    const participant = await participation(project.id, singer.id, lead.id, 'Singer');
    const draft = await propose(lead, project.id, participant.id, 'Singer', 'VOCALS');
    assert.equal((await withdraw(outsider, project.id, draft)).status, 404);
    assert.equal(await prisma.projectCredit.count({ where: { id: draft } }), 1);
  });

  await t.test('a confirmation racing a withdrawal never leaves a confirmed credit deleted', async () => {
    const player = await contributor('player');
    const participant = await participation(project.id, player.id, lead.id, 'Player');
    for (let round = 0; round < 12; round += 1) {
      const credit = await propose(lead, project.id, participant.id, `Player ${round}`, 'MUSICIAN');
      const [confirm, removal] = await Promise.all([answer(player, credit, 'CONFIRM'), withdraw(lead, project.id, credit)]);
      const stored = await prisma.projectCredit.findUnique({ where: { id: credit } });
      if (confirm.status === 200) {
        assert.equal(removal.status, 409, `round ${round}: a withdrawal after the confirmation is refused`);
        assert.equal(stored?.status, 'CONFIRMED', `round ${round}: the confirmed credit is kept`);
      } else {
        assert.equal(removal.status, 200, `round ${round}: the withdrawal won`);
        assert.ok([404, 409].includes(confirm.status), `round ${round}: the confirmation found nothing to answer (${confirm.status})`);
        assert.equal(stored, null);
      }
    }
  });

  await t.test('an engineer counts the credits they confirmed, not credits to someone sharing their name', async () => {
    const studio = await prisma.studio.create({ data: { slug: `credit-record-${runId}`, name: 'Credit Record Studio' } });
    const engineerUser = await prisma.user.create({
      data: { email: `engineer-${runId}@example.test`, role: 'ENGINEER', engineer: { create: { studio_id: studio.id, name: 'Sam Rivers', specialties: [] } } },
    });
    const namesake = await contributor('namesake');

    const own = await participation(project.id, engineerUser.id, lead.id, 'S. Rivers');
    const ownCredit = await propose(lead, project.id, own.id, 'S. Rivers', 'RECORDING_ENGINEER');
    assert.equal((await answer(engineerUser, ownCredit, 'CONFIRM')).status, 200);

    const other = await participation(project.id, namesake.id, lead.id, 'Sam Rivers');
    for (const role of ['PRODUCER', 'COMPOSER']) {
      const credit = await propose(lead, project.id, other.id, 'Sam Rivers', role);
      assert.equal((await answer(namesake, credit, 'CONFIRM')).status, 200);
    }

    const metrics = await request('/network-metrics', { headers: auth(engineerUser) });
    assert.equal(metrics.status, 200);
    const confirmed = metrics.body.metrics.find((metric: any) => metric.key === 'confirmed_credits');
    assert.equal(confirmed?.value, 1, 'only the credit the engineer confirmed through their own participation');
  });
});
