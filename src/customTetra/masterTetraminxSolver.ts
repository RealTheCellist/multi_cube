import * as THREE from "three";
import { nearestFaceIndex, VERTEX_INDICES, type VertexIndex } from "./tetraMath";
import { applyRawThirdTurn, buildSolvedTetra, isSolved, type PieceType, type TetraState } from "./tetraState";
import type { CustomTetraScene } from "./CustomTetraScene";

export interface TetraMove {
  vertexIndex: VertexIndex;
  depth: number;
  sign: 1 | -1;
}

function centroidOf(corners: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3]): THREE.Vector3 {
  return corners[0].clone().add(corners[1]).add(corners[2]).divideScalar(3);
}

function moveKey(m: TetraMove): string {
  return `${m.vertexIndex}_${m.depth}_${m.sign}`;
}

function invertMove(m: TetraMove): TetraMove {
  return { vertexIndex: m.vertexIndex, depth: m.depth, sign: (-m.sign) as 1 | -1 };
}

function cloneState(state: TetraState): TetraState {
  return {
    layerCount: state.layerCount,
    stickers: state.stickers.map((s) => ({
      ...s,
      corners: [s.corners[0].clone(), s.corners[1].clone(), s.corners[2].clone()] as [THREE.Vector3, THREE.Vector3, THREE.Vector3],
    })),
  };
}

interface PrecomputedMoves {
  ns: number;
  layerCount: number;
  pieceTypes: PieceType[];
  referenceCentroids: THREE.Vector3[];
  permByMove: Map<string, number[]>;
  allMoves: TetraMove[];
}

const precomputedCache = new Map<number, PrecomputedMoves>();

/**
 * Every primitive move's net effect as a slot permutation ("newPieces[i] =
 * oldPieces[permutation[i]]" -- the same pull convention cubing/kpuzzle
 * itself uses, verified empirically during this feature's investigation),
 * derived once per layerCount and cached: build a fresh solved state, apply
 * ONE raw turn, then match each sticker's new centroid back to its nearest
 * solved-state reference position. Every solver phase below reuses this
 * instead of re-deriving permutations from live 3D geometry per candidate.
 */
function precompute(layerCount: number): PrecomputedMoves {
  const cached = precomputedCache.get(layerCount);
  if (cached) return cached;

  const solved = buildSolvedTetra(layerCount);
  const ns = solved.stickers.length;
  const referenceCentroids = solved.stickers.map((s) => centroidOf(s.corners));
  const pieceTypes = solved.stickers.map((s) => s.pieceType);

  const allMoves: TetraMove[] = [];
  for (const vertexIndex of VERTEX_INDICES) {
    for (let depth = 1; depth <= layerCount - 1; depth++) {
      for (const sign of [1, -1] as const) allMoves.push({ vertexIndex, depth, sign });
    }
  }

  const permByMove = new Map<string, number[]>();
  for (const move of allMoves) {
    const fresh = buildSolvedTetra(layerCount);
    applyRawThirdTurn(fresh, move.vertexIndex, move.depth, move.sign);
    const movedTo = new Array<number>(ns);
    for (let id = 0; id < ns; id++) {
      const c = centroidOf(fresh.stickers[id].corners);
      let bestSlot = -1;
      let bestDist = Infinity;
      for (let slot = 0; slot < ns; slot++) {
        const dist = c.distanceToSquared(referenceCentroids[slot]);
        if (dist < bestDist) {
          bestDist = dist;
          bestSlot = slot;
        }
      }
      movedTo[id] = bestSlot;
    }
    const permutation = new Array<number>(ns);
    for (let id = 0; id < ns; id++) permutation[movedTo[id]] = id;
    permByMove.set(moveKey(move), permutation);
  }

  const result: PrecomputedMoves = { ns, layerCount, pieceTypes, referenceCentroids, permByMove, allMoves };
  precomputedCache.set(layerCount, result);
  return result;
}

function applyPerm(pieces: readonly number[], perm: readonly number[]): number[] {
  const out = new Array<number>(pieces.length);
  for (let i = 0; i < pieces.length; i++) out[i] = pieces[perm[i]];
  return out;
}

/** Same as applyPerm but for Uint8Array state keys -- a plain number[] of a
 * BFS state (meetInMiddleSolve/meetInMiddleSolveEdges) costs ~6-7x more
 * memory per array than a Uint8Array of the same length (V8 boxes/pads a
 * generic array's elements; a typed array is a flat byte buffer), which
 * matters a lot once a search visits millions of states -- confirmed
 * directly: this plus SearchEntry's parent-pointer path storage were both
 * needed to stop an out-of-memory crash once the axial-only+center-cleanup
 * fallback pushed maxStates past what the original 2,000,000 budget was
 * ever measured against. Piece identities here max out at pre.ns-1 (well
 * under 255), so Uint8Array is a safe, lossless fit. */
function applyPermU8(pieces: Uint8Array, perm: readonly number[]): Uint8Array {
  const out = new Uint8Array(pieces.length);
  for (let i = 0; i < pieces.length; i++) out[i] = pieces[perm[i]];
  return out;
}

/**
 * pieces[slot] = which solved-reference sticker id is currently sitting
 * there -- the same "pull" convention permByMove's arrays use (see
 * precompute's own comment), so meetInMiddleSolve's applyPerm chaining can
 * treat this as a valid starting point. Must loop by REFERENCE SLOT and
 * search for the nearest CURRENT sticker id, not the other way around: for
 * any state that isn't already solved, "loop by sticker id and find its
 * nearest slot" produces the functional INVERSE of this convention (it only
 * coincides with the correct array for the identity/solved case, since an
 * identity permutation is its own inverse) -- confirmed empirically via a
 * bidirectional-BFS solve that reported success against its own internal
 * key match yet, on the real puzzle, left axial/center/edge pieces wrong
 * (production N=4 solver investigation).
 */
