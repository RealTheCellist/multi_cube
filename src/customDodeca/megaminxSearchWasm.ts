import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MOVE_TABLE, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import type { FaceIndex } from "./dodecaMath";

/**
 * JS binding layer for wasm-search's own Rust functions (raw `extern "C"`
 * exports moved through Wasm linear memory, no wasm-bindgen -- see
 * wasm-search/src/lib.rs's own top comment). `buildReachableMapWasm`
 * below was the first of these (a direct BFS port, exposing the same
 * `.has`/`.get` surface the original JS buildReachableMap did) and is
 * still used by megaminxSearchWasm.test.ts's own differential test; the
 * megaminx solver itself has since moved on to calling the full-function
 * ports (`findSafeApplicationWasm`, `findFinishingApplicationWasm`,
 * `solveCrossWasm`) directly, each doing its own reachable-map BFS
 * internally in Rust rather than round-tripping through this one.
 */

interface WasmExports {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  dealloc(ptr: number, len: number): void;
  init_move_table(ptr: number): void;
  build_reachable(kind: number, piecesLen: number, maxDepth: number, maxReachable: number): void;
  query(keyLo: number, keyHi: number): number;
  result_ptr(): number;
  upload_library(kind: number, entryCount: number, totalLen: number, ptr: number): number;
  find_safe_application(
    libHandle: number,
    kind: number,
    target: number,
    displaced: number,
    fixedCornersLen: number,
    fixedEdgesLen: number,
    targetPositionsLen: number,
    wrongBefore: number,
    requireImprovement: number,
  ): number;
  fsa_result_ptr(): number;
  find_finishing_application(libHandle: number, kind: number, wrongPositionsLen: number, fixedCornersLen: number, fixedEdgesLen: number, maxDepth: number, maxReachable: number): number;
  state_scratch_ptr(): number;
  pieces_scratch_ptr(): number;
  fixed_corners_scratch_ptr(): number;
  fixed_edges_scratch_ptr(): number;
  target_positions_scratch_ptr(): number;
  solve_cross(piecesLen: number, maxHalfDepth: number, maxFrontierSize: number): number;
  solve_result_ptr(): number;
  reach_log_count(): number;
  reach_log_ptr(): number;
  reach_log_reset(): void;
}

/**
 * Pointers into Wasm's own static scratch buffers (see wasm-search/src/lib.rs's
 * own dev notes): fetched once at init and reused for every call instead of
 * alloc()/dealloc()-ing a fresh buffer per call for these small, fixed-
 * upper-bound inputs (state<=100 bytes, pieces<=8, fixedCorners<=20,
 * fixedEdges/targetPositions<=30). The addresses never move (plain
 * `static mut` arrays, not reallocated Vecs), so caching them is safe
 * even across a Wasm memory growth (only `.buffer` itself changes then,
 * which every view below already re-reads fresh on each call).
 */
interface ScratchPointers {
  state: number;
  pieces: number;
  fixedCorners: number;
  fixedEdges: number;
  targetPositions: number;
}
let scratch: ScratchPointers | null = null;

const WASM_PATH = join(dirname(fileURLToPath(import.meta.url)), "wasm-search", "megaminx_search.wasm");

let wasm: WasmExports | null = null;

/** [face 0..12][sign 0=+1,1=-1] x (cornerPerm[20] ++ cornerOrientDelta[20] ++ edgePerm[30] ++ edgeOrientDelta[30]) -- exactly the layout wasm-search/src/lib.rs's own init_move_table expects. */
function flattenMoveTable(): Int8Array {
  const out = new Int8Array(2400);
  let offset = 0;
  for (let face = 0; face < 12; face++) {
    for (let signIdx = 0; signIdx < 2; signIdx++) {
      const table = MOVE_TABLE[face][signIdx];
      out.set(table.cornerPerm, offset);
      offset += 20;
      out.set(table.cornerOrientDelta, offset);
      offset += 20;
      out.set(table.edgePerm, offset);
      offset += 30;
      out.set(table.edgeOrientDelta, offset);
      offset += 30;
    }
  }
  return out;
}

