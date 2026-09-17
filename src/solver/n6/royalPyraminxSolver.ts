// N=6 (Royal Pyraminx) solver, Phase 2 -- baseline. Meet-in-the-middle
// search over the raw 40-move set, exactly the same algorithm shape as
// customTetra/masterTetraminxSolver.ts's meetInMiddleSolve (which this
// module still doesn't import, per Phase 1's independence requirement --
// the shape is reused, not the code).
//
// This is a FIRST PASS, not the final solver: it searches the combined
// state (tips+edges+axial+centers together) with no subgroup decomposition
// or heuristic pruning. N=5 needed that kind of decomposition (axial+center
// first via a safe-generator split, then edges via EDGE_SAFE_GENERATORS) to
// get real scrambles under control, and N=6's piece counts are larger in
// every orbit that matters for search cost (60 axial vs 40, 24 edges vs 18
// physical edge pieces) -- so the numbers this produces are the baseline to
// decide how much of that same investigation N=6 needs, not a claim that
// this is fast enough to ship.
//
// Measured (real browser, meet-in-the-middle over ALL 40 moves at once, no
// decomposition): random scrambles up to 12 moves solve in well under 10s
// (4mv=3.9ms, 6mv=0.9ms, 8mv=11ms, 10mv=2.1s, 12mv=9.7s), but cost explodes
// past that -- a 15-move scramble did not finish within 180s. Real N=6
// scrambles (like N=5's, typically 15-30 moves) are not solvable this way;
// decomposition work (analogous to N=5's) is the next step, tracked
// separately.
import { applyRoyalMove, ALL_ROYAL_MOVE_NAMES } from "./royalPyraminxMoves";
import { AXIAL_COUNT, createSolvedRoyalState, isSolvedRoyal, type RoyalPyraminxState } from "./royalPyraminxState";
import { solveAxialByCommutator, solveCentersByCommutator, solveEdgesByCommutator, solveTips } from "./royalPyraminxCommutators";

function invertMoveName(move: string): string {
  return move.endsWith("'") ? move.slice(0, -1) : `${move}'`;
}

// ---- Axial-only search (decomposition step 1) ----
//
// solveRoyalBaseline (below) searches all 4 orbits (tips+edges+axial+
// centers, 140 bytes/state) at once via the general applyRoyalMove, which
// recomputes and stores every orbit on every move even though a
// decomposed search only cares about axial (60 of those 140 bytes).
// Measured cost of that waste: escalating the combined search's budget
// past depth8/4,000,000 states (to try to clear 20+ move scrambles) grew
// memory enough to crash the browser tab entirely, not just run slowly.
//
// This targets ONLY the 60-piece axial orbit, with its own small
// per-move permutation table (derived once, by applying each of the 40
// moves to the solved state and reading off .axial -- not hand-derived)
// and 60-byte states instead of 140-byte ones. Same algorithm as N=5's
// axial-only search (meetInMiddleSolve targeting just the "axial"
// pieceType) -- that decomposition step is what let N=5's search
// actually scale to real scrambles.
let axialPermByMoveCache: ReadonlyMap<string, Uint8Array> | null = null;
function axialPermByMove(): ReadonlyMap<string, Uint8Array> {
  if (!axialPermByMoveCache) {
    const solved = createSolvedRoyalState();
    const map = new Map<string, Uint8Array>();
    for (const move of ALL_ROYAL_MOVE_NAMES) map.set(move, applyRoyalMove(solved, move).axial);
    axialPermByMoveCache = map;
  }
  return axialPermByMoveCache;
}

function axialKeyOf(axial: Uint8Array): string {
  return String.fromCharCode(...axial);
}

function applyAxialPerm(axial: Uint8Array, perm: Uint8Array): Uint8Array {
  const out = new Uint8Array(AXIAL_COUNT);
  for (let i = 0; i < AXIAL_COUNT; i++) out[i] = axial[perm[i]];
  return out;
}

interface AxialEntry {
  axial: Uint8Array;
  move: string | null;
  parent: AxialEntry | null;
}

function pathFromAxialEntry(entry: AxialEntry): string[] {
  const path: string[] = [];
  let cur: AxialEntry | null = entry;
  while (cur && cur.move !== null) {
    path.push(cur.move);
    cur = cur.parent;
  }
  path.reverse();
  return path;
}

