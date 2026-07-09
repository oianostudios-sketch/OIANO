export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded bg-studio-muted ${className}`}
      style={{ animation: 'skpulse 1.4s ease-in-out infinite', ...style }}
    />
  );
}

export function SkeletonKPI() {
  return (
    <div className="bg-studio-surface border border-studio-border rounded-xl p-5">
      <style>{`@keyframes skpulse { 0%,100%{opacity:.4} 50%{opacity:.15} }`}</style>
      <Skeleton className="h-2.5 w-24 mb-3" />
      <Skeleton className="h-7 w-16" />
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="bg-studio-surface border border-studio-border rounded-xl px-5 py-4 flex items-center justify-between">
      <div className="space-y-2 flex-1 mr-6">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-2.5 w-52" />
      </div>
      <Skeleton className="h-6 w-20" />
    </div>
  );
}

export function SkeletonArtistCard() {
  return (
    <div className="bg-studio-surface border border-studio-border rounded-xl px-5 py-4 flex items-center justify-between">
      <div className="space-y-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-2.5 w-16" />
      </div>
      <Skeleton className="h-8 w-16" />
    </div>
  );
}
