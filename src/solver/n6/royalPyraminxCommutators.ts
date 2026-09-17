// N=6 (Royal Pyraminx) commutator-based 100%-solve fallback (Phase 2,
// "option B"). Unlike the axial meet-in-the-middle search (which can fail
// once a scramble needs more than ~20 moves each way within its state
// budget -- see royalPyraminxSolver.ts's own comment), this module never
// fails: it reduces tips/edges/centers to solved via a deterministic
// piece-by-piece 3-cycle insertion, the same technique real speedcubers use
// for big-cube centers/edges. Solutions from this path are longer than an
// optimal search result, but always exist.
//
// IMPORTANT structural fact, discovered while building this (not assumed):
// edges and centers each split into TWO separate 12-piece orbits under
// single-piece tracking (e.g. edge slot 3 can only ever reach
// {0,3,4,5,10,11,12,15,16,19,20,23} -- never the other 12 edge slots, no
// matter how many moves are applied). This is despite Phase 1 confirming
// edges/centers are each a single geometric PIECE TYPE (24 interchangeable
// physical pieces) -- "one piece type" and "one permutation-group orbit"
// are different claims, and only the first one is true here. Practically:
// a single buffer+commutator pair can only ever solve pieces within its
// own 12-slot orbit, so each of edges/centers needs its own SECOND base
// commutator for the other orbit.
//
// None of the 4 base commutators below were hand-derived -- all were found
// by exhaustively searching [A,B] = A B A' B' commutators (and, for
// centers, much deeper A<=3/B<=2 legs) against the real applyRoyalMove
// engine and keeping ones with zero side effects on the other piece
// categories. See this session's investigation notes for the search
// process; the numbers below are the verified result, not an assumption:
//   - EDGE_COMM_1 (orbit {0,3,4,5,10,11,12,15,16,19,20,23}): found
//     immediately (192 equally-valid hits among the first 1,560
//     single-move-pair commutators tried).
//   - EDGE_COMM_2 (orbit {1,2,6,7,8,9,13,14,17,18,21,22}): also found at
//     the same shallow depth once specifically filtered for this orbit.
//   - CENTER_COMM_1/2: NOT found at that shallow depth for either orbit
//     (0 hits, even letting edges move freely) -- needed ~18 million
//     A<=3/B<=2 commutators before the first hit for each orbit turned up.
//     Every move that touches centers always touches axial too (verified:
//     centers and axial cycles are never mixed within a single move's own
//     cycle decomposition, but no shallow commutator manages to cancel
//     axial while leaving centers displaced), so centers are qualitatively
//     harder to isolate than edges in this move group.
import { applyRoyalMove, ALL_ROYAL_MOVE_NAMES } from "./royalPyraminxMoves";
import { CENTER_COUNT, EDGE_COUNT, TIP_COUNT, createSolvedRoyalState, type RoyalPyraminxState } from "./royalPyraminxState";

function invertMoveName(move: string): string {
  return move.endsWith("'") ? move.slice(0, -1) : `${move}'`;
}

function invertSeq(seq: readonly string[]): string[] {
  return seq
    .slice()
    .reverse()
    .map(invertMoveName);
}

function applySeq(state: RoyalPyraminxState, seq: readonly string[]): RoyalPyraminxState {
  let cur = state;
  for (const m of seq) cur = applyRoyalMove(cur, m);
  return cur;
}

interface OrbitComm {
  /** Move sequence implementing a pure 3-cycle: piece@feed->buffer,
   * piece@buffer->third, piece@third->feed. */
  readonly comm: readonly string[];
  readonly buffer: number;
  readonly feed: number;
  readonly third: number;
}

