// --- IntegrationBenchmarkComparison (Solver Primitive Integration
// Prototype Sprint v1) -- STEP5: 기존 Production Solver(REPAIR 미포함,
// includeRepair=false -- pre-Integration counterfactual) vs REPAIR 포함
// Solver(includeRepair=true, shortCircuitRepair=true -- the REAL, actual
// production default as of this Sprint's STEP1) on the full 150-replay
// Dataset, using ShadowSolveLoop's runShadowSolve (byte-identical
// reimplementation of solve()'s own orchestration, since solve() itself
// cannot be parametrized or modified -- see that file's own comment).
//
// This dataset (failures.json) is BY CONSTRUCTION composed of historical
// solver FAILURES -- cube states the existing solver could not fully
// pair within its time budget. A "Solve Rate" (wrongWingAfter===0,
// COMPLETE plan) metric therefore floors near 0% regardless of any
// primitive's real contribution (still reported below for transparency,
// but not used as the Level 3 decision criterion). The Evaluation
// Stabilization Sprint v2's own confirmed Standard Evaluation Protocol
// (paired-diff 95% CI, computed within the SAME run so both arms share
// identical ground truth per snapshot) is the correct instrument here --
// applied via the wrongWing-improvement paired diff below, reusing
// StatsUtil.ts's computeStats UNMODIFIED, exactly as every prior
// Sprint's Integration-approval comparison in this research series used it.
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import { runShadowSolve, type ShadowSolveResult } from "./ShadowSolveLoop";

export interface SolverArmSummary {
  label: "기존 (REPAIR 미포함)" | "REPAIR 포함 (실제 production 기본값)";
  n: number;
  solveRate: number; // wrongWingAfter === 0
  avgMoveCount: number;
  avgTimeMs: number;
  maxTimeMs: number;
  timeoutOverPlanBudgetCount: number; // timeMs > PLAN_TIME_BUDGET_MS(1000) -- should never happen, both loops enforce it internally, checked here as an independent sanity check
  recoveryTriggeredCount: number;
  repairGeneratedCount: number;
  repairShortCircuitCount: number;
  regressionCount: number; // wrongWingAfter > wrongWingBefore
  results: ShadowSolveResult[];
}

function summarizeArm(label: SolverArmSummary["label"], results: ShadowSolveResult[]): SolverArmSummary {
  const n = results.length;
  return {
    label,
    n,
    solveRate: results.filter((r) => r.wrongWingAfter === 0).length / n,
    avgMoveCount: results.reduce((a, r) => a + r.moveCount, 0) / n,
    avgTimeMs: results.reduce((a, r) => a + r.timeMs, 0) / n,
    maxTimeMs: Math.max(...results.map((r) => r.timeMs)),
    timeoutOverPlanBudgetCount: results.filter((r) => r.timeMs > 1000).length,
    recoveryTriggeredCount: results.reduce((a, r) => a + r.recoveryTriggeredCount, 0),
    repairGeneratedCount: results.reduce((a, r) => a + r.repairGeneratedCount, 0),
    repairShortCircuitCount: results.reduce((a, r) => a + r.repairShortCircuitCount, 0),
    regressionCount: results.filter((r) => r.wrongWingAfter > r.wrongWingBefore).length,
    results,
  };
}

export interface IntegrationBenchmarkResult {
  before: SolverArmSummary;
  after: SolverArmSummary;
  solveRateDelta: number;
  avgMoveCountDelta: number;
  avgTimeMsDelta: number;
  regressionDelta: number;
  // per-snapshot pairs where `after` solved and `before` did not (net rescues), and the reverse (net losses)
  rescuedHashes: string[];
  lostHashes: string[];
  // Standard Evaluation Protocol (Evaluation Stabilization Sprint v2):
  // paired-diff per snapshot of (wrongWingBefore-wrongWingAfter) improvement,
  // after arm minus before arm -- positive means REPAIR arm made MORE
  // progress on that snapshot than the baseline arm, computed within the
  // SAME run so both arms share identical ground truth per snapshot.
  pairedImprovementDiffStats: SampleStats;
}

export function runIntegrationBenchmark(snapshots: readonly FailureSnapshot[], libs: ExecutorLibraries): IntegrationBenchmarkResult {
  const beforeResults: ShadowSolveResult[] = [];
  const afterResults: ShadowSolveResult[] = [];
  const rescuedHashes: string[] = [];
  const lostHashes: string[] = [];
  const improvementDiffs: number[] = [];

  for (const s of snapshots) {
    const cubiesBefore = deserializeCube(s.cubeState);
    const before = runShadowSolve(cubiesBefore, libs, false, false);
    const cubiesAfter = deserializeCube(s.cubeState);
    const after = runShadowSolve(cubiesAfter, libs, true, true);

    beforeResults.push(before);
    afterResults.push(after);

    const beforeSolved = before.wrongWingAfter === 0;
    const afterSolved = after.wrongWingAfter === 0;
    if (afterSolved && !beforeSolved) rescuedHashes.push(s.hash);
    if (beforeSolved && !afterSolved) lostHashes.push(s.hash);

    const beforeImprovement = before.wrongWingBefore - before.wrongWingAfter;
    const afterImprovement = after.wrongWingBefore - after.wrongWingAfter;
    improvementDiffs.push(afterImprovement - beforeImprovement);
  }

  const before = summarizeArm("기존 (REPAIR 미포함)", beforeResults);
  const after = summarizeArm("REPAIR 포함 (실제 production 기본값)", afterResults);

  return {
    before,
    after,
    solveRateDelta: after.solveRate - before.solveRate,
    avgMoveCountDelta: after.avgMoveCount - before.avgMoveCount,
    avgTimeMsDelta: after.avgTimeMs - before.avgTimeMs,
    regressionDelta: after.regressionCount - before.regressionCount,
    rescuedHashes,
    lostHashes,
    pairedImprovementDiffStats: computeStats(improvementDiffs),
  };
}
