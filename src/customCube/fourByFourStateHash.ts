// Detects whether the ACTUAL 4x4x4 cube state still matches what a cached
// solve plan (see fourByFourSolverEngine.ts) was computed against. Unlike
// the 5x5's equivalent (fiveByFiveEdgeStateHash.ts), this covers EVERY
// piece -- corners, edges/wings, and centers -- since a 4x4x4 solve plan's
// moves span all three phases (edge pairing, centers, reduction), any of
// which can touch any piece type.
import type { Cubie } from "./cubeState";

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
 * Numeric hash of every piece's current position + orientation (sorted by
 * id, so it doesn't depend on array order). Two calls return the same value
 * if and only if the cube looks the same in every way a 4x4x4 solve plan
 * could care about.
 */
export function computeFourByFourStateHash(cubies: readonly Cubie[]): number {
  const parts: string[] = [];
  for (const c of cubies) {
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
