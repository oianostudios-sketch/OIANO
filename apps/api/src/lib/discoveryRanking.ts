// Discovery's order among artists: shared taste first, then completed sessions —
// work other people took part in. Profile completeness is what an artist says
// about themselves, so it never ranks anyone (C18).
export function byOverlapThenCompletedWork<T extends { id: string; overlap_score: number }>(
  candidates: T[],
  completedSessions: ReadonlyMap<string, number>,
): T[] {
  return [...candidates].sort((a, b) =>
    b.overlap_score - a.overlap_score || (completedSessions.get(b.id) ?? 0) - (completedSessions.get(a.id) ?? 0));
}