function patternFromState(state: TetraState, pre: PrecomputedMoves): number[] {
  const currentCentroids = state.stickers.map((s) => centroidOf(s.corners));
  const pieces = new Array<number>(pre.ns);
  for (let slot = 0; slot < pre.ns; slot++) {
    let bestId = -1;
    let bestDist = Infinity;
    for (let id = 0; id < pre.ns; id++) {
      const dist = currentCentroids[id].distanceToSquared(pre.referenceCentroids[slot]);
      if (dist < bestDist) {
        bestDist = dist;
        bestId = id;
      }
    }
    pieces[slot] = bestId;
  }
  return pieces;
}

interface SearchEntry {
  pieces: Uint8Array;
  move: TetraMove | null;
  parent: SearchEntry | null;
}

/** Reconstructs the chronological move list from start by walking parent
 * pointers -- O(path length) per call, done ONCE when a meeting point is
 * found, instead of every entry carrying its own full copied array (which
 * made memory scale with depth x states instead of just states, and was
 * the direct cause of an out-of-memory crash once fallback callers pushed
 * maxStates/maxDepthEachSide past the values this was originally tuned
 * for). */
function pathFromEntry(entry: SearchEntry): TetraMove[] {
  const moves: TetraMove[] = [];
  for (let e: SearchEntry | null = entry; e && e.move; e = e.parent) moves.push(e.move);
  moves.reverse();
  return moves;
}

/**
 * Bidirectional (meet-in-the-middle) BFS restricted to a subset of piece
 * types -- solves for those pieces alone, ignoring where anything else ends
 * up (a "quotient" state space: many full 64-sticker states collapse onto
 * the same key here, which is what makes this fast). Each side only needs
 * to reach half the true distance to solved, so this covers much deeper
 * effective solves than one-sided BFS at the same node-count cost.
 *
 * This exists because a single search over the WHOLE 64-sticker puzzle is
 * intractable for a Master-Pyraminx-family tetrahedron: neither a plain
 * generic solver (cubing/search's twsearch wrapper) nor a hand-built
 * commutator library (verified to work great for edges alone, 40/40
 * scrambles solved in under a second) could handle the axial+center pieces
 * -- every commutator touching them, no matter how deep the search for one,
 * turned out to move a fixed, rigid "all 4 centers + 6 more axial stickers"
 * shape, with no smaller or more varied alternative ever found. This
 * bidirectional BFS sidesteps needing any hand-derived algorithm at all,
 * and is what actually solves axial+center reliably (40/40 scrambles,
 * under a second each, 4-10 move solutions -- see the investigation this
 * grew out of).
 */
/**
 * Hard ceiling on total visited states (both search directions combined)
 * for any single meetInMiddleSolve* call. Without this, a scramble whose
 * true solution lies past maxDepthEachSide can grow the visited maps
 * without bound and crash the whole process with an unrecoverable
 * "JavaScript heap out of memory" -- confirmed to actually happen on a real
 * N=5 scramble (see N5_EDGE_REPAIR_AND_FAILURE_SAFETY_VALIDATION Sprint).
 * Calibrated empirically against real N=5 axial+center searches: successful
 * 10-move solves peaked around ~1.07M visited states, so 2,000,000 leaves
 * comfortable headroom for legitimate solves (N=4's much smaller
 * axial+center target space stays far below this) while still aborting
 * an unsolvable-within-budget case in ~30s on ordinary heap instead of
 * exhausting memory. The check runs INSIDE each expansion loop (not just
 * once per depth level) because a single depth level's own expansion can
 * itself blow past any per-depth-only check before it ever runs.
 */
const MAX_SEARCH_STATES = 2_000_000;

