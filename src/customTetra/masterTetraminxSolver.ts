import * as THREE from "three";
import { depthFromVertex, nearestFaceIndex, thirdTurnQuaternion, VERTEX_INDICES, type VertexIndex } from "./tetraMath";
import { applyRawThirdTurn, buildSolvedTetra, type PieceType, type TetraState } from "./tetraState";
// edgePdbClient/axialWorkerClient are deliberately NOT imported here (not
// even dynamically -- that was tried and didn't help, see below): each owns
// a `new Worker(new URL("./edgePdbWorker"/"./axialWorker", ...))` call, and
// both of those worker files import FROM this one (precompute,
// meetInMiddleSolveAxialFast, etc.) -- ANY import here, static or dynamic,
// would close a cycle (this file -> client -> worker -> this file) that
// Vite's worker bundler flatly refuses to build ("Circular worker imports
// detected"), confirmed the hard way: `vite build` failed with exactly that
// error the first time it was actually run after axialWorkerClient was
// added (only `vite`'s dev server and `tsc -b` had been exercised before
// that, and neither one catches this). A dynamic `import()` was tried first
// and did NOT break the cycle -- Vite's worker-cycle check treats it the
// same as a static import for this purpose. The actual fix: code that needs
// those clients (computeMasterTetraSolveMovesAsync et al.) lives in
// masterTetraSolveAsync.ts instead, a separate file that neither worker
// entry point ever imports.

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

export function cloneState(state: TetraState): TetraState {
  return {
    layerCount: state.layerCount,
    stickers: state.stickers.map((s) => ({
      ...s,
      corners: [s.corners[0].clone(), s.corners[1].clone(), s.corners[2].clone()] as [THREE.Vector3, THREE.Vector3, THREE.Vector3],
    })),
  };
}

