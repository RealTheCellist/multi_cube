// --- GapRescueConfidenceInterval (Solver Primitive Evaluation
// Stabilization Sprint v1) -- STEP3: applies confidence-interval
// reasoning to GapRescue itself, using the concrete worked example
// Refinement Sprint v1 left unresolved (baseline A0 vs candidate
// A1_wideCycle, which showed A,A,B across 3 raw runs). Reports both
// variants' own per-run GapRescue distributions AND the PAIRED
// difference (candidate-baseline, computed within the SAME run so both
// share that run's own Gap classification) -- the paired form is the
// statistically appropriate one here, since it cancels out the run-to-run
// shift in the Gap population itself (already disclosed as BASE-driven)
// rather than comparing two independently-noisy quantities.
import type { RunRecord } from "./RawDataCollector";
import { computeStats, type SampleStats } from "./StatsUtil";

export interface GapRescueCIResult {
  baselineStats: SampleStats;
  candidateStats: SampleStats;
  pairedDiffStats: SampleStats; // per-run (candidate - baseline)
  candidateCIExceedsBaselineCI: boolean; // non-overlapping CIs -- a strong, conservative signal
  pairedDiffCIExcludesZero: boolean; // paired-diff CI lower bound > 0 -- the statistically appropriate test for this data
}

function gapRescueCount(run: RunRecord, successField: "baselineSucceeded" | "a1Succeeded"): number {
  return run.filter((r) => r.wasExistingGap && r[successField]).length;
}

export function computeGapRescueCI(runs: readonly RunRecord[]): GapRescueCIResult {
  const baselineCounts = runs.map((run) => gapRescueCount(run, "baselineSucceeded"));
  const candidateCounts = runs.map((run) => gapRescueCount(run, "a1Succeeded"));
  const pairedDiffs = runs.map((_run, i) => candidateCounts[i] - baselineCounts[i]);

  const baselineStats = computeStats(baselineCounts);
  const candidateStats = computeStats(candidateCounts);
  const pairedDiffStats = computeStats(pairedDiffs);

  return {
    baselineStats,
    candidateStats,
    pairedDiffStats,
    candidateCIExceedsBaselineCI: candidateStats.ciLower > baselineStats.ciUpper,
    pairedDiffCIExcludesZero: pairedDiffStats.ciLower > 0,
  };
}
