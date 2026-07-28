// --- ExpressivenessComparison (Move Representation Blueprint Sprint v1,
// Required Analysis #2) ------------------------------------------------------
// Theoretical one-shot coverage of each candidate Representation, computed
// directly from the REAL cycleLength distribution PURE_CYCLE_ISOLATION
// Structural Mechanism Analysis Sprint v1 measured across all 28 cases
// (loaded from that Sprint's own result JSON by the driver, not
// hardcoded here) -- not estimated or guessed.
import type { RepresentationCandidate } from "./RepresentationDesignSpace";

export interface CycleLengthDistribution {
  [length: number]: number; // measured case count at this cycle length
}

export interface ExpressivenessRow {
  representationId: string;
  oneShotCoverageCount: number; // cases this representation resolves in a SINGLE application
  oneShotCoverageRate: number;
  decomposableCoverageCount: number; // cases resolvable via repeated/composed application (still requires the same building block, just applied more than once)
  decomposableCoverageRate: number;
  note: string;
}

function totalCases(dist: CycleLengthDistribution): number {
  return Object.values(dist).reduce((a, b) => a + b, 0);
}

export function compareExpressiveness(candidates: RepresentationCandidate[], dist: CycleLengthDistribution): ExpressivenessRow[] {
  const total = totalCases(dist);
  const lengths = Object.keys(dist).map(Number);

  return candidates.map((c) => {
    if (c.minWingUnit === "adaptive") {
      // Adaptive representations (Cycle Rotation, Commutator) size themselves
      // to the case's own measured cycle length -- one-shot coverage is the
      // full population by construction.
      return {
        representationId: c.id,
        oneShotCoverageCount: total,
        oneShotCoverageRate: 1,
        decomposableCoverageCount: total,
        decomposableCoverageRate: 1,
        note: "적응형 단위 -- 측정된 모든 cycleLength(3~6)를 한 번에 커버.",
      };
    }

    const unitSize = c.unitSize as number;
    const oneShot = lengths.filter((l) => l === unitSize).reduce((a, l) => a + dist[l], 0);
    // Decomposable: a longer cycle COULD in principle be closed via repeated
    // application of a fixed-size unit if the cycle length is evenly
    // divisible, or via a sequence of overlapping fixed-size steps -- this
    // is the generous upper bound, not a guarantee (composition itself adds
    // real cost, see ComplexityAnalysis.ts).
    const decomposable = lengths.filter((l) => l >= unitSize).reduce((a, l) => a + dist[l], 0);

    return {
      representationId: c.id,
      oneShotCoverageCount: oneShot,
      oneShotCoverageRate: total ? oneShot / total : 0,
      decomposableCoverageCount: decomposable,
      decomposableCoverageRate: total ? decomposable / total : 0,
      note: `고정 단위(${unitSize}) -- 한 번의 적용으로는 cycleLength===${unitSize}인 케이스만 해결. cycleLength>=${unitSize}인 케이스는 이론적으로 여러 번 조합하면 닿을 가능성이 있으나 실측되지 않은 가정.`,
    };
  });
}
