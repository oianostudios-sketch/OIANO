import assert from 'node:assert/strict';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';

// C34, continued. After walk-ins, cash and payouts (staff-capability-gates), the other
// studio operator writes still asked only for the account role: any STUDIO_ADMIN
// membership could confirm or cancel bookings and assign engineers, add equipment, and
// run the studio's team, so a receptionist could invite an owner. Each now asks the
// caller's membership for the capability that names it (lib/staffPermission.ts). The
// table below is preset -> route -> allowed, with the presets as the team page grants
// them (apps/web/src/pages/StudioTeamPage.tsx), so a preset that stops being able to
// do its job fails here too.

const PRESETS = {
  OWNER: { role: 'STUDIO_ADMIN', capabilities: ['MANAGE_BOOKINGS', 'MANAGE_CALENDAR', 'MANAGE_STAFF', 'MANAGE_POLICIES', 'VIEW_FINANCE', 'POLICY_OVERRIDE_ALL'] },
  MANAGER: { role: 'STUDIO_ADMIN', capabilities: ['MANAGE_BOOKINGS', 'MANAGE_CALENDAR', 'MANAGE_STAFF', 'MANAGE_POLICIES', 'VIEW_FINANCE'] },
  RECEPTION: { role: 'STUDIO_ADMIN', capabilities: ['VIEW_CALENDAR', 'MANAGE_CALENDAR', 'MANAGE_BOOKINGS'] },
  ENGINEER: { role: 'ENGINEER', capabilities: ['VIEW_CALENDAR', 'MANAGE_ASSIGNED_SESSIONS', 'UPLOAD_DELIVERABLES'] },
  // A self-registered owner: a STUDIO_ADMIN membership with no capabilities at all.
  LEGACY_OWNER: { role: 'STUDIO_ADMIN', capabilities: [] as string[] },
} as const;
type Preset = keyof typeof PRESETS;
const ALL = Object.keys(PRESETS) as Preset[];

