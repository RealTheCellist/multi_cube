import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MOVE_TABLE, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import type { FaceIndex } from "./dodecaMath";

/**
 * Wasm-backed drop-in for megaminxSolver.ts's own buildReachableMap (see
 * wasm-search/src/lib.rs's own top comment for why only this one loop was
 * ported, not the whole solve pipeline). Exposes the SAME `.has`/`.get`
 * surface findSafeApplication/findFinishingApplication already call, so
 * swapping one construction call for the other is the only change their
 * own code needs -- every query key they compute themselves (jointPositionKey,
 * or a raw position for the single-piece case) stays byte-for-byte the same
 * JS, since the Wasm side mirrors that exact base-30 packing internally.
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

export function isWasmSearchAvailable(): boolean {
  return existsSync(WASM_PATH);
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

export interface WasmSafeApplicationResult {
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
): WasmSafeApplicationResult | null {
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
export function findFinishingApplicationWasm(libHandle: number, current: MegaminxState, kind: 0 | 1, wrongPositions: readonly number[], fixedCorners: readonly number[], fixedEdges: readonly number[], maxDepth: number, maxReachable: number): WasmSafeApplicationResult | null {
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
