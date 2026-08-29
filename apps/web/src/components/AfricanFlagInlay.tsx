import './AfricanFlagInlay.css';
import { useMemo, type CSSProperties } from 'react';

const markets = [
  { code: 'sl', name: 'Sierra Leone' },
  { code: 'ng', name: 'Nigeria' },
  { code: 'gh', name: 'Ghana' },
  { code: 'za', name: 'South Africa' },
  { code: 'tz', name: 'Tanzania' },
  { code: 'cd', name: 'Democratic Republic of the Congo' },
] as const;

function shuffledMarkets(): typeof markets[number][] {
  const order = [...markets];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Decorative country inlay engraved into the master wordmark's A. No market
 * is a fixed default — the cycle order is reshuffled on every mount so all
 * of OIANO's African markets get equal first billing over time. */
export default function AfricanFlagInlay() {
  const order = useMemo(shuffledMarkets, []);

  return (
    <span className="african-flag-inlay" aria-hidden="true">
      {order.map((market, index) => (
        <span
          key={market.code}
          className={`african-flag-inlay__flag is-${market.code}`}
          style={{ '--flag-frame': index } as CSSProperties}
          title={market.name}
        />
      ))}
    </span>
  );
}
