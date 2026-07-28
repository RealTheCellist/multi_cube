// --- DesignSpaceCoverageMatrix (Mixed Commutator Design Space Validation
// Sprint v1, Deliverable #2 + Required Analysis #1 "Same vs Mixed Pattern
// Matrix") ------------------------------------------------------------------
import type { CommutatorCandidate, PatternPairSearchResult } from "./PatternPairSearch";

export interface PairRow {
  patternA: string;
  patternB: string;
  samePattern: boolean;
  casesWithSuccess: number; // out of 28
  avgAffectedWingCount: number | null; // over each case's best-for-this-pair candidate
  avgMoveLength: number | null;
  avgImprovementScore: number | null;
}

export interface SameVsMixedRow {
  group: "Same" | "Mixed";
  success: number; // total (case, pair) combos with >=1 improving candidate, summed across the 3 pairs in this group
  avgFootprint: number | null;
  avgMoveLength: number | null;
  avgImprovement: number | null;
}

function avg(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function buildPairRows(results: PatternPairSearchResult[], pairs: readonly [string, string][]): PairRow[] {
  return pairs.map(([patternA, patternB]) => {
    const key = `${patternA}|${patternB}`;
    const bests: CommutatorCandidate[] = [];
    for (const r of results) {
      const b = r.bestByPatternPair.get(key);
      if (b) bests.push(b);
    }
    return {
      patternA,
      patternB,
      samePattern: patternA === patternB,
      casesWithSuccess: bests.length,
      avgAffectedWingCount: avg(bests.map((b) => b.affectedWingCount)),
      avgMoveLength: avg(bests.map((b) => b.moveLength)),
      avgImprovementScore: avg(bests.map((b) => b.improvementScore)),
    };
  });
}

export function buildSameVsMixedRows(pairRows: PairRow[]): SameVsMixedRow[] {
  const groups: ("Same" | "Mixed")[] = ["Same", "Mixed"];
  return groups.map((group) => {
    const rows = pairRows.filter((r) => (group === "Same" ? r.samePattern : !r.samePattern));
    const totalSuccess = rows.reduce((a, r) => a + r.casesWithSuccess, 0);
    const footprintValues = rows.filter((r) => r.avgAffectedWingCount !== null).map((r) => r.avgAffectedWingCount!);
    const moveLengthValues = rows.filter((r) => r.avgMoveLength !== null).map((r) => r.avgMoveLength!);
    const improvementValues = rows.filter((r) => r.avgImprovementScore !== null).map((r) => r.avgImprovementScore!);
    return {
      group,
      success: totalSuccess,
      avgFootprint: avg(footprintValues),
      avgMoveLength: avg(moveLengthValues),
      avgImprovement: avg(improvementValues),
    };
  });
}
