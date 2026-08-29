import { useMemo } from 'react';
import {
  arc,
  CX,
  CY,
  isoAngle,
  polar,
  ROOM_COLOR,
  ROOM_PALETTE,
  ROOM_R,
  STATUS_ALPHA,
} from './smartClockModel';

interface RoomArcsProps {
  bookings: any[];
  rooms: { name: string }[];
  activeSessionId?: string;
  hoveredId: string | null;
  onHover: (id: string | null, booking: any | null) => void;
}

export default function RoomArcs({ bookings, rooms, activeSessionId, hoveredId, onHover }: RoomArcsProps) {
  const roomNames = rooms.slice(0, ROOM_R.length).map(room => room.name);
  const roomKey = roomNames.join('|');
  const byRoom = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const name of roomNames) map[name] = [];
    for (const booking of bookings) {
      const name = booking.room?.name;
      if (map[name]) map[name].push(booking);
    }
    return map;
    // roomKey gives the memo a stable primitive dependency for the derived room list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, roomKey]);

  const now = Date.now();

  return (
    <>
      {roomNames.map((name, roomIndex) => {
        const radius = ROOM_R[roomIndex];
        const color = ROOM_COLOR[name] ?? ROOM_PALETTE[roomIndex];
        const sessions = (byRoom[name] ?? []).filter(
          booking => booking.starts_at && booking.ends_at && !['CANCELLED', 'NO_SHOW'].includes(booking.status),
        );

        return (
          <g key={name}>
            <circle cx={CX} cy={CY} r={radius} fill="none" stroke="#111" strokeWidth={8} />
            <circle cx={CX} cy={CY} r={radius} fill="none" stroke={color} strokeWidth={8} strokeOpacity={0.04} />

            {sessions.map(booking => {
              const startAngle = isoAngle(booking.starts_at);
              const endAngle = isoAngle(booking.ends_at);
              const alpha = STATUS_ALPHA[booking.status] ?? 0.5;
              const isActive = booking.id === activeSessionId;
              const isHovered = booking.id === hoveredId;
              const isRunning = now >= new Date(booking.starts_at).getTime()
                && now <= new Date(booking.ends_at).getTime();

              return (
                <g
                  key={booking.id}
                  onMouseEnter={() => onHover(booking.id, booking)}
                  onMouseLeave={() => onHover(null, null)}
                  style={{ cursor: 'pointer' }}
                >
                  {(isActive || isRunning) && (
                    <path
                      d={arc(startAngle, endAngle, radius)}
                      fill="none"
                      stroke={color}
                      strokeWidth={14}
                      strokeLinecap="round"
                      strokeOpacity={0.18}
                      filter="url(#ck-glow-strong)"
                    />
                  )}
                  <path
                    d={arc(startAngle, endAngle, radius)}
                    fill="none"
                    stroke={color}
                    strokeWidth={isHovered ? 10 : 8}
                    strokeLinecap="round"
                    strokeOpacity={isHovered ? 1 : isActive ? 0.95 : alpha}
                    style={{ transition: 'stroke-opacity 0.2s, stroke-width 0.15s' }}
                  />
                  {(() => {
                    const point = polar(startAngle, radius);
                    return (
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={isRunning ? 4 : 2.5}
                        fill={color}
                        fillOpacity={isRunning ? 1 : 0.6}
                        filter={isRunning ? 'url(#ck-glow-tight)' : undefined}
                      />
                    );
                  })()}
                </g>
              );
            })}
          </g>
        );
      })}
    </>
  );
}
