// --- cycleUtil (Coverage Expansion Sprint v1) --------------------------------
// Shared helper for this Sprint's own new files (InactivityClassifier.ts,
// CycleChaseSimulator.ts) -- mirrors CycleChasePrototype.ts's own
// tie-breaking rule for picking a cycle (longest first, ties broken by the
// lexicographically-smallest starting slot) without importing that file's
// internals or modifying it.
export function pickLongestCycle(cycles: readonly string[][]): string[] | null {
  if (cycles.length === 0) return null;
  let best = cycles[0];
  for (const c of cycles) {
    if (c.length > best.length || (c.length === best.length && c[0] < best[0])) best = c;
  }
  return best;
}
