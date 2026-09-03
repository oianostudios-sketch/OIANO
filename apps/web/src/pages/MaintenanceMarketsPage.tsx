import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Globe2, MapPin, Users2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import MaintenanceShell from '../components/MaintenanceShell';
import { api } from '../lib/api';

type Market = {
  region: string; continent: string;
  studios: Array<{ id: string; name: string; currency: string }>;
  studio_count: number; bookings: number; gmv_collected_usd: number;
  artists_reachable: number; revenue_activated: boolean;
};
type ArtistGeo = { total_artists: number; with_location: number; with_public_location: number; status: 'INSUFFICIENT_DATA' | 'PARTIAL' };
type Markets = { generated_at: string; markets: Market[]; single_studio_markets: number; artist_geo: ArtistGeo };

const usd = (n: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(n);

export default function MaintenanceMarketsPage() {
  const nav = useNavigate();
  const { data, isLoading, error } = useQuery<Markets>({
    queryKey: ['maintenance-markets'],
    queryFn: async () => (await api.get('/maintenance/markets')).data,
    refetchInterval: 60000,
  });

  return (
    <MaintenanceShell>
      <div className="mx-auto max-w-[1100px] px-5 py-10 md:px-8">
        <button onClick={() => nav('/maintenance')} className="mb-7 flex items-center gap-2 text-xs text-zinc-600 hover:text-white">
          <ArrowLeft size={13} />Network overview
        </button>
        <p className="mb-3 text-[9px] font-mono uppercase tracking-[.28em] text-dome">Business · Markets</p>
        <h1 className="font-display text-4xl">Where the network operates.</h1>
        <p className="mt-3 max-w-2xl text-sm text-zinc-600">
          Grouped by each studio's own operating timezone — real, already-stored data, not a new field. This describes where studios run, not where artists are from.
        </p>

        {isLoading ? (
          <p className="mt-14 text-xs text-zinc-700">Placing studios on the map…</p>
        ) : error || !data ? (
          <p className="mt-12 text-red-400">Market intelligence unavailable.</p>
        ) : (
          <>
            {data.single_studio_markets > 0 && (
              <div className="mt-8 flex items-start gap-3 rounded-xl border border-amber-500/15 bg-amber-500/[.03] p-4">
                <MapPin size={14} className="mt-0.5 shrink-0 text-amber-400" />
                <p className="text-[11px] leading-5 text-zinc-500">
                  {data.single_studio_markets} of {data.markets.length} region{data.markets.length === 1 ? '' : 's'} currently {data.single_studio_markets === 1 ? 'has' : 'have'} exactly one studio. At that scale, "market" and "studio" are the same thing — real supply-vs-demand comparison within a region needs more than one studio in it.
                </p>
              </div>
            )}

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.markets.map((market) => (
                <article key={market.region} className="rounded-2xl border border-white/[.065] bg-studio-surface p-5">
                  <div className="flex items-center gap-2">
                    <Globe2 size={14} className="text-dome" />
                    <h2 className="text-sm font-semibold">{market.region}</h2>
                  </div>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-700">{market.continent} · {market.studio_count} studio{market.studio_count === 1 ? '' : 's'}</p>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xl font-semibold">{market.bookings}</p>
                      <p className="mt-1 text-[9px] uppercase tracking-wider text-zinc-600">Bookings</p>
                    </div>
                    <div>
                      <p className="text-xl font-semibold text-[#C9A84C]">{usd(market.gmv_collected_usd)}</p>
                      <p className="mt-1 text-[9px] uppercase tracking-wider text-zinc-600">Collected</p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-[10px] text-zinc-500">
                    <Users2 size={11} />{market.artists_reachable} distinct artist{market.artists_reachable === 1 ? '' : 's'} served here
                  </div>

                  <div className="mt-3">
                    <span className={`rounded-full px-2.5 py-1 text-[9px] uppercase ${market.revenue_activated ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/[.05] text-zinc-600'}`}>
                      {market.revenue_activated ? 'Platform fee active' : 'No platform fee configured'}
                    </span>
                  </div>

                  <div className="mt-4 border-t border-white/[.05] pt-3">
                    {market.studios.map((studio) => (
                      <p key={studio.id} className="text-[10px] text-zinc-600">{studio.name} <span className="text-zinc-800">· {studio.currency}</span></p>
                    ))}
                  </div>
                </article>
              ))}
            </div>

            <article className="mt-5 rounded-2xl border border-white/[.065] bg-studio-surface p-6">
              <h2 className="text-sm font-semibold">Where artists are, not just studios</h2>
              <p className="mt-2 max-w-xl text-xs leading-5 text-zinc-600">
                Artists can privately share where they're creating from during onboarding. That data is honest about its own limits rather than pretending to be more than it is.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-4">
                <span className={`rounded-full px-3 py-1.5 text-[9px] uppercase tracking-wider ${data.artist_geo.status === 'INSUFFICIENT_DATA' ? 'bg-white/[.05] text-zinc-500' : 'bg-amber-500/10 text-amber-400'}`}>
                  {data.artist_geo.status === 'INSUFFICIENT_DATA' ? 'Insufficient data' : 'Partial data'}
                </span>
                <span className="text-[11px] text-zinc-600">
                  {data.artist_geo.with_public_location} of {data.artist_geo.total_artists} artists have published a public location
                  {data.artist_geo.with_location > data.artist_geo.with_public_location && ` (${data.artist_geo.with_location} have entered one privately)`}.
                </span>
              </div>
            </article>
            <p className="mt-5 text-right text-[8px] font-mono text-zinc-800">Checked {new Date(data.generated_at).toLocaleString()}</p>
          </>
        )}
      </div>
    </MaintenanceShell>
  );
}
