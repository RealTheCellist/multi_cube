// --- Evaluation (Gate Relaxation Validation Sprint v1) --------------------
// Applies Evaluation Stabilization Sprint v2's confirmed Standard
// Evaluation Protocol (Majority Vote Gap classification + paired-diff 95%
// CI, N>=15, adaptive extension) to G0 vs G1, mirroring the exact pattern
// solverPrimitivePrototypeRefinementV2/StandardProtocolEvaluation.ts and
// solverPrimitiveIntegrationRefinement's own evaluators already
// established. Reuses computeStats (StatsUtil.ts, UNMODIFIED) for all CI
// arithmetic -- no re-derivation of the statistical machinery.
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
  variant: "G0" | "G1";
  totalReplays: number;
  avgMatchedCount: number;
  coverage: number;
  avgSuccessCount: number;
  precision: number;
  gapRescueStats: SampleStats;
  pairedDiffVsG0Stats: SampleStats; // (G1 - G0), always zero-vector for G0 itself
  regressionCount: number;
}

export function evaluateVariants(runs: readonly RunRecord[]): { g0: VariantMetrics; g1: VariantMetrics } {
  const totalReplays = runs[0].length;
  const nRuns = runs.length;

  const majorityGapSet = computeMajorityVoteGapSet(runs);
  const g0GapRescuePerRun = runs.map((run) => run.filter((r) => r.g0Succeeded && majorityGapSet.has(r.hash)).length);

  function summarize(variant: "G0" | "G1"): VariantMetrics {
    let matchedTotal = 0;
    let successTotal = 0;
    let regressionCount = 0;
    const perRunGapRescue: number[] = [];

    for (const run of runs) {
      let gapRescueThisRun = 0;
      for (const r of run) {
        const matched = variant === "G0" ? r.g0Matched : r.g1Matched;
        const succeeded = variant === "G0" ? r.g0Succeeded : r.g1Succeeded;
        const regressed = variant === "G0" ? r.g0Regressed : r.g1Regressed;
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
    const pairedDiff = variant === "G0" ? perRunGapRescue.map(() => 0) : perRunGapRescue.map((v, i) => v - g0GapRescuePerRun[i]);
    const pairedDiffVsG0Stats = computeStats(pairedDiff);

    return {
      variant,
      totalReplays,
      avgMatchedCount: matchedTotal / nRuns,
      coverage: totalReplays ? matchedTotal / nRuns / totalReplays : 0,
      avgSuccessCount: successTotal / nRuns,
      precision: matchedTotal ? successTotal / matchedTotal : 0,
      gapRescueStats,
      pairedDiffVsG0Stats,
      regressionCount,
    };
  }

  return { g0: summarize("G0"), g1: summarize("G1") };
}

/** Adaptive-extension driver: runs collectRun-based batches until the
 * paired-diff CI excludes zero OR a hard cap on total runs is reached --
 * per the Standard Evaluation Protocol's own documented behavior
 * ("최소 N회를 표준으로 하되 CI가 0을 배제하지 못하면 그때 추가 Run으로
 * 확장한다"), rather than always running a single fixed N. */
export interface AdaptiveResult {
  runsUsed: number;
  runs: RunRecord[];
  metrics: { g0: VariantMetrics; g1: VariantMetrics };
  reachedDecisive: boolean;
}

export function evaluateAdaptive(collectBatch: (times: number) => RunRecord[], initialN: number, extensionStep: number, maxN: number): AdaptiveResult {
  let runs: RunRecord[] = collectBatch(initialN);
  let metrics = evaluateVariants(runs);
  while (!(metrics.g1.pairedDiffVsG0Stats.ciLower > 0 || metrics.g1.pairedDiffVsG0Stats.ciUpper < 0) && runs.length < maxN) {
    const remaining = Math.min(extensionStep, maxN - runs.length);
    runs = runs.concat(collectBatch(remaining));
    metrics = evaluateVariants(runs);
  }
  const reachedDecisive = metrics.g1.pairedDiffVsG0Stats.ciLower > 0 || metrics.g1.pairedDiffVsG0Stats.ciUpper < 0;
  return { runsUsed: runs.length, runs, metrics, reachedDecisive };
}
