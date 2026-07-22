// --- PrototypeEvaluation (Incremental Recovery Prototype Sprint v1) ------
// STEP6/STEP7. Safety Verification (measured directly from N independent
// runs' own attempt logs, not assumed) + Standard Evaluation Protocol,
// reusing computeStats (Solver Primitive Evaluation Stabilization Sprint
// v1's own shared stats helper, UNMODIFIED -- the exact paired-diff 95% CI
// method this whole research program has used for every A/B Primitive
// comparison since) rather than inventing a new statistic.
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import { computeCapabilityMetrics, type PerSnapshotOutcome } from "./PrototypeBenchmark";

export interface SafetyVerificationResult {
  runsChecked: number;
  infiniteRetryViolations: number; // same taskId attempted more than once within one solve -- expected 0 by construction (single pass over the fixed tasks array)
  duplicateInvocationCount: number; // same cube stateHash (computeEdgeSolverStateHash) attempted via Incremental Recovery more than once within one solve, across DIFFERENT task slots -- the real risk the Blueprint's Safety Contract flagged
  schedulerLoopNote: string; // structural verification note, not a per-run count -- see rationale below
  budgetOverrunCount: number;
  budgetAttemptsWithUsage: number;
  totalRegressionCount: number; // summed across all runs -- baselineSolved && !candidateSolved
  totalRegressionOpportunities: number; // summed baselineSolvedCount across all runs (the population regression could occur against)
}

export function verifySafety(runsOfOutcomes: readonly (readonly PerSnapshotOutcome[])[]): SafetyVerificationResult {
  let infiniteRetryViolations = 0;
  let duplicateInvocationCount = 0;
  let budgetOverrunCount = 0;
  let budgetAttemptsWithUsage = 0;
  let totalRegressionCount = 0;
  let totalRegressionOpportunities = 0;

  for (const outcomes of runsOfOutcomes) {
    for (const o of outcomes) {
      const taskIdSeen = new Set<number>();
      const stateHashSeen = new Set<number>();
      for (const entry of o.incrementalAttempts) {
        if (taskIdSeen.has(entry.taskId)) infiniteRetryViolations++;
        taskIdSeen.add(entry.taskId);

        if (stateHashSeen.has(entry.stateHashBefore)) duplicateInvocationCount++;
        stateHashSeen.add(entry.stateHashBefore);

        for (const usage of [entry.attempt.repairUsage, entry.attempt.ccrUsage]) {
          if (!usage) continue;
          budgetAttemptsWithUsage++;
          if (usage.overrun) budgetOverrunCount++;
        }
      }
    }
    const metrics = computeCapabilityMetrics(outcomes);
    totalRegressionCount += metrics.regressionCount;
    totalRegressionOpportunities += metrics.baselineSolvedCount;
  }

  return {
    runsChecked: runsOfOutcomes.length,
    infiniteRetryViolations,
    duplicateInvocationCount,
    schedulerLoopNote:
      "구조적 검증: IncrementalScheduler.runCandidateSolve()는 fiveByFiveEdgePlanner.ts를 전혀 import하지 않고, planEdgeTasks()는 (Production과 동일하게) 한 solve당 정확히 1회만 호출된다 -- Incremental Recovery 호출부(attemptIncrementalRecovery)는 Planner의 simulateStrategy() 미리보기 경로에 전혀 배선되지 않는다(코드상 import 자체가 없음). Production의 allowRecovery=true는 이 Scheduler의 top-level 루프에서만 전달되며, Planner 코드는 이번 Sprint에서 한 줄도 수정/재구현하지 않았다.",
    budgetOverrunCount,
    budgetAttemptsWithUsage,
    totalRegressionCount,
    totalRegressionOpportunities,
  };
}

export interface StandardEvaluationResult {
  runCount: number;
  baselineSolvedStats: SampleStats;
  candidateSolvedStats: SampleStats;
  pairedDiffStats: SampleStats; // per-run (candidateSolvedCount - baselineSolvedCount)
  pairedDiffCIExcludesZero: boolean; // ciLower > 0 -- this Sprint's own Level 2 criterion
}

export function evaluateStandardProtocol(runsOfOutcomes: readonly (readonly PerSnapshotOutcome[])[]): StandardEvaluationResult {
  const baselineCounts = runsOfOutcomes.map((outcomes) => computeCapabilityMetrics(outcomes).baselineSolvedCount);
  const candidateCounts = runsOfOutcomes.map((outcomes) => computeCapabilityMetrics(outcomes).candidateSolvedCount);
  const pairedDiffs = runsOfOutcomes.map((_r, i) => candidateCounts[i] - baselineCounts[i]);

  const baselineSolvedStats = computeStats(baselineCounts);
  const candidateSolvedStats = computeStats(candidateCounts);
  const pairedDiffStats = computeStats(pairedDiffs);

  return {
    runCount: runsOfOutcomes.length,
    baselineSolvedStats,
    candidateSolvedStats,
    pairedDiffStats,
    pairedDiffCIExcludesZero: pairedDiffStats.ciLower > 0,
  };
}