function meetInMiddleSolve(pre: PrecomputedMoves, startPieces: number[], targetTypes: ReadonlySet<PieceType>, maxDepthEachSide: number, maxStates: number = MAX_SEARCH_STATES): TetraMove[] | null {
  const targetSlots: number[] = [];
  for (let i = 0; i < pre.ns; i++) if (targetTypes.has(pre.pieceTypes[i])) targetSlots.push(i);

  // Every search state here only ever needs the `targetSlots.length` values
  // this function actually reads (52 of the full 100 slots for N=5's
  // axial+center target) -- so transitions and keys operate on a COMPACT
  // local array indexed 0..targetSlots.length-1, not the full `pre.ns`-sized
  // pieces array. This is lossless: legal moves never move a piece between
  // different pieceType categories, so every primitive's full permutation,
  // restricted to targetSlots, is itself a well-defined permutation of
  // targetSlots -- composing on the local array produces EXACTLY the same
  // targetSlots-projection as composing on the full array and projecting
  // afterward. Verified before this was applied
  // (N5_PHASE1_COMPACT_STATE_REPRESENTATION_VALIDATION Sprint): 0 mismatches
  // across 160,000 sampled (state, move) transition pairs, 0 key-equivalence
  // violations across 500,000 sampled states, byte-identical solutions on
  // all 20 fixed validation seeds. The ~48% smaller per-state array (52 vs
  // 100 elements) also shrinks the state-key strings built each visit (see
  // N5_PHASE1_STATE_KEY_OPTIMIZATION_VALIDATION Sprint for that encoding).
  const targetSlotPosition = new Map<number, number>(targetSlots.map((slot, i) => [slot, i]));
  const localPermByMove = new Map<string, number[]>();
  for (const move of pre.allMoves) {
    const fullPerm = pre.permByMove.get(moveKey(move))!;
    const localPerm = targetSlots.map((slot) => targetSlotPosition.get(fullPerm[slot])!);
    localPermByMove.set(moveKey(move), localPerm);
  }

  const keyFor = (local: readonly number[]) => String.fromCharCode(...local.map((v) => v + 32));
  const buildPath = (fwdEntry: SearchEntry, bwdEntry: SearchEntry): TetraMove[] => [...pathFromEntry(fwdEntry), ...pathFromEntry(bwdEntry).reverse().map(invertMove)];

  const startLocal = Uint8Array.from(targetSlots.map((slot) => targetSlotPosition.get(startPieces[slot])!));
  const fwdVisited = new Map<string, SearchEntry>();
  const startEntry: SearchEntry = { pieces: startLocal, move: null, parent: null };
  fwdVisited.set(keyFor(startLocal), startEntry);
  let fwdFrontier: SearchEntry[] = [startEntry];

  const solvedLocal = Uint8Array.from(targetSlots.map((_slot, i) => i));
  const bwdVisited = new Map<string, SearchEntry>();
  const solvedEntry: SearchEntry = { pieces: solvedLocal, move: null, parent: null };
  bwdVisited.set(keyFor(solvedLocal), solvedEntry);
  let bwdFrontier: SearchEntry[] = [solvedEntry];

  if (fwdVisited.has(keyFor(solvedLocal))) return [];

  const totalVisited = () => fwdVisited.size + bwdVisited.size;

  for (let depth = 1; depth <= maxDepthEachSide; depth++) {
    const newFwd = new Map<string, SearchEntry>();
    for (const parentEntry of fwdFrontier) {
      for (const move of pre.allMoves) {
        const next = applyPermU8(parentEntry.pieces, localPermByMove.get(moveKey(move))!);
        const k = keyFor(next);
        if (!fwdVisited.has(k)) {
          const entry: SearchEntry = { pieces: next, move, parent: parentEntry };
          fwdVisited.set(k, entry);
          newFwd.set(k, entry);
          if (totalVisited() > maxStates) return null;
          // Check immediately, not just once per depth level: if the budget
          // is hit partway through building this level's map, a deferred
          // check would never run at all, silently skipping every state
          // generated so far this level even if one already matched.
          const hit = bwdVisited.get(k);
          if (hit) return buildPath(entry, hit);
        }
      }
    }
    fwdFrontier = [...newFwd.values()];

    const newBwd = new Map<string, SearchEntry>();
    for (const parentEntry of bwdFrontier) {
      for (const move of pre.allMoves) {
        const next = applyPermU8(parentEntry.pieces, localPermByMove.get(moveKey(move))!);
        const k = keyFor(next);
        if (!bwdVisited.has(k)) {
          const entry: SearchEntry = { pieces: next, move, parent: parentEntry };
          bwdVisited.set(k, entry);
          newBwd.set(k, entry);
          if (totalVisited() > maxStates) return null;
          const hit = fwdVisited.get(k);
          if (hit) return buildPath(hit, entry);
        }
      }
    }
    bwdFrontier = [...newBwd.values()];
  }

  return null;
}

/**
 * Fallback constructive solver for axial+center, used only when
 * meetInMiddleSolve(["axial","center"]) exhausts its budget without a
 * match -- confirmed (N5_AXIAL_CENTER_FALLBACK_VALIDATION investigation) to
 * happen on a small number of adversarial scrambles whose true axial+center
 * distance provably exceeds what a combined bidirectional search can prove
 * within any practical budget (one such scramble's minimal distance was
 * proven >=16 by exhaustive IDA* -- the search tree at that depth is far
 * too large for real-time use).
 *
 * The fix: stop requiring axial and center to match SIMULTANEOUSLY.
 * meetInMiddleSolve(["axial"]) alone (centers don't-care) turned out to be
 * dramatically shallower for these same scrambles (length 11, found in
 * seconds) -- solving axial+center together is hard, but solving axial
 * ALONE is not. Once axial is fixed, any center disturbance left behind is
 * cleaned up with this dedicated 3-cycle commutator: a 12-move sequence
 * verified (by direct composition from the identity, independent of any
 * live state) to touch EXACTLY 3 center slots as a pure 3-cycle, combined
 * with a setup-move table (BFS over reachable ordered triples via
 * conjugation) that reaches ALL 12x11x10=1,320 possible ordered triples of
 * the puzzle's 12 center pieces -- i.e. it can cycle ANY 3 chosen centers,
 * so this phase always succeeds once axial is solved (axial/center piece
 * type is conserved by every move, verified, so this cleanup can never
 * re-disturb the axial pieces the first phase just fixed).
 *
 * Trade-off: this fallback path produces much longer solutions (dozens to
 * ~100 moves, vs 4-10 for the common case) -- acceptable ONLY as a rare
 * safety net so a solve always completes, not as the primary strategy.
 */
interface CenterCommutatorTools {
  cycleThreeMoves(fullSlotA: number, fullSlotB: number, fullSlotC: number): TetraMove[] | null;
}

const centerCommutatorCache = new Map<number, CenterCommutatorTools>();

