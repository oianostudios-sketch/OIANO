import { useEffect, useState } from 'react';
import { ClockData } from './useClockData';
import { arc, CX, CY, fmtMs, R, STATUS_COLOR } from './smartClockModel';

type Booking = {
  starts_at?: string;
  status?: string;
  artist?: { name?: string };
};

export default function FocusFace({ data, todayBookings }: {
  data: ClockData | null;
  todayBookings: Booking[];
}) {
  const [milliseconds, setMilliseconds] = useState(0);
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState('');
  const session = data?.activeSession ?? null;

  useEffect(() => {
    const calculate = () => {
      const now = Date.now();
      if (session?.endsAt) {
        const end = new Date(session.endsAt).getTime();
        const start = new Date(session.scheduledAt).getTime();
        const remaining = end - now;
        setMilliseconds(Math.max(0, remaining));
        setProgress(Math.max(0, Math.min(1, 1 - remaining / (end - start))));
        setLabel(remaining < 900_000 ? '⚡ CLOSING SOON' : 'until session ends');
        return;
      }
      const next = todayBookings
        .filter(booking => booking.starts_at && new Date(booking.starts_at).getTime() > now && !['CANCELLED', 'NO_SHOW'].includes(booking.status ?? ''))
        .sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime())[0];
      if (!next) {
        setMilliseconds(0);
        setProgress(0);
        setLabel('no sessions pending');
        return;
      }
      const start = new Date(next.starts_at!).getTime();
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const remaining = start - now;
      setMilliseconds(Math.max(0, remaining));
      setProgress(Math.max(0, Math.min(1, 1 - remaining / (start - dayStart.getTime()))));
      setLabel(`until ${next.artist?.name ?? 'next session'}`);
    };
    calculate();
    const timer = window.setInterval(calculate, 500);
    return () => window.clearInterval(timer);
  }, [session, todayBookings]);

  const ringAngle = progress * 359.99;
  const status = data?.sessionStatus ?? 'idle';
  const color = STATUS_COLOR[status];
  const urgent = Boolean(session && progress > 0.85);
  const faceColor = urgent ? '#D94A4A' : color;

  return (
    <>
      <circle cx={CX} cy={CY} r={R.roomA} fill="none" stroke="#111" strokeWidth={10} />
      {ringAngle > 0 && <>
        {urgent && <path d={arc(0, ringAngle, R.roomA)} fill="none" stroke="#D94A4A" strokeWidth={16} strokeLinecap="round" strokeOpacity={0.12} filter="url(#ck-glow-strong)" />}
        <path d={arc(0, ringAngle, R.roomA)} fill="none" stroke={faceColor} strokeWidth={10} strokeLinecap="round" strokeOpacity={0.9} />
      </>}
      <circle cx={CX} cy={CY} r={R.face} fill="url(#ck-face-bg)" />
      <circle cx={CX} cy={CY} r={R.face} fill="url(#ck-face-halo)" />
      <circle cx={CX} cy={CY} r={R.face} fill="none" stroke={faceColor} strokeWidth={1} strokeOpacity={0.25} />
      <text x={CX} y={126} textAnchor="middle" fontSize={9} fill="#444" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.14em">FOCUS MODE</text>
      <text x={CX} y={158} textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize={milliseconds > 3_600_000 ? 24 : 32} fill={urgent ? '#D94A4A' : '#E6EDF5'} fontWeight={700} filter={urgent ? 'url(#ck-glow-tight)' : undefined}>
        {milliseconds > 0 ? fmtMs(milliseconds) : '—'}
      </text>
      <text x={CX} y={176} textAnchor="middle" fontSize={10} fill={faceColor} fontFamily="'JetBrains Mono', monospace" letterSpacing="0.06em">{label}</text>
      <line x1={120} y1={187} x2={200} y2={187} stroke={color} strokeWidth={0.5} strokeOpacity={0.2} />
      <text x={CX} y={208} textAnchor="middle" fontSize={28} fill={faceColor} fontFamily="'JetBrains Mono', monospace" fontWeight={700}>{Math.round(progress * 100)}%</text>
      <text x={CX} y={225} textAnchor="middle" fontSize={10} fill="#444" fontFamily="system-ui">of window elapsed</text>
      {session && <text x={CX} y={244} textAnchor="middle" fontSize={10} fill="#555" fontFamily="'JetBrains Mono', monospace">{session.artistName} · {session.room}</text>}
    </>
  );
}
