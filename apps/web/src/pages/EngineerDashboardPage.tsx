import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/auth.store';
import { api } from '../lib/api';
import { useToast } from '../components/Toast';
import { SkeletonRow } from '../components/Skeleton';
import SunMark from '../components/SunMark';
import { fmtTime, fmtDate } from '../lib/fmt';

const STATUS_COLORS: Record<string, string> = {
  PENDING:     'bg-yellow-900/30 text-yellow-400',
  CONFIRMED:   'bg-green-900/30 text-green-400',
  IN_PROGRESS: 'bg-blue-900/30 text-blue-400',
  COMPLETED:   'bg-zinc-800 text-zinc-400',
  CANCELLED:   'bg-red-900/30 text-red-400',
  NO_SHOW:     'bg-red-900/20 text-red-600',
};

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

function isToday(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function isThisWeek(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  return d >= startOfWeek && d < endOfWeek;
}


export default function EngineerDashboardPage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  const [notesTarget, setNotesTarget] = useState<string | null>(null); // booking id
  const [notesText, setNotesText] = useState('');
  const [tracksText, setTracksText] = useState('');
  const [rating, setRating] = useState(0);

  const { data: pulse } = useQuery({
    queryKey: ['studio-pulse'],
    queryFn: async () => (await api.get('/studio/pulse')).data,
    refetchInterval: 15_000,
  });

  // The bookable Engineer record (specialties/credits/hourly-rate) linked to
  // this login, if any — previously there was no way to know which Engineer
  // a logged-in "engineer" actually was. Null, not a 404, when unlinked.
  const { data: myEngineer } = useQuery({
    queryKey: ['engineer-me'],
    queryFn: async () => (await api.get('/engineers/me')).data,
  });

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ['bookings'],
    queryFn: async () => { const r = (await api.get('/bookings')).data; return Array.isArray(r) ? r : (r?.data ?? []); },
    refetchInterval: 60_000,
  });

  const saveNotes = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      api.patch(`/bookings/${id}/session-notes`, {
        notes: notesText || undefined,
        quality_rating: rating || undefined,
        tracks_worked: tracksText ? tracksText.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      toast.success('Session notes saved');
      setNotesTarget(null);
      setNotesText('');
      setTracksText('');
      setRating(0);
    },
    onError: () => toast.error('Failed to save notes'),
  });

  const allBookings = bookings as any[];
  const todaysSessions = allBookings.filter((b) => isToday(b.starts_at) && !['CANCELLED', 'NO_SHOW'].includes(b.status));
  const upcomingThisWeek = allBookings.filter((b) =>
    isThisWeek(b.starts_at) &&
    !isToday(b.starts_at) &&
    new Date(b.starts_at) > new Date() &&
    !['CANCELLED', 'NO_SHOW'].includes(b.status)
  );
  const recentCompleted = allBookings
    .filter((b) => b.status === 'COMPLETED')
    .sort((a, b) => new Date(b.ends_at).getTime() - new Date(a.ends_at).getTime())
    .slice(0, 5);

  function openNotes(b: any) {
    setNotesTarget(b.id);
    setNotesText(b.session_log?.notes ?? '');
    setTracksText((b.session_log?.tracks_worked ?? []).join(', '));
    setRating(b.session_log?.quality_rating ?? 0);
  }

  return (
    <div className="min-h-screen bg-studio-bg text-white">
      {/* Header */}
      <header className="border-b border-studio-border px-6 py-4 flex items-center justify-between sticky top-0 bg-studio-bg z-10">
        <div className="flex items-center gap-3">
          <SunMark size={24} />
          {myEngineer ? (
            <span className="text-zinc-400 text-xs">
              <span className="text-white font-medium">{myEngineer.name}</span>
              {myEngineer.specialties?.length ? <span className="text-zinc-600"> · {myEngineer.specialties.slice(0, 2).join(', ')}</span> : null}
            </span>
          ) : (
            <span className="text-zinc-600 text-xs">Engineer · Studio</span>
          )}
        </div>
        {/* Room status strip — live from pulse */}
        <div className="hidden md:flex items-center gap-2">
          {(pulse?.rooms ?? []).map((room: any) => {
            const live = room.status === 'OCCUPIED' || room.is_live;
            return (
              <div key={room.id} style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                borderRadius: 99, fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
                background: live ? 'rgba(29,158,117,0.1)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${live ? 'rgba(29,158,117,0.3)' : '#222'}`,
                color: live ? '#1D9E75' : '#444',
              }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', background: live ? '#1D9E75' : '#333', flexShrink: 0,
                  boxShadow: live ? '0 0 6px #1D9E75' : 'none',
                  animation: live ? 'spw-pulse 1.2s ease-in-out infinite' : 'none',
                }} />
                {room.name ?? room.room_type}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4">
          <Link to="/calendar" className="text-zinc-500 hover:text-white text-sm transition-colors">Calendar</Link>
          <Link to="/runsheet" className="text-zinc-500 hover:text-white text-sm transition-colors">Runsheet</Link>
          <span className="text-zinc-500 text-sm">{user?.email}</span>
          <button
            onClick={() => { logout(); navigate('/enter'); }}
            className="text-zinc-600 hover:text-zinc-400 text-sm transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-10">

        {/* Today's sessions */}
        <div>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-display text-xl text-white">Today</h2>
            <span className="text-xs font-mono text-zinc-500">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </span>
            {todaysSessions.length > 0 && (
              <span className="ml-auto text-xs bg-dome/10 border border-dome/20 text-dome px-2 py-0.5 rounded-full">
                {todaysSessions.length} session{todaysSessions.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-3">{[0,1].map(i => <SkeletonRow key={i} />)}</div>
          ) : todaysSessions.length === 0 ? (
            <div className="bg-studio-surface border border-studio-border rounded-xl p-8 text-center">
              <p className="text-zinc-500 text-sm">No sessions scheduled for today.</p>
              <p className="text-zinc-600 text-xs mt-1">Rest up. Tomorrow might be different.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {todaysSessions.map((b: any) => {
                const now = new Date();
                const start = new Date(b.starts_at);
                const end = new Date(b.ends_at);
                const isActive = now >= start && now <= end;
                const isPast = now > end;

                return (
                  <div key={b.id} className={`bg-studio-surface border rounded-xl px-5 py-4 transition-colors ${
                    isActive ? 'border-dome/30 bg-dome/5' : 'border-studio-border'
                  }`}>
                    <div className="flex items-center gap-5">
                      {/* Time block */}
                      <div className="w-20 flex-shrink-0 text-center">
                        <p className={`font-mono text-sm font-semibold ${isActive ? 'text-dome' : 'text-zinc-300'}`}>
                          {fmtTime(b.starts_at)}
                        </p>
                        <p className="text-zinc-600 text-xs">{fmtTime(b.ends_at)}</p>
                        {isActive && (
                          <span className="text-[9px] text-dome uppercase tracking-wider font-mono mt-1 block">● live</span>
                        )}
                      </div>

                      {/* Artist + service */}
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold">{b.artist?.name ?? 'Unknown'}</p>
                        <p className="text-zinc-500 text-xs mt-0.5">
                          {b.service?.name ?? 'Session'} · {b.room?.name ?? 'No room'}
                        </p>
                        {b.notes && (
                          <p className="text-zinc-600 text-xs mt-1 italic">"{b.notes}"</p>
                        )}
                      </div>

                      {/* Status + actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[b.status] ?? 'text-zinc-500'}`}>
                          {b.status}
                        </span>
                        {isPast && (
                          <button
                            onClick={() => openNotes(b)}
                            className="text-xs bg-dome/10 border border-dome/20 text-dome px-3 py-1.5 rounded-lg hover:bg-dome/20 transition-colors"
                          >
                            {b.session_log?.notes ? '✎ Edit notes' : '+ Add notes'}
                          </button>
                        )}
                        <Link
                          to={`/bookings/${b.id}`}
                          className="text-xs text-zinc-500 hover:text-white transition-colors px-2"
                        >
                          View →
                        </Link>
                      </div>
                    </div>

                    {/* Existing notes preview */}
                    {b.session_log?.notes && (
                      <div className="mt-3 pt-3 border-t border-studio-border flex items-start gap-3">
                        <span className="text-dome text-xs font-mono">Notes</span>
                        <p className="text-zinc-400 text-xs leading-relaxed flex-1">{b.session_log.notes}</p>
                        {b.session_log.quality_rating && (
                          <span className="text-dome text-xs flex-shrink-0">
                            {'★'.repeat(b.session_log.quality_rating)}
                            <span className="text-zinc-600 ml-1">({RATING_LABELS[b.session_log.quality_rating]})</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* This week */}
        {upcomingThisWeek.length > 0 && (
          <div>
            <h2 className="font-display text-xl text-white mb-4">This week</h2>
            <div className="space-y-2">
              {upcomingThisWeek.map((b: any) => (
                <div key={b.id} className="bg-studio-surface border border-studio-border rounded-xl px-5 py-3.5 flex items-center gap-4">
                  <div className="w-24 flex-shrink-0">
                    <p className="text-zinc-400 text-xs">{fmtDate(b.starts_at)}</p>
                    <p className="text-zinc-600 text-xs">{fmtTime(b.starts_at)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{b.artist?.name ?? '—'}</p>
                    <p className="text-zinc-500 text-xs truncate">{b.service?.name} · {b.room?.name}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[b.status] ?? ''}`}>
                    {b.status}
                  </span>
                  <Link to={`/bookings/${b.id}`} className="text-zinc-600 text-xs hover:text-white transition-colors">
                    →
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent completed — add notes */}
        {recentCompleted.length > 0 && (
          <div>
            <h2 className="font-display text-xl text-white mb-4">Recent sessions</h2>
            <div className="space-y-2">
              {recentCompleted.map((b: any) => (
                <div key={b.id} className="bg-studio-surface border border-studio-border rounded-xl px-5 py-3.5 flex items-center gap-4">
                  <div className="w-24 flex-shrink-0">
                    <p className="text-zinc-400 text-xs">{fmtDate(b.starts_at)}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{b.artist?.name ?? '—'}</p>
                    <p className="text-zinc-500 text-xs truncate">{b.service?.name}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {b.session_log?.quality_rating && (
                      <span className="text-dome text-xs">{'★'.repeat(b.session_log.quality_rating)}</span>
                    )}
                    <button
                      onClick={() => openNotes(b)}
                      className="text-xs border border-studio-border text-zinc-400 px-3 py-1.5 rounded-lg hover:border-zinc-600 hover:text-white transition-colors"
                    >
                      {b.session_log?.notes ? '✎ Notes' : '+ Notes'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>

      {/* Session notes modal */}
      {notesTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={(e) => e.target === e.currentTarget && setNotesTarget(null)}
        >
          <div className="bg-studio-surface border border-studio-border rounded-xl p-6 w-full max-w-md space-y-5">
            <div>
              <p className="text-zinc-500 text-xs font-mono uppercase tracking-widest mb-1">Session notes</p>
              <h3 className="font-display text-lg text-white">
                {allBookings.find(b => b.id === notesTarget)?.artist?.name ?? 'Session'}
              </h3>
            </div>

            {/* Rating */}
            <div>
              <p className="text-zinc-500 text-xs mb-2">Session quality</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((r) => (
                  <button
                    key={r}
                    onClick={() => setRating(r === rating ? 0 : r)}
                    className={`flex-1 py-2 rounded-lg border text-xs transition-colors ${
                      r <= rating
                        ? 'border-dome bg-dome/10 text-dome'
                        : 'border-studio-border text-zinc-600 hover:border-zinc-600'
                    }`}
                  >
                    {'★'.repeat(r)}
                  </button>
                ))}
              </div>
              {rating > 0 && <p className="text-zinc-600 text-xs mt-1">{RATING_LABELS[rating]}</p>}
            </div>

            {/* Tracks */}
            <div>
              <label className="text-zinc-500 text-xs mb-1 block">Tracks worked on</label>
              <input
                type="text"
                value={tracksText}
                onChange={(e) => setTracksText(e.target.value)}
                placeholder="Track 1, Track 2, Hook refine..."
                className="w-full bg-studio-muted border border-studio-border text-white placeholder-zinc-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-dome transition-colors"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-zinc-500 text-xs mb-1 block">Session notes</label>
              <textarea
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                placeholder="What happened in the session? Breakthroughs, challenges, what to pick up next time..."
                rows={4}
                className="w-full bg-studio-muted border border-studio-border text-white placeholder-zinc-600 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-dome transition-colors resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setNotesTarget(null)}
                className="flex-1 border border-studio-border text-zinc-400 py-2.5 rounded-lg text-sm hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => saveNotes.mutate({ id: notesTarget })}
                disabled={saveNotes.isPending}
                className="flex-1 bg-dome text-black font-semibold py-2.5 rounded-lg text-sm hover:bg-dome-light transition-colors disabled:opacity-50"
              >
                {saveNotes.isPending ? 'Saving…' : 'Save notes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
