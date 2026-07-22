// --- RealTryFixWingProbe (Incremental Recovery Production Integration
// Sprint v1, STEP1 correction) ------------------------------------------------
// SELF-CAUGHT METHODOLOGY FIX (round 2): a first version of this probe
// used a generous 5000ms outer deadline to isolate the 140ms per-call cap
// in a vacuum -- it found a real per-call effect (abort rate 57.6%,
// avgRuntimeMs 591.6ms baseline vs 416.3ms candidate on n=314 real wrong
// wings), but that generous-deadline setup does NOT match real production:
// the REAL PAIR-task call site (fiveByFiveEdgeExecutor.ts's
// runPrimaryPipeline) passes `localDeadline = Math.min(deadline, Date.now()
// + TASK_LOCAL_BUDGET_MS)` with TASK_LOCAL_BUDGET_MS=120 -- TIGHTER than
// this Sprint's own FIXED_BUDGET_MS=140. Since `perCallDeadline(d) =
// Math.min(d, now+140)` and `d` is already <=120ms out, the per-call cap
// numerically reduces to just `d` itself in real production -- meaning the
// NEW effect isn't "a tighter 140ms sub-budget," it's "the EXISTING outer
// deadline finally gets enforced INSIDE a single bfsMoveWingToPosition call
// (which had ZERO internal time awareness before this Sprint), instead of
// only being checked BETWEEN library entries."
//
// This module now probes BOTH scenarios explicitly, parametrized by
// `outerDeadlineMs`: the isolated/generous case (no outer interference,
// isolates the per-call cap in a vacuum) AND the production-realistic case
// (outerDeadlineMs=120, matching TASK_LOCAL_BUDGET_MS exactly) -- the
// latter is what actually matters for this Sprint's Level2 judgment.
import type { Cubie } from "../cubeState";
import { wrongWings5, tryFixWing, type WingLibrary } from "../fiveByFiveEdges";

export const PRODUCTION_OUTER_DEADLINE_MS = 120; // mirrors fiveByFiveEdgeExecutor.ts's own TASK_LOCAL_BUDGET_MS exactly
export const ISOLATED_OUTER_DEADLINE_MS = 5000; // generous, isolates the per-call cap from any outer interference

export interface TryFixWingProbeRecord {
  hash: string;
  pieceId: number;
  runtimeMs: number;
  found: boolean;
}

export function probeAllWrongWings(
  snapshots: readonly { hash: string; cubies: Cubie[] }[],
  lib: WingLibrary,
  pairBudgetMs: number | undefined,
  outerDeadlineMs: number
): TryFixWingProbeRecord[] {
  const records: TryFixWingProbeRecord[] = [];
  for (const s of snapshots) {
    const wrongs = wrongWings5(s.cubies);
    for (const w of wrongs) {
      const deadline = Date.now() + outerDeadlineMs;
      const start = Date.now();
      const result = tryFixWing(s.cubies, w, lib, deadline, pairBudgetMs);
      const runtimeMs = Date.now() - start;
      records.push({ hash: s.hash, pieceId: w.id, runtimeMs, found: result !== null });
    }
  }
  return records;
}

export interface TryFixWingProbeSummary {
  n: number;
  callCount: number;
  avgRuntimeMs: number;
  avgBudgetUsagePct: number; // avgRuntimeMs / outerDeadlineMs * 100 -- the REAL budget target in production is the outer deadline, not pairBudgetMs (see file header)
  abortRate: number; // fraction with runtimeMs >= outerDeadlineMs (exact criterion, same reasoning as BudgetSweep.ts)
  overrunRate: number; // fraction with runtimeMs > outerDeadlineMs + tolerance
}

const OVERRUN_TOLERANCE_MS = 5;

/** `outerDeadlineMs` here must be the SAME value used to build the deadline passed to probeAllWrongWings, so overrun/abort are measured against the real production target regardless of whether pairBudgetMs is defined. */
export function summarizeTryFixWingProbe(records: readonly TryFixWingProbeRecord[], outerDeadlineMs: number): TryFixWingProbeSummary {
  const n = records.length;
  const avgRuntimeMs = n ? records.reduce((a, r) => a + r.runtimeMs, 0) / n : 0;
  const abortCount = records.filter((r) => r.runtimeMs >= outerDeadlineMs).length;
  const overrunCount = records.filter((r) => r.runtimeMs > outerDeadlineMs + OVERRUN_TOLERANCE_MS).length;
  return {
    n,
    callCount: n,
    avgRuntimeMs,
    avgBudgetUsagePct: outerDeadlineMs > 0 ? (avgRuntimeMs / outerDeadlineMs) * 100 : 0,
    abortRate: n ? abortCount / n : 0,
    overrunRate: n ? overrunCount / n : 0,
  };
}
