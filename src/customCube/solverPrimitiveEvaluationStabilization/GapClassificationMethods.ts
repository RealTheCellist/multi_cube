// --- GapClassificationMethods (Solver Primitive Evaluation Stabilization
// Sprint v1) -- STEP1: compares 4 ways to decide "is this replay a Gap"
// (all 5 existing Primitives fail) from the same N independent raw runs --
// Single Run (what every prior Sprint in this series used), Majority
// Vote (per-replay, label = the majority outcome across N runs),
// N회평균/soft average (per-replay Gap PROBABILITY summed, a continuous
// Gap Total instead of an integer), and a Confidence Interval on the
// per-run Gap Total itself.
import type { RunRecord } from "./RawDataCollector";
import { computeStats, type SampleStats } from "./StatsUtil";

export interface GapClassificationComparison {
  singleRunGapTotal: number;
  majorityVoteGapTotal: number;
  softAverageGapTotal: number;
  confidenceInterval: SampleStats; // over per-run Gap Total (integer per run)
  singleVsMajorityJaccard: number; // overlap between the Single-Run Gap set and the Majority-Vote Gap set
}

export function compareGapClassificationMethods(runs: readonly RunRecord[]): GapClassificationComparison {
  const n = runs.length;
  const hashes = runs[0].map((r) => r.hash);

  const singleRunGapSet = new Set(runs[0].filter((r) => r.wasExistingGap).map((r) => r.hash));
  const singleRunGapTotal = singleRunGapSet.size;

  const perHashGapCount = new Map<string, number>();
  for (const run of runs) for (const r of run) if (r.wasExistingGap) perHashGapCount.set(r.hash, (perHashGapCount.get(r.hash) ?? 0) + 1);

  const majorityVoteGapSet = new Set(hashes.filter((h) => (perHashGapCount.get(h) ?? 0) > n / 2));
  const majorityVoteGapTotal = majorityVoteGapSet.size;

  const softAverageGapTotal = hashes.reduce((sum, h) => sum + (perHashGapCount.get(h) ?? 0) / n, 0);

  const perRunTotals = runs.map((run) => run.filter((r) => r.wasExistingGap).length);
  const confidenceInterval = computeStats(perRunTotals);

  let intersection = 0;
  for (const h of singleRunGapSet) if (majorityVoteGapSet.has(h)) intersection++;
  const union = new Set([...singleRunGapSet, ...majorityVoteGapSet]).size;
  const singleVsMajorityJaccard = union ? intersection / union : 1;

  return { singleRunGapTotal, majorityVoteGapTotal, softAverageGapTotal, confidenceInterval, singleVsMajorityJaccard };
}
