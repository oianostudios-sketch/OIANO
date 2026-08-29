import { useEffect, useState } from 'react';
import {
  arc, CX, CY, nowAngle, polar, R, ROOM_COLOR, ROOM_PALETTE, ROOM_R,
} from './smartClockModel';

type Booking = { status?: string };

export function DayFace({ todayBookings, rooms }: { todayBookings: Booking[]; rooms: { name: string }[] }) {
  const roomNames = rooms.slice(0, ROOM_R.length).map(room => room.name);
  const [currentAngle, setCurrentAngle] = useState(nowAngle());
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentAngle(nowAngle()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const confirmed = todayBookings.filter(booking => booking.status === 'CONFIRMED').length;
  const pending = todayBookings.filter(booking => booking.status === 'PENDING').length;
  const completed = todayBookings.filter(booking => booking.status === 'COMPLETED').length;
  const total = todayBookings.filter(booking => !['CANCELLED', 'NO_SHOW'].includes(booking.status ?? '')).length;
  const needleRadians = (currentAngle - 90) * Math.PI / 180;
  const needlePoint = polar(currentAngle, R.decoA + 4);

  return (
    <>
      {roomNames.map((name, index) => (
        <circle key={name} cx={CX} cy={CY} r={ROOM_R[index]} fill="none"
          stroke={ROOM_COLOR[name] ?? ROOM_PALETTE[index]} strokeWidth={8} strokeOpacity={0.06} />
      ))}
      <line
        x1={CX + (R.face - 4) * Math.cos(needleRadians)} y1={CY + (R.face - 4) * Math.sin(needleRadians)}
        x2={CX + (R.decoA + 18) * Math.cos(needleRadians)} y2={CY + (R.decoA + 18) * Math.sin(needleRadians)}
        stroke="#C9A84C" strokeWidth={1} strokeOpacity={0.5} strokeDasharray="3 6" />
      <circle cx={needlePoint.x} cy={needlePoint.y} r={4} fill="#C9A84C" filter="url(#ck-glow-tight)" />
      <circle cx={CX} cy={CY} r={R.face} fill="url(#ck-face-bg)" />
      <circle cx={CX} cy={CY} r={R.face} fill="none" stroke="#C9A84C" strokeWidth={1} strokeOpacity={0.15} />
      <text x={CX} y={112} textAnchor="middle" fontSize={9} fill="#444" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.12em">DAY OVERVIEW</text>
      <text x={CX} y={148} textAnchor="middle" fontFamily="'Playfair Display', serif" fontSize={38} fill="#E6EDF5">{total}</text>
      <text x={CX} y={164} textAnchor="middle" fontSize={10} fill="#666" fontFamily="'DM Sans', sans-serif">sessions today</text>
      <line x1={118} y1={174} x2={202} y2={174} stroke="#C9A84C" strokeWidth={0.5} strokeOpacity={0.2} />
      <text x={CX - 32} y={193} textAnchor="middle" fontSize={16} fill="#3B8BFF" fontFamily="'JetBrains Mono', monospace" fontWeight={700}>{confirmed}</text>
      <text x={CX} y={193} textAnchor="middle" fontSize={16} fill="#C9A84C" fontFamily="'JetBrains Mono', monospace" fontWeight={700}>{pending}</text>
      <text x={CX + 32} y={193} textAnchor="middle" fontSize={16} fill="#1D9E75" fontFamily="'JetBrains Mono', monospace" fontWeight={700}>{completed}</text>
      <text x={CX - 32} y={207} textAnchor="middle" fontSize={8} fill="#333" fontFamily="system-ui">conf</text>
      <text x={CX} y={207} textAnchor="middle" fontSize={8} fill="#333" fontFamily="system-ui">pend</text>
      <text x={CX + 32} y={207} textAnchor="middle" fontSize={8} fill="#333" fontFamily="system-ui">done</text>
      {roomNames.map((name, index) => {
        const y = 222 + index * 11;
        return (
          <g key={name}>
            <circle cx={120} cy={y - 2} r={3.5} fill={ROOM_COLOR[name] ?? ROOM_PALETTE[index]} fillOpacity={0.8} />
            <text x={128} y={y} fontSize={8} fill="#444" fontFamily="'JetBrains Mono', monospace">{name}</text>
          </g>
        );
      })}
    </>
  );
}

export function PulseFace({ utilizationPct, weekSessions, todayBookings }: {
  utilizationPct: number;
  weekSessions: number;
  todayBookings: Booking[];
}) {
  const arcAngle = Math.max(0, Math.min(359.99, (utilizationPct / 100) * 360));
  const color = utilizationPct >= 70 ? '#1D9E75' : utilizationPct >= 40 ? '#C9A84C' : '#3B8BFF';
  const health = utilizationPct >= 70 ? 'HEALTHY' : utilizationPct >= 40 ? 'BUILDING' : 'QUIET';
  const confirmed = todayBookings.filter(booking => booking.status === 'CONFIRMED').length;
  const completed = todayBookings.filter(booking => booking.status === 'COMPLETED').length;
  const total = todayBookings.filter(booking => !['CANCELLED', 'NO_SHOW'].includes(booking.status ?? '')).length;
  const utilizationPoint = polar(arcAngle, R.roomA);

  return (
    <>
      <circle cx={CX} cy={CY} r={R.roomA} fill="none" stroke="#111" strokeWidth={10} />
      {arcAngle > 0 && <>
        <path d={arc(0, arcAngle, R.roomA)} fill="none" stroke={color} strokeWidth={16} strokeLinecap="round" strokeOpacity={0.12} filter="url(#ck-glow-strong)" />
        <path d={arc(0, arcAngle, R.roomA)} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" strokeOpacity={0.88} />
      </>}
      <circle cx={utilizationPoint.x} cy={utilizationPoint.y} r={5} fill={color} filter="url(#ck-glow-tight)" />
      <circle cx={CX} cy={CY} r={R.face} fill="url(#ck-face-bg)" />
      <circle cx={CX} cy={CY} r={R.face} fill="url(#ck-face-halo)" />
      <circle cx={CX} cy={CY} r={R.face} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.22} />
      <text x={CX} y={112} textAnchor="middle" fontSize={9} fill="#444" fontFamily="'JetBrains Mono', monospace" letterSpacing="0.14em">STUDIO PULSE</text>
      <text x={CX} y={154} textAnchor="middle" fontFamily="'JetBrains Mono', monospace" fontSize={42} fill={color} fontWeight={700} filter="url(#ck-glow-tight)">{utilizationPct}%</text>
      <text x={CX} y={170} textAnchor="middle" fontSize={9} fill={color} fontFamily="'JetBrains Mono', monospace" letterSpacing="0.16em">{health}</text>
      <line x1={112} y1={180} x2={208} y2={180} stroke={color} strokeWidth={0.5} strokeOpacity={0.18} />
      <text x={CX - 34} y={199} textAnchor="middle" fontSize={17} fill="#3B8BFF" fontFamily="'JetBrains Mono', monospace" fontWeight={700}>{confirmed}</text>
      <text x={CX} y={199} textAnchor="middle" fontSize={17} fill="#1D9E75" fontFamily="'JetBrains Mono', monospace" fontWeight={700}>{completed}</text>
      <text x={CX + 34} y={199} textAnchor="middle" fontSize={17} fill="#C9A84C" fontFamily="'JetBrains Mono', monospace" fontWeight={700}>{total}</text>
      <text x={CX - 34} y={212} textAnchor="middle" fontSize={8} fill="#333" fontFamily="system-ui">conf</text>
      <text x={CX} y={212} textAnchor="middle" fontSize={8} fill="#333" fontFamily="system-ui">done</text>
      <text x={CX + 34} y={212} textAnchor="middle" fontSize={8} fill="#333" fontFamily="system-ui">total</text>
      <line x1={112} y1={222} x2={208} y2={222} stroke={color} strokeWidth={0.5} strokeOpacity={0.12} />
      <text x={CX} y={237} textAnchor="middle" fontSize={10} fill="#555" fontFamily="'DM Sans', sans-serif">{weekSessions} sessions this week</text>
    </>
  );
}
