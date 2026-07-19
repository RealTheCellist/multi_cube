// --- CoveragePrecisionRecallAnalysis (Solver Primitive Blueprint Sprint
// v2) -------------------------------------------------------------------
// STEP4: for each candidate (base/threshold variants/feature-addition
// variants), computes Coverage/Precision/Recall/False-Positive-Rate
// averaged across the same multi-run Dataset -- the standard classifier
// evaluation this Sprint's own work order asked for, applied to "does this
// Blueprint precondition correctly predict when Multi-Hop Bridge
// succeeds."
import type { RunRecord, CandidatePredicate } from "./ReproducibilityCheck";

export interface PrecisionRecallResult {
  candidateName: string;
  avgCoverage: number; // matched / total replays
  avgPrecision: number; // true positives / matched (= success rate within matched)
  avgRecall: number; // true positives / all-real-successes-that-run
  avgFalsePositiveRate: number; // (matched - true positives) / matched
}

function avg(nums: readonly number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

export function computePrecisionRecall(multiRun: readonly RunRecord[][], candidate: CandidatePredicate): PrecisionRecallResult {
  const perRun = multiRun.map((records) => {
    const totalSuccesses = records.filter((r) => r.succeeded).length;
    const matched = records.filter((r) => candidate.predicate(r.features));
    const truePositive = matched.filter((r) => r.succeeded).length;
    const falsePositive = matched.length - truePositive;
    return {
      coverage: records.length ? matched.length / records.length : 0,
      precision: matched.length ? truePositive / matched.length : 0,
      recall: totalSuccesses ? truePositive / totalSuccesses : 0,
      falsePositiveRate: matched.length ? falsePositive / matched.length : 0,
    };
  });

  return {
    candidateName: candidate.name,
    avgCoverage: avg(perRun.map((r) => r.coverage)),
    avgPrecision: avg(perRun.map((r) => r.precision)),
    avgRecall: avg(perRun.map((r) => r.recall)),
    avgFalsePositiveRate: avg(perRun.map((r) => r.falsePositiveRate)),
  };
}

export function computeAllPrecisionRecall(multiRun: readonly RunRecord[][], candidates: readonly CandidatePredicate[]): PrecisionRecallResult[] {
  return candidates.map((c) => computePrecisionRecall(multiRun, c));
}
