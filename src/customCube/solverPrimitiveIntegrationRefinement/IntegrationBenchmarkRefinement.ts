// --- IntegrationBenchmarkRefinement (Solver Primitive Integration
// Refinement Sprint v1) -- STEP3: applies Evaluation Stabilization Sprint
// v2's confirmed Standard Evaluation Protocol (Majority Vote Gap
// classification + paired-diff 95% CI, N>=15) to this Sprint's own
// scheduling variants, mirroring solverPrimitivePrototypeRefinementV2/
// StandardProtocolEvaluation.ts's own established pattern exactly. Reuses
// computeStats (StatsUtil.ts, UNMODIFIED) for the CI arithmetic -- no
// re-derivation of the statistical machinery.
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import type { SchedulingStrategy } from "../fiveByFiveEdgeRecovery";
import type { GapRunRecord, VariantGenerationRun } from "./RefinementRawDataCollector";

export function computeMajorityVoteGapSet(gapRuns: readonly GapRunRecord[]): Set<string> {
  const n = gapRuns.length;
  const perHashGapCount = new Map<string, number>();
  for (const run of gapRuns) {
    for (const r of run) {
      if (r.isGap) perHashGapCount.set(r.hash, (perHashGapCount.get(r.hash) ?? 0) + 1);
    }
  }
  const hashes = gapRuns[0].map((r) => r.hash);
  return new Set(hashes.filter((h) => (perHashGapCount.get(h) ?? 0) > n / 2));
}

export interface VariantCapabilityMetrics {
  strategy: SchedulingStrategy;
  totalReplays: number;
  coverage: number; // average per-run REPAIR-generated rate
  precision: number; // success rate among generated
  gapRescueStats: SampleStats; // per-run GapRescue count against the FIXED Majority-Vote Gap set
  pairedDiffVsBaselineStats: SampleStats; // per-run (this strategy - baseline), same run's own values, same Gap set
  regressionCount: number; // summed across all runs -- should be 0 by construction (Deferred Validation), checked empirically
}

export function evaluateSchedulingCapability(runsByStrategy: Record<SchedulingStrategy, VariantGenerationRun[]>, gapRuns: readonly GapRunRecord[]): VariantCapabilityMetrics[] {
  const majorityGapSet = computeMajorityVoteGapSet(gapRuns);
  const strategies: SchedulingStrategy[] = ["baseline", "priorityGate", "reservedBudget"];
  const totalReplays = runsByStrategy.baseline[0].length;
  const nRuns = runsByStrategy.baseline.length;

  const baselineGapRescuePerRun = runsByStrategy.baseline.map((run) => run.filter((r) => r.repairSucceeded && majorityGapSet.has(r.hash)).length);

  return strategies.map((strategy) => {
    const runs = runsByStrategy[strategy];
    let matchedTotal = 0;
    let successTotal = 0;
    let regressionCount = 0;
    const perRunGapRescue: number[] = [];

    for (const run of runs) {
      let gapRescueThisRun = 0;
      for (const r of run) {
        if (r.repairGenerated) matchedTotal++;
        if (r.repairRegressed) regressionCount++;
        if (r.repairSucceeded) {
          successTotal++;
          if (majorityGapSet.has(r.hash)) gapRescueThisRun++;
        }
      }
      perRunGapRescue.push(gapRescueThisRun);
    }

    const gapRescueStats = computeStats(perRunGapRescue);
    const pairedDiff = perRunGapRescue.map((v, i) => v - baselineGapRescuePerRun[i]);
    const pairedDiffVsBaselineStats = computeStats(pairedDiff);

    return {
      strategy,
      totalReplays,
      coverage: totalReplays ? matchedTotal / nRuns / totalReplays : 0,
      precision: matchedTotal ? successTotal / matchedTotal : 0,
      gapRescueStats,
      pairedDiffVsBaselineStats,
      regressionCount,
    };
  });
}