/**
 * Synchronous by design (new WebAssembly.Module/Instance, not the async
 * WebAssembly.instantiate): every caller in this module's own solve chain
 * (solveCross -> ... -> findSafeApplication) is itself synchronous, and
 * Node supports the sync Wasm-loading API directly (confirmed working,
 * this project's Node 22.22), so there's no need to thread a Promise
 * through call sites that were never async to begin with.
 */
function ensureWasm(): WasmExports {
  if (wasm) return wasm;
  const bytes = readFileSync(WASM_PATH);
  const module = new WebAssembly.Module(bytes);
  const instance = new WebAssembly.Instance(module);
  const exports = instance.exports as unknown as WasmExports;

  const flat = flattenMoveTable();
  const ptr = exports.alloc(flat.length);
  new Int8Array(exports.memory.buffer, ptr, flat.length).set(flat);
  exports.init_move_table(ptr);
  exports.dealloc(ptr, flat.length);

  scratch = {
    state: exports.state_scratch_ptr(),
    pieces: exports.pieces_scratch_ptr(),
    fixedCorners: exports.fixed_corners_scratch_ptr(),
    fixedEdges: exports.fixed_edges_scratch_ptr(),
    targetPositions: exports.target_positions_scratch_ptr(),
  };

  wasm = exports;
  return exports;
}

export interface ReachableIndex {
  has(key: number): boolean;
  get(key: number): MegaminxTurn[] | undefined;
}

/** kind: 0 = corner (20 positions), 1 = edge (30 positions) -- matches wasm-search/src/lib.rs's own compute_key convention. */
export function buildReachableMapWasm(state: MegaminxState, kind: 0 | 1, pieces: readonly number[], maxDepth: number, maxReachable = 300_000): ReachableIndex {
  const exports = ensureWasm();
  const s = scratch!;

  // Re-read exports.memory.buffer fresh on every call: a call that grows
  // Wasm memory detaches any previously-created view over it, even
  // though the scratch pointers themselves (into static arrays) don't move.
  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  exports.build_reachable(kind, piecesLen, maxDepth, maxReachable);

  return {
    has(key: number): boolean {
      return this.get(key) !== undefined;
    },
    get(key: number): MegaminxTurn[] | undefined {
      const keyLo = key % 0x100000000;
      const keyHi = Math.floor(key / 0x100000000);
      const len = exports.query(keyLo, keyHi);
      if (len < 0) return undefined;
      const ptr = exports.result_ptr();
      const bytes = new Uint8Array(exports.memory.buffer, ptr, len * 2);
      const moves: MegaminxTurn[] = new Array(len);
      for (let i = 0; i < len; i++) {
        moves[i] = { face: bytes[i * 2] as FaceIndex, sign: bytes[i * 2 + 1] === 0 ? 1 : -1 };
      }
      return moves;
    },
  };
}

/** The minimal per-commutator shape find_safe_application/find_finishing_application's own upload_library needs -- see wasm-search/src/lib.rs's own dev notes for the buffer format. `support`/`movingSupport`/`destination` must already be resolved for the SAME kind this library targets (megaminxSolver.ts does this via PieceKind.support/movingSupport/destination before calling uploadLibraryWasm), since the Wasm side never carries both a corner and an edge variant per entry. */
export interface UploadableCommutator {
  seq: readonly MegaminxTurn[];
  support: readonly number[];
  movingSupport: readonly number[];
  destination: readonly number[];
}

