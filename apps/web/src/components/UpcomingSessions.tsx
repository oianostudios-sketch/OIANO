import { CalendarDays, Clock3, MapPin, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { STATUS_LABEL, type BookingStatus } from '../lib/bookingStatus';
import { fmtDateShort, fmtStudioTime } from '../lib/fmt';
import './UpcomingSessions.css';

export interface UpcomingBooking {
  id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  studio?: { name?: string | null; timezone?: string | null } | null;
  room?: { name?: string | null } | null;
  service?: { name?: string | null } | null;
  engineer?: { name?: string | null } | null;
  total_usd?: number | string | null;
  _count?: { messages?: number };
}

interface UpcomingSessionsProps {
  bookings: UpcomingBooking[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
}

function isUpcoming(booking: UpcomingBooking, now: number) {
  const startsAt = new Date(booking.starts_at).getTime();
  if (!Number.isFinite(startsAt)) return false;
  if (booking.status === 'IN_PROGRESS') {
    const endsAt = new Date(booking.ends_at).getTime();
    return Number.isFinite(endsAt) && endsAt > now;
  }
  return (booking.status === 'PENDING' || booking.status === 'CONFIRMED') && startsAt > now;
}

export default function UpcomingSessions({ bookings, isLoading, isError, isFetching, onRetry }: UpcomingSessionsProps) {
  const sessions = bookings.filter(booking => isUpcoming(booking, Date.now()))
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    .slice(0, 3);

  return (
    <section className="upcoming-sessions" aria-labelledby="upcoming-sessions-title">
      <header className="upcoming-sessions-heading">
        <div>
          <p className="creative-eyebrow">On the calendar</p>
          <h2 id="upcoming-sessions-title">Upcoming sessions</h2>
        </div>
        <CalendarDays size={19} aria-hidden="true" />
      </header>

      {isLoading && (
        <div className="upcoming-sessions-loading" role="status">
          Checking your sessions…
        </div>
      )}

      {isError && (
        <div className="upcoming-sessions-error" role="alert">
          <p>{sessions.length ? 'Couldn’t refresh sessions. The list may be out of date.' : 'Sessions couldn’t be loaded. Try again to check your calendar.'}</p>
          <button type="button" onClick={onRetry} disabled={isFetching}>
            <RefreshCw size={14} aria-hidden="true" />
            {isFetching ? 'Checking…' : 'Try again'}
          </button>
        </div>
      )}

      {!isLoading && sessions.length > 0 && (
        <ul className="upcoming-sessions-list">
          {sessions.map(booking => {
            const timezone = booking.studio?.timezone ?? undefined;
            return (
              <li key={booking.id}>
                <Link to={`/bookings/${booking.id}`} className="upcoming-session-row">
                  <span className="upcoming-session-date">
                    <strong>{fmtDateShort(booking.starts_at, timezone)}</strong>
                    <span>{fmtStudioTime(booking.starts_at, timezone)}</span>
                  </span>
                  <span className="upcoming-session-copy">
                    <strong>{booking.service?.name ?? 'Studio session'}</strong>
                    <span><MapPin size={13} aria-hidden="true" />{booking.studio?.name ?? 'Studio'} · {booking.room?.name ?? 'Room to be confirmed'}</span>
                    <span className="upcoming-session-status"><Clock3 size={13} aria-hidden="true" />{STATUS_LABEL[booking.status]}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {!isLoading && !isError && sessions.length === 0 && (
        <div className="upcoming-sessions-empty">
          <p>No upcoming sessions are linked to your account.</p>
          <Link to="/book">Find a studio time</Link>
        </div>
      )}

      <Link to="/calendar" className="upcoming-sessions-calendar">Open calendar <span aria-hidden="true">→</span></Link>
    </section>
  );
}