/**
 * Meet-in-the-middle search over JUST the 60-piece axial orbit (ignoring
 * tips/edges/centers -- they're expected to be cleaned up in later,
 * separate phases, same as N=5's decomposition). `start`'s axial array is
 * the only part of the input state this reads. Returns a move sequence
 * that solves axial, or null if none was found within
 * `maxDepthEachSide`/`maxStates`.
 */
export function solveRoyalAxialOnly(startAxial: Uint8Array, maxDepthEachSide: number, maxStates: number): string[] | null {
  if (startAxial.every((v, i) => v === i)) return [];
  const perms = axialPermByMove();

  const fwdVisited = new Map<string, AxialEntry>();
  const startEntry: AxialEntry = { axial: startAxial, move: null, parent: null };
  fwdVisited.set(axialKeyOf(startAxial), startEntry);
  let fwdFrontier: AxialEntry[] = [startEntry];

  const solvedAxial = Uint8Array.from({ length: AXIAL_COUNT }, (_, i) => i);
  const bwdVisited = new Map<string, AxialEntry>();
  const solvedEntry: AxialEntry = { axial: solvedAxial, move: null, parent: null };
  bwdVisited.set(axialKeyOf(solvedAxial), solvedEntry);
  let bwdFrontier: AxialEntry[] = [solvedEntry];

  const totalVisited = () => fwdVisited.size + bwdVisited.size;
  const buildPath = (fwdEntry: AxialEntry, bwdEntry: AxialEntry): string[] => [...pathFromAxialEntry(fwdEntry), ...pathFromAxialEntry(bwdEntry).reverse().map(invertMoveName)];

  for (let depth = 1; depth <= maxDepthEachSide; depth++) {
    const newFwd: AxialEntry[] = [];
    for (const parentEntry of fwdFrontier) {
      for (const move of ALL_ROYAL_MOVE_NAMES) {
        const nextAxial = applyAxialPerm(parentEntry.axial, perms.get(move)!);
        const k = axialKeyOf(nextAxial);
        if (!fwdVisited.has(k)) {
          const entry: AxialEntry = { axial: nextAxial, move, parent: parentEntry };
          fwdVisited.set(k, entry);
          newFwd.push(entry);
          if (totalVisited() > maxStates) return null;
          const hit = bwdVisited.get(k);
          if (hit) return buildPath(entry, hit);
        }
      }
    }
    fwdFrontier = newFwd;

    const newBwd: AxialEntry[] = [];
    for (const parentEntry of bwdFrontier) {
      for (const move of ALL_ROYAL_MOVE_NAMES) {
        const nextAxial = applyAxialPerm(parentEntry.axial, perms.get(move)!);
        const k = axialKeyOf(nextAxial);
        if (!bwdVisited.has(k)) {
          const entry: AxialEntry = { axial: nextAxial, move, parent: parentEntry };
          bwdVisited.set(k, entry);
          newBwd.push(entry);
          if (totalVisited() > maxStates) return null;
          const hit = fwdVisited.get(k);
          if (hit) return buildPath(hit, entry);
        }
      }
    }
    bwdFrontier = newBwd;
  }
  return null;
}

// ---- Axial-only search, typed-array hash table (decomposition step 2) ----
//
// solveRoyalAxialOnly (above) still uses a JS Map<string, object> per
// visited state. Measured: even at 60 bytes/state, that Map+object
// overhead (string key interning, per-entry object headers, hash bucket
// bookkeeping) inflates real cost to an estimated 300-400+ bytes/state --
// escalating its budget to depth9/16,000,000 states crashed the browser
// tab outright on one of two test scrambles, not just ran slowly. Same
// wall N=5 hit with its own Map-based axial search, and the same fix:
// pre-allocated flat typed-array storage (Uint8Array/Int8Array/Int32Array)
// with open-addressing instead of a Map, cutting real per-state cost close
// to the raw 60 bytes + a few bookkeeping bytes.
const AXIAL_NUM_MOVES = ALL_ROYAL_MOVE_NAMES.length; // 40

let axialLocalPermsCache: Uint8Array[] | null = null;
/** Same permutation data as axialPermByMove(), as a plain array indexed by
 * move index (matching ALL_ROYAL_MOVE_NAMES order) instead of a Map keyed
 * by move name -- avoids a string-keyed Map lookup in the search's hot
 * loop. */
function axialLocalPerms(): Uint8Array[] {
  if (!axialLocalPermsCache) {
    const byName = axialPermByMove();
    axialLocalPermsCache = ALL_ROYAL_MOVE_NAMES.map((name) => byName.get(name)!);
  }
  return axialLocalPermsCache;
}