/** kind: 0 = corner (destination is 20 bytes/entry), 1 = edge (30 bytes/entry). Returns an opaque handle for findSafeApplicationWasm/findFinishingApplicationWasm's own libHandle -- callers should cache this by the source library array's own identity (see megaminxSolver.ts's own getLibraryHandle) rather than re-uploading on every call, since a phase's library never changes once built. */
export function uploadLibraryWasm(kind: 0 | 1, entries: readonly UploadableCommutator[]): number {
  const exports = ensureWasm();
  const destLen = kind === 0 ? 20 : 30;

  let totalLen = 0;
  for (const e of entries) totalLen += 1 + e.seq.length * 2 + 1 + e.support.length + 1 + e.movingSupport.length + destLen;

  const buf = new Uint8Array(totalLen);
  let offset = 0;
  for (const e of entries) {
    buf[offset++] = e.seq.length;
    for (const t of e.seq) {
      buf[offset++] = t.face;
      buf[offset++] = t.sign === 1 ? 0 : 1;
    }
    buf[offset++] = e.support.length;
    buf.set(e.support, offset);
    offset += e.support.length;
    buf[offset++] = e.movingSupport.length;
    buf.set(e.movingSupport, offset);
    offset += e.movingSupport.length;
    buf.set(e.destination, offset);
    offset += destLen;
  }

  const ptr = exports.alloc(buf.length);
  new Uint8Array(exports.memory.buffer, ptr, buf.length).set(buf);
  const handle = exports.upload_library(kind, entries.length, buf.length, ptr);
  exports.dealloc(ptr, buf.length);
  return handle;
}

export interface WasmMatchResult {
  state: MegaminxState;
  seq: MegaminxTurn[];
}

/**
 * Wasm-backed drop-in for megaminxSolver.ts's own findSafeApplication:
 * the whole function (setup-move BFS AND its own candidate-matching
 * loop -- library iteration, applySeq, fixedOk, countWrongKind), not
 * just buildReachableMap's own BFS the way the rest of this module ports
 * (see wasm-search/src/lib.rs's own dev notes on why: profiled directly,
 * this function's own JS-side matching loop had grown to ~49% of a full
 * solve's own time once findFinishingApplication's cap tuning shrank
 * everything else). `fixedCorners`/`fixedEdges`/`targetPositions` are
 * small (<=20 or <=30) and cheap to re-upload every call, unlike the
 * library itself.
 */
export function findSafeApplicationWasm(
  libHandle: number,
  current: MegaminxState,
  kind: 0 | 1,
  target: number,
  displaced: number,
  fixedCorners: readonly number[],
  fixedEdges: readonly number[],
  targetPositions: readonly number[],
  wrongBefore: number,
  requireImprovement: boolean,
): WasmMatchResult | null {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(current.cornerPerm, 0);
  stateView.set(current.cornerOrient, 20);
  stateView.set(current.edgePerm, 40);
  stateView.set(current.edgeOrient, 70);

  const fcLen = fixedCorners.length;
  new Uint8Array(exports.memory.buffer, s.fixedCorners, fcLen).set(fixedCorners);

  const feLen = fixedEdges.length;
  new Uint8Array(exports.memory.buffer, s.fixedEdges, feLen).set(fixedEdges);

  const tpLen = targetPositions.length;
  new Uint8Array(exports.memory.buffer, s.targetPositions, tpLen).set(targetPositions);

  const len = exports.find_safe_application(libHandle, kind, target, displaced, fcLen, feLen, tpLen, wrongBefore, requireImprovement ? 1 : 0);

  if (len < 0) return null;

  const ptr = exports.fsa_result_ptr();
  const bytes = new Uint8Array(exports.memory.buffer, ptr, 100 + len * 2);
  const state: MegaminxState = {
    cornerPerm: Int8Array.from(bytes.subarray(0, 20)),
    cornerOrient: Int8Array.from(bytes.subarray(20, 40)),
    edgePerm: Int8Array.from(bytes.subarray(40, 70)),
    edgeOrient: Int8Array.from(bytes.subarray(70, 100)),
  };
  const seq: MegaminxTurn[] = new Array(len);
  for (let i = 0; i < len; i++) {
    seq[i] = { face: bytes[100 + i * 2] as FaceIndex, sign: bytes[100 + i * 2 + 1] === 0 ? 1 : -1 };
  }
  return { state, seq };
}

