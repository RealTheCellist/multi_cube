// --- TargetSubsetVerification (Solver Primitive Integration Sprint v2) ---
// STEP4: re-checks Primitive Discovery Sprint #2's own 77-snapshot
// subset (cycleLength 2~4, conflictEdgeCount=0) against the REAL,
// now-production Candidate Gate -- a reproduction check of Gate
// Relaxation Validation Sprint v1's own STEP4 finding, this time using
// the actual shipped runSuccessV2 rather than a benchmark-only
// reimplementation.
import type { RunRecord } from "./RawDataCollector";

export interface Target77Verification {
  totalInTarget: number;
  baselineSucceededCount: number; // expected 0 by construction
  candidateSucceededAtLeastOnce: number;
  candidateSucceededMajority: number;
  avgCandidateSuccessRate: number;
}

export function verifyTarget77(runs: readonly RunRecord[]): Target77Verification {
  const isTarget = (r: RunRecord[number]) => r.cycleLength >= 2 && r.cycleLength <= 4 && r.conflictEdgeCount === 0;
  const targetHashes = new Set(runs[0].filter(isTarget).map((r) => r.hash));
  const totalInTarget = targetHashes.size;
  const nRuns = runs.length;

  const perHashCandidateSuccessCount = new Map<string, number>();
  let baselineSucceededTotal = 0;
  const perRunCandidateSuccessCount: number[] = [];

  for (const run of runs) {
    let candidateThisRun = 0;
    for (const r of run) {
      if (!targetHashes.has(r.hash)) continue;
      if (r.baselineSucceeded) baselineSucceededTotal++;
      if (r.candidateSucceeded) {
        candidateThisRun++;
        perHashCandidateSuccessCount.set(r.hash, (perHashCandidateSuccessCount.get(r.hash) ?? 0) + 1);
      }
    }
    perRunCandidateSuccessCount.push(candidateThisRun);
  }

  const candidateSucceededAtLeastOnce = [...perHashCandidateSuccessCount.keys()].length;
  const candidateSucceededMajority = [...perHashCandidateSuccessCount.values()].filter((c) => c > nRuns / 2).length;
  const avgCandidateSuccessRate = totalInTarget ? perRunCandidateSuccessCount.reduce((a, b) => a + b, 0) / nRuns / totalInTarget : 0;

  return {
    totalInTarget,
    baselineSucceededCount: baselineSucceededTotal,
    candidateSucceededAtLeastOnce,
    candidateSucceededMajority,
    avgCandidateSuccessRate,
  };
}
