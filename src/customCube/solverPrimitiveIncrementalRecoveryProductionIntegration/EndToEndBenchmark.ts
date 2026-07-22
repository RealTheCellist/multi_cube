// --- EndToEndBenchmark (Incremental Recovery Production Integration
// Sprint v1, STEP2-3) --------------------------------------------------------
// Runs ONE real, end-to-end trial across a snapshot subsample: Baseline
// (ProductionSolveMirror.mirrorSolve with pairBudgetMs=undefined --
// reconstructs pre-Sprint behavior) vs Candidate (RealSolveProbe.
// realSolveProbe -- the REAL, unmodified FiveByFiveEdgeSolverEngine.solve(),
// which now uses the real production default FIXED_BUDGET_MS=140).
//
// bestFixOverall/tryEndgameMultiPly's own shuffle() (Math.random()-based)
// makes each solve() call genuinely stochastic -- confirmed directly in
// this Sprint's own smoke test (two calls with the IDENTICAL pairBudgetMs
// on the SAME cube state produced different outcomes on some snapshots).
// This is why STEP5 repeats this whole trial N>=30 times and compares
// TRIAL-LEVEL aggregates via paired-diff, rather than trusting any single
// trial's per-snapshot numbers.
import type { Cubie } from "../cubeState";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { mirrorSolve, buildLibs, type MirrorSolveResult } from "./ProductionSolveMirror";
import { realSolveProbe } from "./RealSolveProbe";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";

export interface PairedSolveResult {
  hash: string;
  baseline: MirrorSolveResult;
  candidate: MirrorSolveResult;
}

export interface TrialAggregate {
  n: number;
  baselineImprovedCount: number;
  candidateImprovedCount: number;
  baselineSolvedCount: number;
  candidateSolvedCount: number;
  baselineAvgWallMs: number;
  candidateAvgWallMs: number;
  baselineDeadlineMissRate: number;
  candidateDeadlineMissRate: number;
  baselineTaskActiveRate: number; // fraction of snapshots with tasksCompleted > 0 -- coarse task-level-capability proxy
  candidateTaskActiveRate: number;
}

export function runOneTrial(snapshots: readonly FailureSnapshot[], libs: ExecutorLibraries): PairedSolveResult[] {
  return snapshots.map((s) => {
    const cubiesForBaseline: Cubie[] = deserializeCube(s.cubeState);
    const cubiesForCandidate: Cubie[] = deserializeCube(s.cubeState);
    const baseline = mirrorSolve(cubiesForBaseline, libs, undefined);
    const candidate = realSolveProbe(cubiesForCandidate);
    return { hash: s.hash, baseline, candidate };
  });
}

export function summarizeTrial(pairs: readonly PairedSolveResult[]): TrialAggregate {
  const n = pairs.length;
  const sum = (f: (p: PairedSolveResult) => number) => pairs.reduce((a, p) => a + f(p), 0);
  return {
    n,
    baselineImprovedCount: pairs.filter((p) => p.baseline.improved).length,
    candidateImprovedCount: pairs.filter((p) => p.candidate.improved).length,
    baselineSolvedCount: pairs.filter((p) => p.baseline.solved).length,
    candidateSolvedCount: pairs.filter((p) => p.candidate.solved).length,
    baselineAvgWallMs: n ? sum((p) => p.baseline.wallMs) / n : 0,
    candidateAvgWallMs: n ? sum((p) => p.candidate.wallMs) / n : 0,
    baselineDeadlineMissRate: n ? pairs.filter((p) => p.baseline.deadlineMissed).length / n : 0,
    candidateDeadlineMissRate: n ? pairs.filter((p) => p.candidate.deadlineMissed).length / n : 0,
    baselineTaskActiveRate: n ? pairs.filter((p) => p.baseline.tasksCompleted > 0).length / n : 0,
    candidateTaskActiveRate: n ? pairs.filter((p) => p.candidate.tasksCompleted > 0).length / n : 0,
  };
}

export { buildLibs };