/**
 * Wasm-backed drop-in for megaminxSolver.ts's own findFinishingApplication
 * (the whole function, not just its own buildReachableMap call -- see
 * wasm-search/src/lib.rs's own find_finishing_application dev notes for
 * why: profiled directly, this function's own JS-side matching loop --
 * library iteration, permutations(wrongPieces), applySeq, fixedOk, the
 * per-piece solved check -- was ~21% of a full solve's own time,
 * distinct from (and in addition to) its own buildReachableMap share.
 * `wrongPositions` reuses the same PIECES_SCRATCH buffer buildReachableMapWasm
 * uses (never called concurrently with it), `fixedCorners`/`fixedEdges`
 * the same scratch findSafeApplicationWasm uses.
 */
export function findFinishingApplicationWasm(libHandle: number, current: MegaminxState, kind: 0 | 1, wrongPositions: readonly number[], fixedCorners: readonly number[], fixedEdges: readonly number[], maxDepth: number, maxReachable: number): WasmMatchResult | null {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(current.cornerPerm, 0);
  stateView.set(current.cornerOrient, 20);
  stateView.set(current.edgePerm, 40);
  stateView.set(current.edgeOrient, 70);

  const wpLen = wrongPositions.length;
  new Uint8Array(exports.memory.buffer, s.pieces, wpLen).set(wrongPositions);

  const fcLen = fixedCorners.length;
  new Uint8Array(exports.memory.buffer, s.fixedCorners, fcLen).set(fixedCorners);

  const feLen = fixedEdges.length;
  new Uint8Array(exports.memory.buffer, s.fixedEdges, feLen).set(fixedEdges);

  const len = exports.find_finishing_application(libHandle, kind, wpLen, fcLen, feLen, maxDepth, maxReachable);

  if (len < 0) return null;

  const ptr = exports.fsa_result_ptr();
  const bytes = new Uint8Array(exports.memory.buffer, ptr, 100 + len * 2);
  const state: MegaminxState = {
    cornerPerm: Int8Array.from(bytes.subarray(0, 20)),
    cornerOrient: Int8Array.from(bytes.subarray(20, 40)),
    edgePerm: Int8Array.from(bytes.subarray(40, 70)),
    edgeOrient: Int8Array.from(bytes.subarray(70, 100)),
  };
  const seq: MegaminxTurn[] = new Array(len);
  for (let i = 0; i < len; i++) {
    seq[i] = { face: bytes[100 + i * 2] as FaceIndex, sign: bytes[100 + i * 2 + 1] === 0 ? 1 : -1 };
  }
  return { state, seq };
}

/**
 * Wasm-backed drop-in for megaminxSolver.ts's own solveCross (the WHOLE
 * function, not just a building block inside it -- a deliberately small
 * pilot for "port solve-level control flow into Wasm" before deciding
 * whether to extend this to the rest of the pipeline; see
 * wasm-search/src/lib.rs's own dev notes). `pieces` is the sorted list of
 * edge piece ids the cross tracks (FIRST_LAYER_EDGE_POSITIONS); the
 * search target is always the solved state, fixed inside Wasm. Returns
 * `null` if no solution was found within maxHalfDepth/maxFrontierSize
 * (mirrors the JS version's own `null` return from bidirectionalSearch,
 * before solveCross itself turns that into a thrown error).
 */
export function solveCrossWasm(state: MegaminxState, pieces: readonly number[], maxHalfDepth: number, maxFrontierSize: number): MegaminxTurn[] | null {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  const len = exports.solve_cross(piecesLen, maxHalfDepth, maxFrontierSize);
  if (len < 0) return null;

  const ptr = exports.solve_result_ptr();
  const bytes = new Uint8Array(exports.memory.buffer, ptr, len * 2);
  const seq: MegaminxTurn[] = new Array(len);
  for (let i = 0; i < len; i++) {
    seq[i] = { face: bytes[i * 2] as FaceIndex, sign: bytes[i * 2 + 1] === 0 ? 1 : -1 };
  }
  return seq;
}