function hashAxial(state: Uint8Array, mask: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < AXIAL_COUNT; i++) {
    h ^= state[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) & mask;
}

class AxialTable {
  slotState: Uint8Array;
  slotUsed: Uint8Array;
  slotMove: Int8Array;
  slotParent: Int32Array;
  mask: number;
  count = 0;

  constructor(capacity: number) {
    this.mask = capacity - 1;
    this.slotState = new Uint8Array(capacity * AXIAL_COUNT);
    this.slotUsed = new Uint8Array(capacity);
    this.slotMove = new Int8Array(capacity).fill(-1);
    this.slotParent = new Int32Array(capacity).fill(-1);
  }

  private matches(idx: number, state: Uint8Array): boolean {
    const base = idx * AXIAL_COUNT;
    for (let i = 0; i < AXIAL_COUNT; i++) if (this.slotState[base + i] !== state[i]) return false;
    return true;
  }

  findOrInsert(state: Uint8Array, moveIdx: number, parentSlot: number): { idx: number; isNew: boolean } {
    let idx = hashAxial(state, this.mask);
    while (this.slotUsed[idx]) {
      if (this.matches(idx, state)) return { idx, isNew: false };
      idx = (idx + 1) & this.mask;
    }
    this.slotUsed[idx] = 1;
    this.slotState.set(state, idx * AXIAL_COUNT);
    this.slotMove[idx] = moveIdx;
    this.slotParent[idx] = parentSlot;
    this.count++;
    return { idx, isNew: true };
  }

  find(state: Uint8Array): number {
    let idx = hashAxial(state, this.mask);
    while (this.slotUsed[idx]) {
      if (this.matches(idx, state)) return idx;
      idx = (idx + 1) & this.mask;
    }
    return -1;
  }

  stateAt(idx: number): Uint8Array {
    return this.slotState.subarray(idx * AXIAL_COUNT, idx * AXIAL_COUNT + AXIAL_COUNT);
  }
}

function pathFromSlot(table: AxialTable, slot: number): number[] {
  const path: number[] = [];
  let cur = slot;
  while (table.slotMove[cur] !== -1) {
    path.push(table.slotMove[cur]);
    cur = table.slotParent[cur];
  }
  path.reverse();
  return path;
}

/**
 * Same contract as solveRoyalAxialOnly (axial-only meet-in-the-middle, same
 * 40 moves, same admissible result), but backed by AxialTable instead of a
 * JS Map -- for budgets large enough that the Map version's overhead risks
 * exhausting the tab's memory. Prefer this one; solveRoyalAxialOnly is kept
 * only as the simpler reference implementation the two were cross-checked
 * against.
 */
export function solveRoyalAxialOnlyFast(startAxial: Uint8Array, maxDepthEachSide: number, maxStates: number): string[] | null {
  if (startAxial.every((v, i) => v === i)) return [];
  const perms = axialLocalPerms();

  let capacity = 1 << 12;
  while (capacity * 0.6 < maxStates) capacity *= 2;

  const fwd = new AxialTable(capacity);
  const bwd = new AxialTable(capacity);

  const solvedAxial = Uint8Array.from({ length: AXIAL_COUNT }, (_, i) => i);
  const { idx: startIdx } = fwd.findOrInsert(startAxial, -1, -1);
  const { idx: solvedIdx } = bwd.findOrInsert(solvedAxial, -1, -1);

  let fwdFrontier: number[] = [startIdx];
  let bwdFrontier: number[] = [solvedIdx];
  const scratch = new Uint8Array(AXIAL_COUNT);

  const buildPathFast = (fwdIdx: number, bwdIdx: number): string[] => [
    ...pathFromSlot(fwd, fwdIdx).map((mi) => ALL_ROYAL_MOVE_NAMES[mi]),
    ...pathFromSlot(bwd, bwdIdx)
      .map((mi) => ALL_ROYAL_MOVE_NAMES[mi])
      .reverse()
      .map(invertMoveName),
  ];

  for (let depth = 1; depth <= maxDepthEachSide; depth++) {
    const newFwd: number[] = [];
    for (const parentIdx of fwdFrontier) {
      const parentState = fwd.stateAt(parentIdx);
      for (let mi = 0; mi < AXIAL_NUM_MOVES; mi++) {
        const perm = perms[mi];
        for (let i = 0; i < AXIAL_COUNT; i++) scratch[i] = parentState[perm[i]];
        const { idx, isNew } = fwd.findOrInsert(scratch, mi, parentIdx);
        if (!isNew) continue;
        newFwd.push(idx);
        if (fwd.count + bwd.count > maxStates) return null;
        const hitIdx = bwd.find(scratch);
        if (hitIdx !== -1) return buildPathFast(idx, hitIdx);
      }
    }
    fwdFrontier = newFwd;

    const newBwd: number[] = [];
    for (const parentIdx of bwdFrontier) {
      const parentState = bwd.stateAt(parentIdx);
      for (let mi = 0; mi < AXIAL_NUM_MOVES; mi++) {
        const perm = perms[mi];
        for (let i = 0; i < AXIAL_COUNT; i++) scratch[i] = parentState[perm[i]];
        const { idx, isNew } = bwd.findOrInsert(scratch, mi, parentIdx);
        if (!isNew) continue;
        newBwd.push(idx);
        if (fwd.count + bwd.count > maxStates) return null;
        const hitIdx = fwd.find(scratch);
        if (hitIdx !== -1) return buildPathFast(hitIdx, idx);
      }
    }
    bwdFrontier = newBwd;
  }
  return null;
}