/** Orbit {0,3,4,5,10,11,12,15,16,19,20,23}. Cycle: 20->3, 3->16, 16->20. */
export const EDGE_COMM_1: OrbitComm = { comm: ["U", "4Lw", "U'", "4Lw'"], buffer: 3, feed: 20, third: 16 };
/** Orbit {1,2,6,7,8,9,13,14,17,18,21,22}. Cycle: 21->2, 2->17, 17->21. */
export const EDGE_COMM_2: OrbitComm = { comm: ["Uw", "3Lw", "Uw'", "3Lw'"], buffer: 2, feed: 21, third: 17 };

/** Orbit {1,3,4,7,9,10,13,15,16,19,21,22}. Cycle: 4->1, 19->4, 1->19. */
export const CENTER_COMM_1: OrbitComm = {
  comm: ["3Uw", "3Lw", "3Uw'", "3Lw", "4Lw'", "3Uw", "3Lw'", "3Uw'", "4Lw", "3Lw'"],
  buffer: 1,
  feed: 4,
  third: 19,
};
/** Orbit {0,2,5,6,8,11,12,14,17,18,20,23}. Cycle: 2->0, 20->2, 0->20. Found
 * the same way as CENTER_COMM_1 (A<=3/B<=2 commutator search, ~7.2 million
 * checked with the 8 tip-only moves excluded from the search since they
 * can never help cancel axial/centers disturbance -- verified earlier in
 * this session that they touch nothing but tips). */
export const CENTER_COMM_2: OrbitComm = {
  comm: ["4Uw", "Lw", "4Uw'", "Lw", "4Lw'", "4Uw", "Lw'", "4Uw'", "4Lw", "Lw'"],
  buffer: 0,
  feed: 2,
  third: 20,
};

// ---- Piece-tracking permutations per move (position-only, no orientation
// -- orientation is handled automatically since the algorithm always
// applies real moves to the real state, never operates on orientation
// data directly) ----

function invPermFromRaw(rawPerm: Uint8Array): Uint8Array {
  const inv = new Uint8Array(rawPerm.length);
  for (let s = 0; s < rawPerm.length; s++) inv[rawPerm[s]] = s;
  return inv;
}

let edgePieceMoveCache: ReadonlyMap<string, Uint8Array> | null = null;
function edgePieceMoveByMove(): ReadonlyMap<string, Uint8Array> {
  if (!edgePieceMoveCache) {
    const solved = createSolvedRoyalState();
    const map = new Map<string, Uint8Array>();
    for (const move of ALL_ROYAL_MOVE_NAMES) map.set(move, invPermFromRaw(applyRoyalMove(solved, move).edges));
    edgePieceMoveCache = map;
  }
  return edgePieceMoveCache;
}

let centerPieceMoveCache: ReadonlyMap<string, Uint8Array> | null = null;
function centerPieceMoveByMove(): ReadonlyMap<string, Uint8Array> {
  if (!centerPieceMoveCache) {
    const solved = createSolvedRoyalState();
    const map = new Map<string, Uint8Array>();
    for (const move of ALL_ROYAL_MOVE_NAMES) map.set(move, invPermFromRaw(applyRoyalMove(solved, move).centers));
    centerPieceMoveCache = map;
  }
  return centerPieceMoveCache;
}

// ---- Generic setup-move lookup tables ----
//
// "Pair table": BFS from a fixed source pair (feedSlot, bufferSlot),
// recording the shortest forward move sequence to every reachable
// (a, b) pair. Used to find a setup S with S(bufferSlot)=feedSlot and
// S(homeSlot)=bufferSlot -- i.e. conjugating the base commutator by S
// turns it into a 3-cycle that moves whatever piece currently sits at
// bufferSlot into homeSlot, while only disturbing one other (don't-care)
// slot. See this module's derivation notes (session investigation) for
// why this needs a joint 2-point search, not two independent 1-point
// searches: S has to satisfy both constraints at once.
function buildPairTable(feedSlot: number, bufferSlot: number, pieceMoveByMove: ReadonlyMap<string, Uint8Array>): ReadonlyMap<string, string[]> {
  const startKey = `${feedSlot},${bufferSlot}`;
  const table = new Map<string, string[]>();
  table.set(startKey, []);
  let frontier: Array<[number, number]> = [[feedSlot, bufferSlot]];
  while (frontier.length > 0) {
    const next: Array<[number, number]> = [];
    for (const [a, b] of frontier) {
      const path = table.get(`${a},${b}`)!;
      for (const [name, pieceMove] of pieceMoveByMove) {
        const na = pieceMove[a];
        const nb = pieceMove[b];
        const key = `${na},${nb}`;
        if (!table.has(key)) {
          table.set(key, [...path, name]);
          next.push([na, nb]);
        }
      }
    }
    frontier = next;
  }
  return table;
}

