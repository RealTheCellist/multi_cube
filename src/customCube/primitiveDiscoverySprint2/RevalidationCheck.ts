// --- RevalidationCheck (Primitive Discovery Sprint #2) ---------------------
// The pre-REPAIR portion of failures.json (collected before Integration
// Validation Sprint v1 promoted reservedBudget to the production default)
// may contain snapshots the CURRENT solver would now resolve outright --
// stale entries that would wrongly inflate a cluster's "still unresolved"
// count. Reuses failureAnalysis/failureReplay.ts's replayFailure()
// UNMODIFIED (calls the real, unmodified SolverEngine's public solve()
// API, exactly as any other caller) to re-check each pre-cutoff snapshot:
// if a single solve() call now fully resolves it (plan.score >= 0), REPAIR
// (or any other since-shipped change) already closed this specific gap --
// exclude it from the "current failure population" clustering uses.
//
// A single solve() call is a lighter check than the full press-until-stuck
// loop failureAnalysisEngine.ts's own collection uses -- disclosed
// tradeoff, but sufficient here: REPAIR's short-circuit resolves within
// ONE Recovery attempt inside ONE solve() call by construction (that's the
// whole point of the short-circuit), so if REPAIR is what closed a gap,
// one call is enough to see it.
import { replayFailure } from "../failureAnalysis/failureReplay";
import type { FailureDatabase } from "../failureAnalysis/failureDatabase";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";

// The gap between the pre-existing 150-snapshot dataset and this Sprint's
// own fresh collection (STEP1) -- confirmed via the database's own
// timestamps (a ~2.6 day gap sits exactly between snapshot #150 and #151).
export const PRE_REPAIR_CUTOFF_MS = Date.UTC(2026, 6, 20); // 2026-07-20T00:00:00Z

export interface RevalidationRecord {
  hash: string;
  isPreCutoff: boolean;
  nowResolved: boolean; // true only for pre-cutoff snapshots the current solver fully resolves in one call
}

export function revalidateSnapshots(db: FailureDatabase, snapshots: readonly FailureSnapshot[]): RevalidationRecord[] {
  return snapshots.map((s) => {
    const isPreCutoff = s.timestamp < PRE_REPAIR_CUTOFF_MS;
    if (!isPreCutoff) return { hash: s.hash, isPreCutoff, nowResolved: false };
    const result = replayFailure(db, s.hash);
    const nowResolved = !!result && result.plan.score >= 0;
    return { hash: s.hash, isPreCutoff, nowResolved };
  });
}
