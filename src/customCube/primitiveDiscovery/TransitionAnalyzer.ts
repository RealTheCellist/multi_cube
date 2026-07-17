// --- TransitionAnalyzer (Capability Expansion Sprint v2) --------------------
// A Transition Hash describes WHAT STATE CHANGE a real move sequence
// produces -- independent of which specific Replay/scramble it's tested
// against -- computed by applying the sequence to a SOLVED reference cube
// (exactly the same convention fiveByFiveEdges.ts's own internal
// computeEntryEffect already uses for its library entries) and hashing
// every wing/trueEdge piece's resulting position + sticker-facing
// orientation. Two sequences with completely different move TEXT that move
// every piece identically hash the same -- this is the dedup key spec
// section 13 requires ("Sequence 기준이 아니다... Transition Hash 기준
// 사용"), not the literal move list.
import { buildSolvedCube, cloneCubies } from "../cubeState";
import { applySeq } from "../fiveByFiveEdges";
import type { Move } from "../fiveByFiveEdges";
import { pieceType5 } from "../fiveByFivePieces";
import { analyzeEdgeSlots } from "../fiveByFiveHumanEdges";

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function computeTransitionHash(sequence: readonly Move[]): string {
  const cubies = buildSolvedCube(5);
  applySeq(cubies, sequence);
  const parts: string[] = [];
  for (const c of cubies) {
    const t = pieceType5(c);
    if (t !== "wingEdge" && t !== "trueEdge") continue;
    const pos = `${Math.round(c.position.x * 2) / 2},${Math.round(c.position.y * 2) / 2},${Math.round(c.position.z * 2) / 2}`;
    const stickers = c.stickers
      .map((s) => {
        const d = s.direction.clone().applyQuaternion(c.orientation).round();
        return `${d.x}${d.y}${d.z}${s.color}`;
      })
      .sort()
      .join(",");
    parts.push(`${c.id}:${pos}:${stickers}`);
  }
  parts.sort();
  return fnv1a(parts.join("|")).toString(16);
}

/** Applied to a solved reference (matching Transition Hash's own convention)
 * -- which of the 12 canonical slots come out disturbed (pairedCount < 2)
 * when this sequence runs on an otherwise-perfect cube. */
export function computeAffectedSlots(sequence: readonly Move[]): string[] {
  const cubies = buildSolvedCube(5);
  applySeq(cubies, sequence);
  return analyzeEdgeSlots(cubies)
    .filter((s) => s.pairedCount < 2)
    .map((s) => s.slot);
}

export function computeChangedLayers(sequence: readonly Move[]): string[] {
  const layers = new Set<string>();
  for (const [axis, layer] of sequence) layers.add(`${axis},${layer}`);
  return [...layers].sort();
}

/** Simple generic before/after positional hash for a LIVE (not necessarily
 * solved) cube -- used by PrimitiveEvaluator for the Before/After Hash
 * fields spec section 10 asks for, distinct from the Transition Hash
 * (which is always computed against a solved reference, not a live Replay
 * state). */
export function computeStateHash(cubies: ReturnType<typeof cloneCubies>): string {
  const parts: string[] = [];
  for (const c of cubies) {
    const t = pieceType5(c);
    if (t !== "wingEdge" && t !== "trueEdge") continue;
    const pos = `${Math.round(c.position.x * 2) / 2},${Math.round(c.position.y * 2) / 2},${Math.round(c.position.z * 2) / 2}`;
    const stickers = c.stickers
      .map((s) => {
        const d = s.direction.clone().applyQuaternion(c.orientation).round();
        return `${d.x}${d.y}${d.z}${s.color}`;
      })
      .sort()
      .join(",");
    parts.push(`${c.id}:${pos}:${stickers}`);
  }
  parts.sort();
  return fnv1a(parts.join("|")).toString(16);
}