function stateKey(s: RoyalPyraminxState): string {
  const chars: number[] = [];
  for (const arr of [s.tips, s.tipOri, s.edges, s.edgeOri, s.axial, s.centers]) {
    for (let i = 0; i < arr.length; i++) chars.push(arr[i] + 32);
  }
  return String.fromCharCode(...chars);
}

interface Entry {
  state: RoyalPyraminxState;
  move: string | null;
  parent: Entry | null;
}

function pathFromEntry(entry: Entry): string[] {
  const path: string[] = [];
  let cur: Entry | null = entry;
  while (cur && cur.move !== null) {
    path.push(cur.move);
    cur = cur.parent;
  }
  path.reverse();
  return path;
}

/**
 * Meet-in-the-middle search from `start` to solved, over all 40 raw moves,
 * no decomposition. Returns a move sequence that solves `start`, or null if
 * none was found within `maxDepthEachSide`/`maxStates`. See this file's own
 * comment for why this is a baseline, not the final solver.
 */
export function solveRoyalBaseline(start: RoyalPyraminxState, maxDepthEachSide: number, maxStates: number): string[] | null {
  if (isSolvedRoyal(start)) return [];

  const fwdVisited = new Map<string, Entry>();
  const startEntry: Entry = { state: start, move: null, parent: null };
  fwdVisited.set(stateKey(start), startEntry);
  let fwdFrontier: Entry[] = [startEntry];

  const solved = createSolvedRoyalState();
  const bwdVisited = new Map<string, Entry>();
  const solvedEntry: Entry = { state: solved, move: null, parent: null };
  bwdVisited.set(stateKey(solved), solvedEntry);
  let bwdFrontier: Entry[] = [solvedEntry];

  const totalVisited = () => fwdVisited.size + bwdVisited.size;
  const buildPath = (fwdEntry: Entry, bwdEntry: Entry): string[] => [...pathFromEntry(fwdEntry), ...pathFromEntry(bwdEntry).reverse().map(invertMoveName)];

  for (let depth = 1; depth <= maxDepthEachSide; depth++) {
    const newFwd: Entry[] = [];
    for (const parentEntry of fwdFrontier) {
      for (const move of ALL_ROYAL_MOVE_NAMES) {
        const nextState = applyRoyalMove(parentEntry.state, move);
        const k = stateKey(nextState);
        if (!fwdVisited.has(k)) {
          const entry: Entry = { state: nextState, move, parent: parentEntry };
          fwdVisited.set(k, entry);
          newFwd.push(entry);
          if (totalVisited() > maxStates) return null;
          const hit = bwdVisited.get(k);
          if (hit) return buildPath(entry, hit);
        }
      }
    }
    fwdFrontier = newFwd;

    const newBwd: Entry[] = [];
    for (const parentEntry of bwdFrontier) {
      for (const move of ALL_ROYAL_MOVE_NAMES) {
        const nextState = applyRoyalMove(parentEntry.state, move);
        const k = stateKey(nextState);
        if (!bwdVisited.has(k)) {
          const entry: Entry = { state: nextState, move, parent: parentEntry };
          bwdVisited.set(k, entry);
          newBwd.push(entry);
          if (totalVisited() > maxStates) return null;
          const hit = fwdVisited.get(k);
          if (hit) return buildPath(hit, entry);
        }
      }
    }
    bwdFrontier = newBwd;
  }
  return null;
}

