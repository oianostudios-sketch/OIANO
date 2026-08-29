import { useMemo } from 'react';

type SignatureUniverseProps = { intensified?: boolean };

function seededStars(count: number) {
  let seed = 0x0a1a0;
  return Array.from({ length: count }, (_, index) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const x = (seed % 10000) / 100;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const y = (seed % 7200) / 100;
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const size = 0.7 + (seed % 18) / 10;
    return { index, x, y, size, delay: -((seed % 9000) / 1000) };
  });
}

/** CSS-only depth keeps the access page atmospheric without shipping WebGL. */
export default function SignatureUniverse3D({ intensified = false }: SignatureUniverseProps) {
  const stars = useMemo(() => seededStars(96), []);
  return (
    <div className={`signature-universe${intensified ? ' is-intensified' : ''}`} aria-hidden="true">
      <div className="signature-universe__stars">
        {stars.map((star) => <i key={star.index} style={{ left: `${star.x}%`, top: `${star.y}%`, width: star.size, height: star.size, animationDelay: `${star.delay}s` }} />)}
      </div>
      <div className="signature-universe__horizon" />
      <div className="signature-universe__orbit" />
      <div className="signature-universe__veil" />
      <style>{`
        .signature-universe{position:absolute;inset:0;overflow:hidden;background:radial-gradient(circle at 50% 78%,rgba(201,168,76,.095),transparent 31%),radial-gradient(circle at 54% 76%,rgba(90,155,203,.065),transparent 37%),#010102;contain:strict}
        .signature-universe__stars{position:absolute;inset:0;opacity:.72;transition:opacity .4s ease}.signature-universe__stars i{position:absolute;border-radius:50%;background:#e4ca83;box-shadow:0 0 5px rgba(226,201,126,.38);animation:universe-star-breathe 7s ease-in-out infinite}
        .signature-universe__horizon{position:absolute;left:50%;bottom:-64%;width:118%;aspect-ratio:1;border-radius:50%;transform:translateX(-50%);background:radial-gradient(circle at 49% 14%,rgba(55,38,13,.2),#080502 37%,#020202 62%);box-shadow:inset 0 0 80px rgba(0,0,0,.9),0 -1px 0 rgba(226,201,126,.14),0 -22px 65px rgba(201,168,76,.055)}
        .signature-universe__orbit{position:absolute;left:50%;bottom:-3%;width:92%;height:27%;border:1px solid rgba(226,201,126,.09);border-radius:50%;transform:translateX(-50%) rotate(-7deg);box-shadow:0 0 28px rgba(201,168,76,.025);transition:border-color .4s ease,box-shadow .4s ease}
        .signature-universe__veil{position:absolute;inset:0;background:linear-gradient(180deg,transparent 48%,rgba(0,0,0,.5))}.signature-universe.is-intensified .signature-universe__stars{opacity:.95}.signature-universe.is-intensified .signature-universe__orbit{border-color:rgba(226,201,126,.19);box-shadow:0 0 42px rgba(201,168,76,.07)}
        @keyframes universe-star-breathe{0%,100%{opacity:.34;transform:scale(.78)}50%{opacity:.88;transform:scale(1.08)}}@media(prefers-reduced-motion:reduce){.signature-universe__stars i{animation:none;opacity:.58}}
      `}</style>
    </div>
  );
}