export interface PrecomputedMoves {
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
export function precompute(layerCount: number): PrecomputedMoves {
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
export function patternFromState(state: TetraState, pre: PrecomputedMoves): number[] {
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

export function meetInMiddleSolve(pre: PrecomputedMoves, startPieces: number[], targetTypes: ReadonlySet<PieceType>, maxDepthEachSide: number, maxStates: number = MAX_SEARCH_STATES): TetraMove[] | null {
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
 * Same bidirectional search as meetInMiddleSolve, specialized for the
 * axial-only target and backed by a typed open-addressing hash table
 * instead of Map<string, SearchEntry> -- exists purely for speed, not new
 * capability. Only worth the extra code because this exact search
 * (axialWorkerClient's bigger-budget retry) was measured taking ~130-150s
 * with the generic Map-based version; validated offline (this feature's
 * own investigation) at ~3.26x raw state-generation throughput and ~8x
 * end-to-end on the 3 scrambles that actually need this path (150s -> ~19s
 * each, moves verified correct by replay). Not applied to
 * meetInMiddleSolve generically: the memory cost scales with target-slot
 * count (40 here), and the axial+center/edge targets (52/100 slots) would
 * need much more careful capacity tuning than validated here -- a
 * generalization for another day, not assumed safe by default.
 *
 * Capacity is sized per table (forward and backward each get their own)
 * for the FULL maxStates budget at a 0.6 load factor, safe even under a
 * very uneven forward/backward split -- e.g. ~1.5GB per table (~3GB
 * total) for maxStates=16,000,000. Deliberately NOT applied to the
 * synchronous main-thread path; this is only ever called from
 * axialWorker.ts, off the main thread, same as the plain axial-only
 * fallback it replaces there.
 */
export function meetInMiddleSolveAxialFast(pre: PrecomputedMoves, startPieces: readonly number[], maxDepthEachSide: number, maxStates: number): TetraMove[] | null {
  const targetSlots: number[] = [];
  for (let i = 0; i < pre.ns; i++) if (pre.pieceTypes[i] === "axial") targetSlots.push(i);
  const n = targetSlots.length;
  const targetSlotPosition = new Map<number, number>(targetSlots.map((slot, i) => [slot, i]));
  const localPermByMove: number[][] = pre.allMoves.map((move) => {
    const fullPerm = pre.permByMove.get(moveKey(move))!;
    return targetSlots.map((slot) => targetSlotPosition.get(fullPerm[slot])!);
  });

  let capacity = 1 << 20;
  while (capacity * 0.6 < maxStates) capacity *= 2;
  const mask = capacity - 1;

  interface Table {
    slotState: Uint8Array; // capacity * n, flat
    slotUsed: Uint8Array; // capacity, 0/1
    slotMove: Int16Array; // capacity, move index or -1
    slotParent: Int32Array; // capacity, parent slot index or -1
    count: number;
  }
  const makeTable = (): Table => ({
    slotState: new Uint8Array(capacity * n),
    slotUsed: new Uint8Array(capacity),
    slotMove: new Int16Array(capacity).fill(-1),
    slotParent: new Int32Array(capacity).fill(-1),
    count: 0,
  });
  const hashOf = (state: Uint8Array, offset: number): number => {
    let h = 0x811c9dc5;
    for (let i = 0; i < n; i++) {
      h ^= state[offset + i];
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };
  const findOrInsert = (table: Table, state: Uint8Array, offset: number, moveIdx: number, parentSlot: number): { idx: number; isNew: boolean } => {
    let idx = hashOf(state, offset) & mask;
    while (table.slotUsed[idx] === 1) {
      let same = true;
      const base = idx * n;
      for (let i = 0; i < n; i++) {
        if (table.slotState[base + i] !== state[offset + i]) {
          same = false;
          break;
        }
      }
      if (same) return { idx, isNew: false };
      idx = (idx + 1) & mask;
    }
    table.slotUsed[idx] = 1;
    const base = idx * n;
    for (let i = 0; i < n; i++) table.slotState[base + i] = state[offset + i];
    table.slotMove[idx] = moveIdx;
    table.slotParent[idx] = parentSlot;
    table.count++;
    return { idx, isNew: true };
  };
  const pathFromSlot = (table: Table, slot: number): TetraMove[] => {
    const path: TetraMove[] = [];
    let cur = slot;
    while (table.slotMove[cur] !== -1) {
      path.push(pre.allMoves[table.slotMove[cur]]);
      cur = table.slotParent[cur];
    }
    path.reverse();
    return path;
  };

  const scratch = new Uint8Array(n);
  const fwd = makeTable();
  const bwd = makeTable();

  // Pre-allocated frontier buffers (double-buffered, no per-depth array
  // growth/reallocation) -- sized to maxStates, the true worst-case upper
  // bound for how many entries any single depth level could ever produce.
  // Validated (this feature's own investigation) at ~37-40% faster than
  // plain `number[]` frontiers grown via push(), on top of the ~3.26x this
  // whole typed-hash-table approach already gets over the generic
  // Map<string,...>-based meetInMiddleSolve -- see this function's own
  // comment for the full picture.
  let fwdFrontier = new Int32Array(maxStates);
  let fwdFrontierNext = new Int32Array(maxStates);
  let bwdFrontier = new Int32Array(maxStates);
  let bwdFrontierNext = new Int32Array(maxStates);

  const startLocal = new Uint8Array(n);
  for (let i = 0; i < n; i++) startLocal[i] = targetSlotPosition.get(startPieces[targetSlots[i]])!;
  const solvedLocal = Uint8Array.from({ length: n }, (_, i) => i);

  const startEntry = findOrInsert(fwd, startLocal, 0, -1, -1);
  const solvedEntry = findOrInsert(bwd, solvedLocal, 0, -1, -1);
  if (startLocal.every((v, i) => v === solvedLocal[i])) return [];

  fwdFrontier[0] = startEntry.idx;
  let fwdFrontierLen = 1;
  bwdFrontier[0] = solvedEntry.idx;
  let bwdFrontierLen = 1;

  for (let depth = 1; depth <= maxDepthEachSide; depth++) {
    let newFwdLen = 0;
    for (let fi = 0; fi < fwdFrontierLen; fi++) {
      const parentIdx = fwdFrontier[fi];
      const base = parentIdx * n;
      for (let mi = 0; mi < localPermByMove.length; mi++) {
        const perm = localPermByMove[mi];
        for (let i = 0; i < n; i++) scratch[i] = fwd.slotState[base + perm[i]];
        const res = findOrInsert(fwd, scratch, 0, mi, parentIdx);
        if (!res.isNew) continue;
        fwdFrontierNext[newFwdLen++] = res.idx;
        if (fwd.count + bwd.count > maxStates) return null;
        let bidx = hashOf(scratch, 0) & mask;
        while (bwd.slotUsed[bidx] === 1) {
          let same = true;
          const bbase = bidx * n;
          for (let i = 0; i < n; i++) {
            if (bwd.slotState[bbase + i] !== scratch[i]) {
              same = false;
              break;
            }
          }
          if (same) return [...pathFromSlot(fwd, res.idx), ...pathFromSlot(bwd, bidx).reverse().map(invertMove)];
          bidx = (bidx + 1) & mask;
        }
      }
    }
    [fwdFrontier, fwdFrontierNext] = [fwdFrontierNext, fwdFrontier];
    fwdFrontierLen = newFwdLen;

    let newBwdLen = 0;
    for (let bi = 0; bi < bwdFrontierLen; bi++) {
      const parentIdx = bwdFrontier[bi];
      const base = parentIdx * n;
      for (let mi = 0; mi < localPermByMove.length; mi++) {
        const perm = localPermByMove[mi];
        for (let i = 0; i < n; i++) scratch[i] = bwd.slotState[base + perm[i]];
        const res = findOrInsert(bwd, scratch, 0, mi, parentIdx);
        if (!res.isNew) continue;
        bwdFrontierNext[newBwdLen++] = res.idx;
        if (fwd.count + bwd.count > maxStates) return null;
        let fidx = hashOf(scratch, 0) & mask;
        while (fwd.slotUsed[fidx] === 1) {
          let same = true;
          const fbase = fidx * n;
          for (let i = 0; i < n; i++) {
            if (fwd.slotState[fbase + i] !== scratch[i]) {
              same = false;
              break;
            }
          }
          if (same) return [...pathFromSlot(fwd, fidx), ...pathFromSlot(bwd, res.idx).reverse().map(invertMove)];
          fidx = (fidx + 1) & mask;
        }
      }
    }
    [bwdFrontier, bwdFrontierNext] = [bwdFrontierNext, bwdFrontier];
    bwdFrontierLen = newBwdLen;
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
    // applies every insertion "backwards"). Confirmed (p1, p3, p2) -- NOT
    // the naive (p1, p2, p3) -- is the direction this specific commutator
    // needs: the naive order was shipped for a while without anyone
    // noticing, since it still solves plenty of scrambles by luck (whenever
    // the chase never lands on the shape this direction mishandles), but it
    // reliably got center cleanup stuck at a fixed misplaced-count forever
    // on several real scrambles. Re-verify this order if the commutator's
    // move sequence ever changes.
    const cycMoves = tools.cycleThreeMoves(p1, p3, p2);
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

export interface EdgeGeneratorMove {
  perm: number[];
  primitives: readonly TetraMove[];
  invPrimitives: readonly TetraMove[];
}

const edgeGeneratorCache = new Map<number, EdgeGeneratorMove[]>();

export function edgeGeneratorMoves(pre: PrecomputedMoves): EdgeGeneratorMove[] {
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
 *
 * generators/targetSlots default to the full edge set (every generator,
 * every edge slot) -- N=5's two-phase middle/outer split (see
 * buildEdgeMiddleOuterTools below) passes a restricted subset of each
 * instead, so this one function serves both the N=4 single-phase path and
 * N=5's two smaller phases without duplicating the search itself.
 */
function meetInMiddleSolveEdges(
  pre: PrecomputedMoves,
  startPieces: number[],
  maxDepthEachSide: number,
  maxStates: number = MAX_SEARCH_STATES,
  generators: EdgeGeneratorMove[] = edgeGeneratorMoves(pre),
  targetSlots: number[] = (() => {
    const slots: number[] = [];
    for (let i = 0; i < pre.ns; i++) if (pre.pieceTypes[i] === "edge") slots.push(i);
    return slots;
  })(),
): TetraMove[] | null {
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

// ============================================================================
// N=5 edge middle/outer split.
//
// N=5's 18 edge pieces are NOT one homogeneous group: each of the 6
// tetrahedron edges has 3 edge-piece positions -- 1 "middle" (depth (3,3),
// self-symmetric between the edge's 2 endpoint vertices) and 2 "outer"
// (depth (2,4)/(4,2), mirror images of each other). Verified this offline
// (edge_piece_parity_check.mjs / check_middle_outer_split.mjs / phaseA_closure_check.mjs
// / phaseB_feasibility_check.mjs in the research scratchpad, not committed --
// see the investigation this grew out of):
//   - every RAW primitive move keeps middle and outer completely separate
//     (never sends a middle piece to an outer slot or vice versa) and is
//     individually an EVEN permutation on each subset alone -- so no
//     reachable puzzle state can ever need an ODD permutation of just the 6
//     middle pieces or just the 12 outer pieces, regardless of what the
//     other subset looks like.
//   - of the 144 EDGE_SAFE_GENERATORS_N5 compound commutators, exactly 48
//     touch ONLY middle pieces and 96 touch ONLY outer pieces -- zero touch
//     both. The 48 middleOnly generators' closure is exactly the full
//     alternating group on the 6 middle pieces (360/360 even permutations
//     reachable) -- i.e. EVERY permutation a real scramble could ever need
//     on the middle pieces alone is reachable using ONLY middleOnly
//     generators, so this phase is unconditionally guaranteed to succeed
//     (same character as solveCentersByCommutator's full-reachability
//     guarantee for centers).
//   - the 96 outerOnly generators alone solved 20/20 synthetic outer-only
//     scrambles via meet-in-the-middle at maxDepthEachSide<=5.
//
// Net effect of solving middle first (guaranteed) and outer second (using
// ONLY outerOnly generators, which by construction can never re-disturb
// middle): a strictly smaller search per phase than the old single 18-piece
// combined search below (meetInMiddleSolveEdges called with the full
// generator/slot set), which is what made the hardest scrambles need the
// PDB worker fallback in the first place. This doesn't remove that
// fallback -- computeMasterTetraSolveMovesAsync's PDB retry stays as the
// final safety net for whatever residual share of cases still exceeds
// these phases' own budgets -- but is expected to shrink how often it's
// actually needed.
export interface EdgeMiddleOuterTools {
  middleSlots: number[];
  outerSlots: number[];
  middleOnlyGenerators: EdgeGeneratorMove[];
  outerOnlyGenerators: EdgeGeneratorMove[];
}

const edgeMiddleOuterCache = new Map<number, EdgeMiddleOuterTools>();

function buildEdgeMiddleOuterTools(pre: PrecomputedMoves): EdgeMiddleOuterTools {
  const cached = edgeMiddleOuterCache.get(pre.ns);
  if (cached) return cached;

  const middleSlots: number[] = [];
  const outerSlots: number[] = [];
  for (let slot = 0; slot < pre.ns; slot++) {
    if (pre.pieceTypes[slot] !== "edge") continue;
    const depths = VERTEX_INDICES.map((v) => depthFromVertex(pre.referenceCentroids[slot], v, pre.layerCount));
    const sorted = [...depths].sort((a, b) => a - b);
    (sorted[0] === sorted[1] ? middleSlots : outerSlots).push(slot);
  }
  const middleSet = new Set(middleSlots);
  const outerSet = new Set(outerSlots);

  const middleOnlyGenerators: EdgeGeneratorMove[] = [];
  const outerOnlyGenerators: EdgeGeneratorMove[] = [];
  for (const gm of edgeGeneratorMoves(pre)) {
    let touchesMiddle = false;
    let touchesOuter = false;
    for (let slot = 0; slot < pre.ns; slot++) {
      if (gm.perm[slot] === slot) continue;
      if (middleSet.has(slot)) touchesMiddle = true;
      else if (outerSet.has(slot)) touchesOuter = true;
    }
    if (touchesMiddle && !touchesOuter) middleOnlyGenerators.push(gm);
    else if (touchesOuter && !touchesMiddle) outerOnlyGenerators.push(gm);
    // else: touches neither (identity, doesn't occur for these generators)
    // or touches both (verified this never happens for EDGE_SAFE_GENERATORS_N5).
  }

  const tools: EdgeMiddleOuterTools = { middleSlots, outerSlots, middleOnlyGenerators, outerOnlyGenerators };
  edgeMiddleOuterCache.set(pre.ns, tools);
  return tools;
}

/**
 * N=5-only two-phase edge solve: middle pieces first (unconditionally
 * guaranteed to succeed -- see buildEdgeMiddleOuterTools's comment), then
 * outer pieces (using only outerOnly generators, so middle can't be
 * re-disturbed). Returns null if either phase's own budget is exceeded
 * (the outer phase is the only one expected to ever do this in practice),
 * leaving the caller to fall back to the PDB worker exactly as before.
 */
function solveN5EdgesInTwoPhases(pre: PrecomputedMoves, startPieces: number[], outerMaxDepthEachSide: number, outerMaxStates: number = MAX_SEARCH_STATES): TetraMove[] | null {
  const tools = buildEdgeMiddleOuterTools(pre);
  const middleMoves = meetInMiddleSolveEdges(pre, startPieces, 6, MAX_SEARCH_STATES, tools.middleOnlyGenerators, tools.middleSlots);
  if (!middleMoves) return null;

  let afterMiddle = startPieces;
  for (const m of middleMoves) afterMiddle = applyPerm(afterMiddle, pre.permByMove.get(moveKey(m))!);

  // Try the outer-only PDB-guided IDA* first when it's already loaded (see
  // preloadOuterPdb's comment -- best-effort, main-thread-safe, and usually
  // much faster than the meet-in-the-middle fallback below: validated
  // offline at 20/20 solved on synthetic outer scrambles, ~89ms average /
  // 723ms worst case for an unoptimized prototype of this exact search --
  // see OUTER_PDB_RADIUS's section comment). Falls through to the existing
  // meet-in-the-middle attempt untouched if the PDB isn't loaded yet, or if
  // it fails within its own budget.
  if (outerPdb) {
    const pdbMoves = runPdbGuidedOuterSearch(pre, afterMiddle, outerPdb, 12, 500_000);
    if (pdbMoves) return [...middleMoves, ...pdbMoves];
  }

  const outerMoves = meetInMiddleSolveEdges(pre, afterMiddle, outerMaxDepthEachSide, outerMaxStates, tools.outerOnlyGenerators, tools.outerSlots);
  if (!outerMoves) return null;

  return [...middleMoves, ...outerMoves];
}

// ============================================================================
// Edge pattern-database (PDB) guided cleanup, radius<=4.
//
// meetInMiddleSolveEdges above can still fail outright on the hardest
// post-fallback edge disturbances (see computeMasterTetraSolveMoves's own
// comment). A multi-session offline research effort confirmed those cases
// ARE all solvable with the SAME 144 EDGE_SAFE_GENERATORS_N5 generators,
// given a deep enough admissible heuristic: a canonical (12-fold
// tetrahedral-symmetry-deduplicated) backward BFS from solved, used as a
// forward IDA* heuristic table instead of meetInMiddleSolveEdges's
// from-scratch bidirectional search. A FULL perimeter deep enough to solve
// every case needs ~50,000,000 canonical states (~22GB, ~1hr build) and,
// for the 3 hardest cases, HOURS of forward search even with that heuristic
// -- nowhere near browser-safe, so that exact configuration is NOT shipped.
//
// What IS shipped: a radius<=4 perimeter (1,676,349 canonical states, built
// once offline -- see generate_edge_pdb_r4.mjs in the research scratchpad --
// and committed as the public/edgePerimeterN5_r4.bin asset, 36 raw local
// slot values + 1 depth byte per entry).
//
// Even at radius<=4, a single IDA* iteration once the search actually has to
// branch (rather than hit the heuristic immediately) costs millions of
// node expansions -- measured at ~33-40s for 3,000,000 nodes on a desktop
// Node process. That's nowhere near acceptable to run synchronously on the
// page's main thread (would freeze the tab, trigger "page unresponsive").
// So this is NOT called directly from computeMasterTetraSolveMoves at all
// -- see edgePdbWorker.ts (runs the actual search off the main thread) and
// edgePdbClient.ts (owns that worker, exposes the one function
// computeMasterTetraSolveMovesAsync actually awaits). What lives here is
// just the shared, worker-and-main-thread-safe pieces (types, the 12-fold
// symmetry/canonicalization math, the PDB binary parser, and the IDA*
// search itself) so neither side duplicates them.
export interface EdgeSymmetryTools {
  edgeSlots: number[];
  edgeIndex: Map<number, number>;
  localSymPerms: number[][];
  generatorLocalPerms: number[][];
}

const edgeSymmetryCache = new Map<number, EdgeSymmetryTools>();
const fullTetraSymPermsCache = new Map<number, number[][]>();

/** Builds (once per layerCount) the full 12-fold tetrahedral rotation
 * group's effect on ALL ns sticker slots -- shared by buildEdgeSymmetryTools
 * (edge-only, 36 slots) and buildOuterSymmetryTools (outer-only, 24 slots)
 * below, which each just project this same group onto their own slot
 * subset instead of recomputing the quaternion BFS twice. */
function buildFullTetraSymPerms(pre: PrecomputedMoves): number[][] {
  const cached = fullTetraSymPermsCache.get(pre.ns);
  if (cached) return cached;

  const identityQ = new THREE.Quaternion();
  const qKey = (q: THREE.Quaternion) => [q.x, q.y, q.z, q.w].map((v) => Math.round(v * 1e6)).join(",");
  const seenQ = new Map<string, THREE.Quaternion>([[qKey(identityQ), identityQ]]);
  let frontierQ: THREE.Quaternion[] = [identityQ];
  const generatorsQ: THREE.Quaternion[] = [];
  for (const v of VERTEX_INDICES) for (const sign of [1, -1] as const) generatorsQ.push(thirdTurnQuaternion(v, sign));
  while (frontierQ.length > 0) {
    const next: THREE.Quaternion[] = [];
    for (const q of frontierQ) {
      for (const g of generatorsQ) {
        const c = g.clone().multiply(q);
        const k = qKey(c);
        if (!seenQ.has(k)) {
          seenQ.set(k, c);
          next.push(c);
        }
      }
    }
    frontierQ = next;
  }
  const fullSymPerms = [...seenQ.values()].map((q) => {
    const perm = new Array<number>(pre.ns);
    for (let id = 0; id < pre.ns; id++) {
      const c = pre.referenceCentroids[id].clone().applyQuaternion(q);
      let bestSlot = -1;
      let bestDist = Infinity;
      for (let slot = 0; slot < pre.ns; slot++) {
        const d = c.distanceToSquared(pre.referenceCentroids[slot]);
        if (d < bestDist) {
          bestDist = d;
          bestSlot = slot;
        }
      }
      perm[id] = bestSlot;
    }
    return perm;
  });
  const distinctFullSymPerms: number[][] = [];
  const seenPK = new Set<string>();
  for (const p of fullSymPerms) {
    const k = p.join(",");
    if (!seenPK.has(k)) {
      seenPK.add(k);
      distinctFullSymPerms.push(p);
    }
  }
  fullTetraSymPermsCache.set(pre.ns, distinctFullSymPerms);
  return distinctFullSymPerms;
}

/** Builds (once per layerCount) the edge-local 12-fold tetrahedral rotation
 * group and each of the 144 edge-safe generators' edge-local permutation --
 * both empirically confirmed (separate offline research) closed under this
 * symmetry AND under inversion, which is what makes canonicalizing edge
 * states by this group sound for both heuristic lookup and (were it ever
 * needed here) path reconstruction. */
export function buildEdgeSymmetryTools(pre: PrecomputedMoves): EdgeSymmetryTools {
  const cached = edgeSymmetryCache.get(pre.ns);
  if (cached) return cached;

  const edgeSlots: number[] = [];
  for (let i = 0; i < pre.pieceTypes.length; i++) if (pre.pieceTypes[i] === "edge") edgeSlots.push(i);
  const edgeIndex = new Map(edgeSlots.map((slot, i) => [slot, i]));

  const localSymPerms = buildFullTetraSymPerms(pre).map((fullPerm) => edgeSlots.map((slot) => edgeIndex.get(fullPerm[slot])!));

  const generators = edgeGeneratorMoves(pre);
  const generatorLocalPerms = generators.map((gm) => edgeSlots.map((slot) => edgeIndex.get(gm.perm[slot])!));

  const tools: EdgeSymmetryTools = { edgeSlots, edgeIndex, localSymPerms, generatorLocalPerms };
  edgeSymmetryCache.set(pre.ns, tools);
  return tools;
}

export interface OuterSymmetryTools {
  outerSlots: number[];
  outerIndex: Map<number, number>;
  localSymPerms: number[][];
  generatorLocalPerms: number[][];
}

const outerSymmetryCache = new Map<number, OuterSymmetryTools>();

/** Same as buildEdgeSymmetryTools, scoped to N=5's 24 outer edge slots and
 * the 96 outerOnly generators (see buildEdgeMiddleOuterTools's comment) --
 * the 12-fold rotation group maps outer slots to outer slots (verified in
 * generate_outer12_pdb.mjs, the research scratchpad script that built the
 * shipped outerPerimeterN5.bin), so this projection is just as sound as the
 * full-edge one above. */
export function buildOuterSymmetryTools(pre: PrecomputedMoves): OuterSymmetryTools {
  const cached = outerSymmetryCache.get(pre.ns);
  if (cached) return cached;

  const { outerSlots, outerOnlyGenerators } = buildEdgeMiddleOuterTools(pre);
  const outerIndex = new Map(outerSlots.map((slot, i) => [slot, i]));
  const localSymPerms = buildFullTetraSymPerms(pre).map((fullPerm) => outerSlots.map((slot) => outerIndex.get(fullPerm[slot])!));
  const generatorLocalPerms = outerOnlyGenerators.map((gm) => outerSlots.map((slot) => outerIndex.get(gm.perm[slot])!));

  const tools: OuterSymmetryTools = { outerSlots, outerIndex, localSymPerms, generatorLocalPerms };
  outerSymmetryCache.set(pre.ns, tools);
  return tools;
}

export function edgeCanonicalKey(pieces: Uint8Array, localSymPerms: readonly number[][]): string {
  const n = pieces.length;
  const scratch = new Uint8Array(n);
  let bestKey: string | null = null;
  for (const sp of localSymPerms) {
    for (let i = 0; i < n; i++) scratch[sp[i]] = sp[pieces[i]] + 32;
    const k = String.fromCharCode(...scratch);
    if (bestKey === null || k < bestKey) bestKey = k;
  }
  return bestKey!;
}

export const EDGE_PDB_RADIUS = 4;
export const EDGE_PDB_URL_PATH = "edgePerimeterN5_r4.bin";
export const OUTER_PDB_RADIUS = 4;
export const OUTER_PDB_URL_PATH = "outerPerimeterN5.bin";
export const AXIAL_WASM_URL_PATH = "axialSolver.wasm";

/** Works out the right URL for a shipped PDB asset in both dev and a
 * GitHub-Pages-style subpath deploy (vite.config.ts sets `base` to
 * `/multi_cube/` there) -- `import.meta.env.BASE_URL` reflects that same
 * `base` at runtime. Guarded for contexts where `import.meta.env` isn't
 * Vite-provided (e.g. this file imported directly under plain Node for
 * scripts/tests): falls back to a bare root-relative path rather than
 * throwing. */
function resolvePdbUrl(urlPath: string): string {
  const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
  const base = env?.BASE_URL ?? "/";
  return `${base}${urlPath}`;
}

export function resolveEdgePdbUrl(): string {
  return resolvePdbUrl(EDGE_PDB_URL_PATH);
}

export function resolveOuterPdbUrl(): string {
  return resolvePdbUrl(OUTER_PDB_URL_PATH);
}

export function resolveAxialWasmUrl(): string {
  return resolvePdbUrl(AXIAL_WASM_URL_PATH);
}

/** Parses a PDB's common binary layout (generate_edge_pdb_r4.mjs /
 * generate_outer12_pdb.mjs both write this): a 10-byte header (4-byte magic
 * + version + radius + uint32 entryCount), then per entry `slotCount` raw
 * local-slot values + 1 depth byte. Pure/sync so it runs identically
 * wherever the fetched bytes end up (main thread or worker). `slotCount` is
 * 36 for the full edge PDB, 24 for the outer-only one -- passing the wrong
 * value silently misreads every entry, so both call sites below pin it to a
 * literal matching their own format instead of trusting the header alone. */
function parsePdbBuffer(buf: ArrayBuffer, expectedMagic: string, slotCount: number): Map<string, number> {
  const bytes = new Uint8Array(buf);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  if (magic !== expectedMagic) throw new Error(`PDB bad magic: expected ${expectedMagic}, got ${magic}`);
  const view = new DataView(buf);
  const entryCount = view.getUint32(6, true);
  const map = new Map<string, number>();
  const scratch = new Uint8Array(slotCount);
  let offset = 10;
  for (let e = 0; e < entryCount; e++) {
    for (let i = 0; i < slotCount; i++) scratch[i] = bytes[offset + i] + 32;
    map.set(String.fromCharCode(...scratch), bytes[offset + slotCount]);
    offset += slotCount + 1;
  }
  return map;
}

export function parseEdgePdbBuffer(buf: ArrayBuffer): Map<string, number> {
  return parsePdbBuffer(buf, "EPD4", 36);
}

export function parseOuterPdbBuffer(buf: ArrayBuffer): Map<string, number> {
  return parsePdbBuffer(buf, "OPD1", 24);
}

/**
 * Forward-only IDA* guided by a radius-limited PDB (passed in explicitly --
 * this function has no opinion on where/how it was loaded, so the exact
 * same code runs inside edgePdbWorker.ts) as an admissible heuristic (exact
 * distance when the canonical state was reached within the PDB's radius;
 * radius+1 as a safe lower bound otherwise -- sound because the PDB's own
 * build is a COMPLETE BFS to that radius, so anything missing is provably
 * farther). No backward meeting/reconstruction: the search just runs
 * forward until the target-slot state is actually solved. Returns null
 * (never throws) if the budget is exhausted or no solution turns up within
 * maxThreshold. Shared core for both runPdbGuidedEdgeSearch (full 36-slot
 * edge set, NOT browser-main-thread-safe at any meaningful maxNodes budget
 * -- see this section's top comment) and runPdbGuidedOuterSearch (24-slot
 * outer-only subset, validated fast enough in practice to run inline --
 * see solveN5EdgesInTwoPhases's own comment for the measured numbers).
 */
function runPdbGuidedSearch(
  startPieces: readonly number[],
  targetSlots: readonly number[],
  targetIndex: ReadonlyMap<number, number>,
  localSymPerms: readonly number[][],
  generatorLocalPerms: readonly number[][],
  generators: readonly EdgeGeneratorMove[],
  pdb: ReadonlyMap<string, number>,
  pdbRadius: number,
  maxThreshold: number,
  maxNodes: number,
): TetraMove[] | null {
  const n = targetSlots.length;

  const startLocal = Uint8Array.from(targetSlots.map((slot) => targetIndex.get(startPieces[slot])!));
  const isSolvedLocal = (pieces: Uint8Array): boolean => {
    for (let i = 0; i < n; i++) if (pieces[i] !== i) return false;
    return true;
  };
  const applyGen = (pieces: Uint8Array, genIdx: number): Uint8Array => {
    const perm = generatorLocalPerms[genIdx];
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = pieces[perm[i]];
    return out;
  };
  const heuristic = (pieces: Uint8Array): number => pdb.get(edgeCanonicalKey(pieces, localSymPerms)) ?? pdbRadius + 1;

  let nodesExplored = 0;
  let aborted = false;

  // Returns -1 as a "solved" sentinel (f is always >=0, so it's unambiguous
  // with the plain threshold-exceeded return value).
  function search(pieces: Uint8Array, g: number, threshold: number, path: number[]): number {
    nodesExplored++;
    if (nodesExplored > maxNodes) {
      aborted = true;
      return Infinity;
    }
    const f = g + heuristic(pieces);
    if (f > threshold) return f;
    if (isSolvedLocal(pieces)) return -1;
    let min = Infinity;
    for (let a = 0; a < generators.length; a++) {
      const next = applyGen(pieces, a);
      path.push(a);
      const result = search(next, g + 1, threshold, path);
      if (result === -1) return -1;
      if (aborted) return Infinity;
      if (result < min) min = result;
      path.pop();
    }
    return min;
  }

  let threshold = heuristic(startLocal);
  const path: number[] = [];
  while (threshold <= maxThreshold) {
    nodesExplored = 0;
    aborted = false;
    const result = search(startLocal, 0, threshold, path);
    if (result === -1) return path.flatMap((genIdx) => generators[genIdx].primitives);
    if (aborted || result === Infinity) return null;
    threshold = result;
  }
  return null;
}

export function runPdbGuidedEdgeSearch(pre: PrecomputedMoves, startPieces: readonly number[], pdb: ReadonlyMap<string, number>, maxThreshold: number, maxNodes: number): TetraMove[] | null {
  const tools = buildEdgeSymmetryTools(pre);
  return runPdbGuidedSearch(startPieces, tools.edgeSlots, tools.edgeIndex, tools.localSymPerms, tools.generatorLocalPerms, edgeGeneratorMoves(pre), pdb, EDGE_PDB_RADIUS, maxThreshold, maxNodes);
}

/** Same as runPdbGuidedEdgeSearch, scoped to N=5's 24 outer edge slots and
 * 96 outerOnly generators + the shipped outerPerimeterN5.bin PDB. Unlike
 * the full edge search, this one's small enough (12-piece state space) to
 * call inline from solveN5EdgesInTwoPhases -- see that function's comment
 * for the measured timing that justifies running it on the main thread. */
export function runPdbGuidedOuterSearch(pre: PrecomputedMoves, startPieces: readonly number[], pdb: ReadonlyMap<string, number>, maxThreshold: number, maxNodes: number): TetraMove[] | null {
  const tools = buildOuterSymmetryTools(pre);
  return runPdbGuidedSearch(startPieces, tools.outerSlots, tools.outerIndex, tools.localSymPerms, tools.generatorLocalPerms, buildEdgeMiddleOuterTools(pre).outerOnlyGenerators, pdb, OUTER_PDB_RADIUS, maxThreshold, maxNodes);
}

let outerPdb: Map<string, number> | null = null;
let outerPdbPromise: Promise<void> | null = null;

/**
 * Background fetch of the small (8.2MB) outer-only PDB. Returns a Promise
 * so computeMasterTetraSolveMovesAsync can actually AWAIT it (briefly, with
 * a timeout race -- see that function) before running the synchronous
 * phases: fire-and-forget alone turned out NOT to be enough, unlike
 * preloadEdgePdbWorker's worker-based fetch. Confirmed directly (this
 * feature's own validation): computeMasterTetraSolveProgress is a single,
 * long, fully synchronous call (up to ~100s on the hardest scrambles) with
 * no internal await points, so once it starts running, the browser cannot
 * process ANY pending callback -- including this fetch's `.then()` -- until
 * it returns; a real regression run showed the PDB attempt NEVER firing for
 * any of 30 cases (0 measured speedup) even minutes into the run, while an
 * isolated test that awaited a real macrotask (setTimeout) before solving
 * saw it load and cut one case's time from ~87s to ~42s. No such problem
 * for the full edge PDB (edgePdbWorker.ts) -- a Worker's fetch runs on a
 * genuinely separate thread, so this class of starvation can't happen
 * there. Never throws; a failed fetch just means solveN5EdgesInTwoPhases
 * falls through to its existing meet-in-the-middle attempt for that call.
 */
export function preloadOuterPdb(): Promise<void> {
  if (!outerPdbPromise) {
    outerPdbPromise =
      typeof fetch === "undefined"
        ? Promise.resolve()
        : fetch(resolveOuterPdbUrl())
            .then((r) => r.arrayBuffer())
            .then((buf) => {
              outerPdb = parseOuterPdbBuffer(buf);
            })
            .catch((err) => {
              console.error("outer PDB failed to load (non-fatal, solveN5EdgesInTwoPhases just skips this attempt):", err);
            });
  }
  return outerPdbPromise;
}

/**
 * Tips are trivial by comparison: each vertex's 3 tip stickers only ever
 * spin among themselves via that SAME vertex's depth=1 turn (see
 * tetraMath's discovery notes), independent of every other piece -- so
 * fixing them is just "try 0, 1, or 2 applications and keep whichever
 * leaves the puzzle most correct," no search needed.
 */
export function tipSolveMoves(state: TetraState): TetraMove[] {
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

/**
 * Emergency fallback for when even the axial-only meet-in-the-middle search
 * (below) fails within its (now time-bounded) budget: picks whichever
 * single primitive move most reduces the axial+center misplaced-piece
 * count, with no lookahead or backtracking. This is NOT a solving method --
 * greedy single-move descent is empirically known to plateau at a local
 * minimum after just a handful of moves on this puzzle (confirmed directly:
 * 10/10 real scrambles got stuck within exactly 6 steps, cost never
 * reaching 0 -- see the investigation this fallback grew out of). It
 * exists purely so the hint UI always has SOME move to offer instead of
 * hanging for the ~76-100s the unbounded search could take before still
 * failing outright: MasterTetraSolverEngine's plan-once/consume-many cache
 * (see that class) recomputes from the live state on every off-plan move
 * anyway, so serving one best-effort move at a time here costs nothing
 * extra -- each hint press just asks again with the puzzle's actual current
 * state, same as it already does for a fully-solved plan.
 */
function greedyBestSingleMove(pre: PrecomputedMoves, pattern: readonly number[], targetTypes: ReadonlySet<PieceType>): TetraMove | null {
  const targetSlots: number[] = [];
  for (let i = 0; i < pre.ns; i++) if (targetTypes.has(pre.pieceTypes[i])) targetSlots.push(i);
  const misplacedCount = (p: readonly number[]): number => {
    let n = 0;
    for (const slot of targetSlots) if (p[slot] !== slot) n++;
    return n;
  };
  let bestMove: TetraMove | null = null;
  let bestCost = misplacedCount(pattern);
  for (const move of pre.allMoves) {
    const candidate = applyPerm(pattern, pre.permByMove.get(moveKey(move))!);
    const cost = misplacedCount(candidate);
    if (cost < bestCost) {
      bestCost = cost;
      bestMove = move;
    }
  }
  return bestMove;
}

export interface MasterTetraSolveResult {
  moves: TetraMove[];
  solved: boolean;
}

export interface SolveProgress {
  moves: TetraMove[];
  working: TetraState;
  /** True only when axial+center and edges both succeeded via the
   * synchronous phases below (tips are cheap/guaranteed, not tracked
   * separately) -- i.e. everything except possibly a worker-based edge PDB
   * retry has already been tried. */
  edgePhaseFailed: boolean;
  /** True only when the axial-only meet-in-the-middle fallback itself
   * failed within its budget -- greedyBestSingleMove's fallback move, if
   * any, is already included in `moves`/`working` by this point, and
   * edgePhaseFailed is always false alongside this (the edge phase never
   * ran). Lets computeMasterTetraSolveMovesAsync retry with a much bigger,
   * worker-offloaded search budget (axialWorkerClient.ts) before settling
   * for the greedy fallback's result -- see that function's own comment
   * for why this is worth a dedicated flag instead of reusing
   * edgePhaseFailed. */
  axialOnlyFailed: boolean;
}

export function applyPhaseTo(working: TetraState, moves: TetraMove[], phaseMoves: TetraMove[] | null): boolean {
  if (!phaseMoves) return false;
  for (const m of phaseMoves) {
    applyRawThirdTurn(working, m.vertexIndex, m.depth, m.sign);
    moves.push(m);
  }
  return true;
}

/**
 * Everything that happens once axial (and only axial -- centers don't-care
 * yet) is known to be correct, regardless of how it got that way (the
 * normal synchronous search, or axialWorkerClient's bigger-budget retry):
 * clean up centers with the guaranteed commutator, then edges, then tips.
 * Shared by computeMasterTetraSolveProgress's own fallback branch and
 * computeMasterTetraSolveMovesAsync's axial-worker retry so the two can't
 * drift -- whichever one gets axial solved, the rest of the pipeline
 * behaves identically from that point on.
 */
export function continueAfterAxialSolved(pre: PrecomputedMoves, working: TetraState, moves: TetraMove[], usedFallback: boolean): { edgePhaseFailed: boolean } {
  const centerCleanupMoves = solveCentersByCommutator(pre, patternFromState(working, pre));
  if (!centerCleanupMoves || !applyPhaseTo(working, moves, centerCleanupMoves)) return { edgePhaseFailed: false };

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
  //
  // N=5 specifically gets the middle/outer split (solveN5EdgesInTwoPhases --
  // see its own comment): strictly smaller per-phase searches than the old
  // single 18-piece combined one below, which N=4 still uses (N=4's edges
  // don't have this middle/outer structure -- see that comment for why).
  const edgeOk =
    pre.layerCount === 5
      ? applyPhaseTo(working, moves, solveN5EdgesInTwoPhases(pre, patternFromState(working, pre), usedFallback ? 8 : 6, usedFallback ? 6_000_000 : MAX_SEARCH_STATES))
      : usedFallback
        ? applyPhaseTo(working, moves, meetInMiddleSolveEdges(pre, patternFromState(working, pre), 8, 6_000_000))
        : applyPhaseTo(working, moves, meetInMiddleSolveEdges(pre, patternFromState(working, pre), 6));
  if (!edgeOk) return { edgePhaseFailed: true };

  applyPhaseTo(working, moves, tipSolveMoves(working));
  return { edgePhaseFailed: false };
}

/** The synchronous portion shared by computeMasterTetraSolveMoves (which
 * stops here) and computeMasterTetraSolveMovesAsync (which, on
 * axialOnlyFailed or edgePhaseFailed, goes on to try a worker-backed retry
 * before falling back to whatever this function already computed). Kept as
 * one function so the two never drift -- the async path's "fast case"
 * (everything already solved synchronously) does exactly what the sync
 * function does, no reimplementation. */
export function computeMasterTetraSolveProgress(state: TetraState): SolveProgress {
  const pre = precompute(state.layerCount);
  const working = cloneState(state);
  const moves: TetraMove[] = [];
  const applyPhase = (phaseMoves: TetraMove[] | null): boolean => applyPhaseTo(working, moves, phaseMoves);

  let usedFallback = false;
  const axialCenterOk = applyPhase(meetInMiddleSolve(pre, patternFromState(working, pre), new Set<PieceType>(["axial", "center"]), 7));
  if (!axialCenterOk) {
    // Best-effort fallback (see solveCentersByCommutator's own comment for
    // why): drop the requirement that axial and center match
    // SIMULTANEOUSLY. Solve axial alone first (centers don't-care, and
    // empirically far shallower even for scrambles the combined search
    // above cannot resolve within its budget), then clean up whatever
    // center disturbance is left with the fully transitive, edge-clean
    // center commutator.
    usedFallback = true;
    // NOT time-bounded: an earlier attempt at capping this search to 8s
    // (so it would fail fast instead of taking up to ~76-100s) was
    // reverted after it turned out to cut off ~10 scrambles that genuinely
    // needed more than 8s but DID still succeed given their existing
    // 6,000,000-state budget -- confirmed as a real regression (27/30 ->
    // 17/30 on the fixed validation set), not just a slower success.
    const axialOnlyOk = applyPhase(meetInMiddleSolve(pre, patternFromState(working, pre), new Set<PieceType>(["axial"]), 10, 6_000_000));
    if (!axialOnlyOk) {
      // The search can still fail outright within its own (large) node
      // budget on a genuine handful of scrambles -- confirmed directly
      // (Stage 3 investigation) that this is a TUNING problem, not a
      // structural wall: all 3 scrambles tested this way DO have a
      // solution, found at exactly depth<=6 each side / ~11,590,974 total
      // states -- just short of the 6,000,000-state budget above. Raising
      // that budget in place would fix these same 3 cases, but at the cost
      // of a ~130-150s synchronous block (measured offline) instead of the
      // current ~76-100s -- worse, not better, for a hint button run on
      // the main thread. computeMasterTetraSolveMovesAsync's axial worker
      // retry (axialWorkerClient.ts) is what actually applies that bigger
      // budget, off the main thread. Here in the synchronous path (no
      // worker available), fall back to ONE greedy move that improves
      // axial+center as much as a single move can, so a hint press still
      // offers SOMETHING instead of nothing -- see greedyBestSingleMove's
      // own comment for why this is a UX safety net, not a solving
      // guarantee.
      const greedyMove = greedyBestSingleMove(pre, patternFromState(working, pre), new Set<PieceType>(["axial", "center"]));
      if (greedyMove) applyPhase([greedyMove]);
      return { moves, working, edgePhaseFailed: false, axialOnlyFailed: true };
    }
    const centerCleanupMoves = solveCentersByCommutator(pre, patternFromState(working, pre));
    if (!centerCleanupMoves || !applyPhase(centerCleanupMoves)) return { moves, working, edgePhaseFailed: false, axialOnlyFailed: false };
  }

  const { edgePhaseFailed } = continueAfterAxialSolved(pre, working, moves, usedFallback);
  return { moves, working, edgePhaseFailed, axialOnlyFailed: false };
}
