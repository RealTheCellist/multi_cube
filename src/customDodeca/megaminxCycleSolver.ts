import commutatorData from "./data/megaminxCommutators.json";
import { MOVE_TABLE } from "./megaminxState";
import { buildOrbitMacros, solveOrbitWithMacros, type CommutatorWords, type OrbitMacros, type OrbitMoves } from "./orientedCycleSolver";

// ============================================================================
// Megaminx / Master Kilominx (identical piece model and move tables: 20 corners x3 orientations, 30 edges x2) and
// Kilominx (the same 20 corners) by short macros.
//
// Corners and edges are independent (a fifth turn is an even permutation of each, and the commutators below change only
// one of them), so each is solved on its own by orientedCycleSolver.ts's greedy macro search. The building blocks are
// commutators found by an exhaustive offline search (megaminx-gen/) that change only corners (3 pieces, 8-14 moves) or only
// edges (3 pieces, 12-18 moves) -- the previous solver's layer-by-layer commutator libraries gave ~740 moves; this gives
// ~340.
// ============================================================================

export interface TurnLike {
  face: number;
  sign: 1 | -1;
}

// setups: none, or any single move (12 faces x 2): fewer setups build faster but give longer plans and stall more often
const SETUPS: number[][] = [[], ...Array.from({ length: 24 }, (_, i) => [i])];

function orbitMoves(kind: "corner" | "edge"): OrbitMoves {
  const flat = MOVE_TABLE.flatMap((pair) => [pair[0], pair[1]]); // move m = face * 2 + (sign === 1 ? 0 : 1), inverse m ^ 1
  return kind === "corner"
    ? { n: 20, mod: 3, from: flat.map((t) => Int8Array.from(t.cornerPerm)), delta: flat.map((t) => Int8Array.from(t.cornerOrientDelta)) }
    : { n: 30, mod: 2, from: flat.map((t) => Int8Array.from(t.edgePerm)), delta: flat.map((t) => Int8Array.from(t.edgeOrientDelta)) };
}

const libraries = new Map<"corner" | "edge", OrbitMacros>();
function library(kind: "corner" | "edge"): OrbitMacros {
  const cached = libraries.get(kind);
  if (cached) return cached;
  const words = (commutatorData[kind] as number[][][]).map(([a, b]): CommutatorWords => ({ a, b }));
  const lib = buildOrbitMacros(orbitMoves(kind), words, SETUPS, true);
  libraries.set(kind, lib);
  return lib;
}

/** Builds the macro tables now (about a second), so the first solve doesn't wait for them. */
export function warmupMegaminxCycleSolver(): void {
  library("corner");
  library("edge");
}

const toTurns = (word: number[]): TurnLike[] => word.map((m) => ({ face: m >> 1, sign: (m & 1) === 0 ? 1 : -1 }));

export interface MegaminxLikeState {
  cornerPerm: ArrayLike<number>;
  cornerOrient: ArrayLike<number>;
  edgePerm: ArrayLike<number>;
  edgeOrient: ArrayLike<number>;
}

/** Full Megaminx / Master Kilominx solve by macros: corners, then edges (independent). Throws if the greedy search stalls. */
export function solveMegaminxByCycles(state: MegaminxLikeState): TurnLike[] {
  const corners = solveOrbitWithMacros(library("corner"), state.cornerPerm, state.cornerOrient);
  const edges = solveOrbitWithMacros(library("edge"), state.edgePerm, state.edgeOrient);
  return toTurns([...corners, ...edges]);
}

/** Kilominx (corners only). */
export function solveKilominxByCycles(state: { perm: ArrayLike<number>; orient: ArrayLike<number> }): TurnLike[] {
  return toTurns(solveOrbitWithMacros(library("corner"), state.perm, state.orient));
}
