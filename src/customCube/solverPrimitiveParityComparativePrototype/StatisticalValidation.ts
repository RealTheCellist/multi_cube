// --- StatisticalValidation (Parity-Gated Cycle Comparative Prototype
// Sprint v1, STEP4) -----------------------------------------------------------
// Reuses this arc's own Standard Evaluation Protocol
// (computeStats/analyzeEffectSize, solverPrimitiveEvaluationStabilization/,
// unmodified) on paired-diffs of the "improved" indicator (0/1 per case),
// over the full 142-case population (>=15 required by the Directive,
// satisfied many times over). All 3 pairwise comparisons: Dual vs
// Baseline, Multi vs Baseline, Dual vs Multi.
import { computeStats, type SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import { analyzeEffectSize, type EffectSizeResult } from "../solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";
import type { CaseBenchmarkResult } from "./CapabilityBenchmark";

export interface PairedComparison {
  label: string;
  n: number;
  improvedDiffStats: SampleStats; // mean/CI of (armA.improved - armB.improved) per case, 0/1 each
  improvedDiffEffectSize: EffectSizeResult;
  regressionDiffStats: SampleStats;
}

function diffArray(perCase: readonly CaseBenchmarkResult[], a: (c: CaseBenchmarkResult) => boolean, b: (c: CaseBenchmarkResult) => boolean): number[] {
  return perCase.map((c) => (a(c) ? 1 : 0) - (b(c) ? 1 : 0));
}

export interface StatisticalValidationResult {
  dualVsBaseline: PairedComparison;
  multiVsBaseline: PairedComparison;
  dualVsMulti: PairedComparison;
}

export function runStatisticalValidation(perCase: readonly CaseBenchmarkResult[]): StatisticalValidationResult {
  const build = (label: string, improvedA: (c: CaseBenchmarkResult) => boolean, improvedB: (c: CaseBenchmarkResult) => boolean, regressionA: (c: CaseBenchmarkResult) => boolean, regressionB: (c: CaseBenchmarkResult) => boolean): PairedComparison => {
    const improvedDiffs = diffArray(perCase, improvedA, improvedB);
    const improvedDiffStats = computeStats(improvedDiffs);
    const improvedDiffEffectSize = analyzeEffectSize({ meanDiff: improvedDiffStats.mean, stddevDiff: improvedDiffStats.stddev, n: improvedDiffStats.n });
    const regressionDiffs = diffArray(perCase, regressionA, regressionB);
    const regressionDiffStats = computeStats(regressionDiffs);
    return { label, n: perCase.length, improvedDiffStats, improvedDiffEffectSize, regressionDiffStats };
  };

  return {
    dualVsBaseline: build("Dual Wing Bridge vs Baseline", (c) => c.dualImproved, () => false, (c) => c.dualRegression, () => false),
    multiVsBaseline: build("Multi-Component Merge vs Baseline", (c) => c.multiImproved, () => false, (c) => c.multiRegression, () => false),
    dualVsMulti: build("Dual Wing Bridge vs Multi-Component Merge", (c) => c.dualImproved, (c) => c.multiImproved, (c) => c.dualRegression, (c) => c.multiRegression),
  };
}
