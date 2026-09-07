import { prisma } from './prisma';
import { PERFORMED_SESSION_WHERE, summariseVerifiedWork } from './verifiedWork';

// One answer to "where am I, what's happening, what should I do next".
//
// Every page previously rebuilt this in the browser — the artist dashboard alone
// runs eight independent queries and assembles meaning client-side — so the
// answer differed by page and no server-side notion of a creator's situation
// existed at all. The only deterministic guidance in the product, Pulse, is
// STUDIO_ADMIN-only, which left the operator the best-served user on a creator
// platform.
//
// This layer READS domain state and ranks it. It owns no business rules: it does
// not decide what a valid transition is, what something costs, or who may do
// what. Delete it and every domain still works exactly as it does today.
//
// Deliberately not AI. getNextAction() exists but is gated behind
// OIANO_AI_ENABLED (off) and scoped to a single booking, so in practice nothing
// guided a creator. A suggestion a creator cannot audit is worse than none;
// every action below is traceable to a row.

export type NextActionKind =
  | 'SESSION_UNDERWAY'
  | 'SESSION_IMMINENT'
  | 'SESSION_AWAITING_STUDIO'
  | 'BALANCE_DUE'
  | 'DELIVERABLE_AWAITING_REVIEW'
  | 'RIGHTS_DECISION_PENDING'
  | 'CREDIT_AWAITING_RESPONSE'
  | 'CONSENT_REQUESTED'
  | 'NO_WORK_YET'
  | 'ALL_CLEAR';

export interface NextAction {
  kind: NextActionKind;
  title: string;
  detail: string;
  href: string;
  /** When the action is time-bound. Lets a client show urgency without re-deriving it. */
  at?: string;
  /**
   * How many items of this kind are actually waiting. Only one entry per kind is
   * surfaced, so without this a client counting `attention` reports the number of
   * *categories* needing the creator and calls it the number of things.
   */
  count?: number;
}

/** The session a creator is heading toward, chosen here rather than by each client. */
export interface NextSession {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  studio_name: string | null;
  room_name: string | null;
  service_name: string | null;
}

export interface CreatorContext {
  who: { id: string; role: string; name: string | null };
  next: NextAction;
  /** Everything else worth acting on, already ranked. `next` is always attention[0] when present. */
  attention: NextAction[];
  /**
   * How many individual things are waiting, across every kind. `attention.length`
   * counts categories, not items, and a client showing "3 more waiting on you"
   * from it would be describing something that does not exist.
   */
  attention_total: number;
  /** Work currently moving. Counts, not lists — a client that needs the rows still fetches them. */
  in_motion: { upcoming_sessions: number; active_projects: number };
  next_session: NextSession | null;
  money: { outstanding_usd: number; wallet_balance_usd: number | null };
  progress: { sessions: number; hours: number };
  generated_at: string;
}

const HOURS_36 = 36 * 60 * 60 * 1000;

// Ranked by what it costs the creator to miss it. A session cannot be recovered
// once its hour passes, so time-bound commitments outrank money; unpaid money
// outranks the rest because it blocks the session; and everything a *counterparty*
// is waiting on outranks anything that only grows the creator's own record.
const RANK: NextActionKind[] = [
  'SESSION_UNDERWAY',
  'SESSION_IMMINENT',
  'SESSION_AWAITING_STUDIO',
  'BALANCE_DUE',
  'DELIVERABLE_AWAITING_REVIEW',
  'RIGHTS_DECISION_PENDING',
  'CREDIT_AWAITING_RESPONSE',
  'CONSENT_REQUESTED',
  'NO_WORK_YET',
  'ALL_CLEAR',
];

function rank(action: NextAction) {
  return RANK.indexOf(action.kind);
}

function whenLabel(at: Date, now: Date): string {
  const hours = (at.getTime() - now.getTime()) / 3_600_000;
  if (hours < 0) return 'now';
  if (hours < 1) return 'within the hour';
  if (hours < 12) return `in ${Math.round(hours)} hours`;
  return at.toDateString() === new Date(now.getTime() + 86_400_000).toDateString() ? 'tomorrow' : 'soon';
}

/** The shape sessionAction needs. Narrower than a Booking row on purpose. */
export interface SessionForAction {
  id: string;
  starts_at: Date;
  ends_at: Date;
  status: string;
  studio?: { name: string | null } | null;
  room?: { name: string | null } | null;
}

