// --- FailureClassification (Gate Relaxation Validation Sprint v1) --------
// STEP4: of the specific 77-snapshot subset Primitive Discovery Sprint #2
// found (cycleLength 2~4, conflictEdgeCount=0 -- inside REPAIR's own
// cycle-length range, excluded only by the conflict-edge requirement),
// how many does G1 actually resolve? This is the Sprint's own core
// question isolated to the exact population it was raised about, rather
// than the whole 335-snapshot dataset's aggregate numbers.
import type { RunRecord } from "./RawDataCollector";

export interface Target77Classification {
  totalInTarget: number; // should be 77 per Primitive Discovery Sprint #2 -- verified empirically here, not assumed
  g0SucceededCount: number; // expected 0 by construction (G0 requires conflictEdgeCount>0)
  g1SucceededAtLeastOnce: number; // count of target-population hashes G1 solved in >=1 run
  g1SucceededMajority: number; // count where G1 solved it in > half of runs (stable, not a fluke)
  avgG1SuccessRate: number; // average across runs of (g1 successes within target population / totalInTarget)
}

export function classifyTarget77(runs: readonly RunRecord[]): Target77Classification {
  const isTarget = (r: RunRecord[number]) => r.cycleLength >= 2 && r.cycleLength <= 4 && r.conflictEdgeCount === 0;
  const targetHashes = new Set(runs[0].filter(isTarget).map((r) => r.hash));
  const totalInTarget = targetHashes.size;
  const nRuns = runs.length;

  const perHashG1SuccessCount = new Map<string, number>();
  let g0SucceededTotal = 0;
  const perRunG1SuccessCount: number[] = [];

  for (const run of runs) {
    let g1ThisRun = 0;
    for (const r of run) {
      if (!targetHashes.has(r.hash)) continue;
      if (r.g0Succeeded) g0SucceededTotal++;
      if (r.g1Succeeded) {
        g1ThisRun++;
        perHashG1SuccessCount.set(r.hash, (perHashG1SuccessCount.get(r.hash) ?? 0) + 1);
      }
    }
    perRunG1SuccessCount.push(g1ThisRun);
  }

  const g1SucceededAtLeastOnce = [...perHashG1SuccessCount.keys()].length;
  const g1SucceededMajority = [...perHashG1SuccessCount.values()].filter((c) => c > nRuns / 2).length;
  const avgG1SuccessRate = totalInTarget ? perRunG1SuccessCount.reduce((a, b) => a + b, 0) / nRuns / totalInTarget : 0;

  return {
    totalInTarget,
    g0SucceededCount: g0SucceededTotal,
    g1SucceededAtLeastOnce,
    g1SucceededMajority,
    avgG1SuccessRate,
  };
}
