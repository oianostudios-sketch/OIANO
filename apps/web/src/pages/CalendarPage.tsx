/**
 * CalendarPage — OIANO StudioOS
 * Three views: Day (resource grid) · Week (horizontal timeline) · Month (overview)
 * Roles: STUDIO_ADMIN + ENGINEER see all; ARTIST sees own + clickable open slots
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/auth.store';
import ArtistEmptyState from '../components/ArtistEmptyState';
import { CalendarPlus2 } from 'lucide-react';
import { BookingStatus, STATUS_HEX, hexAlpha } from '../lib/bookingStatus';

// ── Constants ─────────────────────────────────────────────────────────────────
const HOUR_START  = 8;
const HOUR_END    = 23;
const TOTAL_HOURS = HOUR_END - HOUR_START;
const DAY_LABELS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

// ── Colour palette — derived from the shared canonical status hex
// (lib/bookingStatus.ts) rather than a locally-authored copy (AUD-002).
// Calendar blocks need a translucent bg + bright text, which a flat brand
// hex alone doesn't give, so this derives that treatment from one shared
// source instead of hand-picking a separate palette.
function statusStyle(status: string) {
  const hex = STATUS_HEX[status as BookingStatus] ?? STATUS_HEX.CONFIRMED;
  return { bg: hexAlpha(hex, 0.16), border: hexAlpha(hex, 0.55), text: hex };
}

const ROOM_PALETTE = [
  '#C9A84C','#6366f1','#06b6d4','#10b981',
  '#f59e0b','#ec4899','#8b5cf6','#f97316',
];
const ENG_PALETTE = ['#7C3AED','#0891B2','#059669','#D97706','#DC2626','#DB2777','#4F46E5'];

type ColorMode = 'status' | 'room' | 'engineer';
type ViewMode  = 'day' | 'week' | 'month';

// ── Helpers ───────────────────────────────────────────────────────────────────
function startOfWeek(d: Date): Date {
  const day = new Date(d); day.setHours(0,0,0,0);
  day.setDate(day.getDate() - day.getDay()); return day;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function toISO(d: Date) { return d.toISOString().split('T')[0]; }
function fmtHour(h: number) {
  const ap = h >= 12 ? 'pm' : 'am';
  return `${h > 12 ? h-12 : h === 0 ? 12 : h}${ap}`;
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  const h = d.getHours(), m = d.getMinutes();
  const ap = h >= 12 ? 'pm' : 'am';
  const dh = h > 12 ? h-12 : h === 0 ? 12 : h;
  return m ? `${dh}:${String(m).padStart(2,'0')}${ap}` : `${dh}${ap}`;
}
function durLabel(b: any) {
  const m = Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m/60)}h${m%60 ? ` ${m%60}m` : ''}`;
}
function hashColor(str: string, palette: string[]) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return palette[Math.abs(h) % palette.length];
}
// pct of day-grid for a datetime
function timePct(iso: string): number {
  const d = new Date(iso);
  const mins = d.getHours()*60 + d.getMinutes();
  return Math.max(0, Math.min(100, ((mins - HOUR_START*60) / (TOTAL_HOURS*60)) * 100));
}
function nowPct(): number {
  const n = new Date();
  const mins = n.getHours()*60 + n.getMinutes();
  return ((mins - HOUR_START*60) / (TOTAL_HOURS*60)) * 100;
}

// ── Booking colour by mode ─────────────────────────────────────────────────────
function bookingColor(b: any, mode: ColorMode, rooms: any[]) {
  if (mode === 'status') {
    return statusStyle(b.status);
  }
  if (mode === 'room') {
    const idx = rooms.findIndex((r:any) => r.id === b.room_id);
    const c = ROOM_PALETTE[Math.max(0,idx) % ROOM_PALETTE.length];
    return { bg: c+'33', border: c, text: c };
  }
  if (mode === 'engineer' && b.engineer?.name) {
    const c = hashColor(b.engineer.name, ENG_PALETTE);
    return { bg: c+'33', border: c, text: c };
  }
  return statusStyle(b.status);
}

// ── Booking tooltip card ───────────────────────────────────────────────────────
function BookingCard({ b, onConfirm, onView, isAdmin }:
  { b: any; onConfirm: ()=>void; onView: ()=>void; isAdmin: boolean }) {
  return (
    <div style={{
      position:'absolute', zIndex:100, top:'calc(100% + 4px)', left:0, minWidth:200,
      background:'#1a1a1a', border:'1px solid #2a2a2a', borderRadius:8,
      padding:'10px 12px', boxShadow:'0 8px 32px #000a',
      fontSize:12, color:'#ccc', lineHeight:1.5,
    }}>
      <div style={{fontWeight:700, color:'#fff', marginBottom:4}}>{b.artist?.alias ?? b.artist?.name ?? '—'}</div>
      <div style={{color:'#888', fontSize:11}}>{fmtTime(b.starts_at)} – {fmtTime(b.ends_at)} · {durLabel(b)}</div>
      {b.room?.name && <div style={{color:'#5A9BCB', fontSize:11, marginTop:2}}>{b.room.name}</div>}
      {b.engineer?.name && <div style={{color:'#888', fontSize:11}}>{b.engineer.name}</div>}
      {b.service?.name && <div style={{color:'#666', fontSize:11}}>{b.service.name}</div>}
      {isAdmin && (
        <div style={{display:'flex', gap:6, marginTop:8}}>
          {b.status === 'PENDING' && (
            <button onClick={e=>{e.stopPropagation();onConfirm();}} style={{
              fontSize:10, padding:'3px 8px', borderRadius:4, cursor:'pointer',
              background:'#14532d', border:'1px solid #166534', color:'#86efac',
            }}>✓ Confirm</button>
          )}
          <button onClick={e=>{e.stopPropagation();onView();}} style={{
            fontSize:10, padding:'3px 8px', borderRadius:4, cursor:'pointer',
            background:'#1e1e1e', border:'1px solid #333', color:'#aaa',
          }}>View →</button>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function CalendarPage() {
  const navigate  = useNavigate();
  const qc        = useQueryClient();
  const user      = useAuthStore(s => s.user);
  const isAdmin   = user?.role === 'STUDIO_ADMIN';
  const isEngineer = user?.role === 'ENGINEER';
  const isArtist  = user?.role === 'ARTIST';

  const [view,      setView]      = useState<ViewMode>('week');
  const [anchor,    setAnchor]    = useState(() => new Date()); // focal date
  const [colorMode, setColorMode] = useState<ColorMode>('status');
  const [hoverId,   setHoverId]   = useState<string|null>(null);
  const [nowPctVal, setNowPct]    = useState(() => nowPct());
  const dayScrollRef = useRef<HTMLDivElement>(null);

  // Live clock tick every minute
  useEffect(() => {
    const t = setInterval(() => setNowPct(nowPct()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Auto-scroll day view to current time
  useEffect(() => {
    if (view === 'day' && dayScrollRef.current) {
      const el = dayScrollRef.current;
      const scrollTo = (nowPctVal / 100) * el.scrollHeight - el.clientHeight / 2;
      el.scrollTo({ top: Math.max(0, scrollTo), behavior: 'smooth' });
    }
  }, [view, nowPctVal]);

  // Compute visible date range for fetching
  const { from, to } = useMemo(() => {
    if (view === 'day') {
      const d = new Date(anchor); d.setHours(0,0,0,0);
      return { from: d, to: addDays(d, 1) };
    }
    if (view === 'week') {
      const w = startOfWeek(anchor);
      return { from: w, to: addDays(w, 7) };
    }
    // month — fetch 6-week window
    const m = startOfMonth(anchor);
    const w = startOfWeek(m);
    return { from: w, to: addDays(w, 42) };
  }, [view, anchor]);

  const { data: raw = { data: [] }, isFetching } = useQuery({
    queryKey: ['cal-bookings', toISO(from), toISO(to)],
    queryFn: async () => (await api.get(
      `/bookings?from=${from.toISOString()}&to=${to.toISOString()}&limit=500`
    )).data,
    refetchInterval: 90_000,
    staleTime: 30_000,
  });
  const bookings: any[] = raw.data ?? raw ?? [];

  const { data: studio } = useQuery({
    queryKey: ['studio'],
    queryFn: async () => (await api.get('/studio')).data,
    staleTime: 300_000,
  });
  const rooms: any[] = studio?.rooms ?? [];

  const confirmMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/bookings/${id}/status`, { status: 'CONFIRMED' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cal-bookings'] }),
  });

  // Navigation
  function navPrev() {
    if (view === 'day')   setAnchor(a => addDays(a, -1));
    if (view === 'week')  setAnchor(a => addDays(a, -7));
    if (view === 'month') setAnchor(a => new Date(a.getFullYear(), a.getMonth()-1, 1));
  }
  function navNext() {
    if (view === 'day')   setAnchor(a => addDays(a, 1));
    if (view === 'week')  setAnchor(a => addDays(a, 7));
    if (view === 'month') setAnchor(a => new Date(a.getFullYear(), a.getMonth()+1, 1));
  }
  function goToday() { setAnchor(new Date()); }

  // Click empty slot → book
  function handleSlotClick(date: Date, hour: number, roomId?: string) {
    if (isArtist || isAdmin) {
      const pad = (n:number) => String(n).padStart(2,'0');
      const dateStr = toISO(date);
      const timeStr = `${pad(hour)}:00`;
      const params = new URLSearchParams({ date: dateStr, time: timeStr });
      if (roomId) params.set('room_id', roomId);
      navigate(`/book?${params}`);
    }
  }

  // Range label
  const rangeLabel = useMemo(() => {
    if (view === 'day') {
      return anchor.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
    }
    if (view === 'week') {
      const w = startOfWeek(anchor);
      const e = addDays(w, 6);
      return `${w.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${e.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`;
    }
    return `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
  }, [view, anchor]);

  const isToday = isSameDay(anchor, new Date());
  const showNow = (view === 'day' || view === 'week') && nowPctVal >= 0 && nowPctVal <= 100;

  // Room utilization for day view header
  function roomUtil(roomId: string, day: Date): number {
    const secs = bookings
      .filter(b => b.room_id === roomId && isSameDay(new Date(b.starts_at), day) && !['CANCELLED','NO_SHOW'].includes(b.status))
      .reduce((s,b) => s + (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()), 0);
    return Math.min(100, Math.round(secs / (TOTAL_HOURS * 3_600_000) * 100));
  }

  // ── Shared styles ──────────────────────────────────────────────────────────
  const CS: React.CSSProperties = {
    minHeight:'100vh', background:'var(--bg,#0a0a0a)', color:'#fff',
    fontFamily:"'DM Sans', sans-serif",
  };

  const HEADER: React.CSSProperties = {
    position:'sticky', top:0, zIndex:30,
    background:'#0d0d0d', borderBottom:'1px solid #1e1e1e',
    padding:'10px 20px', display:'flex', alignItems:'center',
    justifyContent:'space-between', gap:12, flexWrap:'wrap',
  };

  const BTN = (active=false): React.CSSProperties => ({
    padding:'5px 12px', borderRadius:6, fontSize:11, cursor:'pointer',
    fontFamily:"'JetBrains Mono', monospace", letterSpacing:'0.06em',
    background: active ? '#5A9BCB' : '#141414',
    color: active ? '#000' : '#888',
    border: `1px solid ${active ? '#5A9BCB' : '#222'}`,
    transition:'all 0.15s',
  });

  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => HOUR_START + i);

  // ── DAY VIEW ──────────────────────────────────────────────────────────────
  function DayView() {
    const day = new Date(anchor); day.setHours(0,0,0,0);
    const dayBookings = bookings.filter(b => isSameDay(new Date(b.starts_at), day));

    // Column width per room
    const COL_W = Math.max(140, Math.floor((typeof window !== 'undefined' ? window.innerWidth - 80 : 1200) / Math.max(1, rooms.length)));

    return (
      <div ref={dayScrollRef} style={{ overflowY:'auto', maxHeight:'calc(100vh - 110px)' }}>
        {/* Room headers */}
        <div style={{ display:'flex', position:'sticky', top:0, zIndex:20, background:'#0d0d0d', borderBottom:'1px solid #1e1e1e' }}>
          <div style={{ width:56, flexShrink:0 }} />
          {rooms.map(room => {
            const util = roomUtil(room.id, day);
            const rc = hashColor(room.name, ROOM_PALETTE);
            return (
              <div key={room.id} style={{ width:COL_W, flexShrink:0, padding:'8px 10px', borderLeft:'1px solid #1e1e1e' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ width:8, height:8, borderRadius:'50%', background:rc, display:'inline-block', flexShrink:0 }} />
                  <span style={{ fontSize:12, fontWeight:600, color:'#ccc', whiteSpace:'nowrap' }}>{room.name}</span>
                </div>
                {/* Util bar */}
                <div style={{ marginTop:4, height:2, background:'#1e1e1e', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ width:`${util}%`, height:'100%', background:rc, borderRadius:2 }} />
                </div>
                <div style={{ fontSize:9, color:'#555', fontFamily:'monospace', marginTop:2 }}>{util}% booked</div>
              </div>
            );
          })}
        </div>

        {/* Grid */}
        <div style={{ display:'flex', position:'relative' }}>
          {/* Hour labels */}
          <div style={{ width:56, flexShrink:0 }}>
            {hours.map(h => (
              <div key={h} style={{ height:64, display:'flex', alignItems:'flex-start', justifyContent:'flex-end',
                paddingRight:8, paddingTop:2, fontSize:9, color:'#444', fontFamily:'monospace' }}>
                {fmtHour(h)}
              </div>
            ))}
          </div>

          {/* Room columns */}
          {rooms.map(room => {
            const roomBkgs = dayBookings.filter(b => b.room_id === room.id);
            return (
              <div key={room.id} style={{ width:COL_W, flexShrink:0, position:'relative',
                borderLeft:'1px solid #141414' }}>
                {/* Hour rows (click targets) */}
                {hours.map(h => (
                  <div key={h} onClick={() => handleSlotClick(day, h, room.id)}
                    style={{ height:64, borderBottom:'1px solid #111', cursor: (isAdmin||isArtist) ? 'pointer' : 'default',
                      transition:'background 0.1s' }}
                    onMouseEnter={e => { if(isAdmin||isArtist) (e.currentTarget as HTMLElement).style.background='#5A9BCB08'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background='transparent'; }}
                  />
                ))}

                {/* Booking blocks — absolutely positioned */}
                {roomBkgs.map(b => {
                  const topPct   = timePct(b.starts_at);
                  const btmPct   = timePct(b.ends_at);
                  const heightPct = Math.max(2, btmPct - topPct);
                  const col = bookingColor(b, colorMode, rooms);
                  const isHovered = hoverId === b.id;
                  return (
                    <div key={b.id}
                      onMouseEnter={() => setHoverId(b.id)}
                      onMouseLeave={() => setHoverId(null)}
                      onClick={e => { e.stopPropagation(); navigate(`/bookings/${b.id}`); }}
                      style={{
                        position:'absolute', zIndex:10,
                        top:`${topPct}%`, height:`${heightPct}%`,
                        left:4, right:4,
                        background:col.bg, border:`1px solid ${col.border}`,
                        borderRadius:5, padding:'3px 6px', cursor:'pointer',
                        overflow:'hidden', transition:'filter 0.1s',
                        filter: isHovered ? 'brightness(1.3)' : 'none',
                      }}
                    >
                      <div style={{ fontSize:10, fontWeight:700, color:col.text, lineHeight:1.3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {b.artist?.alias ?? b.artist?.name ?? '?'}
                      </div>
                      <div style={{ fontSize:9, color:col.text, opacity:0.7, lineHeight:1.2 }}>
                        {fmtTime(b.starts_at)} · {durLabel(b)}
                      </div>
                      {isHovered && (
                        <BookingCard b={b}
                          onConfirm={() => confirmMutation.mutate(b.id)}
                          onView={() => navigate(`/bookings/${b.id}`)}
                          isAdmin={isAdmin}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Now line */}
          {isToday && showNow && (
            <div style={{
              position:'absolute', left:56, right:0, zIndex:25,
              top:`${nowPctVal}%`, pointerEvents:'none',
            }}>
              <div style={{ height:1, background:'#ef4444', opacity:0.8 }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:'#ef4444',
                  position:'absolute', left:-4, top:-3.5 }} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── WEEK VIEW ─────────────────────────────────────────────────────────────
  function WeekView() {
    const weekStart = startOfWeek(anchor);
    const days = Array.from({length:7}, (_,i) => addDays(weekStart, i));

    return (
      <div style={{ overflowX:'auto' }}>
        <div style={{ minWidth:700 }}>
          {/* Day headers */}
          <div style={{ display:'flex', borderBottom:'1px solid #1e1e1e', position:'sticky', top:0, zIndex:20, background:'#0d0d0d' }}>
            <div style={{ width:56, flexShrink:0 }} />
            {days.map(day => {
              const today = isSameDay(day, new Date());
              const cnt = bookings.filter(b => isSameDay(new Date(b.starts_at), day)).length;
              return (
                <div key={day.toISOString()} onClick={() => { setAnchor(day); setView('day'); }}
                  style={{ flex:1, padding:'7px 6px', textAlign:'center', cursor:'pointer',
                    borderLeft:'1px solid #1a1a1a',
                    background: today ? '#5A9BCB0a' : 'transparent',
                    transition:'background 0.1s' }}>
                  <div style={{ fontSize:9, color: today ? '#5A9BCB' : '#666', fontFamily:'monospace', letterSpacing:'0.08em' }}>
                    {DAY_LABELS[day.getDay()]}
                  </div>
                  <div style={{ fontSize:15, fontWeight:700, color: today ? '#5A9BCB' : '#aaa', lineHeight:1.3 }}>
                    {day.getDate()}
                  </div>
                  {cnt > 0 && <div style={{ fontSize:8, color:'#555', fontFamily:'monospace' }}>{cnt} session{cnt!==1?'s':''}</div>}
                </div>
              );
            })}
          </div>

          {/* Room rows */}
          {rooms.map(room => {
            const rc = hashColor(room.name, ROOM_PALETTE);
            return (
              <div key={room.id} style={{ display:'flex', borderBottom:'1px solid #141414' }}>
                {/* Room label */}
                <div style={{ width:56, flexShrink:0, display:'flex', alignItems:'center', padding:'0 6px',
                  borderRight:'1px solid #1a1a1a' }}>
                  <span style={{ fontSize:9, color:rc, fontFamily:'monospace', writingMode:'vertical-rl', transform:'rotate(180deg)', whiteSpace:'nowrap' }}>
                    {room.name}
                  </span>
                </div>

                {/* Day columns */}
                {days.map(day => {
                  const today = isSameDay(day, new Date());
                  const dayBkgs = bookings.filter(b => b.room_id === room.id && isSameDay(new Date(b.starts_at), day));
                  return (
                    <div key={day.toISOString()} style={{
                      flex:1, borderLeft:'1px solid #141414', position:'relative',
                      height:72, background: today ? '#5A9BCB05' : 'transparent',
                      cursor: (isAdmin||isArtist) ? 'pointer' : 'default',
                    }}
                      onClick={() => handleSlotClick(day, 10, room.id)}>
                      {/* Hour lines */}
                      <div style={{ position:'absolute', inset:0, display:'flex', pointerEvents:'none' }}>
                        {Array.from({length:TOTAL_HOURS}, (_,i) => (
                          <div key={i} style={{ flex:1, borderRight:'1px solid #0f0f0f' }} />
                        ))}
                      </div>

                      {/* Bookings */}
                      {dayBkgs.map(b => {
                        const leftPct = timePct(b.starts_at);
                        const rightPct = 100 - timePct(b.ends_at);
                        const col = bookingColor(b, colorMode, rooms);
                        const isHovered = hoverId === b.id;
                        return (
                          <div key={b.id}
                            onMouseEnter={e=>{e.stopPropagation();setHoverId(b.id);}}
                            onMouseLeave={()=>setHoverId(null)}
                            onClick={e=>{e.stopPropagation();navigate(`/bookings/${b.id}`);}}
                            style={{
                              position:'absolute', top:4, bottom:4, zIndex:10,
                              left:`${leftPct}%`, right:`${Math.max(0,rightPct)}%`,
                              minWidth:6,
                              background:col.bg, border:`1px solid ${col.border}`,
                              borderRadius:4, padding:'2px 4px', cursor:'pointer',
                              overflow:'hidden',
                              filter: isHovered ? 'brightness(1.4)' : 'none',
                            }}>
                            <div style={{ fontSize:9, fontWeight:700, color:col.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                              {b.artist?.alias ?? b.artist?.name ?? '?'}
                            </div>
                            {isHovered && (
                              <BookingCard b={b}
                                onConfirm={()=>confirmMutation.mutate(b.id)}
                                onView={()=>navigate(`/bookings/${b.id}`)}
                                isAdmin={isAdmin}
                              />
                            )}
                          </div>
                        );
                      })}

                      {/* Now line — only on today's column */}
                      {today && showNow && (
                        <div style={{
                          position:'absolute', top:0, bottom:0, zIndex:20,
                          left:`${nowPctVal}%`, width:1,
                          background:'#ef4444', opacity:0.7, pointerEvents:'none',
                        }} />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Hour ruler at bottom */}
          <div style={{ display:'flex', borderTop:'1px solid #141414' }}>
            <div style={{ width:56, flexShrink:0 }} />
            <div style={{ flex:1, display:'flex', height:18 }}>
              {hours.map(h => (
                <div key={h} style={{ flex:1, fontSize:8, color:'#333', fontFamily:'monospace',
                  borderLeft:'1px solid #141414', paddingLeft:2, paddingTop:3 }}>
                  {fmtHour(h)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── MONTH VIEW ────────────────────────────────────────────────────────────
  function MonthView() {
    const firstDay = startOfMonth(anchor);
    const gridStart = startOfWeek(firstDay);
    const cells = Array.from({length:42}, (_,i) => addDays(gridStart, i));
    const curMonth = anchor.getMonth();

    return (
      <div style={{ padding:'0 20px 20px' }}>
        {/* Day-of-week headers */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', borderBottom:'1px solid #1a1a1a', marginBottom:0 }}>
          {DAY_LABELS.map(d => (
            <div key={d} style={{ textAlign:'center', padding:'8px 0', fontSize:9,
              color:'#555', fontFamily:'monospace', letterSpacing:'0.1em' }}>{d}</div>
          ))}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
          {cells.map((day, idx) => {
            const inMonth = day.getMonth() === curMonth;
            const today   = isSameDay(day, new Date());
            const dayBkgs = bookings.filter(b => isSameDay(new Date(b.starts_at), day));
            const maxShow = 3;

            return (
              <div key={idx}
                onClick={() => { setAnchor(day); setView('day'); }}
                style={{
                  minHeight:90, padding:'6px 6px 4px',
                  borderRight:'1px solid #141414', borderBottom:'1px solid #141414',
                  background: today ? '#5A9BCB08' : 'transparent',
                  opacity: inMonth ? 1 : 0.35,
                  cursor:'pointer', transition:'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = today ? '#5A9BCB10' : '#141414'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = today ? '#5A9BCB08' : 'transparent'}
              >
                <div style={{
                  display:'inline-flex', alignItems:'center', justifyContent:'center',
                  width:22, height:22, borderRadius:'50%', marginBottom:4,
                  background: today ? '#5A9BCB' : 'transparent',
                  fontSize:12, fontWeight: today ? 700 : 400,
                  color: today ? '#000' : inMonth ? '#ccc' : '#444',
                }}>
                  {day.getDate()}
                </div>

                {dayBkgs.slice(0, maxShow).map(b => {
                  const col = bookingColor(b, colorMode, rooms);
                  return (
                    <div key={b.id}
                      onClick={e => { e.stopPropagation(); navigate(`/bookings/${b.id}`); }}
                      style={{
                        marginBottom:2, padding:'1px 5px', borderRadius:3,
                        background:col.bg, borderLeft:`2px solid ${col.border}`,
                        fontSize:9, color:col.text, whiteSpace:'nowrap',
                        overflow:'hidden', textOverflow:'ellipsis', cursor:'pointer',
                      }}>
                      {fmtTime(b.starts_at)} {b.artist?.alias ?? b.artist?.name ?? '?'}
                    </div>
                  );
                })}
                {dayBkgs.length > maxShow && (
                  <div style={{ fontSize:9, color:'#555', fontFamily:'monospace', paddingLeft:4 }}>
                    +{dayBkgs.length - maxShow} more
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  // Count pending bookings in view for header badge
  const pendingCount = bookings.filter(b => b.status === 'PENDING').length;

  return (
    <div style={CS}>
      {/* Header */}
      <header style={HEADER}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <button onClick={() => navigate(-1)} style={{ background:'none', border:'none', color:'#555', cursor:'pointer', fontSize:13 }}>← Back</button>
          <span style={{ fontFamily:"'Playfair Display', serif", fontSize:16, color:'#5A9BCB', fontWeight:600 }}>Studio Calendar</span>
          {isFetching && <span style={{ fontSize:9, color:'#555', fontFamily:'monospace' }}>syncing…</span>}
          {pendingCount > 0 && isAdmin && (
            <span style={{ fontSize:9, background:'#78350f44', border:'1px solid #92400e', color:'#fcd34d',
              borderRadius:10, padding:'2px 7px', fontFamily:'monospace' }}>
              {pendingCount} pending
            </span>
          )}
        </div>

        {/* View toggle + nav */}
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {/* View buttons */}
          <div style={{ display:'flex', background:'#0d0d0d', border:'1px solid #1e1e1e', borderRadius:6, overflow:'hidden' }}>
            {(['day','week','month'] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setView(v)} style={BTN(view===v)}>
                {v.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Color mode */}
          {(isAdmin||isEngineer) && (
            <div style={{ display:'flex', background:'#0d0d0d', border:'1px solid #1e1e1e', borderRadius:6, overflow:'hidden' }}>
              {(['status','room','engineer'] as ColorMode[]).map(m => (
                <button key={m} onClick={() => setColorMode(m)} style={{
                  ...BTN(colorMode===m), fontSize:9, padding:'4px 8px',
                }}>
                  {m === 'status' ? '● STATUS' : m === 'room' ? '▥ ROOM' : '◎ ENG'}
                </button>
              ))}
            </div>
          )}

          {/* Nav */}
          <button onClick={navPrev} style={BTN()}>‹</button>
          {!isToday && <button onClick={goToday} style={{ ...BTN(), color:'#5A9BCB', borderColor:'#5A9BCB44' }}>Today</button>}
          <button onClick={navNext} style={BTN()}>›</button>
        </div>

        {/* Range label */}
        <div style={{ fontSize:12, color:'#888', fontFamily:"'JetBrains Mono', monospace" }}>
          {rangeLabel}
        </div>
      </header>

      {/* Hint bar */}
      {(isAdmin || isArtist) && (view === 'day' || view === 'week') && (
        <div style={{ padding:'5px 20px', background:'#0d0d0d', borderBottom:'1px solid #141414',
          fontSize:10, color:'#444', fontFamily:'monospace' }}>
          Click any empty slot to book → pre-fills the booking form
        </div>
      )}

      {/* Content */}
      {rooms.length === 0 ? (
        <div style={{ textAlign:'center', padding:'60px', color:'#555', fontSize:13 }}>Loading rooms…</div>
      ) : (
        <>
          {view === 'day'   && <DayView />}
          {view === 'week'  && <WeekView />}
          {view === 'month' && <MonthView />}
        </>
      )}

      {/* Empty state */}
      {bookings.length === 0 && rooms.length > 0 && (
        <ArtistEmptyState compact icon={CalendarPlus2} title="Your schedule has room" description="Choose an open studio time and turn it into your next session." actionLabel={(isAdmin||isArtist) ? 'Explore studio dates' : undefined} onAction={(isAdmin||isArtist) ? () => navigate('/book') : undefined} />
      )}
    </div>
  );
}