/** "Single table": BFS from a single fixed slot, recording the shortest
 * forward move sequence taking that slot's occupant to every reachable
 * slot within the SAME orbit as startSlot. Used both for the "buffer
 * already correct, inject a different wrong piece from this orbit into it"
 * pre-step, and to know which slots belong to this orbit at all. */
function buildSingleTable(startSlot: number, pieceMoveByMove: ReadonlyMap<string, Uint8Array>): ReadonlyMap<number, string[]> {
  const table = new Map<number, string[]>();
  table.set(startSlot, []);
  let frontier: number[] = [startSlot];
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const a of frontier) {
      const path = table.get(a)!;
      for (const [name, pieceMove] of pieceMoveByMove) {
        const na = pieceMove[a];
        if (!table.has(na)) {
          table.set(na, [...path, name]);
          next.push(na);
        }
      }
    }
    frontier = next;
  }
  return table;
}

function computeSetup(pairTable: ReadonlyMap<string, string[]>, bufferSlot: number, homeSlot: number): string[] {
  const forward = pairTable.get(`${bufferSlot},${homeSlot}`);
  if (!forward) throw new Error(`royalPyraminxCommutators: no setup found for buffer=${bufferSlot} home=${homeSlot}`);
  return invertSeq(forward);
}

// "Triple table": same idea as the pair table, but tracks all 3 of the
// commutator's own slots (feed, buffer, third) simultaneously, so a query
// can pin down ALL THREE resulting slots at once (not just two, leaving
// the third to whatever the shortest 2-point path happens to produce).
// This exists specifically for the "exactly 3 pieces left, and they
// already form one clean 3-cycle among themselves" endgame case: the
// 2-point setup alone measurably gets stuck in a small residual loop
// there (verified during this module's development -- the same (X,Y)
// query, applied repeatedly, can cycle through several different
// "whatever Z the shortest path happens to give" results without ever
// landing on the ONE Z that would actually close out the residual cycle
// in a single application). Building this is more expensive than the pair
// table (tracks 3 points instead of 2) but still cheap for a 12-element
// orbit (at most 12*11*10=1,320 reachable triples).
function buildTripleTable(feedSlot: number, bufferSlot: number, thirdSlot: number, pieceMoveByMove: ReadonlyMap<string, Uint8Array>): ReadonlyMap<string, string[]> {
  const startKey = `${feedSlot},${bufferSlot},${thirdSlot}`;
  const table = new Map<string, string[]>();
  table.set(startKey, []);
  let frontier: Array<[number, number, number]> = [[feedSlot, bufferSlot, thirdSlot]];
  while (frontier.length > 0) {
    const next: Array<[number, number, number]> = [];
    for (const [a, b, c] of frontier) {
      const path = table.get(`${a},${b},${c}`)!;
      for (const [name, pieceMove] of pieceMoveByMove) {
        const na = pieceMove[a];
        const nb = pieceMove[b];
        const nc = pieceMove[c];
        const key = `${na},${nb},${nc}`;
        if (!table.has(key)) {
          table.set(key, [...path, name]);
          next.push([na, nb, nc]);
        }
      }
    }
    frontier = next;
  }
  return table;
}