/**
 * Which session action, if any, a booking deserves right now.
 *
 * Three situations that used to produce one sentence. Telling an artist to
 * "confirm you're coming" to a session the studio has not accepted yet names an
 * action they cannot take and hides the fact that matters: nobody has agreed to
 * this booking. And a session that began twenty minutes ago is the single most
 * relevant thing in a creator's day, so it outranks one that is merely close.
 */
export function sessionAction(booking: SessionForAction | null, now: Date): NextAction | null {
  if (!booking) return null;
  const studio = booking.studio?.name ?? 'Studio';
  const where = `${studio}${booking.room?.name ? ` — ${booking.room.name}` : ''}`;

  // Already running, and not yet over — the query that finds it filters on
  // ends_at for exactly this reason.
  if (booking.starts_at.getTime() <= now.getTime()) {
    if (booking.ends_at.getTime() < now.getTime()) return null;
    return {
      kind: 'SESSION_UNDERWAY',
      title: 'Your session is underway',
      detail: `${where}.`,
      href: `/bookings/${booking.id}`,
      at: booking.ends_at.toISOString(),
    };
  }

  if (booking.status === 'PENDING') {
    return {
      kind: 'SESSION_AWAITING_STUDIO',
      title: `${studio} hasn't confirmed your session yet`,
      detail: `Starts ${whenLabel(booking.starts_at, now)}. You'll hear when they accept it.`,
      href: `/bookings/${booking.id}`,
      at: booking.starts_at.toISOString(),
    };
  }

  if (booking.starts_at.getTime() - now.getTime() < HOURS_36) {
    return {
      kind: 'SESSION_IMMINENT',
      title: `Your session is ${whenLabel(booking.starts_at, now)}`,
      detail: `${where}. Confirmed.`,
      href: `/bookings/${booking.id}`,
      at: booking.starts_at.toISOString(),
    };
  }
  return null;
}

/**
 * How many individual things are waiting. `attention.length` counts kinds, not
 * items, so a client showing it as "N more waiting on you" reports a number that
 * describes nothing.
 */
export function totalWaiting(attention: NextAction[]): number {
  return attention.reduce((sum, item) => sum + (item.count ?? 1), 0);
}