function buildCenterCommutatorTools(pre: PrecomputedMoves): CenterCommutatorTools {
  const cached = centerCommutatorCache.get(pre.layerCount);
  if (cached) return cached;

  const targetSlots: number[] = [];
  for (let i = 0; i < pre.ns; i++) if (pre.pieceTypes[i] === "axial" || pre.pieceTypes[i] === "center") targetSlots.push(i);
  const targetSlotPosition = new Map<number, number>(targetSlots.map((slot, i) => [slot, i]));
  const localPermByMove = new Map<string, number[]>();
  for (const move of pre.allMoves) {
    const fullPerm = pre.permByMove.get(moveKey(move))!;
    const localPerm = targetSlots.map((slot) => targetSlotPosition.get(fullPerm[slot])!);
    localPermByMove.set(moveKey(move), localPerm);
  }
  const n = targetSlots.length;
  const identity = Array.from({ length: n }, (_, i) => i);
  const composeLocal = (a: readonly number[], b: readonly number[]): number[] => {
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) out[i] = a[b[i]];
    return out;
  };

  // Hand-found commutator [A,B]=A B A' B': verified below to be a pure
  // 3-cycle on exactly 3 center slots (whichever 3 that turns out to be --
  // derived from the actual permutation rather than assumed, so this stays
  // correct even if precompute()'s internal slot ordering ever changes).
  // This specific (A,B) pair was chosen out of 49 candidates found by an
  // exhaustive length<=3+3 search (all pure-center-3-cycle, axial-identity)
  // for the one with ZERO edge collateral disturbance -- earlier candidates
  // (e.g. the first one found) touched ~8 edge slots per application, which
  // compounded across the several rounds a hard scramble needs into edge
  // damage too deep for meetInMiddleSolveEdges' budget to undo.
  const A_MOVES: TetraMove[] = [
    { vertexIndex: 0, depth: 2, sign: 1 },
    { vertexIndex: 1, depth: 3, sign: 1 },
    { vertexIndex: 1, depth: 4, sign: -1 },
  ];
  const B_MOVES: TetraMove[] = [
    { vertexIndex: 0, depth: 4, sign: 1 },
    { vertexIndex: 1, depth: 3, sign: 1 },
    { vertexIndex: 0, depth: 4, sign: -1 },
  ];
  const COMM_MOVES: TetraMove[] = [...A_MOVES, ...B_MOVES, ...A_MOVES.slice().reverse().map(invertMove), ...B_MOVES.slice().reverse().map(invertMove)];
  let commPerm = identity;
  for (const m of COMM_MOVES) commPerm = composeLocal(commPerm, localPermByMove.get(moveKey(m))!);

  const affected: number[] = [];
  for (let i = 0; i < n; i++) if (commPerm[i] !== i) affected.push(i);
  if (affected.length !== 3) throw new Error(`center commutator sanity check failed: support=${affected.length} (expected 3)`);
  const c0 = affected[0];
  const c1 = commPerm[c0];
  const c2 = commPerm[c1];
  if (commPerm[c2] !== c0 || pre.pieceTypes[targetSlots[c0]] !== "center") {
    throw new Error("center commutator sanity check failed: not a pure 3-cycle on center slots");
  }
  const baseTriple: [number, number, number] = [c0, c1, c2];

  // Setup-move table: BFS over ordered triples reachable from baseTriple by
  // conjugation, so the base commutator can be relabeled onto ANY 3 chosen
  // center slots (S . COMM_MOVES . S^-1 for whichever setup S maps
  // baseTriple to the target triple).
  const tripleKey = (a: number, b: number, c: number) => `${a},${b},${c}`;
  const genKey = (m: TetraMove) => `${m.vertexIndex}_${m.depth}`;
  const setupTable = new Map<string, TetraMove[]>();
  setupTable.set(tripleKey(...baseTriple), []);
  let frontier: { triple: [number, number, number]; lastGen: string | null; moves: TetraMove[] }[] = [{ triple: baseTriple, lastGen: null, moves: [] }];
  for (let depth = 0; depth < 8 && frontier.length > 0; depth++) {
    const next: typeof frontier = [];
    for (const node of frontier) {
      for (const move of pre.allMoves) {
        const gk = genKey(move);
        if (gk === node.lastGen) continue;
        const perm = localPermByMove.get(moveKey(move))!;
        const nt: [number, number, number] = [perm[node.triple[0]], perm[node.triple[1]], perm[node.triple[2]]];
        const k = tripleKey(...nt);
        if (!setupTable.has(k)) {
          const moves = [...node.moves, move];
          setupTable.set(k, moves);
          next.push({ triple: nt, lastGen: gk, moves });
        }
      }
    }
    frontier = next;
  }

  function cycleThreeMoves(fullSlotA: number, fullSlotB: number, fullSlotC: number): TetraMove[] | null {
    const p1 = targetSlotPosition.get(fullSlotA);
    const p2 = targetSlotPosition.get(fullSlotB);
    const p3 = targetSlotPosition.get(fullSlotC);
    if (p1 === undefined || p2 === undefined || p3 === undefined) return null;
    const entry = setupTable.get(tripleKey(p1, p2, p3));
    if (!entry) return null;
    // Setup-table moves compose as the REVERSE chronological sequence when
    // read forward (verified empirically during this feature's
    // investigation) -- reverse (not invert) for the setup, and invert
    // without reversing for the setup's undo.
    const setup = entry.slice().reverse();
    const setupInv = entry.map(invertMove);
    return [...setup, ...COMM_MOVES, ...setupInv];
  }

  const tools: CenterCommutatorTools = { cycleThreeMoves };
  centerCommutatorCache.set(pre.layerCount, tools);
  return tools;
}

/**
 * Insertion-style solve: repeatedly take a misplaced center piece, trace
 * its 3-cycle, apply cycleThreeMoves. Terminates in a bounded number of
 * rounds (each fixes >=2 pieces) since the center commutator is fully
 * transitive (any 3 chosen center slots are reachable).
 */