/**
 * MEGAMINX_3SEC_REACHABILITY_REUSE_ANALYSIS_V1 -- diagnostic-only binding
 * for wasm-search/src/lib.rs's own REACH_LOG (see its own dev notes): one
 * record per build_reachable_impl call made from find_safe_application/
 * find_finishing_application. Never read by any production solve path --
 * exists purely so a benchmark can determine, after a real solve, how
 * many of those calls shared an identical (root state, kind, pieces,
 * maxDepth, maxReachable) and would therefore have done identical work.
 */
/** termination: 0=MAX_DEPTH, 1=MAX_REACHABLE, 2=SEARCH_EXHAUSTED, 3=OTHER -- see build_reachable_impl's own dev notes (MEGAMINX_3SEC_REACHABILITY_COST_PROFILE_V1). */
export type BfsTerminationReason = 0 | 1 | 2 | 3;

export interface ReachLogEntry {
  stateHash: bigint;
  kind: 0 | 1;
  /** 0 = find_safe_application single-anchor, 1 = find_safe_application pair-anchor, 2 = find_finishing_application. */
  callerTag: 0 | 1 | 2;
  pieces: readonly number[];
  maxDepth: number;
  maxReachable: number;
  resultSize: number;
  expandedNodes: number;
  generatedStates: number;
  maxDepthReached: number;
  terminationReason: BfsTerminationReason;
  /** find_safe_application's own matching-loop scan (MEGAMINX_3SEC_PAIR_ANCHOR_EXHAUSTION_ANALYSIS_V1) -- 0/null for find_finishing_application (callerTag 2), which has no equivalent linear scan. */
  pairsVisited: number;
  candidatesHit: number;
  /** 1-based position in the scan where the winning candidate was found, or null if none succeeded. */
  successVisitIndex: number | null;
  /** The BFS's own discovery-order id for the winning key, or null if none succeeded -- how early/late build_reachable_impl found the key that ultimately mattered. */
  successKeyDiscoveryId: number | null;
  /** try_candidate's own two (and only two) rejection points (MEGAMINX_3SEC_FAILED_CANDIDATE_REASON_ANALYSIS_V1) -- both 0 for find_finishing_application. */
  rejectFixedOkFail: number;
  rejectBlocked: number;
  /**
   * MEGAMINX_3SEC_SETUP_PATH_FIXED_FILTER_VALIDATION_V1 -- cross-tab of
   * "does the setup path alone already touch a fixed position" (the
   * `actual`-state definition, see wasm-search/src/lib.rs's own dev
   * notes) against the eventual fixed_ok result. crossTouchesPass is the
   * safety-critical bucket: it should be 0 if "setup touches a fixed
   * position" is a safe necessary condition for fixed_ok failure. All 0
   * for find_finishing_application.
   */
  crossTouchesReject: number;
  crossTouchesPass: number;
  crossNotTouchesReject: number;
  crossNotTouchesPass: number;
  /** How often the identity-based ("support") and actual-state-based definitions of "touches a fixed position" disagreed, tallied once per unique setup path. */
  definitionMismatch: number;
  /** Distinct BFS-discovery ids (== distinct setup paths) encountered in this call's own matching-loop scan. */
  uniqueSetupPaths: number;
  /**
   * MEGAMINX_3SEC_CALL_LEVEL_FIXED_FILTER_VALIDATION_V2 -- unlike the
   * cross* fields above (scoped to setup paths the library actually
   * referenced), these describe the BFS's ENTIRE reachable-map output --
   * computable before the library scan starts, since it depends only on
   * build_reachable_impl's own result. allTouchFull is the call-level
   * candidate necessary condition under test.
   */
  allTouchFull: boolean;
  fullTouchesCount: number;
  fullReachableSize: number;
  /**
   * MEGAMINX_3SEC_PHASE2BC_LIBRARY_SUPPORT_NECESSITY_V1 -- the WINNING
   * commutator's own support.len() on success (null otherwise). Since
   * `library` is built as buckets 1..maxSupport concatenated in ascending
   * order and the matching loop scans it start-to-finish breaking on the
   * first hit, this is exactly "the smallest support size that had a
   * working candidate for this call" -- removing all support>N library
   * entries can only turn a call whose winningSupportSize>N into a
   * failure; it cannot affect a call whose winningSupportSize<=N.
   */
  winningSupportSize: number | null;
  /** Same pairsVisited/rejectFixedOkFail/rejectBlocked tallies, split by whether the current commutator's own support.len() is <=6 or >6. */
  attemptedLe6: number;
  attemptedGt6: number;
  fixedFailLe6: number;
  fixedFailGt6: number;
  blockedLe6: number;
  blockedGt6: number;
}