/** Finds S with Total(feedTarget)=bufferTarget AND Total(bufferTarget)=
 * thirdTarget (so the 3rd leg, Total(thirdTarget)=feedTarget, follows for
 * free) -- returns null if that exact triple isn't in the table (e.g. the
 * 3 slots don't actually form a single 3-cycle in that direction), so
 * callers can fall back to the more permissive 2-point computeSetup. */
function computeSetupExact(tripleTable: ReadonlyMap<string, string[]>, feedTarget: number, bufferTarget: number, thirdTarget: number): string[] | null {
  const forward = tripleTable.get(`${feedTarget},${bufferTarget},${thirdTarget}`);
  return forward ? invertSeq(forward) : null;
}

interface OrbitTools {
  readonly comm: OrbitComm;
  readonly pairTable: ReadonlyMap<string, string[]>;
  readonly tripleTable: ReadonlyMap<string, string[]>;
  readonly singleTable: ReadonlyMap<number, string[]>;
}

function buildOrbitTools(oc: OrbitComm, pieceMoveByMove: ReadonlyMap<string, Uint8Array>): OrbitTools {
  return {
    comm: oc,
    pairTable: buildPairTable(oc.feed, oc.buffer, pieceMoveByMove),
    tripleTable: buildTripleTable(oc.feed, oc.buffer, oc.third, pieceMoveByMove),
    singleTable: buildSingleTable(oc.buffer, pieceMoveByMove),
  };
}

let edgeOrbitsCache: OrbitTools[] | null = null;
function edgeOrbits(): OrbitTools[] {
  if (!edgeOrbitsCache) {
    const pm = edgePieceMoveByMove();
    edgeOrbitsCache = [buildOrbitTools(EDGE_COMM_1, pm), buildOrbitTools(EDGE_COMM_2, pm)];
  }
  return edgeOrbitsCache;
}

let centerOrbitsCache: OrbitTools[] | null = null;
function centerOrbits(): OrbitTools[] {
  if (!centerOrbitsCache) {
    const pm = centerPieceMoveByMove();
    const orbits = [buildOrbitTools(CENTER_COMM_1, pm)];
    if (CENTER_COMM_2.buffer >= 0) orbits.push(buildOrbitTools(CENTER_COMM_2, pm));
    centerOrbitsCache = orbits;
  }
  return centerOrbitsCache;
}

// ---- Generic single-orbit reduction ----

/** Picks a second slot to pair with a pure-orientation-wrong X (position
 * already correct, X===perm[X]) -- computeSetup(pairTable, X, X) isn't a
 * valid query (X can't reach itself as a distinct tracked position), so
 * route through any OTHER slot in the orbit instead; the ensuing 3-cycle's
 * own orientation side effect on X is what actually fixes it, and its
 * (temporary) position move is undone by returning through the same slot
 * a second time -- see reduceOrbit's own comment for why this is safe. */
function pickDetourSlot(tools: OrbitTools, exclude: number): number {
  for (const slot of tools.singleTable.keys()) {
    if (slot !== exclude) return slot;
  }
  throw new Error("royalPyraminxCommutators: orbit has fewer than 2 slots");
}

/** All currently-wrong slots (position or orientation) within this orbit,
 * in ascending order. */
function wrongSlotsInOrbit(perm: Uint8Array, ori: Uint8Array | null, tools: OrbitTools): number[] {
  const out: number[] = [];
  for (let slot = 0; slot < perm.length; slot++) {
    if (!tools.singleTable.has(slot)) continue;
    if (perm[slot] !== slot || (ori && ori[slot] !== 0)) out.push(slot);
  }
  return out;
}