test('studio operator routes follow the membership capability, preset by preset', async (t) => {
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
  const request = async (method: string, path: string, user: { id: string; role: string }, body?: unknown) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${jwt.sign({ sub: user.id, role: user.role, ver: 0 }, process.env.JWT_SECRET!)}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: any = text;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    return { status: response.status, body: parsed };
  };

  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  let sequence = 0;
  const unique = (label: string) => `${label}-${runId}-${(sequence += 1)}`;
  let slot = 0;
  const nextSlot = () => {
    const date = new Date(Date.now() + (60 + (slot += 1)) * 86_400_000);
    date.setUTCHours(10, 0, 0, 0);
    return date;
  };

  const studio = await prisma.studio.create({ data: { slug: unique('gates'), name: 'Gates rest' } });
  const room = await prisma.room.create({ data: { studio_id: studio.id, name: 'Gates room' } });
  const service = await prisma.serviceOffering.create({ data: {
    studio_id: studio.id, category: 'RECORDING', name: 'Gates session', min_price_usd: 50, max_price_usd: 50, unit: 'hour',
  } });
  const artistUser = await prisma.user.create({ data: { email: `${unique('artist')}@example.test`, role: 'ARTIST' } });
  const artist = await prisma.artist.create({ data: { user_id: artistUser.id, name: 'Gates Artist' } });

  // Every caller holds the STUDIO_ADMIN account role, which is all these routes asked for,
  // so only the membership decides.
  const staffAt = async (preset: Preset) => {
    const user = await prisma.user.create({ data: { email: `${unique(preset.toLowerCase())}@example.test`, role: 'STUDIO_ADMIN', active_studio_id: studio.id } });
    const { role, capabilities } = PRESETS[preset];
    const membership = await prisma.studioStaff.create({ data: { user_id: user.id, studio_id: studio.id, role, position: preset, capabilities: [...capabilities] } });
    return { user, membership };
  };
  const callers = Object.fromEntries(await Promise.all(ALL.map(async (preset) => [preset, await staffAt(preset)] as const))) as Record<Preset, Awaited<ReturnType<typeof staffAt>>>;

  const pendingBooking = async () => {
    const starts_at = nextSlot();
    return prisma.booking.create({ data: {
      studio_id: studio.id, artist_id: artist.id, room_id: room.id, service_id: service.id,
      starts_at, ends_at: new Date(starts_at.getTime() + 3_600_000), total_usd: 50,
    } });
  };
  // A throwaway member for the team routes that change or remove one.
  const spareMember = async () => (await staffAt('RECEPTION')).membership;

  type Route = {
    name: string;
    allowed: Preset[];
    refusal?: string;
    call: (user: { id: string; role: string }) => Promise<{ status: number; body: any }>;
    ok: number;
  };
  const routes: Route[] = [
    {
      name: 'PATCH /bookings/:id/status', ok: 200, refusal: 'Booking management permission required',
      allowed: ['OWNER', 'MANAGER', 'RECEPTION', 'LEGACY_OWNER'],
      call: async (user) => request('PATCH', `/bookings/${(await pendingBooking()).id}/status`, user, { status: 'CONFIRMED' }),
    },
    {
      name: 'PATCH /bookings/:id/engineer', ok: 200, refusal: 'Booking management permission required',
      allowed: ['OWNER', 'MANAGER', 'RECEPTION', 'LEGACY_OWNER'],
      call: async (user) => request('PATCH', `/bookings/${(await pendingBooking()).id}/engineer`, user, { engineer_id: null }),
    },
    {
      name: 'POST /admin/walkin', ok: 201, refusal: 'Booking management permission required',
      allowed: ['OWNER', 'MANAGER', 'RECEPTION', 'LEGACY_OWNER'],
      call: (user) => request('POST', '/admin/walkin', user, { name: unique('guest'), room_id: room.id, starts_at: nextSlot().toISOString(), duration_minutes: 60 }),
    },
    {
      name: 'GET /payouts/balance', ok: 200, refusal: 'Finance permission required',
      allowed: ['OWNER', 'MANAGER', 'LEGACY_OWNER'],
      call: (user) => request('GET', '/payouts/balance', user),
    },
    {
      name: 'POST /facilities/equipment', ok: 201, refusal: 'Only staff who manage the studio\'s standards can change its equipment',
      allowed: ['OWNER', 'MANAGER', 'LEGACY_OWNER'],
      call: (user) => request('POST', '/facilities/equipment', user, { name: unique('mic'), type: 'Microphone', room_id: room.id }),
    },
    {
      name: 'GET /studio/team', ok: 200, refusal: 'Staff management permission required',
      allowed: ['OWNER', 'MANAGER', 'LEGACY_OWNER'],
      call: (user) => request('GET', '/studio/team', user),
    },
    {
      name: 'POST /studio/team/invitations', ok: 201, refusal: 'Staff management permission required',
      allowed: ['OWNER', 'MANAGER', 'LEGACY_OWNER'],
      call: (user) => request('POST', '/studio/team/invitations', user, { email: `${unique('invitee')}@example.test`, role: 'STUDIO_ADMIN', position: 'OWNER', capabilities: [...PRESETS.OWNER.capabilities] }),
    },
    {
      name: 'DELETE /studio/team/invitations/:id', ok: 204, refusal: 'Staff management permission required',
      allowed: ['OWNER', 'MANAGER', 'LEGACY_OWNER'],
      call: async (user) => {
        const invitation = await prisma.studioStaffInvitation.create({ data: {
          studio_id: studio.id, invited_by: callers.OWNER.user.id, email: `${unique('pending')}@example.test`, role: 'ENGINEER', position: 'ENGINEER',
          capabilities: [], token_hash: unique('hash'), expires_at: new Date(Date.now() + 86_400_000),
        } });
        return request('DELETE', `/studio/team/invitations/${invitation.id}`, user);
      },
    },
    {
      name: 'PATCH /studio/team/:membershipId', ok: 200, refusal: 'Staff management permission required',
      allowed: ['OWNER', 'MANAGER', 'LEGACY_OWNER'],
      call: async (user) => request('PATCH', `/studio/team/${(await spareMember()).id}`, user, { role: 'STUDIO_ADMIN', position: 'OWNER', capabilities: [...PRESETS.OWNER.capabilities] }),
    },
    {
      name: 'DELETE /studio/team/:membershipId', ok: 204, refusal: 'Staff management permission required',
      allowed: ['OWNER', 'MANAGER', 'LEGACY_OWNER'],
      call: async (user) => request('DELETE', `/studio/team/${(await spareMember()).id}`, user),
    },
    // Reads every member of the studio's staff needs for the day's work stay open.
    ...['/admin/runsheet', '/admin/analytics', '/admin/announcements', '/studio/pulse', '/facilities/rooms', '/facilities/equipment', '/facilities/issues', '/studio-circle/current-work']
      .map((path): Route => ({ name: `GET ${path}`, ok: 200, allowed: ALL, call: (user) => request('GET', path, user) })),
  ];

  for (const route of routes) {
    await t.test(route.name, async () => {
      for (const preset of ALL) {
        const response = await route.call(callers[preset].user);
        if (route.allowed.includes(preset)) {
          assert.equal(response.status, route.ok, `${preset} should be allowed: ${JSON.stringify(response.body)}`);
        } else {
          assert.equal(response.status, 403, `${preset} should be refused: ${JSON.stringify(response.body)}`);
          if (route.refusal) assert.equal(response.body.error, route.refusal, preset);
        }
      }
    });
  }

  await t.test('a refusal changes nothing', async () => {
    const booking = await pendingBooking();
    await request('PATCH', `/bookings/${booking.id}/status`, callers.ENGINEER.user, { status: 'CANCELLED' });
    assert.equal((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).status, 'PENDING');

    const target = await spareMember();
    await request('PATCH', `/studio/team/${target.id}`, callers.RECEPTION.user, { role: 'STUDIO_ADMIN', position: 'OWNER', capabilities: [...PRESETS.OWNER.capabilities] });
    assert.deepEqual((await prisma.studioStaff.findUniqueOrThrow({ where: { id: target.id } })).capabilities, [...PRESETS.RECEPTION.capabilities]);

    const invitations = await prisma.studioStaffInvitation.count({ where: { studio_id: studio.id } });
    await request('POST', '/studio/team/invitations', callers.RECEPTION.user, { email: `${unique('escalate')}@example.test`, role: 'STUDIO_ADMIN', position: 'OWNER', capabilities: [...PRESETS.OWNER.capabilities] });
    assert.equal(await prisma.studioStaffInvitation.count({ where: { studio_id: studio.id } }), invitations);
  });

  // The web app hides what the caller cannot do from this list (useStudioCapabilities).
  await t.test('GET /studio/memberships reports the active membership\'s role and capabilities', async () => {
    const response = await request('GET', '/studio/memberships', callers.RECEPTION.user);
    assert.equal(response.status, 200);
    assert.equal(response.body.active_studio_id, studio.id);
    const active = response.body.memberships.find((m: any) => m.studio.id === studio.id);
    assert.equal(active.role, 'STUDIO_ADMIN');
    assert.deepEqual(active.capabilities, [...PRESETS.RECEPTION.capabilities]);
  });
});
