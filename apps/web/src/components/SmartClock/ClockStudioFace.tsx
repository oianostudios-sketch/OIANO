import { useEffect, useMemo, useState } from 'react';
import { ClockData } from './useClockData';
import { CX, CY, fmtMins, fmtTime, nowAngle, polar, R, ROOM_COLOR, STATUS_COLOR } from './smartClockModel';
import { STATUS_HEX, type BookingStatus } from '../../lib/bookingStatus';

type Booking = {
  starts_at?: string;
  ends_at?: string;
  status?: string;
  artist?: { name?: string };
  room?: { name?: string };
};

export default function StudioFace({ data, todayBookings, hoveredBooking }: {
  data: ClockData | null;
  todayBookings: Booking[];
  hoveredBooking: Booking | null;
}) {
  const [now, setNow] = useState(new Date());
  const [angle, setAngle] = useState(nowAngle());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
      setAngle(nowAngle());
    }, 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const session = data?.activeSession ?? null;
  const color = STATUS_COLOR[data?.sessionStatus ?? 'idle'];
  const nextSession = useMemo(() => {
    const nowMs = Date.now();
    return todayBookings
      .filter(booking => booking.starts_at && new Date(booking.starts_at).getTime() > nowMs && !['CANCELLED', 'NO_SHOW'].includes(booking.status ?? ''))
      .sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime())[0] ?? null;
  }, [todayBookings]);
  const minutesToNext = nextSession?.starts_at
    ? Math.max(0, Math.round((new Date(nextSession.starts_at).getTime() - Date.now()) / 60_000))
    : null;
  const sessionCount = todayBookings.filter(booking => !['CANCELLED', 'NO_SHOW'].includes(booking.status ?? '')).length;
  const needlePoint = polar(angle, R.face + 2);

  return (
    <>
      <g transform={`rotate(${angle}, ${CX}, ${CY})`}>
        <line x1={CX} y1={CY - R.face + 6} x2={CX} y2={CY - R.face - 4} stroke={color} strokeWidth={2} strokeLinecap="round" />
      </g>
      <circle cx={needlePoint.x} cy={needlePoint.y} r={4} fill={color} filter="url(#ck-glow-tight)" />
      <circle cx={CX} cy={CY} r={R.face} fill="url(#ck-face-bg)" />
      <circle cx={CX} cy={CY} r={R.face} fill="url(#ck-face-halo)" />
      <circle cx={CX} cy={CY} r={R.face} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.22} />

      {hoveredBooking && !session ? <>
        <text x={CX} y={117} textAnchor="middle" fontSize={9} fill="#555" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.1em">PREVIEW</text>
        <text x={CX} y={137} textAnchor="middle" fontSize={15} fill="#e4e4e7" fontFamily="'DM Sans', sans-serif" fontWeight={700}>{hoveredBooking.artist?.name ?? 'Artist'}</text>
        <text x={CX} y={153} textAnchor="middle" fontSize={10} fill={ROOM_COLOR[hoveredBooking.room?.name ?? ''] ?? '#888'} fontFamily="'JetBrains Mono', monospace">{hoveredBooking.room?.name ?? 'Room TBA'}</text>
        <line x1={122} y1={163} x2={198} y2={163} stroke={color} strokeWidth={0.5} strokeOpacity={0.2} />
        <text x={CX} y={178} textAnchor="middle" fontSize={18} fill={color} fontFamily="'JetBrains Mono', monospace" fontWeight={700}>{fmtTime(hoveredBooking.starts_at)}</text>
        <text x={CX} y={195} textAnchor="middle" fontSize={10} fill="#444" fontFamily="'JetBrains Mono', monospace">→ {fmtTime(hoveredBooking.ends_at)}</text>
        <text x={CX} y={215} textAnchor="middle" fontSize={11}
          fill={hoveredBooking.status ? STATUS_HEX[hoveredBooking.status as BookingStatus] ?? '#555' : '#555'}
          fontFamily="'JetBrains Mono', monospace" letterSpacing="0.08em">{hoveredBooking.status}</text>
      </> : session ? <>
        <text x={CX} y={110} textAnchor="middle" fontSize={8} fill={color} fontFamily="'JetBrains Mono', monospace" letterSpacing="0.14em">● LIVE</text>
        <text x={CX} y={130} textAnchor="middle" fontSize={22} fill="#E6EDF5" fontFamily="'JetBrains Mono', monospace" fontWeight={700}>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</text>
        <text x={CX} y={148} textAnchor="middle" fontSize={12} fill="#e4e4e7" fontFamily="'DM Sans', sans-serif" fontWeight={700}>{session.artistName}</text>
        <text x={CX} y={163} textAnchor="middle" fontSize={10} fill={ROOM_COLOR[session.room] ?? '#888'} fontFamily="'JetBrains Mono', monospace">{session.room}</text>
        <line x1={120} y1={172} x2={200} y2={172} stroke={color} strokeWidth={0.5} strokeOpacity={0.2} />
        <text x={CX} y={190} textAnchor="middle" fontSize={22} fill={color} fontFamily="'JetBrains Mono', monospace" fontWeight={700}>{fmtMins(session.minutesRemaining)}</text>
        <text x={CX} y={206} textAnchor="middle" fontSize={9} fill="#444" fontFamily="'JetBrains Mono', monospace">left in session</text>
        <rect x={122} y={216} width={76} height={3} rx={1.5} fill="#1a1a1a" />
        <rect x={122} y={216} width={Math.round(76 * Math.min(1, session.minutesElapsed / Math.max(1, session.minutesTotal)))} height={3} rx={1.5} fill={color} />
        <text x={CX} y={232} textAnchor="middle" fontSize={9} fill="#333" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.1em">{session.phaseLabel}</text>
      </> : <>
        <text x={CX} y={120} textAnchor="middle" fontSize={28} fill="#E6EDF5" fontFamily="'JetBrains Mono', monospace" fontWeight={300}>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</text>
        <text x={CX} y={140} textAnchor="middle" fontSize={9} fill="#5A9BCB" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.16em">◎  STUDIO READY</text>
        <line x1={120} y1={150} x2={200} y2={150} stroke="#5A9BCB" strokeWidth={0.5} strokeOpacity={0.2} />
        {nextSession ? <>
          <text x={CX} y={165} textAnchor="middle" fontSize={9} fill="#444" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.08em">next session in</text>
          <text x={CX} y={188} textAnchor="middle" fontSize={22} fill="#5A9BCB" fontFamily="'JetBrains Mono', monospace" fontWeight={700}>{minutesToNext != null ? `${minutesToNext}m` : '--'}</text>
          <text x={CX} y={207} textAnchor="middle" fontSize={13} fill="#e4e4e7" fontFamily="'DM Sans', sans-serif" fontWeight={600}>{nextSession.artist?.name ?? 'Artist'}</text>
          <text x={CX} y={222} textAnchor="middle" fontSize={10} fill="#555" fontFamily="'JetBrains Mono', monospace">{fmtTime(nextSession.starts_at)} · {nextSession.room?.name ?? 'TBA'}</text>
        </> : <>
          <text x={CX} y={172} textAnchor="middle" fontSize={11} fill="#333" fontFamily="'DM Sans', sans-serif">No sessions remaining</text>
          <text x={CX} y={190} textAnchor="middle" fontSize={9} fill="#222" fontFamily="'JetBrains Mono', monospace">Ready to book</text>
        </>}
        <text x={CX} y={242} textAnchor="middle" fontSize={9} fill="#2a2a2a" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.1em">{sessionCount} booked today</text>
      </>}
    </>
  );
}
