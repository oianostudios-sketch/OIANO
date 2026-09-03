// apps/api/src/lib/weave/sync.ts
//
// The one reconciliation entrypoint for the Oiano Weave in V1: keep
// WeaveNode/WeaveConnection/WeaveEvidence in sync with real domain truth by
// deriving them from it, transactionally, at the moment that truth changes —
// not via a background job or event bus (none exist in this codebase, and
// the brief is explicit not to introduce one for this). Booking is
// authoritative; this module only ever reads it and writes its own tables.
//
// Call syncConnectionFromBooking(bookingId) from every code path that can
// transition a Booking to COMPLETED. There are three today — see the calls
// added to bookings.controller.ts (updateBookingStatus, deliverSessionFiles)
// and complete-session.controller.ts (completeSession) — and this
// deliberately covers all three, unlike syncStudioCircleMembership's
// existing sync, which the Business Intelligence audit this session found
// is only called from two of them.
import { prisma } from '../prisma';
import { Prisma, type WeaveNodeType } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

// Idempotent: safe to call for a Node that already exists (no-op update),
// and safe to call from anywhere that needs one to exist right now. Node
// creation is deliberately lazy — on first real use, not hooked into
// signup — so it never has to touch that separately-owned, actively-changing
// code path. id is the SAME id as the underlying Artist/Studio row; see the
// schema comment on WeaveNode for why.
export async function ensureNodeExists(type: WeaveNodeType, id: string, tx: TxClient | typeof prisma = prisma) {
  await tx.weaveNode.upsert({
    where: { id },
    update: {},
    create: { id, type },
  });
}

// Derives or reinforces a RECORDED_AT connection between a booking's Artist
// and Studio, with the booking itself as evidence. No-ops for anything that
// isn't (yet) a COMPLETED booking — a PENDING or CANCELLED booking is not
// evidence of a real creative relationship. Idempotent: calling this twice
// for the same completed booking creates no duplicate evidence and does not
// double-count activity_count.
export async function syncConnectionFromBooking(bookingId: string): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, artist_id: true, studio_id: true, status: true, updated_at: true },
  });
  if (!booking || booking.status !== 'COMPLETED') return;

  // Neon's per-round-trip latency (confirmed elsewhere this session to run
  // several hundred ms) can exceed Prisma's default 5s interactive-
  // transaction timeout once a handful of awaited statements are chained
  // sequentially — hit exactly this running the backfill script. Two fixes:
  // run the independent Node upserts in parallel instead of one after
  // another, and raise the transaction's own timeout explicitly rather than
  // trust the default headroom.
  await prisma.$transaction(async (tx) => {
    await Promise.all([
      ensureNodeExists('ARTIST', booking.artist_id, tx),
      ensureNodeExists('STUDIO', booking.studio_id, tx),
    ]);

    const connection = await tx.weaveConnection.upsert({
      where: {
        source_node_id_target_node_id_type: {
          source_node_id: booking.artist_id,
          target_node_id: booking.studio_id,
          type: 'RECORDED_AT',
        },
      },
      update: { last_activity_at: booking.updated_at },
      create: {
        source_node_id: booking.artist_id,
        target_node_id: booking.studio_id,
        type: 'RECORDED_AT',
        first_activity_at: booking.updated_at,
        last_activity_at: booking.updated_at,
      },
    });

    // Optimistic: try the create and let the unique constraint on
    // (connection_id, booking_id) reject a duplicate, instead of a
    // findUnique-first round trip that only ever matters on a re-run.
    try {
      await tx.weaveEvidence.create({ data: { connection_id: connection.id, booking_id: booking.id } });
      await tx.weaveConnection.update({ where: { id: connection.id }, data: { activity_count: { increment: 1 } } });
    } catch (error) {
      const isDuplicateEvidence = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!isDuplicateEvidence) throw error;
    }
  }, { timeout: 15_000 });
}

// ── Read-only lookups — the "basic Node lookup/service" this V1 calls for.
// Deliberately not exposed as an HTTP route yet: nothing outside this
// backend needs to query the Weave directly today, and adding a route
// before there's a real consumer would be exactly the kind of speculative
// surface the brief warns against.

export async function getNode(id: string) {
  return prisma.weaveNode.findUnique({ where: { id } });
}

export interface NodeConnectionSummary {
  connection_id: string;
  node_id: string;
  type: string;
  activity_count: number;
  first_activity_at: Date;
  last_activity_at: Date;
  evidence_count: number;
}

// Every connection touching a Node, from either side, with an explainable
// evidence count per connection — never a single opaque strength number.
export async function getNodeConnections(nodeId: string): Promise<NodeConnectionSummary[]> {
  const [asSource, asTarget] = await Promise.all([
    prisma.weaveConnection.findMany({
      where: { source_node_id: nodeId },
      include: { _count: { select: { evidence: true } } },
    }),
    prisma.weaveConnection.findMany({
      where: { target_node_id: nodeId },
      include: { _count: { select: { evidence: true } } },
    }),
  ]);

  return [...asSource, ...asTarget].map((connection) => ({
    connection_id: connection.id,
    node_id: connection.source_node_id === nodeId ? connection.target_node_id : connection.source_node_id,
    type: connection.type,
    activity_count: connection.activity_count,
    first_activity_at: connection.first_activity_at,
    last_activity_at: connection.last_activity_at,
    evidence_count: connection._count.evidence,
  }));
}