function solveCentersByCommutator(pre: PrecomputedMoves, currentFullPattern: readonly number[]): TetraMove[] | null {
  const tools = buildCenterCommutatorTools(pre);
  const centerSlots: number[] = [];
  for (let i = 0; i < pre.ns; i++) if (pre.pieceTypes[i] === "center") centerSlots.push(i);

  const pieces = new Map<number, number>(centerSlots.map((slot) => [slot, currentFullPattern[slot]]));
  const allMoves: TetraMove[] = [];
  const MAX_ROUNDS = 60;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const misplaced = centerSlots.filter((slot) => pieces.get(slot) !== slot);
    if (misplaced.length === 0) return allMoves;
    const p1 = misplaced[0];
    const p2 = pieces.get(p1)!;
    let p3 = pieces.get(p2)!;
    if (p3 === p1) {
      const borrow = misplaced.find((x) => x !== p1 && x !== p2);
      if (borrow === undefined) return null; // single 2-cycle left -- should be impossible (parity)
      p3 = borrow;
    }
    // Argument order here is tied to the SPECIFIC (A,B) commutator above --
    // its cycle direction was verified empirically (a wrong order leaves
    // misplaced count unchanged round after round instead of converging: it
    // applies every insertion "backwards"). Re-verify this order if the
    // commutator's move sequence ever changes.
    const cycMoves = tools.cycleThreeMoves(p1, p2, p3);
    if (!cycMoves) return null;
    for (const m of cycMoves) {
      const perm = pre.permByMove.get(moveKey(m))!;
      const next = new Map<number, number>();
      for (const slot of centerSlots) next.set(slot, pieces.get(perm[slot])!);
      for (const [k, v] of next) pieces.set(k, v);
    }
    allMoves.push(...cycMoves);
  }
  return null;
}

/**
 * 16 hand-discovered commutators (setup-move length <=2, so [A,B]=ABA'B' is
 * 8 primitives each), each verified -- by composing purely from the identity
 * permutation, independent of any live state -- to touch ONLY "edge" slots:
 * zero net effect on axial/center/tip. Together they touch all 24 edge
 * slots at least 4x over (found via a greedy set-cover search).
 *
 * These exist because meetInMiddleSolve's raw-primitive search, run with a
 * target set cumulative with the prior phase (["axial","center","edge"], to
 * keep that phase's already-fixed pieces from being re-disturbed), is
 * combinatorially unworkable: the key space covers all 52 axial+center+edge
 * slots, and even maxDepthEachSide=7 exhausts the browser tab's memory
 * before finding a match (maxDepthEachSide=6 sometimes fails outright,
 * taking up to a minute to give up). Since every one of these commutators
 * is ALREADY a no-op on axial/center by construction, composing them needs
 * no such protection: the search space collapses back down to edge-only (24
 * slots, matching the "edges alone" case that was always fast), while every
 * move in it is safe by construction rather than by hope.
 */
const EDGE_SAFE_GENERATORS: readonly (readonly TetraMove[])[] = [
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 2, sign: 1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 1, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 1, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 1, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 1, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 1, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }],
  [{ vertexIndex: 0, depth: 1, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 1, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }],
];

/**
 * EDGE_SAFE_GENERATORS' 16 sequences were hand-derived for N=4's geometry
 * (24 edges, depths 1-3) and are literal no-ops on N=5 (36 edges, depths
 * 1-4): reusing the same (vertexIndex, depth, sign) tuples against N=5's
 * different depth-to-layer mapping composes back to the identity permutation
 * every time (verified computationally: all 16/16 are identity on N=5 --
 * see N5_EDGE_REPAIR_AND_FAILURE_SAFETY_VALIDATION Sprint's Gate 0). This is
 * N=5's own edge-safe generator library, derived the same way but from N=5's
 * actual primitives.
 *
 * Simpler shape than EDGE_SAFE_GENERATORS: each is a plain 4-move commutator
 * [S, M, S^-1, M^-1] where S and M are single primitives on two different
 * vertices at "complementary" depths (depth 2 paired with depth 4, or depth
 * 3 paired with depth 3 -- these are exactly the depth pairs whose
 * axial+center displacement cancels out algebraically; every other pairing
 * leaves axial+center residue and was excluded). Found via exhaustive search
 * over all (S, M) primitive pairs, filtered to axial+center-identity AND
 * edge-non-identity, then deduplicated by net edge effect: 144 distinct
 * survive out of the 1,024 primitive pairs tried.
 *
 * All 144 (not a smaller coverage-optimized subset) are kept deliberately: a
 * smaller ~24-generator subset chosen to touch every edge slot at least 4x
 * over (the same "coverage" heuristic that worked for EDGE_SAFE_GENERATORS)
 * was tried first and generates a group of only 729 elements under which
 * NONE of the real scrambled edge states tested were reachable. The full
 * 144-generator set was verified to actually solve real post-Phase-1 N=5
 * edge states (2 of 3 control seeds solved within meetInMiddleSolveEdges's
 * existing maxDepthEachSide=6 and the MAX_SEARCH_STATES budget below; the
 * third exhausted the budget without a definitive answer either way, not a
 * proof of impossibility).
 */