// ---- Axial-only search, Rust/wasm port (decomposition step 3) ----
//
// solveRoyalAxialOnlyFast's own typed-array hash table is safe from the
// crashes the plain Map version hit, but it's still a JS engine loop --
// measured up to ~36s for a search that ultimately failed at
// depth9/16,000,000 states. This is a structural Rust/wasm port of that
// exact same algorithm (same open-addressing hash table design, same
// meet-in-the-middle shape), not a new one -- adapted from N=5's own
// axial-wasm research crate, resized for N=6 (N=60 pieces, NUM_MOVES=40 vs
// N=5's 40/32).
//
// IMPORTANT ceiling, confirmed empirically (not assumed): standard wasm32
// (no memory64) has a hard 4GB TOTAL linear memory limit shared by
// everything in the module. At N=60 bytes/state, two hash tables sized for
// max_states=24,000,000 need slightly over 4GB combined and fail outright
// (Rust's allocator aborts) -- so this wasm port's real ceiling is *lower*
// than what the plain JS typed-array version could reach in some runs
// (which saw one success at max_states=16,000,000, using two SEPARATE
// ~2.2GB JS objects that aren't bound by wasm's single shared address
// space). Do not assume "wasm is strictly more capable" -- verified ceiling
// here is max_states<=~20,000,000 (capacity_for(24_000_000) already needs
// the next power-of-two tier and fails). Below that ceiling, wasm is
// faster per state than either JS version (matches N=5's own finding).
//
// A second, real bug was found and fixed while pushing this ceiling: each
// table's capacity is sized for max_states/2 (an EXPECTED roughly-even
// fwd/bwd split, to fit in the 4GB budget at all -- see the Rust source's
// own comment), but an unusually lopsided search can push ONE side much
// closer to ITS OWN 100%-full point before the cheap combined max_states
// check would have caught it, and open-addressing probe length degrades
// sharply as load factor approaches 1.0. Confirmed directly: one scramble
// that failed cleanly in ~19s at max_states=16-18,000,000 took over 5
// minutes at max_states=20,000,000 with the SAME table capacity, before a
// per-table 85%-full soft limit (stopping every probe well short of the
// degraded zone) was added to the Rust source and confirmed to fix it
// (same scramble: ~18s at all three budgets afterward).
const AXIAL_NUM_MOVES_WASM = ALL_ROYAL_MOVE_NAMES.length; // 40, matches the wasm crate's own NUM_MOVES constant

export const ROYAL_AXIAL_WASM_URL_PATH = "royalAxialSolver.wasm";

/** Same BASE_URL-aware resolution masterTetraminxSolver.ts's
 * resolveAxialWasmUrl uses, duplicated rather than imported to keep this
 * module independent of customTetra/ (Phase 1's own requirement). */
function resolveRoyalAxialWasmUrl(): string {
  const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
  const base = env?.BASE_URL ?? "/";
  return `${base}${ROYAL_AXIAL_WASM_URL_PATH}`;
}

interface RoyalAxialWasmExports {
  start_ptr(): number;
  perms_ptr(): number;
  out_ptr(): number;
  solve(maxDepthEachSide: number, maxStates: number): number;
  memory: WebAssembly.Memory;
}

let royalAxialWasmPromise: Promise<RoyalAxialWasmExports | null> | null = null;

/** Fetches and instantiates royalAxialSolver.wasm once. Never throws -- a
 * failed load just means solveRoyalAxialOnlyWasm returns null and callers
 * fall back to solveRoyalAxialOnlyFast. */
