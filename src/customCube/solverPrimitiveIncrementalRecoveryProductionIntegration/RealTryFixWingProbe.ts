// --- RealTryFixWingProbe (Incremental Recovery Production Integration
// Sprint v1, STEP1 correction) ------------------------------------------------
// SELF-CAUGHT METHODOLOGY FIX: EndToEndBenchmark.ts's whole-solve()-level
// "Deadline Miss" (did the ENTIRE 1-second plan budget get exhausted) is a
// fundamentally different, much coarser measurement than the per-call
// Budget Compliance Architecture Prototype Refinement Sprint v1 actually
// validated (does a SINGLE tryFixWing call stay within its own 140ms cap).
// A smoke run confirmed this directly: whole-solve Deadline Miss rate came
// out IDENTICAL between baseline and candidate (40.89% both), because
// OTHER unwired phases (bestFixOverall/tryEndgameMultiPly in the ENDGAME
// branch, deliberately out of this Sprint's scope) can still consume the
// entire plan budget regardless of whether the PAIR branch's tryFixWing
// calls are individually bounded. Comparing that number against the
// Prototype's 99.29% figure would be an apples-to-oranges error.
//
// This module measures the SAME layer the Prototype did: calls the REAL,
// unmodified tryFixWing() directly (not a disclosed reimplementation, an
// actual improvement in fidelity over the Prototype's own bfsMoveWingToPosition-
// level proxy) on every real wrong wing drawn from real snapshots, with a
// generous outer `deadline` (so the outer-deadline check never interferes)
// and pairBudgetMs=undefined (baseline) vs 140 (candidate), to verify: is
// the budget actually passed through, how many calls are made, what's the
// average budget usage, and what fraction actually abort.
import type { Cubie } from "../cubeState";
import { wrongWings5, tryFixWing, type WingLibrary } from "../fiveByFiveEdges";

const GENEROUS_OUTER_DEADLINE_SLACK_MS = 5000; // so the outer `deadline` param itself never fires first

export interface TryFixWingProbeRecord {
  hash: string;
  pieceId: number;
  runtimeMs: number;
  found: boolean;
}

export function probeAllWrongWings(
  snapshots: readonly { hash: string; cubies: Cubie[] }[],
  lib: WingLibrary,
  pairBudgetMs: number | undefined
): TryFixWingProbeRecord[] {
  const records: TryFixWingProbeRecord[] = [];
  for (const s of snapshots) {
    const wrongs = wrongWings5(s.cubies);
    for (const w of wrongs) {
      const deadline = Date.now() + GENEROUS_OUTER_DEADLINE_SLACK_MS;
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
  avgBudgetUsagePct: number; // avgRuntimeMs / pairBudgetMs * 100, only meaningful when pairBudgetMs is defined
  abortRate: number; // fraction with runtimeMs >= pairBudgetMs (exact criterion, same reasoning as BudgetSweep.ts)
  overrunRate: number; // fraction with runtimeMs > pairBudgetMs + tolerance
}

const OVERRUN_TOLERANCE_MS = 5;

export function summarizeTryFixWingProbe(records: readonly TryFixWingProbeRecord[], pairBudgetMs: number | undefined): TryFixWingProbeSummary {
  const n = records.length;
  const avgRuntimeMs = n ? records.reduce((a, r) => a + r.runtimeMs, 0) / n : 0;
  const abortCount = pairBudgetMs !== undefined ? records.filter((r) => r.runtimeMs >= pairBudgetMs).length : 0;
  const overrunCount = pairBudgetMs !== undefined ? records.filter((r) => r.runtimeMs > pairBudgetMs + OVERRUN_TOLERANCE_MS).length : 0;
  return {
    n,
    callCount: n,
    avgRuntimeMs,
    avgBudgetUsagePct: pairBudgetMs !== undefined && pairBudgetMs > 0 ? (avgRuntimeMs / pairBudgetMs) * 100 : 0,
    abortRate: n && pairBudgetMs !== undefined ? abortCount / n : 0,
    overrunRate: n && pairBudgetMs !== undefined ? overrunCount / n : 0,
  };
}
