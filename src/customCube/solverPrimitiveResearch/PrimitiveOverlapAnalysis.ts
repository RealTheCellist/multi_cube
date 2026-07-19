// --- PrimitiveOverlapAnalysis (Solver Primitive Capability Analysis
// Sprint v1) ----------------------------------------------------------
// STEP2: for each pair of the 5 allowed Primitives, computes Jaccard
// Similarity over their SUCCESS SETS (which replays each Primitive solves
// on the untouched state, from STEP1's matrix) -- a high Jaccard means the
// two Primitives are largely redundant (they succeed on nearly the same
// replays); a low Jaccard means they're complementary (each covers ground
// the other doesn't).
import { ALLOWED_PRIMITIVES, type AllowedPrimitive } from "../solverRepresentationPrototype/RepresentationPrimitiveSelector";
import type { MatrixRow } from "./PrimitiveCapabilityMatrix";

export type OverlapClassification = "HIGH_REDUNDANCY" | "MODERATE" | "LOW_REDUNDANCY";

const HIGH_REDUNDANCY_THRESHOLD = 0.5;
const LOW_REDUNDANCY_THRESHOLD = 0.15;

export interface OverlapPair {
  primitiveA: AllowedPrimitive;
  primitiveB: AllowedPrimitive;
  jaccard: number; // |A success ∩ B success| / |A success ∪ B success|
  intersectionCount: number;
  unionCount: number;
  aOnlyCount: number; // solved by A but not B -- A's unique contribution over B
  bOnlyCount: number; // solved by B but not A -- B's unique contribution over A
  classification: OverlapClassification;
}

export function analyzeOverlap(matrix: readonly MatrixRow[]): OverlapPair[] {
  const pairs: OverlapPair[] = [];

  for (let i = 0; i < ALLOWED_PRIMITIVES.length; i++) {
    for (let j = i + 1; j < ALLOWED_PRIMITIVES.length; j++) {
      const a = ALLOWED_PRIMITIVES[i];
      const b = ALLOWED_PRIMITIVES[j];
      let intersectionCount = 0;
      let unionCount = 0;
      let aOnlyCount = 0;
      let bOnlyCount = 0;

      for (const row of matrix) {
        const sa = row.success[a];
        const sb = row.success[b];
        if (sa && sb) intersectionCount++;
        if (sa || sb) unionCount++;
        if (sa && !sb) aOnlyCount++;
        if (sb && !sa) bOnlyCount++;
      }

      const jaccard = unionCount ? intersectionCount / unionCount : 0;
      const classification: OverlapClassification = jaccard >= HIGH_REDUNDANCY_THRESHOLD ? "HIGH_REDUNDANCY" : jaccard <= LOW_REDUNDANCY_THRESHOLD ? "LOW_REDUNDANCY" : "MODERATE";

      pairs.push({ primitiveA: a, primitiveB: b, jaccard, intersectionCount, unionCount, aOnlyCount, bOnlyCount, classification });
    }
  }

  return pairs.sort((x, y) => y.jaccard - x.jaccard);
}