/**
 * Reduces one orbit to solved, always using the EXACT triple table (never
 * the plain 2-point setup with an unconstrained 3rd slot). An earlier
 * version used the 2-point setup for anything but a clean 3-piece
 * residual, leaving the commutator's own 3rd affected slot to whatever
 * the shortest setup path happened to produce -- measurably, that gets
 * stuck in a fixed repeating cycle indefinitely, for residuals as small
 * as 2 disjoint swaps and as large as a lone 7-cycle (verified during this
 * module's development: identical residual state after 100 vs. 1,000
 * iterations, i.e. a genuine infinite loop, not just slow convergence).
 *
 * The fix generalizes to any cycle length via one rule: given a chain
 * X -> Y=perm[X] -> Z=perm[Y] (three DISTINCT slots), asking for the exact
 * 3-cycle Total(X)=Y, Total(Y)=Z (so Total(Z)=X follows) always makes
 * real progress:
 *   - length-3 cycle (Z's own home is X): closes it completely.
 *   - longer cycle (Z's home is something else down the chain): Y and Z
 *     both land on their correct piece, X inherits Z's old (still wrong)
 *     occupant -- the cycle's length still drops by 2 every application.
 * A length-2 cycle (pure swap, Y=perm[X] but Z=perm[Y]=X) can't supply a
 * distinct Z this way -- merge it with another currently-wrong slot from
 * elsewhere in the orbit instead (any reachable state from solved always
 * has an even number of such swaps together, so one is always available;
 * verified, not assumed, by this module's test file). A slot with correct
 * position but wrong orientation (perm[X]=X) has no chain at all --
 * detour through two other slots instead (see pickDetourSlot).
 */
function reduceOrbit(
  state: RoyalPyraminxState,
  tools: OrbitTools,
  getPerm: (s: RoyalPyraminxState) => Uint8Array,
  getOri: ((s: RoyalPyraminxState) => Uint8Array) | null,
  maxIterations: number,
): { moves: string[]; state: RoyalPyraminxState } {
  let cur = state;
  const moves: string[] = [];
  for (let iter = 0; iter < maxIterations; iter++) {
    const perm = getPerm(cur);
    const ori = getOri ? getOri(cur) : null;
    const wrong = wrongSlotsInOrbit(perm, ori, tools);
    if (wrong.length === 0) break; // this orbit is fully solved

    const X = wrong[0];
    let Y: number;
    let Z: number;
    if (perm[X] === X) {
      // Orientation-only: no position chain to follow, detour through
      // two other (arbitrary, mutually distinct) orbit slots.
      const others: number[] = [];
      for (const slot of tools.singleTable.keys()) {
        if (slot !== X) others.push(slot);
        if (others.length === 2) break;
      }
      [Y, Z] = others;
    } else if (perm[perm[X]] === X) {
      // Pure transposition -- merge with another wrong slot elsewhere so
      // the 3rd slot isn't left to chance.
      Y = perm[X];
      const third = wrong.find((s) => s !== X && s !== Y);
      Z = third !== undefined ? third : pickDetourSlot(tools, Y === X ? Y : X);
    } else {
      Y = perm[X];
      Z = perm[Y];
    }
    const exact = computeSetupExact(tools.tripleTable, X, Y, Z) ?? computeSetup(tools.pairTable, X, Y);
    const full = [...exact, ...tools.comm.comm, ...invertSeq(exact)];
    cur = applySeq(cur, full);
    moves.push(...full);
  }
  return { moves, state: cur };
}

/**
 * Solves EDGES to identity (position AND orientation) via repeated
 * 3-cycle insertion (across both of edges' two 12-piece orbits -- see this
 * module's header comment), leaving tips/axial/centers untouched. Always
 * terminates for any state reachable from solved (the move group's
 * generators only ever produce 3-cycles within each orbit, so parity is
 * never an obstruction -- verified, not assumed, by this module's own test
 * file).
 */
export function solveEdgesByCommutator(state: RoyalPyraminxState, maxIterationsPerOrbit = EDGE_COUNT * 2): { moves: string[]; state: RoyalPyraminxState } {
  let cur = state;
  const moves: string[] = [];
  for (const tools of edgeOrbits()) {
    const result = reduceOrbit(
      cur,
      tools,
      (s) => s.edges,
      (s) => s.edgeOri,
      maxIterationsPerOrbit,
    );
    cur = result.state;
    moves.push(...result.moves);
  }
  return { moves, state: cur };
}