export const EDGE_SAFE_GENERATORS_N5: readonly (readonly TetraMove[])[] = [
  [{ vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: 1 }],
  [{ vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: -1 }],
  [{ vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: 1 }],
  [{ vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: -1 }],
  [{ vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: 1 }],
  [{ vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: -1 }],
  [{ vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: 1 }],
  [{ vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: -1 }],
  [{ vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: 1 }],
  [{ vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: -1 }],
  [{ vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: 1 }],
  [{ vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: -1 }],
  [{ vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }],
  [{ vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }],
  [{ vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }],
  [{ vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: -1 }],
  [{ vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: 1 }],
  [{ vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }],
  [{ vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }],
  [{ vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }],
  [{ vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: 1 }],
  [{ vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }],
  [{ vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }],
  [{ vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: -1 }],
  [{ vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }],
  [{ vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }],
  [{ vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }],
  [{ vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }],
  [{ vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }],
  [{ vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: -1 }],
  [{ vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: 1 }],
  [{ vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }],
  [{ vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: 1 }],
  [{ vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }],
  [{ vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: 1 }],
  [{ vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }],
  [{ vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: 1 }],
  [{ vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: -1 }],
  [{ vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: 1 }],
  [{ vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: -1 }],
  [{ vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: 1 }],
  [{ vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: -1 }],
  [{ vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: 1 }],
  [{ vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: -1 }],
  [{ vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: 1 }],
  [{ vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: -1 }],
  [{ vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: 1 }],
  [{ vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: -1 }],
  [{ vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }],
  [{ vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }],
  [{ vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }],
  [{ vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: -1 }],
  [{ vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: 1 }],
  [{ vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }],
  [{ vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: 1 }],
  [{ vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }],
  [{ vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: 1 }],
  [{ vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }],
  [{ vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }],
  [{ vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: -1 }],
  [{ vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }],
  [{ vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }],
  [{ vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }],
  [{ vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }],
  [{ vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }],
  [{ vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: -1 }],
  [{ vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: 1 }],
  [{ vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }],
  [{ vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: 1 }],
  [{ vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }],
  [{ vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: 1 }],
  [{ vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }],
  [{ vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: 1 }],
  [{ vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: -1 }],
  [{ vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: 1 }],
  [{ vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: -1 }],
  [{ vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: 1 }],
  [{ vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: -1 }],
  [{ vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: 1 }],
  [{ vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: -1 }],
  [{ vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: 1 }],
  [{ vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: -1 }],
  [{ vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: 1 }],
  [{ vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: -1 }],
  [{ vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }],
  [{ vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }],
  [{ vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }],
  [{ vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }],
  [{ vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: 1 }],
  [{ vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }],
  [{ vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: 1 }],
  [{ vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }],
  [{ vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }],
  [{ vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }],
  [{ vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }],
  [{ vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: -1 }],
  [{ vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }],
  [{ vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }],
  [{ vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }],
  [{ vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }],
  [{ vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }],
  [{ vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: -1 }],
  [{ vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: 1 }],
  [{ vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }],
  [{ vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: 1 }],
  [{ vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }],
  [{ vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: 1 }],
  [{ vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }],
  [{ vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: 1 }],
  [{ vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: -1 }],
  [{ vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: 1 }],
  [{ vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: -1 }],
  [{ vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: 1 }],
  [{ vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: -1 }],
  [{ vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: 1 }],
  [{ vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 0, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 0, depth: 4, sign: -1 }],
  [{ vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: 1 }],
  [{ vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 1, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 1, depth: 4, sign: -1 }],
  [{ vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: -1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: 1 }],
  [{ vertexIndex: 3, depth: 2, sign: 1 }, { vertexIndex: 2, depth: 4, sign: 1 }, { vertexIndex: 3, depth: 2, sign: -1 }, { vertexIndex: 2, depth: 4, sign: -1 }],
  [{ vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }],
  [{ vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }],
  [{ vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }],
  [{ vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }],
  [{ vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }],
  [{ vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: -1 }],
  [{ vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: 1 }],
  [{ vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 0, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 0, depth: 3, sign: -1 }],
  [{ vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: 1 }],
  [{ vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 1, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 1, depth: 3, sign: -1 }],
  [{ vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: -1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: 1 }],
  [{ vertexIndex: 3, depth: 3, sign: 1 }, { vertexIndex: 2, depth: 3, sign: 1 }, { vertexIndex: 3, depth: 3, sign: -1 }, { vertexIndex: 2, depth: 3, sign: -1 }],
  [{ vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }],
  [{ vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }],
  [{ vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }],
  [{ vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }],
  [{ vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }],
  [{ vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }],
  [{ vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: 1 }],
  [{ vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 0, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 0, depth: 2, sign: -1 }],
  [{ vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: 1 }],
  [{ vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 1, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 1, depth: 2, sign: -1 }],
  [{ vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: -1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: 1 }],
  [{ vertexIndex: 3, depth: 4, sign: 1 }, { vertexIndex: 2, depth: 2, sign: 1 }, { vertexIndex: 3, depth: 4, sign: -1 }, { vertexIndex: 2, depth: 2, sign: -1 }],
];

interface EdgeGeneratorMove {
  perm: number[];
  primitives: readonly TetraMove[];
  invPrimitives: readonly TetraMove[];
}

const edgeGeneratorCache = new Map<number, EdgeGeneratorMove[]>();

function edgeGeneratorMoves(pre: PrecomputedMoves): EdgeGeneratorMove[] {
  const cached = edgeGeneratorCache.get(pre.ns);
  if (cached) return cached;
  const source = pre.layerCount === 5 ? EDGE_SAFE_GENERATORS_N5 : EDGE_SAFE_GENERATORS;
  const built = source.map((seq) => {
    let perm = Array.from({ length: pre.ns }, (_, i) => i);
    for (const m of seq) perm = applyPerm(perm, pre.permByMove.get(moveKey(m))!);
    return { perm, primitives: seq, invPrimitives: [...seq].reverse().map(invertMove) };
  });
  edgeGeneratorCache.set(pre.ns, built);
  return built;
}

interface CompoundSearchEntry {
  pieces: Uint8Array;
  gm: EdgeGeneratorMove | null;
  parent: CompoundSearchEntry | null;
}

/** Same rationale as pathFromEntry: reconstruct the generator-move path by
 * walking parent pointers instead of every entry copying an ever-growing
 * array. */
function edgeGeneratorPathFromEntry(entry: CompoundSearchEntry): EdgeGeneratorMove[] {
  const gms: EdgeGeneratorMove[] = [];
  for (let e: CompoundSearchEntry | null = entry; e && e.gm; e = e.parent) gms.push(e.gm);
  gms.reverse();
  return gms;
}

/**
 * Same bidirectional meet-in-the-middle shape as meetInMiddleSolve, but
 * composed from EDGE_SAFE_GENERATORS instead of raw primitives -- see that
 * constant's comment for why. Target is always edge-only since every
 * generator is already a no-op elsewhere.
 */
