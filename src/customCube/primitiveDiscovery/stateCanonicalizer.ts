// --- StateCanonicalizer (Primitive Discovery Engine) ------------------------
// Normalizes away exactly the 3 things the spec names (Cube Rotation / Edge
// Ordering / Wing Ordering) WITHOUT reconstructing or rotating the actual
// 3D geometry: by describing a residual purely as "how many slots have
// pattern X" (a per-slot classification that's already independent of
// which absolute slot/face it is) plus "how many cross-slot color-swap
// relationships exist" (a pairwise relational count, also independent of
// slot identity or which of a pair's 2 wings you call first), the
// resulting signature can only ever depend on the residual's actual SHAPE,
// never on rotation, slot listing order, or wing listing order. This is a
// deliberate, disclosed alternative to enumerating the cube's 24 whole-body
// rotations directly on THREE.js quaternions -- cheaper, and provably
// invariant to exactly the 3 things named, without needing to re-derive
// slot correspondences under rotation.
import { colorKeyOf } from "../fiveByFiveEdges";
import { analyzeEdgeSlots, detectEdgeSlotPattern, type EdgeSlotStats } from "../fiveByFiveHumanEdges";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import type { CanonicalSignature, EdgePatternName } from "./discoveryTypes";

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Two DIFFERENT unfinished slots form a "swap pair" if each one's wings
 * carry the OTHER slot's true-edge color -- i.e. the wings are literally
 * sitting in each other's slots. This is exactly the shape a 2-edge-swap
 * style Primitive would target (see PrimitiveSuggestionGenerator), and is
 * independent of slot identity/order since it's defined purely by color
 * keys. */
function isSwapPair(a: EdgeSlotStats, b: EdgeSlotStats): boolean {
  const aTrueKey = colorKeyOf(a.trueEdge);
  const bTrueKey = colorKeyOf(b.trueEdge);
  const aWingsMatchB = a.wings.some((w) => colorKeyOf(w) === bTrueKey);
  const bWingsMatchA = b.wings.some((w) => colorKeyOf(w) === aTrueKey);
  return aWingsMatchB && bWingsMatchA;
}

export function computeCanonicalSignature(snapshot: FailureSnapshot): CanonicalSignature {
  const cubies = deserializeCube(snapshot.cubeState);
  const allStats = analyzeEdgeSlots(cubies);
  const unfinished = allStats.filter((s) => s.pairedCount < 2);

  const patternHistogram: Record<EdgePatternName, number> = { unpaired: 0, "flipped-pair": 0, "half-paired": 0 };
  for (const s of unfinished) {
    const p = detectEdgeSlotPattern(s);
    if (p !== "paired") patternHistogram[p]++;
  }

  let swapPairCount = 0;
  for (let i = 0; i < unfinished.length; i++) {
    for (let j = i + 1; j < unfinished.length; j++) {
      if (isSwapPair(unfinished[i], unfinished[j])) swapPairCount++;
    }
  }

  const key = [
    `w${snapshot.wrongWingCount}`,
    `p${snapshot.parity ? 1 : 0}`,
    `u${patternHistogram.unpaired}`,
    `f${patternHistogram["flipped-pair"]}`,
    `h${patternHistogram["half-paired"]}`,
    `s${swapPairCount}`,
  ].join("|");

  return {
    hash: fnv1a(key).toString(16),
    wrongWingCount: snapshot.wrongWingCount,
    parity: snapshot.parity,
    patternHistogram,
    swapPairCount,
  };
}