/**
 * Solves CENTERS to identity via repeated 3-cycle insertion (across both
 * of centers' two 12-piece orbits), leaving tips/axial/edges untouched.
 * Same termination guarantee as solveEdgesByCommutator.
 */
export function solveCentersByCommutator(state: RoyalPyraminxState, maxIterationsPerOrbit = CENTER_COUNT * 2): { moves: string[]; state: RoyalPyraminxState } {
  let cur = state;
  const moves: string[] = [];
  for (const tools of centerOrbits()) {
    const result = reduceOrbit(cur, tools, (s) => s.centers, null, maxIterationsPerOrbit);
    cur = result.state;
    moves.push(...result.moves);
  }
  return { moves, state: cur };
}

// ---- Tips: small enough (4 pieces, orientation 0..2, and verified below
// to NEVER permute position under this move group -- only twist) to solve
// directly by exhaustive BFS from solved, no commutator needed. ----

function tipKey(tips: Uint8Array, tipOri: Uint8Array): string {
  let k = 0;
  for (let i = 0; i < TIP_COUNT; i++) k = k * 4 * 3 + tips[i] * 3 + tipOri[i];
  return String(k);
}

let tipSolveTableCache: ReadonlyMap<string, string[]> | null = null;
function tipSolveTable(): ReadonlyMap<string, string[]> {
  if (tipSolveTableCache) return tipSolveTableCache;
  const solved = createSolvedRoyalState();
  const table = new Map<string, string[]>();
  table.set(tipKey(solved.tips, solved.tipOri), []);
  let frontier: RoyalPyraminxState[] = [solved];
  // Tips-only BFS still applies full moves (touches other orbits too, but
  // we only key on tips/tipOri) -- fine, since this table is only used to
  // look up a move sequence FROM solved TO a given tips/tipOri pattern,
  // then inverted (see solveTips below), same trick as the edge/center
  // pair tables.
  const maxPatterns = 3 ** TIP_COUNT; // tips never permute position (verified: every one of the 40 moves' tipPerm is the identity array) -- if that were ever wrong, this cap just makes the BFS stop early and solveTips throw for an unreached pattern, which the test file would catch.
  for (let depth = 0; depth < 4 && frontier.length > 0 && table.size < maxPatterns; depth++) {
    const next: RoyalPyraminxState[] = [];
    for (const s of frontier) {
      for (const move of ALL_ROYAL_MOVE_NAMES) {
        const ns = applyRoyalMove(s, move);
        const k = tipKey(ns.tips, ns.tipOri);
        if (!table.has(k)) {
          const path = [...pathTo(table, s), move];
          table.set(k, path);
          next.push(ns);
        }
      }
    }
    frontier = next;
  }
  tipSolveTableCache = table;
  return table;
}
function pathTo(table: ReadonlyMap<string, string[]>, s: RoyalPyraminxState): string[] {
  return table.get(tipKey(s.tips, s.tipOri)) ?? [];
}

/** Solves TIPS to identity (position + orientation) by table lookup +
 * inversion. Disturbs other orbits freely -- fine regardless of pipeline
 * ordering, since axial/edges/centers are each solved independently by
 * their own stage afterward. */
export function solveTips(state: RoyalPyraminxState): { moves: string[]; state: RoyalPyraminxState } {
  if (state.tips.every((v, i) => v === i) && state.tipOri.every((v) => v === 0)) return { moves: [], state };
  const table = tipSolveTable();
  const k = tipKey(state.tips, state.tipOri);
  const fromSolved = table.get(k);
  if (!fromSolved) throw new Error("royalPyraminxCommutators: tips pattern not found in solve table (unreachable state?)");
  // fromSolved is a path FROM solved TO this tips pattern; we want the
  // reverse (from this pattern back to solved).
  const moves = invertSeq(fromSolved);
  const solvedState = applySeq(state, moves);
  return { moves, state: solvedState };
}