export async function buildCreatorContext(userId: string, role: string): Promise<CreatorContext> {
  const now = new Date();

  const [user, artist] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } }),
    prisma.artist.findUnique({
      where: { user_id: userId },
      select: { id: true, name: true, wallet: { select: { balance_usd: true } } },
    }),
  ]);
  if (!user) throw new Error('User not found');

  const attention: NextAction[] = [];
  let outstanding = 0;
  let progress = { sessions: 0, hours: 0 };
  let inMotion = { upcoming_sessions: 0, active_projects: 0 };
  let nextSession: NextSession | null = null;

  if (artist) {
    const [upcoming, unpaid, deliverables, performed] = await Promise.all([
      prisma.booking.findFirst({
        // PENDING counts: a session awaiting studio confirmation is still the
        // one the creator is heading toward, and the dashboard treated it that
        // way client-side. Choosing it here means every surface agrees.
        //
        // Filtered on ends_at, not starts_at: a session that began twenty minutes
        // ago is the single most relevant thing in a creator's day, and a
        // start-time filter made it vanish at exactly the moment it began.
        where: { artist_id: artist.id, status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] }, ends_at: { gte: now } },
        orderBy: { starts_at: 'asc' },
        select: {
          id: true, starts_at: true, ends_at: true, status: true,
          studio: { select: { name: true } },
          room: { select: { name: true } },
          service: { select: { name: true } },
        },
      }),
      prisma.payment.findMany({
        where: { booking: { artist_id: artist.id }, status: { in: ['UNPAID', 'FAILED'] } },
        select: { amount_usd: true, booking_id: true },
      }),
      prisma.deliverable.findMany({
        where: { status: 'PENDING_REVIEW', booking: { artist_id: artist.id } },
        select: { id: true, title: true, booking_id: true },
      }),
      prisma.booking.findMany({
        where: { artist_id: artist.id, ...PERFORMED_SESSION_WHERE },
        select: { starts_at: true, ends_at: true },
      }),
    ]);

    progress = summariseVerifiedWork(performed);
    outstanding = Math.round(unpaid.reduce((sum, p) => sum + Number(p.amount_usd), 0) * 100) / 100;

    const [upcomingCount, activeProjects] = await Promise.all([
      prisma.booking.count({
        where: { artist_id: artist.id, status: { in: ['PENDING', 'CONFIRMED', 'IN_PROGRESS'] }, starts_at: { gte: now } },
      }),
      prisma.project.count({ where: { artist_id: artist.id, is_active: true, phase: { not: 'DELIVERED' } } }),
    ]);
    inMotion = { upcoming_sessions: upcomingCount, active_projects: activeProjects };

    if (upcoming) {
      nextSession = {
        id: upcoming.id,
        starts_at: upcoming.starts_at.toISOString(),
        ends_at: upcoming.ends_at.toISOString(),
        status: upcoming.status,
        studio_name: upcoming.studio?.name ?? null,
        room_name: upcoming.room?.name ?? null,
        service_name: upcoming.service?.name ?? null,
      };
    }

    const sessionEntry = sessionAction(upcoming, now);
    if (sessionEntry) attention.push(sessionEntry);

    if (outstanding > 0) {
      attention.push({
        kind: 'BALANCE_DUE',
        title: 'You have a balance to settle',
        detail: `${outstanding.toFixed(2)} outstanding across ${unpaid.length} session${unpaid.length === 1 ? '' : 's'}.`,
        href: unpaid.length === 1 ? `/bookings/${unpaid[0].booking_id}` : '/bookings',
        count: unpaid.length,
      });
    }

    if (deliverables.length > 0) {
      const [deliverable] = deliverables;
      attention.push({
        kind: 'DELIVERABLE_AWAITING_REVIEW',
        title: `${deliverable.title} is ready for you`,
        detail: 'Listen and approve it, or ask for changes.',
        href: `/bookings/${deliverable.booking_id}`,
        count: deliverables.length,
      });
    }

    if (progress.sessions === 0 && !upcoming) {
      attention.push({
        kind: 'NO_WORK_YET',
        title: 'Book your first session',
        detail: 'Your record starts with work you actually do.',
        href: '/book',
      });
    }
  }

  // Applies to anyone who can hold a named share or be credited, artist or not.
  const [rightsPending, creditsPending] = await Promise.all([
    prisma.rightsDecision.findMany({
      where: { holder_user_id: userId, status: 'PENDING' },
      select: { agreement: { select: { id: true, title: true, project_id: true } } },
    }),
    prisma.projectCredit.findMany({
      where: {
        status: 'DRAFT',
        project: { participants: { some: { participant_ref_id: userId, status: 'ACTIVE' } } },
      },
      select: { id: true, role: true, project_id: true },
    }),
  ]);

  if (rightsPending.length > 0) {
    const [decision] = rightsPending;
    attention.push({
      kind: 'RIGHTS_DECISION_PENDING',
      title: 'A split is waiting on you',
      detail: `${decision.agreement.title} — nobody's ownership settles until every holder answers.`,
      href: decision.agreement.project_id ? `/projects?project=${decision.agreement.project_id}` : '/projects',
      count: rightsPending.length,
    });
  }

  if (creditsPending.length > 0) {
    const [credit] = creditsPending;
    attention.push({
      kind: 'CREDIT_AWAITING_RESPONSE',
      title: 'Confirm a credit',
      detail: `You've been credited as ${credit.role.replace(/_/g, ' ').toLowerCase()}. Confirm it and it becomes part of your record.`,
      href: '/contributions',
      count: creditsPending.length,
    });
  }

  attention.sort((a, b) => rank(a) - rank(b));

  const next: NextAction = attention[0] ?? {
    kind: 'ALL_CLEAR',
    title: 'Nothing needs you right now',
    detail: progress.sessions > 0
      ? `${progress.sessions} session${progress.sessions === 1 ? '' : 's'} on your record. Book the next one when you're ready.`
      : 'When work starts moving, it shows up here.',
    href: '/book',
  };

  return {
    who: { id: user.id, role: user.role, name: artist?.name ?? null },
    next,
    attention,
    attention_total: totalWaiting(attention),
    in_motion: inMotion,
    next_session: nextSession,
    money: {
      outstanding_usd: outstanding,
      wallet_balance_usd: artist?.wallet ? Number(artist.wallet.balance_usd) : null,
    },
    progress,
    generated_at: now.toISOString(),
  };
}
