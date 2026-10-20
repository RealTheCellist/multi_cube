import { buildCycleTools, type CommutatorWords, type CycleTools } from "../customCube/threeCycleTools";
import cycleData from "./data/gigaminxThreeCycles.json";
import { applyGigaminxMove, MOVE_TABLE, type GigaminxDepth, type GigaminxState, type GigaminxTurn } from "./gigaminxState";
import type { FaceIndex } from "./dodecaMath";

// ============================================================================
// Gigaminx wings, inner corners, edge bridges and center bridges by pure 3-cycles.
//
// The inner corners, edge bridges and center bridges have no orientation, and a wing's orientation is locked to
// its position (the 120 wing states form two orbits of 60 under a group of order exactly 60!/2, checked with a
// computer-algebra system), so all four are permutations of 60 pieces. Every move (a fifth turn) is an even
// permutation of each, so each can be sorted with 3-cycles alone. What the older solver (gigaminxSolver.ts's solveInnerCorners/solveEdgeBridges/
// solveCenterBridges) did not have is SHORT 3-cycles: it nested commutators of commutators to keep earlier
// orbits fixed, giving 32-, 128- and 512-move building blocks (~40,000 moves for a whole solve). An exhaustive
// offline search (gigaminx-gen/) over [A, B] and [A, X S X'] finds commutators that leave every lower orbit
// untouched and move exactly three pieces of their own orbit in 8 (wings, edge bridges) and 12 (inner corners,
// center bridges) moves. A conjugate of such a commutator is still untouched on the lower orbits (conjugation
// only relabels positions inside the orbits that were moved), so any setup is allowed; the cheapest setup for
// each triple of positions comes from a multi-source search (threeCycleTools.ts). Higher orbits may be
// disturbed freely -- they are solved afterwards, in order.
// ============================================================================

export type CycleOrbit = "wing" | "innerCorner" | "edgeBridge" | "centerBridge";

const DATA_KEY: Record<CycleOrbit, "wg" | "ic" | "eb" | "cb"> = { wing: "wg", innerCorner: "ic", edgeBridge: "eb", centerBridge: "cb" };

function permOf(state: GigaminxState, orbit: CycleOrbit): Int8Array {
  if (orbit === "wing") return state.wingPerm;
  return orbit === "innerCorner" ? state.innerCornerPerm : orbit === "edgeBridge" ? state.edgeBridgePerm : state.centerBridgePerm;
}
function tablePermOf(m: number, orbit: CycleOrbit): number[] {
  const t = MOVE_TABLE[m];
  if (orbit === "wing") return t.wingPerm;
  return orbit === "innerCorner" ? t.innerCornerPerm : orbit === "edgeBridge" ? t.edgeBridgePerm : t.centerBridgePerm;
}

/** MOVE_TABLE is indexed face * 8 + (depth - 1) * 2 + (sign === 1 ? 0 : 1), so m ^ 1 is the inverse. */
function turnOfMove(m: number): GigaminxTurn {
  return { face: (m >> 3) as FaceIndex, depth: (((m & 7) >> 1) + 1) as GigaminxDepth, sign: (m & 1) === 0 ? 1 : -1 };
}

const toolsCache = new Map<CycleOrbit, CycleTools>();
function getTools(orbit: CycleOrbit): CycleTools {
  const cached = toolsCache.get(orbit);
  if (cached) return cached;
  const dest: Uint8Array[] = MOVE_TABLE.map((_, m) => {
    const d = new Uint8Array(60);
    tablePermOf(m, orbit).forEach((from, pos) => (d[from] = pos)); // the piece at `from` moves to `pos`
    return d;
  });
  const commutators: CommutatorWords[] = (cycleData[DATA_KEY[orbit]] as number[][][]).map(([a, b]) => ({ a, b }));
  const tools = buildCycleTools(dest, commutators);
  toolsCache.set(orbit, tools);
  return tools;
}

/** Builds the setup tables for all three orbits now (a second or two), so the first solve doesn't wait for them. */
export function warmupGigaminxCycleSolver(): void {
  for (const orbit of ["wing", "innerCorner", "edgeBridge", "centerBridge"] as CycleOrbit[]) getTools(orbit);
}

/** Cancels adjacent inverse moves left where macros meet. */
function simplify(word: number[]): number[] {
  const out: number[] = [];
  for (const m of word) {
    if (out.length && (out[out.length - 1] ^ 1) === m) out.pop();
    else out.push(m);
  }
  return out;
}

/** Turns that put every piece of `orbit` home (state unchanged), assuming all lower orbits are already solved. Throws if it cannot. */
export function solveOrbitByCycles(state: GigaminxState, orbit: CycleOrbit): GigaminxTurn[] {
  const tools = getTools(orbit);
  const cur = Array.from(permOf(state, orbit)); // cur[pos] = piece at pos; piece i belongs at position i
  const word: number[] = [];
  for (let guard = 0; guard < 400; guard++) {
    const wrong: number[] = [];
    for (let pos = 0; pos < 60; pos++) if (cur[pos] !== pos) wrong.push(pos);
    if (wrong.length === 0) return simplify(word).map(turnOfMove);
    let best: { after: number; cost: number; q: number; p: number; r: number; macro: number[] } | null = null;
    for (const p of wrong) {
      const q = cur.indexOf(p); // where the piece that belongs at p is
      for (let r = 0; r < 60; r++) {
        if (r === p || r === q) continue;
        // the cycle sends q->p, p->r, r->q; count how many positions end up right
        let after = wrong.length;
        const placed: [number, number][] = [
          [p, cur[q]],
          [r, cur[p]],
          [q, cur[r]],
        ];
        for (const [pos, piece] of placed) {
          const was = cur[pos] !== pos;
          const now = piece !== pos;
          if (was && !now) after--;
          else if (!was && now) after++;
        }
        if (after >= wrong.length) continue;
        if (best && after > best.after) continue;
        const macro = tools.macroFor(q, p, r);
        if (!macro) continue;
        if (!best || after < best.after || (after === best.after && macro.length < best.cost)) best = { after, cost: macro.length, q, p, r, macro };
      }
    }
    if (!best) throw new Error(`gigaminxCycleSolver: no progressing 3-cycle for the ${orbit} orbit`);
    const { q, p, r, macro } = best;
    const [pq, pp, pr] = [cur[q], cur[p], cur[r]];
    cur[p] = pq;
    cur[r] = pp;
    cur[q] = pr;
    word.push(...macro);
  }
  throw new Error(`gigaminxCycleSolver: ${orbit} orbit not sorted within the iteration guard`);
}

/** solveOrbitByCycles plus a check on the real move tables. */
export function solveOrbitByCyclesVerified(state: GigaminxState, orbit: CycleOrbit): GigaminxTurn[] {
  const turns = solveOrbitByCycles(state, orbit);
  let s = state;
  for (const t of turns) s = applyGigaminxMove(s, t.face, t.sign, t.depth);
  if (!permOf(s, orbit).every((piece, pos) => piece === pos)) throw new Error(`gigaminxCycleSolver: ${orbit} orbit not solved by the computed turns`);
  return turns;
}
