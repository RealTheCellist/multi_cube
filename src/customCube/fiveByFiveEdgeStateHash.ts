// Detects whether the ACTUAL cube state still matches what a cached
// SolvePlan was computed against -- see fiveByFiveEdgeSolverTypes.ts's own
// comment on why the plan-once/consume-many model needs this. Covers wing,
// true-edge, AND center state (per spec section 16) since either a stray
// move outside the plan's own queue OR the plan's own execution disturbing
// centers (see fiveByFiveEdges.ts's PARITY_ALG comment on why that's a real,
// previously-hit failure mode) must both invalidate the cached plan.
// (Slot-to-index numbering for SolveTask.targetEdge lives in
// fiveByFiveEdgePlanner.ts -- this file only hashes raw piece state.)
import type { Cubie } from "./cubeState";
import { pieceType5 } from "./fiveByFivePieces";

function round(v: number): number {
  return Math.round(v * 4) / 4;
}

// FNV-1a: fast, good-enough avalanche for cache-invalidation purposes (this
// is not a cryptographic or collision-resistant hash -- it only needs to
// almost-never collide between two DIFFERENT cube states, which a 32-bit
// hash over a long descriptive string comfortably satisfies for this use).
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Numeric hash of every wing/trueEdge/center piece's current position +
 * orientation (sorted by id, so it doesn't depend on array order). Two
 * calls return the same value if and only if the cube looks the same in
 * every way the edge solver cares about.
 */
export function computeEdgeSolverStateHash(cubies: readonly Cubie[]): number {
  const parts: string[] = [];
  for (const c of cubies) {
    const t = pieceType5(c);
    if (t !== "wingEdge" && t !== "trueEdge" && t !== "xCenter" && t !== "tCenter" && t !== "trueCenter") continue;
    const pos = `${round(c.position.x)},${round(c.position.y)},${round(c.position.z)}`;
    const stickers = c.stickers
      .map((s) => {
        const d = s.direction.clone().applyQuaternion(c.orientation).round();
        return `${d.x}${d.y}${d.z}${s.color}`;
      })
      .join(",");
    parts.push(`${c.id}:${pos}:${stickers}`);
  }
  parts.sort();
  return fnv1a(parts.join("|"));
}