function loadRoyalAxialWasm(): Promise<RoyalAxialWasmExports | null> {
  if (!royalAxialWasmPromise) {
    royalAxialWasmPromise = fetch(resolveRoyalAxialWasmUrl())
      .then((res) => {
        if (!res.ok) throw new Error(`royal axial wasm fetch failed: HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => WebAssembly.instantiate(buf, {}))
      .then((result) => result.instance.exports as unknown as RoyalAxialWasmExports)
      .catch((err) => {
        console.error("royal axial wasm failed to load (non-fatal, falling back to the JS search):", err);
        return null;
      });
  }
  return royalAxialWasmPromise;
}

/** Kicks off the wasm fetch immediately so it's likely ready before the
 * first solve needs it. Safe to call multiple times, or never. */
export function preloadRoyalAxialWasm(): void {
  loadRoyalAxialWasm();
}

/**
 * Same contract as solveRoyalAxialOnlyFast, but tries the Rust/wasm port
 * first (see this section's own comment for its verified ~20,000,000-state
 * ceiling and why that's lower than the plain JS version's in some cases),
 * falling back to solveRoyalAxialOnlyFast if wasm is unavailable, fails to
 * load, or the caller asks for a budget wasm can't safely address.
 */
export async function solveRoyalAxialOnlyWasm(startAxial: Uint8Array, maxDepthEachSide: number, maxStates: number): Promise<string[] | null> {
  const wasm = await loadRoyalAxialWasm();
  if (!wasm) return solveRoyalAxialOnlyFast(startAxial, maxDepthEachSide, maxStates);

  const startView = new Uint8Array(wasm.memory.buffer, wasm.start_ptr(), AXIAL_COUNT);
  startView.set(startAxial);
  const perms = axialLocalPerms();
  const permsView = new Uint8Array(wasm.memory.buffer, wasm.perms_ptr(), AXIAL_NUM_MOVES_WASM * AXIAL_COUNT);
  for (let mi = 0; mi < AXIAL_NUM_MOVES_WASM; mi++) permsView.set(perms[mi], mi * AXIAL_COUNT);

  const count = wasm.solve(maxDepthEachSide, maxStates);
  if (count < 0) return null;
  // wasm memory can be resized by solve() (Rust's allocator growing the
  // heap for its hash tables), which can detach any previously-created
  // views -- re-read out_ptr() and re-wrap AFTER solve() returns, not
  // before, or this can read garbage/throw on a detached ArrayBuffer (same
  // caveat as N=5's own axial-wasm integration).
  const outView = new Int32Array(wasm.memory.buffer, wasm.out_ptr(), count);
  const moves: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = outView[i];
    if (raw < AXIAL_NUM_MOVES_WASM) moves.push(ALL_ROYAL_MOVE_NAMES[raw]);
    else moves.push(invertMoveName(ALL_ROYAL_MOVE_NAMES[raw - AXIAL_NUM_MOVES_WASM]));
  }
  return moves;
}

// ---- Full pipeline (Phase 2, "option B" complete) ----
//
// Order is axial -> tips -> edges -> centers, NOT tips-first: axial is the
// only stage (search or commutator fallback) that ever disturbs tips, and
// every edges/centers commutator in royalPyraminxCommutators.ts was
// verified to leave tips completely untouched. Solving tips right after
// axial (rather than first) means it only ever needs to be solved once,
// regardless of whether axial succeeded via search or fell back to
// commutators.
function applyMoveSeq(state: RoyalPyraminxState, seq: readonly string[]): RoyalPyraminxState {
  let cur = state;
  for (const m of seq) cur = applyRoyalMove(cur, m);
  return cur;
}

/**
 * Solves a full Royal Pyraminx scramble to identity, always. Tries the
 * axial meet-in-the-middle search first (fast when it works, but bounded
 * by maxDepthEachSide/maxStates -- see solveRoyalAxialOnlyWasm's own
 * comment for its real ceiling); if that fails, falls back to
 * solveAxialByCommutator (royalPyraminxCommutators.ts), which always
 * succeeds but produces a longer, non-optimal solution. Edges/centers/
 * tips are always solved via their own commutator-based stages, which
 * are cheap and always succeed. The returned move list, applied to
 * `start`, reaches the solved state -- callers that want the resulting
 * state too can just apply it themselves.
 */
export async function solveRoyalPyraminx(start: RoyalPyraminxState, axialMaxDepthEachSide: number, axialMaxStates: number): Promise<string[]> {
  const moves: string[] = [];
  let cur = start;

  const axialSolution = await solveRoyalAxialOnlyWasm(cur.axial, axialMaxDepthEachSide, axialMaxStates);
  if (axialSolution) {
    moves.push(...axialSolution);
    cur = applyMoveSeq(cur, axialSolution);
  } else {
    const fallback = solveAxialByCommutator(cur);
    moves.push(...fallback.moves);
    cur = fallback.state;
  }

  const tipsResult = solveTips(cur);
  moves.push(...tipsResult.moves);
  cur = tipsResult.state;

  const edgesResult = solveEdgesByCommutator(cur);
  moves.push(...edgesResult.moves);
  cur = edgesResult.state;

  const centersResult = solveCentersByCommutator(cur);
  moves.push(...centersResult.moves);
  cur = centersResult.state;

  return moves;
}