function meetInMiddleSolveEdges(pre: PrecomputedMoves, startPieces: number[], maxDepthEachSide: number, maxStates: number = MAX_SEARCH_STATES): TetraMove[] | null {
  const generators = edgeGeneratorMoves(pre);
  const targetSlots: number[] = [];
  for (let i = 0; i < pre.ns; i++) if (pre.pieceTypes[i] === "edge") targetSlots.push(i);

  const keyFor = (pieces: readonly number[]) => targetSlots.map((i) => pieces[i]).join(",");
  const buildPath = (fwdEntry: CompoundSearchEntry, bwdEntry: CompoundSearchEntry): TetraMove[] => [
    ...edgeGeneratorPathFromEntry(fwdEntry).flatMap((gm) => gm.primitives),
    ...edgeGeneratorPathFromEntry(bwdEntry).reverse().flatMap((gm) => gm.invPrimitives),
  ];

  const fwdVisited = new Map<string, CompoundSearchEntry>();
  const startPiecesU8 = Uint8Array.from(startPieces);
  const startEntry: CompoundSearchEntry = { pieces: startPiecesU8, gm: null, parent: null };
  fwdVisited.set(keyFor(startPiecesU8), startEntry);
  let fwdFrontier: CompoundSearchEntry[] = [startEntry];

  const solvedPieces = Uint8Array.from({ length: pre.ns }, (_, i) => i);
  const bwdVisited = new Map<string, CompoundSearchEntry>();
  const solvedEntry: CompoundSearchEntry = { pieces: solvedPieces, gm: null, parent: null };
  bwdVisited.set(keyFor(solvedPieces), solvedEntry);
  let bwdFrontier: CompoundSearchEntry[] = [solvedEntry];

  if (fwdVisited.has(keyFor(solvedPieces))) return [];

  const totalVisited = () => fwdVisited.size + bwdVisited.size;

  for (let depth = 1; depth <= maxDepthEachSide; depth++) {
    const newFwd = new Map<string, CompoundSearchEntry>();
    for (const parentEntry of fwdFrontier) {
      for (const gm of generators) {
        const next = applyPermU8(parentEntry.pieces, gm.perm);
        const k = keyFor(next);
        if (!fwdVisited.has(k)) {
          const entry: CompoundSearchEntry = { pieces: next, gm, parent: parentEntry };
          fwdVisited.set(k, entry);
          newFwd.set(k, entry);
          if (totalVisited() > maxStates) return null;
        }
      }
    }
    fwdFrontier = [...newFwd.values()];
    for (const [k, entry] of newFwd) {
      const hit = bwdVisited.get(k);
      if (hit) return buildPath(entry, hit);
    }

    const newBwd = new Map<string, CompoundSearchEntry>();
    for (const parentEntry of bwdFrontier) {
      for (const gm of generators) {
        const next = applyPermU8(parentEntry.pieces, gm.perm);
        const k = keyFor(next);
        if (!bwdVisited.has(k)) {
          const entry: CompoundSearchEntry = { pieces: next, gm, parent: parentEntry };
          bwdVisited.set(k, entry);
          newBwd.set(k, entry);
          if (totalVisited() > maxStates) return null;
        }
      }
    }
    bwdFrontier = [...newBwd.values()];
    for (const [k, entry] of newBwd) {
      const hit = fwdVisited.get(k);
      if (hit) return buildPath(hit, entry);
    }
  }

  return null;
}

/**
 * Tips are trivial by comparison: each vertex's 3 tip stickers only ever
 * spin among themselves via that SAME vertex's depth=1 turn (see
 * tetraMath's discovery notes), independent of every other piece -- so
 * fixing them is just "try 0, 1, or 2 applications and keep whichever
 * leaves the puzzle most correct," no search needed.
 */
function tipSolveMoves(state: TetraState): TetraMove[] {
  const working = cloneState(state);
  const moves: TetraMove[] = [];

  function totalCorrect(st: TetraState): number {
    let n = 0;
    for (const s of st.stickers) {
      if (nearestFaceIndex(centroidOf(s.corners)) === s.homeFaceIndex) n++;
    }
    return n;
  }

  for (const vertexIndex of VERTEX_INDICES) {
    let best = totalCorrect(working);
    let bestTries = 0;
    for (let tries = 1; tries <= 2; tries++) {
      applyRawThirdTurn(working, vertexIndex, 1, 1);
      const now = totalCorrect(working);
      if (now > best) {
        best = now;
        bestTries = tries;
      }
    }
    const revertCount = 2 - bestTries;
    for (let i = 0; i < revertCount; i++) applyRawThirdTurn(working, vertexIndex, 1, -1);
    for (let i = 0; i < bestTries; i++) moves.push({ vertexIndex, depth: 1, sign: 1 });
  }
  return moves;
}

export interface MasterTetraSolveResult {
  moves: TetraMove[];
  solved: boolean;
}

/**
 * Computes a full solve for a Master-Pyraminx-family tetrahedron (N>=4) in
 * 3 independent phases -- axial+center, then edges, then tips -- each
 * solved against whatever the PREVIOUS phase already fixed (so later
 * phases never undo earlier ones). See meetInMiddleSolve's own comment for
 * why a single whole-puzzle search isn't used instead.
 */
