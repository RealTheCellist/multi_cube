// --- PrimitiveCoverageMatrix (Solver Primitive Blueprint Sprint v1) ------
// STEP4: for each STEP3 candidate, counts how many of the 47 Gap replays
// match its STATED structural precondition -- a pure predicate count over
// STEP1's already-computed structural features, never an actual solve or
// search. This is deliberately NOT performance measurement (forbidden by
// this Sprint's own scope): it answers "어떤 구조를 해결하도록
// 의도되었는지" (intended target), not "실제로 몇 건을 풀었는지."
import type { GapReplayFeatures } from "./GapStructuralAnalysis";
import type { PrimitiveCandidate } from "./PrimitiveCandidates";

export interface CandidateCoverage {
  name: string;
  isGenuinelyNovel: boolean;
  matchedHashes: string[];
  matchedCount: number;
  gapTotal: number;
  coverageRate: number;
}

export function computeCoverage(candidates: readonly PrimitiveCandidate[], gapFeatures: readonly GapReplayFeatures[]): CandidateCoverage[] {
  const gapTotal = gapFeatures.length;
  return candidates.map((c) => {
    const matched = gapFeatures.filter((f) => c.matchesPrecondition(f));
    return { name: c.name, isGenuinelyNovel: c.isGenuinelyNovel, matchedHashes: matched.map((f) => f.hash), matchedCount: matched.length, gapTotal, coverageRate: gapTotal ? matched.length / gapTotal : 0 };
  });
}

export interface CoverageOverlap {
  candidateA: string;
  candidateB: string;
  overlapCount: number; // Gap replays matched by BOTH
  jaccard: number;
}

export function computeOverlap(coverages: readonly CandidateCoverage[]): CoverageOverlap[] {
  const overlaps: CoverageOverlap[] = [];
  for (let i = 0; i < coverages.length; i++) {
    for (let j = i + 1; j < coverages.length; j++) {
      const a = new Set(coverages[i].matchedHashes);
      const b = new Set(coverages[j].matchedHashes);
      let intersection = 0;
      for (const h of a) if (b.has(h)) intersection++;
      const union = new Set([...a, ...b]).size;
      overlaps.push({ candidateA: coverages[i].name, candidateB: coverages[j].name, overlapCount: intersection, jaccard: union ? intersection / union : 0 });
    }
  }
  return overlaps;
}

export interface UnionCoverageResult {
  unionMatchedCount: number;
  unionCoverageRate: number;
  uncoveredCount: number;
  uncoveredHashes: string[];
}

function unionOf(coverages: readonly CandidateCoverage[], gapFeatures: readonly GapReplayFeatures[]): UnionCoverageResult {
  const covered = new Set<string>();
  for (const c of coverages) for (const h of c.matchedHashes) covered.add(h);
  const gapTotal = gapFeatures.length;
  const uncoveredHashes = gapFeatures.map((f) => f.hash).filter((h) => !covered.has(h));
  return { unionMatchedCount: covered.size, unionCoverageRate: gapTotal ? covered.size / gapTotal : 0, uncoveredCount: uncoveredHashes.length, uncoveredHashes };
}

export function computeUnionCoverage(coverages: readonly CandidateCoverage[], gapFeatures: readonly GapReplayFeatures[]): UnionCoverageResult {
  return unionOf(coverages, gapFeatures);
}

// A candidate whose "new" behavior is really just an existing Primitive's
// parameters widened contributes Coverage numbers that look identical to a
// genuinely new capability's -- but per this Sprint's own Research Exit
// Criteria ②, that's not evidence a new Primitive is needed. This computes
// the SAME union, restricted to isGenuinelyNovel candidates only, so the
// Blueprint decision isn't carried by a non-novel candidate's raw number.
export function computeGenuineNovelUnionCoverage(coverages: readonly CandidateCoverage[], gapFeatures: readonly GapReplayFeatures[]): UnionCoverageResult {
  return unionOf(
    coverages.filter((c) => c.isGenuinelyNovel),
    gapFeatures,
  );
}
