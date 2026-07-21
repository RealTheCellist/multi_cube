// --- Evaluation (CCR Prototype Sprint v1) ----------------------------------
// STEP5. Applies this arc's own Standard Evaluation Protocol (Majority
// Vote Gap classification + paired-diff 95% CI, N>=15, adaptive
// extension) to Baseline (REPAIR only) vs Candidate (REPAIR + CCR
// Prototype) -- mirroring the exact pattern every prior Sprint's own
// evaluator used (solverPrimitiveIntegrationV2/Evaluation.ts). Reuses
// computeStats (StatsUtil.ts, UNMODIFIED) for all CI arithmetic.
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import type { RunRecord } from "./RawDataCollector";

export function computeMajorityVoteGapSet(runs: readonly RunRecord[]): Set<string> {
  const n = runs.length;
  const perHashGapCount = new Map<string, number>();
  for (const run of runs) {
    for (const r of run) {
      if (r.wasExistingGap) perHashGapCount.set(r.hash, (perHashGapCount.get(r.hash) ?? 0) + 1);
    }
  }
  const hashes = runs[0].map((r) => r.hash);
  return new Set(hashes.filter((h) => (perHashGapCount.get(h) ?? 0) > n / 2));
}

export interface VariantMetrics {
  variant: "baseline" | "candidate";
  totalReplays: number;
  avgMatchedCount: number;
  coverage: number;
  avgSuccessCount: number;
  precision: number;
  gapRescueStats: SampleStats;
  pairedDiffVsBaselineStats: SampleStats;
  regressionCount: number;
}

export function evaluateVariants(runs: readonly RunRecord[]): { baseline: VariantMetrics; candidate: VariantMetrics } {
  const totalReplays = runs[0].length;
  const nRuns = runs.length;
  const majorityGapSet = computeMajorityVoteGapSet(runs);
  const baselineGapRescuePerRun = runs.map((run) => run.filter((r) => r.baselineSucceeded && majorityGapSet.has(r.hash)).length);

  function summarize(variant: "baseline" | "candidate"): VariantMetrics {
    let matchedTotal = 0;
    let successTotal = 0;
    let regressionCount = 0;
    const perRunGapRescue: number[] = [];

    for (const run of runs) {
      let gapRescueThisRun = 0;
      for (const r of run) {
        const matched = variant === "baseline" ? r.baselineMatched : r.candidateMatched;
        const succeeded = variant === "baseline" ? r.baselineSucceeded : r.candidateSucceeded;
        const regressed = variant === "baseline" ? r.baselineRegressed : r.candidateRegressed;
        if (matched) matchedTotal++;
        if (regressed) regressionCount++;
        if (succeeded) {
          successTotal++;
          if (majorityGapSet.has(r.hash)) gapRescueThisRun++;
        }
      }
      perRunGapRescue.push(gapRescueThisRun);
    }

    const gapRescueStats = computeStats(perRunGapRescue);
    const pairedDiff = variant === "baseline" ? perRunGapRescue.map(() => 0) : perRunGapRescue.map((v, i) => v - baselineGapRescuePerRun[i]);
    const pairedDiffVsBaselineStats = computeStats(pairedDiff);

    return {
      variant,
      totalReplays,
      avgMatchedCount: matchedTotal / nRuns,
      coverage: totalReplays ? matchedTotal / nRuns / totalReplays : 0,
      avgSuccessCount: successTotal / nRuns,
      precision: matchedTotal ? successTotal / matchedTotal : 0,
      gapRescueStats,
      pairedDiffVsBaselineStats,
      regressionCount,
    };
  }

  return { baseline: summarize("baseline"), candidate: summarize("candidate") };
}

export interface AdaptiveResult {
  runsUsed: number;
  runs: RunRecord[];
  metrics: { baseline: VariantMetrics; candidate: VariantMetrics };
  reachedDecisive: boolean;
}

export function evaluateAdaptive(collectBatch: (times: number) => RunRecord[], initialN: number, extensionStep: number, maxN: number): AdaptiveResult {
  let runs: RunRecord[] = collectBatch(initialN);
  let metrics = evaluateVariants(runs);
  while (!(metrics.candidate.pairedDiffVsBaselineStats.ciLower > 0 || metrics.candidate.pairedDiffVsBaselineStats.ciUpper < 0) && runs.length < maxN) {
    const remaining = Math.min(extensionStep, maxN - runs.length);
    runs = runs.concat(collectBatch(remaining));
    metrics = evaluateVariants(runs);
  }
  const reachedDecisive = metrics.candidate.pairedDiffVsBaselineStats.ciLower > 0 || metrics.candidate.pairedDiffVsBaselineStats.ciUpper < 0;
  return { runsUsed: runs.length, runs, metrics, reachedDecisive };
}
