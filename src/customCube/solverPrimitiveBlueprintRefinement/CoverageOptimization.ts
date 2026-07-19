// --- CoverageOptimization (Solver Primitive Blueprint Refinement Sprint
// v1) -------------------------------------------------------------------
// STEP4: computes Union Coverage/Overlap/Unique Contribution for the
// REFINED+EXPANDED candidate set (STEP3), and compares against Blueprint
// Sprint v1's original genuine-novelty Union Coverage (26.0%) for a
// direct before/after read. Reuses computeCoverage/computeOverlap
// (solverPrimitiveBlueprint/PrimitiveCoverageMatrix.ts, unmodified) --
// this file only adds Unique Contribution, which that module didn't need.
import type { GapReplayFeatures } from "../solverPrimitiveBlueprint/GapStructuralAnalysis";
import type { PrimitiveCandidate } from "../solverPrimitiveBlueprint/PrimitiveCandidates";
import { computeCoverage, computeOverlap, type CandidateCoverage, type CoverageOverlap } from "../solverPrimitiveBlueprint/PrimitiveCoverageMatrix";

export interface UniqueContribution {
  name: string;
  uniqueCount: number;
  uniqueRate: number; // uniqueCount / gapTotal
}

export function computeUniqueContribution(coverages: readonly CandidateCoverage[], gapTotal: number): UniqueContribution[] {
  return coverages.map((c) => {
    const others = coverages.filter((o) => o.name !== c.name);
    const otherHashes = new Set(others.flatMap((o) => o.matchedHashes));
    const uniqueCount = c.matchedHashes.filter((h) => !otherHashes.has(h)).length;
    return { name: c.name, uniqueCount, uniqueRate: gapTotal ? uniqueCount / gapTotal : 0 };
  });
}

export interface CoverageOptimizationReport {
  gapTotal: number;
  coverages: CandidateCoverage[];
  overlap: CoverageOverlap[];
  uniqueContributions: UniqueContribution[];
  genuineUnionMatchedCount: number;
  genuineUnionCoverageRate: number;
  beforeRefinementRate: number; // Blueprint Sprint v1's own cited genuine-novelty Union Coverage
  deltaPercentagePoints: number;
}

// Cited from Primitive Blueprint Sprint v1's own real run
// (solverPrimitiveBlueprint/data/primitive-blueprint-report.txt) --
// genuine-novelty-only Union Coverage before this Sprint's refinement.
export const BEFORE_REFINEMENT_GENUINE_COVERAGE_RATE = 0.26;

export function optimizeCoverage(candidates: readonly PrimitiveCandidate[], gapFeatures: readonly GapReplayFeatures[]): CoverageOptimizationReport {
  const gapTotal = gapFeatures.length;
  const coverages = computeCoverage(candidates, gapFeatures);
  const overlap = computeOverlap(coverages);
  const uniqueContributions = computeUniqueContribution(coverages, gapTotal);

  const novelCoverages = coverages.filter((c) => c.isGenuinelyNovel);
  const covered = new Set<string>();
  for (const c of novelCoverages) for (const h of c.matchedHashes) covered.add(h);
  const genuineUnionMatchedCount = covered.size;
  const genuineUnionCoverageRate = gapTotal ? genuineUnionMatchedCount / gapTotal : 0;

  return {
    gapTotal,
    coverages,
    overlap,
    uniqueContributions,
    genuineUnionMatchedCount,
    genuineUnionCoverageRate,
    beforeRefinementRate: BEFORE_REFINEMENT_GENUINE_COVERAGE_RATE,
    deltaPercentagePoints: (genuineUnionCoverageRate - BEFORE_REFINEMENT_GENUINE_COVERAGE_RATE) * 100,
  };
}