const NONE_MARKER = 0xffffffff;
const REACH_LOG_WORDS = 32;

export function readReachLog(): ReachLogEntry[] {
  const exports = ensureWasm();
  const count = exports.reach_log_count();
  if (count === 0) return [];
  const ptr = exports.reach_log_ptr();
  const words = new BigUint64Array(exports.memory.buffer, ptr, count * REACH_LOG_WORDS);
  const out: ReachLogEntry[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const base = i * REACH_LOG_WORDS;
    const stateHash = words[base];
    const packedPieces = words[base + 1];
    const meta = words[base + 2];
    const kind = Number(meta & 0xffn) as 0 | 1;
    const callerTag = Number((meta >> 8n) & 0xffn) as 0 | 1 | 2;
    const piecesLen = Number((meta >> 16n) & 0xffn);
    const pieces: number[] = new Array(piecesLen);
    for (let p = 0; p < piecesLen; p++) pieces[p] = Number((packedPieces >> BigInt(p * 8)) & 0xffn);
    const successVisitIndexRaw = Number(words[base + 12]);
    const successKeyDiscoveryIdRaw = Number(words[base + 13]);
    out[i] = {
      stateHash,
      kind,
      callerTag,
      pieces,
      maxDepth: Number(words[base + 3]),
      maxReachable: Number(words[base + 4]),
      resultSize: Number(words[base + 5]),
      expandedNodes: Number(words[base + 6]),
      generatedStates: Number(words[base + 7]),
      maxDepthReached: Number(words[base + 8]),
      terminationReason: Number(words[base + 9]) as BfsTerminationReason,
      pairsVisited: Number(words[base + 10]),
      candidatesHit: Number(words[base + 11]),
      successVisitIndex: successVisitIndexRaw === NONE_MARKER ? null : successVisitIndexRaw,
      successKeyDiscoveryId: successKeyDiscoveryIdRaw === NONE_MARKER ? null : successKeyDiscoveryIdRaw,
      rejectFixedOkFail: Number(words[base + 14]),
      rejectBlocked: Number(words[base + 15]),
      crossTouchesReject: Number(words[base + 16]),
      crossTouchesPass: Number(words[base + 17]),
      crossNotTouchesReject: Number(words[base + 18]),
      crossNotTouchesPass: Number(words[base + 19]),
      definitionMismatch: Number(words[base + 20]),
      uniqueSetupPaths: Number(words[base + 21]),
      allTouchFull: words[base + 22] !== 0n,
      fullTouchesCount: Number(words[base + 23]),
      fullReachableSize: Number(words[base + 24]),
      winningSupportSize: (() => {
        const raw = Number(words[base + 25]);
        return raw === NONE_MARKER ? null : raw;
      })(),
      attemptedLe6: Number(words[base + 26]),
      attemptedGt6: Number(words[base + 27]),
      fixedFailLe6: Number(words[base + 28]),
      fixedFailGt6: Number(words[base + 29]),
      blockedLe6: Number(words[base + 30]),
      blockedGt6: Number(words[base + 31]),
    };
  }
  return out;
}

export function resetReachLog(): void {
  ensureWasm().reach_log_reset();
}
