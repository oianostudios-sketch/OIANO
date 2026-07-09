import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Stats {
  total_sessions: number;
  total_hours: number;
  this_year_sessions: number;
  this_year_hours: number;
  fav_room: string | null;
  fav_engineer: string | null;
  avg_session_rating: number | null;
  monthly: { month: number; sessions: number; hours: number }[];
}

const MONTH_SHORT = ['J','F','M','A','M','J','J','A','S','O','N','D'];

export default function SessionStats() {
  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ['passport-stats'],
    queryFn: async () => (await api.get('/passport/stats')).data,
  });

  if (isLoading) return (
    <div className="bg-studio-surface border border-studio-border rounded-xl p-6 animate-pulse h-36" />
  );
  if (!stats) return null;

  const maxSessions = Math.max(...stats.monthly.map(m => m.sessions), 1);
  const thisYear = new Date().getFullYear();

  return (
    <div className="bg-studio-surface border border-studio-border rounded-xl p-6 animate-surface-3">
      <div className="flex items-center justify-between mb-5">
        <p className="label-mono">Your momentum</p>
        <p className="text-zinc-600 text-xs font-mono">{thisYear}</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 mb-6 sm:grid-cols-4">
        {[
          { label: 'Total sessions', value: stats.total_sessions },
          { label: 'Hours recorded', value: stats.total_hours + 'h' },
          { label: 'This year',      value: stats.this_year_sessions },
          { label: 'Avg rating',     value: stats.avg_session_rating ? '★ ' + stats.avg_session_rating : '—' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-studio-muted border border-studio-border rounded-lg px-4 py-3">
            <p className="text-zinc-600 text-xs mb-1">{kpi.label}</p>
            <p className="metric-number text-white text-xl animate-metric">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Monthly bar chart */}
      <div>
        <p className="text-zinc-600 text-xs mb-3">Sessions per month</p>
        <div className="flex items-end gap-1 h-14">
          {stats.monthly.map((m) => {
            const now = new Date();
            const isCurrent = m.month === now.getMonth();
            const heightPct = maxSessions > 0 ? (m.sessions / maxSessions) * 100 : 0;
            return (
              <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end justify-center" style={{ height: 44 }}>
                  {m.sessions > 0 && (
                    <div
                      className={`w-full rounded-sm transition-all ${isCurrent ? 'bg-dome' : 'bg-studio-border'}`}
                      style={{ height: `${Math.max(heightPct, 8)}%` }}
                      title={`${MONTH_SHORT[m.month]}: ${m.sessions} session${m.sessions !== 1 ? 's' : ''}, ${m.hours}h`}
                    />
                  )}
                  {m.sessions === 0 && (
                    <div className="w-full rounded-sm bg-studio-border/30" style={{ height: '4%' }} />
                  )}
                </div>
                <span className={`text-[9px] font-mono ${isCurrent ? 'text-dome' : 'text-zinc-700'}`}>
                  {MONTH_SHORT[m.month]}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fav room + engineer */}
      {(stats.fav_room || stats.fav_engineer) && (
        <div className="flex gap-3 mt-5 pt-4 border-t border-studio-border">
          {stats.fav_room && (
            <div className="flex-1 bg-studio-muted border border-studio-border rounded-lg px-3 py-2">
              <p className="text-zinc-600 text-xs">Favourite room</p>
              <p className="text-white text-sm font-medium mt-0.5 truncate">{stats.fav_room}</p>
            </div>
          )}
          {stats.fav_engineer && (
            <div className="flex-1 bg-studio-muted border border-studio-border rounded-lg px-3 py-2">
              <p className="text-zinc-600 text-xs">Favourite engineer</p>
              <p className="text-white text-sm font-medium mt-0.5 truncate">{stats.fav_engineer}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
