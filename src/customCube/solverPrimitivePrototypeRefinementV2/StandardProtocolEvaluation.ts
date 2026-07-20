// --- StandardProtocolEvaluation (Solver Primitive Prototype Refinement
// Sprint v2) -- applies the CONFIRMED Standard Evaluation Protocol
// (Evaluation Stabilization Sprint v2, STEP5: Majority Vote Gap
// classification + paired-diff 95% CI, N>=15) to this Sprint's own
// variant set. Reuses computeStats (solverPrimitiveEvaluationStabilization/
// StatsUtil.ts, UNMODIFIED) for the CI/variance arithmetic -- no
// re-derivation of the statistical machinery, per this Sprint's own
// instruction ("평가는 확정된 Standard Evaluation Protocol을 그대로
// 사용"). The Gap population itself is fixed ONCE via Majority Vote
// across all collected runs (not recomputed per-run), while GapRescue
// counts still use each run's own variant-success values -- the exact
// combination the Standard Protocol specifies (a stable denominator,
// a per-run numerator, then paired-diff CI on the numerator).
import type { RunRecordV2, VariantName } from "./RawDataCollectorV2";
import { VARIANT_NAMES } from "./RawDataCollectorV2";
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import type { AllowedPrimitive } from "../solverRepresentationPrototype/RepresentationPrimitiveSelector";

const PRIMITIVES: AllowedPrimitive[] = ["BASE", "FLIP", "CASE", "PARITY", "BP1"];
const BASELINE_NAME: VariantName = "V0_baseline";

export function computeMajorityVoteGapSet(runs: readonly RunRecordV2[]): Set<string> {
  const n = runs.length;
  const perHashGapCount = new Map<string, number>();
  for (const run of runs) {
    for (const r of run) {
      const isGap = PRIMITIVES.every((p) => !r.primitiveSuccess[p]);
      if (isGap) perHashGapCount.set(r.hash, (perHashGapCount.get(r.hash) ?? 0) + 1);
    }
  }
  const hashes = runs[0].map((r) => r.hash);
  return new Set(hashes.filter((h) => (perHashGapCount.get(h) ?? 0) > n / 2));
}

export interface VariantV2Metrics {
  variantName: VariantName;
  totalReplays: number;
  avgMatchedCount: number; // average per-run matched count
  coverage: number;
  avgSuccessCount: number; // average per-run success count
  precision: number;
  gapRescueStats: SampleStats; // per-run GapRescue count against the FIXED Majority-Vote Gap set
  pairedDiffVsBaselineStats: SampleStats; // per-run (this variant - V0_baseline), same run's own values, same Gap set
  regressionCount: number; // summed across all runs -- should be 0 by construction (Deferred Validation), checked empirically
}

export function evaluateVariantsV2(runs: readonly RunRecordV2[]): VariantV2Metrics[] {
  const majorityGapSet = computeMajorityVoteGapSet(runs);
  const totalReplays = runs[0].length;
  const nRuns = runs.length;

  const baselineGapRescuePerRun = runs.map((run) => run.filter((r) => majorityGapSet.has(r.hash) && r.variantSucceeded[BASELINE_NAME]).length);

  return VARIANT_NAMES.map((name) => {
    let matchedTotal = 0;
    let successTotal = 0;
    let regressionCount = 0;
    const perRunGapRescue: number[] = [];

    for (const run of runs) {
      let gapRescueThisRun = 0;
      for (const r of run) {
        if (r.variantMatched[name]) matchedTotal++;
        if (r.variantRegressed[name]) regressionCount++;
        if (r.variantSucceeded[name]) {
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
      variantName: name,
      totalReplays,
      avgMatchedCount: matchedTotal / nRuns,
      coverage: totalReplays ? matchedTotal / nRuns / totalReplays : 0,
      avgSuccessCount: successTotal / nRuns,
      precision: matchedTotal ? successTotal / matchedTotal : 0,
      gapRescueStats,
      pairedDiffVsBaselineStats,
      regressionCount,
    };
  });
}