export function computeMasterTetraSolveMoves(state: TetraState): MasterTetraSolveResult {
  const pre = precompute(state.layerCount);
  const working = cloneState(state);
  const moves: TetraMove[] = [];

  const applyPhase = (phaseMoves: TetraMove[] | null): boolean => {
    if (!phaseMoves) return false;
    for (const m of phaseMoves) {
      applyRawThirdTurn(working, m.vertexIndex, m.depth, m.sign);
      moves.push(m);
    }
    return true;
  };

  let usedFallback = false;
  const axialCenterOk = applyPhase(meetInMiddleSolve(pre, patternFromState(working, pre), new Set<PieceType>(["axial", "center"]), 7));
  if (!axialCenterOk) {
    // Best-effort fallback (see solveCentersByCommutator's own comment for
    // why): drop the requirement that axial and center match
    // SIMULTANEOUSLY. Solve axial alone first (centers don't-care, and
    // empirically far shallower even for scrambles the combined search
    // above cannot resolve within its budget), then clean up whatever
    // center disturbance is left with the fully transitive, edge-clean
    // center commutator. NOT a full guarantee end-to-end: the axial-only
    // phase itself can leave edges disturbed deeply enough (~30 wrong, on
    // the hardest scrambles tested) that the edge phase below still fails
    // within any browser-safe search budget -- confirmed this is a genuine
    // resource wall, not a tuning problem (edge-only bidirectional search
    // needs tens of millions of states by depth 6, whether using compound
    // edge-safe generators or raw primitives, for that level of
    // disturbance -- far beyond what a browser tab's heap can hold). A
    // proper fix needs a dedicated efficient edge solver (e.g. an
    // admissible-heuristic IDA* with its own backward perimeter, mirroring
    // the axial+center approach) -- tracked as separate follow-up research,
    // not yet implemented. Until then, this fallback still HELPS (turns
    // some axial+center failures into full solves when the resulting edge
    // disturbance is modest) without making anything worse (worst case is
    // the same solved:false the common path would have returned anyway).
    usedFallback = true;
    const axialOnlyOk = applyPhase(meetInMiddleSolve(pre, patternFromState(working, pre), new Set<PieceType>(["axial"]), 10, 6_000_000));
    if (!axialOnlyOk) return { moves, solved: false };
    const centerCleanupMoves = solveCentersByCommutator(pre, patternFromState(working, pre));
    if (!centerCleanupMoves || !applyPhase(centerCleanupMoves)) return { moves, solved: false };
  }

  // Edges use EDGE_SAFE_GENERATORS instead of meetInMiddleSolve's raw
  // primitives: those generators are each already a no-op on axial+center
  // by construction, so this phase can't re-disturb what the previous phase
  // just fixed without needing a cumulative (and combinatorially unworkable
  // -- see EDGE_SAFE_GENERATORS' comment) target set.
  //
  // The fallback path's axial-only phase (unlike the now-edge-clean center
  // commutator) still doesn't guarantee edges untouched, so give this phase
  // a bit more room only when the fallback ran -- see the fallback's own
  // comment above for why this still isn't always enough.
  const edgeOk = usedFallback
    ? applyPhase(meetInMiddleSolveEdges(pre, patternFromState(working, pre), 8, 6_000_000))
    : applyPhase(meetInMiddleSolveEdges(pre, patternFromState(working, pre), 6));
  if (!edgeOk) return { moves, solved: false };

  applyPhase(tipSolveMoves(working));

  return { moves, solved: isSolved(working) };
}

const MOVE_ANIMATION_MS = 350;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function animateProgress(scene: CustomTetraScene, from: number, to: number, durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    function step(now: number) {
      const t = Math.min((now - start) / durationMs, 1);
      scene.setTurnProgress(from + easeOutCubic(t) * (to - from));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

export interface MasterTetraSolveHint {
  move: TetraMove | null;
  movesRemaining: number;
}

/**
 * Plan-once/consume-many cache, mirroring customSolvePlayback.ts's
 * FourByFourSolverEngine: computeMasterTetraSolveMoves takes up to a second
 * or two (3 live BFS/trial phases), so it's wasteful to recompute on every
 * single hint press. The cached plan is replayed one move at a time and
 * only rebuilt when the live scene no longer matches where it should be by
 * now (scramble, reset, undo, or an off-plan move) -- tracked via the
 * scene's own undo count, same trick TetraView's reportSolveCommit uses.
 */
class MasterTetraSolverEngine {
  private plan: TetraMove[] | null = null;
  private cursor = 0;
  private planStartUndoCount = -1;

  private expectedUndoCount(): number {
    return this.planStartUndoCount + this.cursor;
  }

  hasValidPlan(scene: CustomTetraScene): boolean {
    return this.plan !== null && this.expectedUndoCount() === scene.getUndoCount();
  }

  solve(scene: CustomTetraScene): void {
    const state: TetraState = { layerCount: scene.layerCount, stickers: scene.getStickers() };
    const result = computeMasterTetraSolveMoves(state);
    this.plan = result.moves;
    this.cursor = 0;
    this.planStartUndoCount = scene.getUndoCount();
  }

  invalidate(): void {
    this.plan = null;
    this.cursor = 0;
    this.planStartUndoCount = -1;
  }

  peekNextMove(): TetraMove | null {
    if (!this.plan || this.cursor >= this.plan.length) return null;
    return this.plan[this.cursor];
  }

  advance(): void {
    this.cursor++;
  }

  remainingMoves(): number {
    return this.plan ? this.plan.length - this.cursor : 0;
  }
}

// Module-level, like fourByFourEngine in customSolvePlayback.ts -- only one
// Master-Pyraminx-family TetraView is ever mounted at a time.
const engine = new MasterTetraSolverEngine();

/**
 * Solves for the scene's current actual state and plays the next move of a
 * cached plan for real: turns the layer and commits it, exactly as if the
 * player had swiped it themselves. Same contract as
 * tetraSolvePlayback.ts's applyNextTetraSolveMove (used for the 3-layer
 * Pyraminx instead).
 */
export async function applyNextMasterTetraSolveMove(scene: CustomTetraScene): Promise<MasterTetraSolveHint> {
  if (!engine.hasValidPlan(scene)) engine.solve(scene);

  const move = engine.peekNextMove();
  if (!move) return { move: null, movesRemaining: 0 };

  if (scene.beginTurn(move.vertexIndex, move.depth)) {
    await animateProgress(scene, 0, move.sign, MOVE_ANIMATION_MS);
    scene.endTurn(move.sign);
    engine.advance();
  }
  return { move, movesRemaining: engine.remainingMoves() };
}
