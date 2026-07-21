// --- CCRTargetSubsetVerification (CCR Prototype Sprint v1) -----------------
// STEP5's own dedicated check on the 173-snapshot CCR target subset
// (cycleLength 5~6, conflictEdgeCount=0), mirroring
// solverPrimitiveIntegrationV2/TargetSubsetVerification.ts's own 77-subset
// pattern exactly, applied to CCR's own target instead.
import type { RunRecord } from "./RawDataCollector";

export interface TargetSubsetVerification {
  totalInTarget: number;
  baselineSucceededCount: number; // expected 0 by construction -- REPAIR's own Gate structurally excludes cycleLength 5~6
  candidateSucceededAtLeastOnce: number;
  candidateSucceededMajority: number;
  avgCandidateSuccessRate: number;
}

export function verifyCcrTargetSubset(runs: readonly RunRecord[]): TargetSubsetVerification {
  const targetHashes = new Set(runs[0].filter((r) => r.isCcrTarget).map((r) => r.hash));
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
