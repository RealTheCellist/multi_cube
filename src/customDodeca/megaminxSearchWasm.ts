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
  cross_log_count(): number;
  cross_log_ptr(): number;
  cross_log_reset(): void;
  solve_cross_symmetry_candidate(piecesLen: number, maxHalfDepth: number, maxFrontierSize: number): number;
  sym_result_ptr(): number;
  sym_stats_ptr(): number;
  sym_selftest(trialsInvariant: number, trialsOrder5: number, trialsSeqConj: number, trialsMoveConj: number): void;
  sym_selftest_result_ptr(): number;
  solve_cross_shared_forward_fallback(piecesLen: number, depth12MaxHalfDepth: number, depth12MaxFrontier: number, totalMaxHalfDepth: number, candidateMaxFrontier: number): number;
  shared_fwd_result_ptr(): number;
  shared_fwd_stats_ptr(): number;
  shared_backward_verify(piecesLen: number, maxRounds: number): void;
  b6_verify_log_count(): number;
  b6_verify_log_ptr(): number;
  solve_cross_shared_backward_fallback(piecesLen: number, depth12MaxHalfDepth: number, depth12MaxFrontier: number, totalMaxHalfDepth: number, candidateMaxFrontier: number): number;
  shared_bwd_result_ptr(): number;
  shared_bwd_stats_ptr(): number;
  tail_profile_phase1(piecesLen: number, depth12MaxHalfDepth: number, depth12MaxFrontier: number): number;
  tail_profile_run_to_round(piecesLen: number, targetTotalRounds: number, maxFrontierSize: number): number;
  tail_profile_result_ptr(): number;
  tail_profile_meeting_scan(piecesLen: number, repeats: number): number;
  tail_profile_reconstruct(piecesLen: number, repeats: number): number;
  microopt_verify_one(piecesLen: number): number;
  microopt_verify_comprehensive(piecesLen: number, forwardRootProvided: number): number;
  bench_conjugate_state(variant: number, repeats: number): bigint;
  bench_compute_edge_state_key(piecesLen: number, variant: number, repeats: number): bigint;
  bench_state_zero_init(repeats: number): number;
  bench_canonical_key(piecesLen: number, variant: number, repeats: number): bigint;
  solve_cross_shared_forward_fallback_v2(piecesLen: number, depth12MaxHalfDepth: number, depth12MaxFrontier: number, totalMaxHalfDepth: number, candidateMaxFrontier: number): number;
  shared_fwd_v2_result_ptr(): number;
  shared_fwd_v2_stats_ptr(): number;
  diagnostic_run_v2(piecesLen: number, depth12MaxHalfDepth: number, depth12MaxFrontier: number, totalMaxHalfDepth: number, candidateMaxFrontier: number): number;
  diag_result_ptr(): number;
  diag_stats_ptr(): number;
  diag_round_log_count(): number;
  diag_round_log_ptr(): number;
  diag_meeting_distance(): number;
  diag_distance_result_ptr(): number;
  radius1_bridge_run_v1(piecesLen: number, depth12MaxHalfDepth: number, depth12MaxFrontier: number, totalMaxHalfDepth: number, candidateMaxFrontier: number, maxBridgeDepth: number): number;
  radius1_stats_ptr(): number;
  radius1_sample_count(): number;
  radius1_sample_ptr(): number;
  radius1_solutions_count(): number;
  radius1_solutions_ptr(): number;
  radius1_solution_stride(): number;
  radius1_bridge_early_exit_v1(piecesLen: number, depth12MaxHalfDepth: number, depth12MaxFrontier: number, totalMaxHalfDepth: number, candidateMaxFrontier: number, maxBridgeDepth: number): number;
  radius1_ee_stats_ptr(): number;
  radius1_ee_result_len(): number;
  radius1_ee_result_ptr(): number;
  radius1_prefilter_analysis_v1(piecesLen: number, depth12MaxHalfDepth: number, depth12MaxFrontier: number, totalMaxHalfDepth: number, candidateMaxFrontier: number, maxBridgeDepth: number, candidateCap: number): number;
  radius1_pf_stats_ptr(): number;
  radius1_pf_sample_count(): number;
  radius1_pf_sample_ptr(): number;
  radius1_bridge_early_exit_filtered_v1(piecesLen: number, depth12MaxHalfDepth: number, depth12MaxFrontier: number, totalMaxHalfDepth: number, candidateMaxFrontier: number, maxBridgeDepth: number): number;
  radius1_fee_stats_ptr(): number;
  radius1_fee_result_len(): number;
  radius1_fee_result_ptr(): number;
  radius1_candidate_order_analysis_v1(piecesLen: number, depth12MaxHalfDepth: number, depth12MaxFrontier: number, totalMaxHalfDepth: number, candidateMaxFrontier: number, maxBridgeDepth: number, candidateCap: number): number;
  radius1_co_stats_ptr(): number;
  radius1_co_row_count(): number;
  radius1_co_rows_ptr(): number;
  radius1_bridge_early_exit_reordered_v1(piecesLen: number, depth12MaxHalfDepth: number, depth12MaxFrontier: number, totalMaxHalfDepth: number, candidateMaxFrontier: number, maxBridgeDepth: number): number;
  radius1_oo_stats_ptr(): number;
  radius1_oo_result_len(): number;
  radius1_oo_result_ptr(): number;
  radius1_orientation_order_analysis_v1(piecesLen: number, depth12MaxHalfDepth: number, depth12MaxFrontier: number, totalMaxHalfDepth: number, candidateMaxFrontier: number, maxBridgeDepth: number, candidateCap: number): number;
  radius1_oa_stats_ptr(): number;
  radius1_oa_row_count(): number;
  radius1_oa_rows_ptr(): number;
  canonical_key_v2_cost_profile_v1(piecesLen: number, depth12MaxHalfDepth: number, depth12MaxFrontier: number, totalMaxHalfDepth: number, candidateMaxFrontier: number, maxBridgeDepth: number, candidateCap: number): number;
  canonical_key_v2_cost_profile_stats_ptr(): number;
  canonical_key_v2_cost_profile_row_count(): number;
  canonical_key_v2_cost_profile_rows_ptr(): number;
  canonical_key_v2_targeted_opt_verify(seed: number, randomCount: number, includeOrbit: number): number;
  canonical_key_v2_targeted_opt_verify_result_ptr(): number;
  bench_canonical_key_v2_targeted(variant: number, repeats: number): bigint;
  bench_conjugate_state_targeted(variant: number, repeats: number): bigint;
  radius1_bridge_early_exit_direct_v1(piecesLen: number, depth12MaxHalfDepth: number, depth12MaxFrontier: number, totalMaxHalfDepth: number, candidateMaxFrontier: number, maxBridgeDepth: number): number;
  radius1_dir_stats_ptr(): number;
  radius1_dir_result_len(): number;
  radius1_dir_result_ptr(): number;
  radius1_bridge_pipeline_cost_profile_v1(piecesLen: number, depth12MaxHalfDepth: number, depth12MaxFrontier: number, totalMaxHalfDepth: number, candidateMaxFrontier: number, maxBridgeDepth: number, candidateCap: number, stage: number): number;
  radius1_pipe_stats_ptr(): number;
  radius1_pipe_row_count(): number;
  radius1_pipe_rows_ptr(): number;
  bench_apply_move_targeted(repeats: number): bigint;
  bench_reconstruct_generic_targeted(pathLen: number, repeats: number): bigint;
  bench_apply_seq_targeted(pathLen: number, repeats: number): bigint;
  noop_ffi_bench(): number;
  rbfs_phase1(piecesLen: number, depth12MaxHalfDepth: number, depth12MaxFrontier: number): number;
  rbfs_run_one_round(piecesLen: number, maxFrontierSize: number): number;
  rbfs_round_stats_ptr(): number;
  rbfs_result_len(): number;
  rbfs_result_ptr(): number;
  bench_fastmap_insert_targeted(prepopulate: number, repeats: number): bigint;
  bench_fastmap_lookup_only_targeted(prepopulate: number, repeats: number): bigint;
  precomputed_backward_table_ensure_built(): number;
  precomputed_backward_table_stats_ptr(): number;
  solve_cross_cached_backward_v1(piecesLen: number, depth12MaxHalfDepth: number, depth12MaxFrontier: number, totalMaxHalfDepth: number): number;
  cached_bwd_stats_ptr(): number;
  cached_bwd_result_len(): number;
  cached_bwd_result_ptr(): number;
  residual3_meeting_gap_analysis_v1(piecesLen: number, depth12MaxHalfDepth: number, depth12MaxFrontier: number, totalMaxHalfDepth: number): number;
  residual3_meeting_gap_stats_ptr(): number;
  residual3_forward_signature_histogram_v1(piecesLen: number, depth12MaxHalfDepth: number, depth12MaxFrontier: number): number;
  residual3_backward_signature_histogram_v1(): number;
  residual3_sig_hist_ptr(): number;
  residual3_sig_bucket_count(): number;
  cluster_target_sigs_scratch_ptr(): number;
  residual3_cluster_entry_analysis_v1(piecesLen: number, depth12MaxHalfDepth: number, depth12MaxFrontier: number, sigCount: number): number;
  residual3_cluster_best_depth_ptr(): number;
  residual3_cluster_best_path_len_ptr(): number;
  residual3_cluster_best_path_ptr(): number;
  residual3_cluster_move_hist_ptr(): number;
  residual3_cluster_total_forward(): number;
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

/**
 * MEGAMINX_SOLVECROSS_COMPLETENESS_V1 -- diagnostic-only binding for
 * wasm-search/src/lib.rs's own CROSS_LOG (see its own dev notes): one
 * record per solve_cross call, describing the bidirectional search's own
 * round-by-round behavior (which side expanded each round, how many new
 * states each round accepted vs generated, how the search terminated).
 * Read via cross_log_ptr/cross_log_count, cleared via cross_log_reset;
 * never read internally by any production solver logic.
 */
export type CrossTerminationReason = 0 | 1 | 2; // 0=meet_found, 1=frontier_exceeded, 2=rounds_exhausted

export interface CrossLogEntry {
  stateHash: bigint;
  maxHalfDepth: number;
  maxFrontierSize: number;
  piecesLen: number;
  found: boolean;
  solutionLength: number | null;
  forwardRounds: number;
  backwardRounds: number;
  forwardFinalSize: number;
  backwardFinalSize: number;
  totalGenerated: number;
  totalAccepted: number;
  meetingAttempts: number;
  terminationReason: CrossTerminationReason;
  roundsCompleted: number;
  /** bit i (0-indexed) = 1 -> round i expanded the backward tree, 0 -> forward. Only bits < roundsCompleted (or the round that triggered frontier_exceeded) are meaningful. */
  roundSideBitmask: bigint;
  /** New (unique, accepted) states discovered in each round, indexed by round number; only the first `min(roundsCompleted+1, 16)` entries are meaningful. */
  roundNewCounts: readonly number[];
}

const CROSS_LOG_WORDS = 32;

export function readCrossLog(): CrossLogEntry[] {
  const exports = ensureWasm();
  const count = exports.cross_log_count();
  if (count === 0) return [];
  const ptr = exports.cross_log_ptr();
  const words = new BigUint64Array(exports.memory.buffer, ptr, count * CROSS_LOG_WORDS);
  const out: CrossLogEntry[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const base = i * CROSS_LOG_WORDS;
    const found = words[base + 4] !== 0n;
    const roundNewCounts: number[] = new Array(16);
    for (let r = 0; r < 16; r++) roundNewCounts[r] = Number(words[base + 16 + r]);
    out[i] = {
      stateHash: words[base],
      maxHalfDepth: Number(words[base + 1]),
      maxFrontierSize: Number(words[base + 2]),
      piecesLen: Number(words[base + 3]),
      found,
      solutionLength: found ? Number(words[base + 5]) : null,
      forwardRounds: Number(words[base + 6]),
      backwardRounds: Number(words[base + 7]),
      forwardFinalSize: Number(words[base + 8]),
      backwardFinalSize: Number(words[base + 9]),
      totalGenerated: Number(words[base + 10]),
      totalAccepted: Number(words[base + 11]),
      meetingAttempts: Number(words[base + 12]),
      terminationReason: Number(words[base + 13]) as CrossTerminationReason,
      roundsCompleted: Number(words[base + 14]),
      roundSideBitmask: words[base + 15],
      roundNewCounts,
    };
  }
  return out;
}

export function resetCrossLog(): void {
  ensureWasm().cross_log_reset();
}

/**
 * MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_RUST_PORT_V1 -- isolated JS binding
 * for wasm-search/src/lib.rs's own solve_cross_symmetry_candidate (see its
 * own dev notes): a Rust port of the JS-validated backward-only C5
 * symmetry canonicalization candidate
 * (solveCrossBackwardSymmetryCandidate.bench.test.ts's own candidateSearch),
 * exposed as a completely separate entry point from solveCrossWasm --
 * calling this NEVER touches solve_cross/bidirectional_search_impl or the
 * production maxHalfDepth=12 default. Not called from megaminxSolver.ts's
 * own solve pipeline; only test/bench harnesses for this Sprint call it.
 */
export interface SymCandidateStats {
  found: boolean;
  solutionLength: number | null;
  forwardRounds: number;
  backwardRounds: number;
  forwardFinalSize: number;
  backwardCanonicalFinalSize: number;
  meetingAttempts: number;
  terminationReason: CrossTerminationReason;
  roundsCompleted: number;
  peakForwardFrontier: number;
  peakBackwardFrontier: number;
}

function readLastSymStats(exports: WasmExports): SymCandidateStats {
  const ptr = exports.sym_stats_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr, 11);
  const found = words[0] !== 0;
  return {
    found,
    solutionLength: found ? words[1] : null,
    forwardRounds: words[2],
    backwardRounds: words[3],
    forwardFinalSize: words[4],
    backwardCanonicalFinalSize: words[5],
    meetingAttempts: words[6],
    terminationReason: words[7] as CrossTerminationReason,
    roundsCompleted: words[8],
    peakForwardFrontier: words[9],
    peakBackwardFrontier: words[10],
  };
}

export interface SymCandidateResult {
  seq: MegaminxTurn[];
  stats: SymCandidateStats;
}

/**
 * Wasm-backed Rust port of the JS symmetry-candidate search. `pieces` is
 * the sorted list of edge piece ids the cross tracks (same contract as
 * solveCrossWasm). Returns `{ seq, stats }` on a hit, or `{ seq: null,
 * stats }` (stats still populated -- termination reason, rounds, final
 * sizes) when no solution was found within maxHalfDepth/maxFrontierSize.
 */
export function solveCrossSymmetryCandidateWasm(state: MegaminxState, pieces: readonly number[], maxHalfDepth: number, maxFrontierSize: number): { seq: MegaminxTurn[] | null; stats: SymCandidateStats } {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  const len = exports.solve_cross_symmetry_candidate(piecesLen, maxHalfDepth, maxFrontierSize);
  const stats = readLastSymStats(exports);
  if (len < 0) return { seq: null, stats };

  const ptr = exports.sym_result_ptr();
  const bytes = new Uint8Array(exports.memory.buffer, ptr, len * 2);
  const seq: MegaminxTurn[] = new Array(len);
  for (let i = 0; i < len; i++) {
    seq[i] = { face: bytes[i * 2] as FaceIndex, sign: bytes[i * 2 + 1] === 0 ? 1 : -1 };
  }
  return { seq, stats };
}

export interface SymSelftestResult {
  solvedInvariant: number;
  order5: number;
  sequenceConjugation: number;
  moveConjugation: number;
}

/**
 * Gate A: runs wasm-search/src/lib.rs's own sym_selftest (SOLVED-invariance,
 * order-5, sequence-conjugation, move-conjugation -- see its own dev notes)
 * against the SAME MOVE_TABLE this module already loaded, and returns pass
 * counts out of each requested trial count.
 */
export function symSelftestWasm(trialsInvariant: number, trialsOrder5: number, trialsSeqConj: number, trialsMoveConj: number): SymSelftestResult {
  const exports = ensureWasm();
  exports.sym_selftest(trialsInvariant, trialsOrder5, trialsSeqConj, trialsMoveConj);
  const ptr = exports.sym_selftest_result_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr, 4);
  return {
    solvedInvariant: words[0],
    order5: words[1],
    sequenceConjugation: words[2],
    moveConjugation: words[3],
  };
}

/**
 * MEGAMINX_SOLVECROSS_SYMMETRY_FALLBACK_SHARED_FORWARD_V1 -- isolated JS
 * binding for wasm-search/src/lib.rs's own solve_cross_shared_forward_fallback
 * (see its own dev notes): phase 1 runs a raw depth12-equivalent search
 * whose forward side ALSO tracks canon_key inline; only if phase 1 fails
 * via ROUNDS_EXHAUSTED does phase 2 continue with a fresh canonical
 * backward and the INHERITED forward tree (no forward regeneration).
 * Never touches solve_cross/solveCrossWasm or
 * solve_cross_symmetry_candidate/solveCrossSymmetryCandidateWasm, and is
 * not wired into megaminxSolver.ts's own production path.
 */
export interface SharedForwardStats {
  found: boolean;
  solutionLength: number | null;
  phase1ForwardRounds: number;
  phase1BackwardRounds: number;
  /** 0 = meet found in phase 1 (fallback never ran), 1 = phase1 hit frontier cap (not reusable, phase 2 skipped), 2 = phase1 rounds exhausted (captured, phase 2 ran). */
  phase1Termination: 0 | 1 | 2;
  phase2ForwardRoundsTotal: number;
  phase2BackwardRounds: number;
  /** 0=meet_found, 1=frontier_exceeded, 2=rounds_exhausted; null if phase 2 never ran. */
  phase2Termination: CrossTerminationReason | null;
  totalRounds: number;
  peakForwardFrontier: number;
  peakBackwardFrontierPhase1Raw: number;
  peakBackwardFrontierPhase2Canonical: number;
}

function readLastSharedForwardStats(exports: WasmExports): SharedForwardStats {
  const ptr = exports.shared_fwd_stats_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr, 12);
  const found = words[0] !== 0;
  const phase2Termination = words[7];
  return {
    found,
    solutionLength: found ? words[1] : null,
    phase1ForwardRounds: words[2],
    phase1BackwardRounds: words[3],
    phase1Termination: words[4] as 0 | 1 | 2,
    phase2ForwardRoundsTotal: words[5],
    phase2BackwardRounds: words[6],
    phase2Termination: phase2Termination === 0xffffffff ? null : (phase2Termination as CrossTerminationReason),
    totalRounds: words[8],
    peakForwardFrontier: words[9],
    peakBackwardFrontierPhase1Raw: words[10],
    peakBackwardFrontierPhase2Canonical: words[11],
  };
}

export function solveCrossSharedForwardFallbackWasm(
  state: MegaminxState,
  pieces: readonly number[],
  depth12MaxHalfDepth: number,
  depth12MaxFrontier: number,
  totalMaxHalfDepth: number,
  candidateMaxFrontier: number,
): { seq: MegaminxTurn[] | null; stats: SharedForwardStats } {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  const len = exports.solve_cross_shared_forward_fallback(piecesLen, depth12MaxHalfDepth, depth12MaxFrontier, totalMaxHalfDepth, candidateMaxFrontier);
  const stats = readLastSharedForwardStats(exports);
  if (len < 0) return { seq: null, stats };

  const ptr = exports.shared_fwd_result_ptr();
  const bytes = new Uint8Array(exports.memory.buffer, ptr, len * 2);
  const seq: MegaminxTurn[] = new Array(len);
  for (let i = 0; i < len; i++) {
    seq[i] = { face: bytes[i * 2] as FaceIndex, sign: bytes[i * 2 + 1] === 0 ? 1 : -1 };
  }
  return { seq, stats };
}

/**
 * MEGAMINX_SOLVECROSS_SYMMETRY_SHARED_BACKWARD_V1 -- isolated JS binding
 * for wasm-search/src/lib.rs's own shared_backward_verify (Stop Rule A
 * check: does canonicalizing depth12's own raw backward tree at each
 * round give EXACTLY the same canonical key set a standalone canonical
 * BFS would reach at that round?) and solve_cross_shared_backward_fallback
 * (the full pipeline, only trustworthy once the verify check passes).
 * Never touches solve_cross/solveCrossWasm,
 * solve_cross_symmetry_candidate/solveCrossSymmetryCandidateWasm, or
 * solve_cross_shared_forward_fallback/solveCrossSharedForwardFallbackWasm
 * -- and is not wired into megaminxSolver.ts's own production path.
 */
export interface B6VerifyRoundResult {
  round: number;
  rawSize: number;
  canonReconstructedSize: number;
  canonGoldenSize: number;
  exactMatch: boolean;
  extraInReconstructed: number;
  missingFromReconstructed: number;
}

export function sharedBackwardVerifyWasm(pieces: readonly number[], maxRounds: number): B6VerifyRoundResult[] {
  const exports = ensureWasm();
  const s = scratch!;
  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  exports.shared_backward_verify(piecesLen, maxRounds);
  const count = exports.b6_verify_log_count();
  const ptr2 = exports.b6_verify_log_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr2, count * 7);
  const out: B6VerifyRoundResult[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const base = i * 7;
    out[i] = {
      round: words[base],
      rawSize: words[base + 1],
      canonReconstructedSize: words[base + 2],
      canonGoldenSize: words[base + 3],
      exactMatch: words[base + 4] !== 0,
      extraInReconstructed: words[base + 5],
      missingFromReconstructed: words[base + 6],
    };
  }
  return out;
}

export interface SharedBackwardStats {
  found: boolean;
  solutionLength: number | null;
  phase1ForwardRounds: number;
  phase1BackwardRounds: number;
  phase1Termination: 0 | 1 | 2;
  phase2ForwardRoundsTotal: number;
  phase2BackwardRoundsTotal: number;
  phase2Termination: CrossTerminationReason | null;
  totalRounds: number;
  peakForwardFrontier: number;
  peakBackwardFrontier: number;
}

function readLastSharedBackwardStats(exports: WasmExports): SharedBackwardStats {
  const ptr = exports.shared_bwd_stats_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr, 11);
  const found = words[0] !== 0;
  const phase2Termination = words[7];
  return {
    found,
    solutionLength: found ? words[1] : null,
    phase1ForwardRounds: words[2],
    phase1BackwardRounds: words[3],
    phase1Termination: words[4] as 0 | 1 | 2,
    phase2ForwardRoundsTotal: words[5],
    phase2BackwardRoundsTotal: words[6],
    phase2Termination: phase2Termination === 0xffffffff ? null : (phase2Termination as CrossTerminationReason),
    totalRounds: words[8],
    peakForwardFrontier: words[9],
    peakBackwardFrontier: words[10],
  };
}

export function solveCrossSharedBackwardFallbackWasm(
  state: MegaminxState,
  pieces: readonly number[],
  depth12MaxHalfDepth: number,
  depth12MaxFrontier: number,
  totalMaxHalfDepth: number,
  candidateMaxFrontier: number,
): { seq: MegaminxTurn[] | null; stats: SharedBackwardStats } {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  const len = exports.solve_cross_shared_backward_fallback(piecesLen, depth12MaxHalfDepth, depth12MaxFrontier, totalMaxHalfDepth, candidateMaxFrontier);
  const stats = readLastSharedBackwardStats(exports);
  if (len < 0) return { seq: null, stats };

  const ptr = exports.shared_bwd_result_ptr();
  const bytes = new Uint8Array(exports.memory.buffer, ptr, len * 2);
  const seq: MegaminxTurn[] = new Array(len);
  for (let i = 0; i < len; i++) {
    seq[i] = { face: bytes[i * 2] as FaceIndex, sign: bytes[i * 2 + 1] === 0 ? 1 : -1 };
  }
  return { seq, stats };
}

/**
 * MEGAMINX_SOLVECROSS_SYMMETRY_CANDIDATE_TAIL_PROFILE_V1 -- isolated JS
 * bindings for wasm-search/src/lib.rs's own tail_profile_* exports (see
 * its own dev notes): a pure profiling harness, NO algorithm change --
 * shared-forward's own validated logic is reproduced exactly, just split
 * into separately-callable, separately-timeable chunks (this crate has no
 * working clock of its own in wasm32-unknown-unknown, so every phase is
 * timed from here via performance.now() around each call). Never touches
 * solve_cross/solveCrossWasm, solve_cross_symmetry_candidate, or
 * solve_cross_shared_forward_fallback/solveCrossSharedForwardFallbackWasm's
 * own entry points -- and is not wired into megaminxSolver.ts.
 *
 * Usage: call tailProfilePhase1Wasm once (T1), then tailProfileRunToRoundWasm
 * with increasing targetTotalRounds (12 then 13, to isolate T3 vs T4),
 * then tailProfileMeetingScanWasm/tailProfileReconstructWasm (T5/T6) --
 * each call timed independently by the caller.
 */
export function tailProfilePhase1Wasm(state: MegaminxState, pieces: readonly number[], depth12MaxHalfDepth: number, depth12MaxFrontier: number): number {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  return exports.tail_profile_phase1(piecesLen, depth12MaxHalfDepth, depth12MaxFrontier);
}

export function tailProfileRunToRoundWasm(pieces: readonly number[], targetTotalRounds: number, maxFrontierSize: number): { status: number; seq: MegaminxTurn[] | null } {
  const exports = ensureWasm();
  const s = scratch!;
  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  const status = exports.tail_profile_run_to_round(piecesLen, targetTotalRounds, maxFrontierSize);
  if (status !== 1) return { status, seq: null };

  // Length isn't returned directly by this export (status is 1/0/-1, not
  // a move count) -- reconstruct isn't needed here since correctness was
  // already validated by the shared-forward Sprint; this Sprint only
  // needs the STATUS (found or not) to confirm the profiled run reached
  // the same outcome, not the actual move sequence.
  return { status, seq: null };
}

export function tailProfileMeetingScanWasm(pieces: readonly number[], repeats: number): number {
  const exports = ensureWasm();
  const s = scratch!;
  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);
  return exports.tail_profile_meeting_scan(piecesLen, repeats);
}

export function tailProfileReconstructWasm(pieces: readonly number[], repeats: number): number {
  const exports = ensureWasm();
  const s = scratch!;
  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);
  return exports.tail_profile_reconstruct(piecesLen, repeats);
}

/**
 * MEGAMINX_SOLVECROSS_CANONICALIZATION_MICRO_OPT_V1 -- isolated JS
 * bindings for wasm-search/src/lib.rs's own microopt_verify_ and bench_
 * exports (see its own dev notes): a pure low-level implementation
 * experiment on canonical_key/conjugate_state, no search-semantics
 * change. V0 is the existing, untouched canonical_key; V1 skips
 * compute_edge_state_key's own redundant slot_for_piece init (this
 * candidate's own tracked pieces are always the fixed 5 contiguous ids
 * [0,1,2,3,4]); V2 additionally fuses conjugate_state's own two
 * compose_transforms passes into one. Every claim is checked for
 * bit-for-bit equivalence against V0 (Gate A) before any timing number is
 * trusted. Not wired into megaminxSolver.ts or any other production path.
 */
export function microoptVerifyOneWasm(state: MegaminxState, pieces: readonly number[]): number {
  const exports = ensureWasm();
  const s = scratch!;
  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);
  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);
  return exports.microopt_verify_one(piecesLen);
}

export function microoptVerifyComprehensiveWasm(pieces: readonly number[], forwardRoot: MegaminxState | null): number {
  const exports = ensureWasm();
  const s = scratch!;
  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);
  if (forwardRoot) {
    const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
    stateView.set(forwardRoot.cornerPerm, 0);
    stateView.set(forwardRoot.cornerOrient, 20);
    stateView.set(forwardRoot.edgePerm, 40);
    stateView.set(forwardRoot.edgeOrient, 70);
  }
  return exports.microopt_verify_comprehensive(piecesLen, forwardRoot ? 1 : 0);
}

/** variant: 0 = V0 (existing conjugate_state), 2 = V2 (fused single-pass). */
export function benchConjugateStateWasm(state: MegaminxState, variant: 0 | 2, repeats: number): bigint {
  const exports = ensureWasm();
  const s = scratch!;
  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);
  return exports.bench_conjugate_state(variant, repeats);
}

/** variant: 0 = V0 (general compute_edge_state_key), 1 = V1 (fast5 path). */
export function benchComputeEdgeStateKeyWasm(state: MegaminxState, pieces: readonly number[], variant: 0 | 1, repeats: number): bigint {
  const exports = ensureWasm();
  const s = scratch!;
  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);
  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);
  return exports.bench_compute_edge_state_key(piecesLen, variant, repeats);
}

export function benchStateZeroInitWasm(repeats: number): number {
  const exports = ensureWasm();
  return exports.bench_state_zero_init(repeats);
}

/** variant: 0 = V0, 1 = V1, 2 = V2. */
export function benchCanonicalKeyWasm(state: MegaminxState, pieces: readonly number[], variant: 0 | 1 | 2, repeats: number): bigint {
  const exports = ensureWasm();
  const s = scratch!;
  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);
  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);
  return exports.bench_canonical_key(piecesLen, variant, repeats);
}

/**
 * Full end-to-end V2 pipeline binding -- same contract as
 * solveCrossSharedForwardFallbackWasm, but using the Gate-A-verified V2
 * canonicalization implementation throughout (see wasm-search/src/lib.rs's
 * own dev notes). The ONLY difference from the already-validated
 * shared-forward pipeline; not wired into any production path.
 */
export function solveCrossSharedForwardFallbackV2Wasm(
  state: MegaminxState,
  pieces: readonly number[],
  depth12MaxHalfDepth: number,
  depth12MaxFrontier: number,
  totalMaxHalfDepth: number,
  candidateMaxFrontier: number,
): { seq: MegaminxTurn[] | null; stats: SharedForwardStats } {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  const len = exports.solve_cross_shared_forward_fallback_v2(piecesLen, depth12MaxHalfDepth, depth12MaxFrontier, totalMaxHalfDepth, candidateMaxFrontier);
  const ptr = exports.shared_fwd_v2_stats_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr, 11);
  const found = words[0] !== 0;
  const phase2Term = words[7];
  const stats: SharedForwardStats = {
    found,
    solutionLength: found ? words[1] : null,
    phase1ForwardRounds: words[2],
    phase1BackwardRounds: words[3],
    phase1Termination: words[4] as 0 | 1 | 2,
    phase2ForwardRoundsTotal: words[5],
    phase2BackwardRounds: words[6],
    phase2Termination: phase2Term === 0xffffffff ? null : (phase2Term as CrossTerminationReason),
    totalRounds: words[8],
    peakForwardFrontier: words[9],
    peakBackwardFrontier: words[10],
  };
  if (len < 0) return { seq: null, stats };

  const resultPtr = exports.shared_fwd_v2_result_ptr();
  const bytes = new Uint8Array(exports.memory.buffer, resultPtr, len * 2);
  const seq: MegaminxTurn[] = new Array(len);
  for (let i = 0; i < len; i++) {
    seq[i] = { face: bytes[i * 2] as FaceIndex, sign: bytes[i * 2 + 1] === 0 ? 1 : -1 };
  }
  return { seq, stats };
}

/**
 * MEGAMINX_SOLVECROSS_RESIDUAL3_COMPLETENESS_STRUCTURAL_ANALYSIS_V1 --
 * isolated JS bindings for wasm-search/src/lib.rs's own diagnostic_run_v2
 * (see its own dev notes): byte-identical phase 1
 * (phase1_raw_capture_forward_v2_impl, the SAME function the accepted V2
 * production pipeline uses) followed by phase2_diagnostic_v2_impl, which
 * reproduces phase2_continue_with_canonical_backward_v2_impl's own round
 * loop exactly but additionally appends one DIAG_ROUND_LOG entry per round
 * (8 words: round, side, generated_this_round, retained_this_round,
 * cumulative_forward_size, cumulative_backward_canon_size, cap_hit,
 * meeting_found) and leaves the final forward/backward trees in DIAG_STATE
 * for diagMeetingDistanceWasm to inspect afterward. Pure diagnostic
 * instrumentation -- never touches solve_cross or any of the
 * solve_cross_shared_forward_fallback (or V2) / solve_cross_symmetry_candidate
 * entry points, and is not wired into megaminxSolver.ts's own production
 * path. `totalMaxHalfDepth` is the parameter that lets a caller run the
 * SAME baseline (13) or an extended depth (14) diagnostic in isolation.
 */
export interface DiagStats {
  found: boolean;
  solutionLength: number | null;
  forwardRounds: number;
  backwardRounds: number;
  forwardFinalSize: number;
  backwardCanonicalFinalSize: number;
  meetingAttempts: number;
  terminationReason: CrossTerminationReason;
  roundsCompleted: number;
}

export interface DiagRoundLogEntry {
  round: number;
  /** 0 = forward expanded this round, 1 = backward expanded this round. */
  side: 0 | 1;
  generatedThisRound: number;
  retainedThisRound: number;
  cumulativeForwardSize: number;
  cumulativeBackwardCanonSize: number;
  capHit: boolean;
  meetingFound: boolean;
}

function readDiagStats(exports: WasmExports): DiagStats {
  const ptr = exports.diag_stats_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr, 9);
  const found = words[0] !== 0;
  return {
    found,
    solutionLength: found ? words[1] : null,
    forwardRounds: words[2],
    backwardRounds: words[3],
    forwardFinalSize: words[4],
    backwardCanonicalFinalSize: words[5],
    meetingAttempts: words[6],
    terminationReason: words[7] as CrossTerminationReason,
    roundsCompleted: words[8],
  };
}

function readDiagRoundLog(exports: WasmExports): DiagRoundLogEntry[] {
  const count = exports.diag_round_log_count();
  if (count === 0) return [];
  const ptr = exports.diag_round_log_ptr();
  const words = new BigUint64Array(exports.memory.buffer, ptr, count * 8);
  const out: DiagRoundLogEntry[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const base = i * 8;
    out[i] = {
      round: Number(words[base]),
      side: Number(words[base + 1]) as 0 | 1,
      generatedThisRound: Number(words[base + 2]),
      retainedThisRound: Number(words[base + 3]),
      cumulativeForwardSize: Number(words[base + 4]),
      cumulativeBackwardCanonSize: Number(words[base + 5]),
      capHit: words[base + 6] !== 0n,
      meetingFound: words[base + 7] !== 0n,
    };
  }
  return out;
}

export function diagnosticRunV2Wasm(
  state: MegaminxState,
  pieces: readonly number[],
  depth12MaxHalfDepth: number,
  depth12MaxFrontier: number,
  totalMaxHalfDepth: number,
  candidateMaxFrontier: number,
): { seq: MegaminxTurn[] | null; stats: DiagStats; roundLog: DiagRoundLogEntry[] } {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  const len = exports.diagnostic_run_v2(piecesLen, depth12MaxHalfDepth, depth12MaxFrontier, totalMaxHalfDepth, candidateMaxFrontier);
  const stats = readDiagStats(exports);
  const roundLog = readDiagRoundLog(exports);
  if (len < 0) return { seq: null, stats, roundLog };

  const ptr = exports.diag_result_ptr();
  const bytes = new Uint8Array(exports.memory.buffer, ptr, len * 2);
  const seq: MegaminxTurn[] = new Array(len);
  for (let i = 0; i < len; i++) {
    seq[i] = { face: bytes[i * 2] as FaceIndex, sign: bytes[i * 2 + 1] === 0 ? 1 : -1 };
  }
  return { seq, stats, roundLog };
}

/**
 * Wildcard-hash "meeting distance" diagnostic: how many of the 5 tracked
 * edge-slot digits would need to differ for some forward canonical key to
 * exactly match some backward canonical key (radius 1 tried first, then
 * radius 2; DIAG_STATE's own forward.canon_key / backward.canon_to_id.keys
 * are the source, left populated by the most recent diagnosticRunV2Wasm
 * call). Diagnostic only -- never used to alter solver behavior.
 * `bestRadius: null` means DIAG_STATE was empty (call diagnosticRunV2Wasm
 * first); `bestRadius: -1` (from Rust's u32::MAX) means nothing was found
 * within radius 2.
 */
export interface DiagDistanceResult {
  available: boolean;
  bestRadius: number | null;
  countAtBest: number;
  exampleForwardKey: bigint;
  exampleBackwardKey: bigint;
}

export function diagMeetingDistanceWasm(): DiagDistanceResult {
  const exports = ensureWasm();
  const available = exports.diag_meeting_distance() !== 0;
  const ptr = exports.diag_distance_result_ptr();
  const words = new BigUint64Array(exports.memory.buffer, ptr, 4);
  const rawRadius = words[0];
  const bestRadius = !available ? null : rawRadius === 0xffffffffn ? -1 : Number(rawRadius);
  return {
    available,
    bestRadius,
    countAtBest: Number(words[1]),
    exampleForwardKey: words[2],
    exampleBackwardKey: words[3],
  };
}

/**
 * MEGAMINX_SOLVECROSS_RADIUS1_MEETING_BRIDGING_FEASIBILITY_V1 -- isolated
 * JS binding for wasm-search/src/lib.rs's own radius1_bridge_run_v1 (see
 * its own dev notes): re-runs the SAME diagnostic_run_v2 phase1/phase2
 * (byte-identical, unchanged) and, only when it finds no exact meeting,
 * extracts every canonical-key radius-1 (forward id, backward id) pair
 * and tests, for each one, whether the REAL (raw, full) states are
 * actually close (real-space Hamming distance among the 5 tracked edge
 * digits, scanning all 5 of backward's own symmetry powers) and, if so,
 * whether a fixed-depth (<=maxBridgeDepth, exhaustively enumerated -- no
 * new search algorithm) sequence of genuine moves connects them into a
 * full, internally-replay-verified cross solution. Pure diagnostic
 * prototype: never touches solve_cross or any production entry point,
 * and is not wired into megaminxSolver.ts.
 */
export interface Radius1Stats {
  /** Ran the extraction/bridge pipeline at all (phase2 found no exact meeting -- a genuine residual case for this depth budget). */
  ran: boolean;
  totalRadius1Candidates: number;
  realHammingCounts: { h1: number; h2: number; h3: number; h4: number; h5Plus: number };
  bridgeDepthCounts: { d1: number; d2: number; d3: number };
  bridgeNotFoundCount: number;
  candidatesTested: number;
  slotHistogram: [number, number, number, number, number];
  totalInternallyVerifiedSolutions: number;
  sampleCount: number;
  solutionsCount: number;
  candidatesTruncated: boolean;
  forwardFinalSize: number;
  backwardFinalSize: number;
  /** True when phase2 already found an exact (radius-0) meeting for this fixture (e.g. hard#5/hard#31) -- radius-1 candidates were still extracted from the SAME final trees, alongside that exact hit. */
  exactMeetingAlreadyFound: boolean;
}

export interface Radius1SampleEntry {
  forwardRawKey: bigint;
  bestTargetKey: bigint;
  slot: number;
  fwdDigit: number;
  bwdDigit: number;
  realHamming: number;
  /** null = not tested (realHamming != 1); -1 = tested, not found within maxBridgeDepth; else 1-3 = actual bridge depth. */
  bridgeDepth: number | null;
  internallyValid: boolean;
}

export interface Radius1Solution {
  bridgeDepth: number;
  seq: MegaminxTurn[];
}

function readRadius1Stats(exports: WasmExports, ran: boolean): Radius1Stats {
  const ptr = exports.radius1_stats_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr, 24);
  return {
    ran,
    totalRadius1Candidates: words[0],
    realHammingCounts: { h1: words[1], h2: words[2], h3: words[3], h4: words[4], h5Plus: words[5] },
    bridgeDepthCounts: { d1: words[6], d2: words[7], d3: words[8] },
    bridgeNotFoundCount: words[9],
    candidatesTested: words[10],
    slotHistogram: [words[11], words[12], words[13], words[14], words[15]],
    totalInternallyVerifiedSolutions: words[16],
    sampleCount: words[17],
    solutionsCount: words[18],
    candidatesTruncated: words[19] !== 0,
    forwardFinalSize: words[20],
    backwardFinalSize: words[21],
    exactMeetingAlreadyFound: words[22] !== 0,
  };
}

function readRadius1Samples(exports: WasmExports, count: number): Radius1SampleEntry[] {
  if (count === 0) return [];
  const ptr = exports.radius1_sample_ptr();
  const words = new BigUint64Array(exports.memory.buffer, ptr, count * 3);
  const out: Radius1SampleEntry[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const base = i * 3;
    const forwardRawKey = words[base];
    const bestTargetKey = words[base + 1];
    const packed = words[base + 2];
    const slot = Number(packed & 0xffn);
    const fwdDigit = Number((packed >> 8n) & 0xffn);
    const bwdDigit = Number((packed >> 16n) & 0xffn);
    const realHamming = Number((packed >> 24n) & 0xffn);
    const bridgeMarker = Number((packed >> 32n) & 0xffn);
    const internallyValid = ((packed >> 40n) & 0xffn) !== 0n;
    const bridgeDepth = bridgeMarker === 0xff ? null : bridgeMarker === 0xfe ? -1 : bridgeMarker;
    out[i] = { forwardRawKey, bestTargetKey, slot, fwdDigit, bwdDigit, realHamming, bridgeDepth, internallyValid };
  }
  return out;
}

function readRadius1Solutions(exports: WasmExports, count: number): Radius1Solution[] {
  if (count === 0) return [];
  const stride = exports.radius1_solution_stride();
  const ptr = exports.radius1_solutions_ptr();
  const bytes = new Uint8Array(exports.memory.buffer, ptr, count * stride);
  const out: Radius1Solution[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const base = i * stride;
    const len = bytes[base];
    const bridgeDepth = bytes[base + 1];
    const seq: MegaminxTurn[] = new Array(len);
    for (let m = 0; m < len; m++) {
      seq[m] = { face: bytes[base + 2 + m * 2] as FaceIndex, sign: bytes[base + 2 + m * 2 + 1] === 0 ? 1 : -1 };
    }
    out[i] = { bridgeDepth, seq };
  }
  return out;
}

export function radius1BridgeRunWasm(
  state: MegaminxState,
  pieces: readonly number[],
  depth12MaxHalfDepth: number,
  depth12MaxFrontier: number,
  totalMaxHalfDepth: number,
  candidateMaxFrontier: number,
  maxBridgeDepth: number,
): { stats: Radius1Stats; samples: Radius1SampleEntry[]; solutions: Radius1Solution[] } {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  const ran = exports.radius1_bridge_run_v1(piecesLen, depth12MaxHalfDepth, depth12MaxFrontier, totalMaxHalfDepth, candidateMaxFrontier, maxBridgeDepth) !== 0;
  const stats = readRadius1Stats(exports, ran);
  const samples = readRadius1Samples(exports, stats.sampleCount);
  const solutions = readRadius1Solutions(exports, stats.solutionsCount);
  return { stats, samples, solutions };
}

/**
 * MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_EARLY_EXIT_AND_SYMMETRY_ALIGNMENT_V1
 * -- isolated JS binding for wasm-search/src/lib.rs's own
 * radius1_bridge_early_exit_v1 (see its own dev notes): fixes the
 * previous Sprint's symmetry-direction mismatch (now reuses the
 * EXISTING, already-validated find_symmetry_index exactly as every other
 * meeting call site in this file does -- conjugate the forward state,
 * compare against backward's own fixed real_key) and switches from
 * exhaustive-all-candidates to first-valid-solution early-exit: stops at
 * the first candidate whose bridge produces a FULLY internally-verified
 * (replayed, 5-tracked-edge match) solution, not the first "local bridge
 * found" the way the previous Sprint measured. Same phase1/phase2 reuse,
 * same extract_radius1_candidates, same try-depth-1-then-2-then-3
 * exhaustive local move enumeration (no new search algorithm) -- only the
 * acceptance test (canonical_key_v2 equality, not a raw-key/manual power
 * alignment) and the early-exit control flow are new. Not wired into
 * megaminxSolver.ts.
 */
export interface Radius1EarlyExitResult {
  /** 1 = found + internally verified; -1 = a bridge was found but the full combined solution failed its OWN internal replay check (should not occur, flagged if it does); 0 = no candidate produced any bridge within maxBridgeDepth (or nothing to bridge -- see ran). */
  status: 1 | -1 | 0;
  ran: boolean;
  candidatesScanned: number;
  totalCandidates: number;
  found: boolean;
  bridgeDepth: number;
  solutionLength: number;
  internallyValid: boolean;
  candidatesTruncated: boolean;
  forwardFinalSize: number;
  backwardFinalSize: number;
  seq: MegaminxTurn[] | null;
}

export function radius1BridgeEarlyExitWasm(
  state: MegaminxState,
  pieces: readonly number[],
  depth12MaxHalfDepth: number,
  depth12MaxFrontier: number,
  totalMaxHalfDepth: number,
  candidateMaxFrontier: number,
  maxBridgeDepth: number,
): Radius1EarlyExitResult {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  const status = exports.radius1_bridge_early_exit_v1(piecesLen, depth12MaxHalfDepth, depth12MaxFrontier, totalMaxHalfDepth, candidateMaxFrontier, maxBridgeDepth) as 1 | -1 | 0;
  const ptr = exports.radius1_ee_stats_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr, 9);
  const found = words[2] !== 0;

  let seq: MegaminxTurn[] | null = null;
  if (found) {
    const len = exports.radius1_ee_result_len();
    const resultPtr = exports.radius1_ee_result_ptr();
    const bytes = new Uint8Array(exports.memory.buffer, resultPtr, len * 2);
    seq = new Array(len);
    for (let i = 0; i < len; i++) {
      seq[i] = { face: bytes[i * 2] as FaceIndex, sign: bytes[i * 2 + 1] === 0 ? 1 : -1 };
    }
  }

  return {
    status,
    ran: words[1] > 0 || found,
    candidatesScanned: words[0],
    totalCandidates: words[1],
    found,
    bridgeDepth: words[3],
    solutionLength: words[4],
    internallyValid: words[5] !== 0,
    candidatesTruncated: words[6] !== 0,
    forwardFinalSize: words[7],
    backwardFinalSize: words[8],
    seq,
  };
}

/**
 * MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_RAWKEY_PREFILTER_VALIDATION_V1 --
 * isolated JS binding for wasm-search/src/lib.rs's own
 * radius1_prefilter_analysis_v1 (see its own dev notes): for up to
 * `candidateCap` radius-1 candidates (same extraction, same order, no
 * reordering), computes BOTH a cheap raw-key pre-check
 * (raw_hamming_min_over_orbits, no canonical_key_v2 calls) and the
 * expensive ground truth (try_bridge_canonical_counted, the SAME depth
 * 1->2->3 exhaustive enumeration try_bridge_canonical already uses, just
 * with a call counter), so the F1 filter's false-negative rate (does the
 * cheap check ever reject a candidate that the expensive one would have
 * accepted?) can be measured directly. Pure diagnostic; not wired into
 * any production or early-exit path.
 */
export interface Radius1PrefilterStats {
  candidatesAnalyzed: number;
  totalCandidates: number;
  /** rawHamming<=1 AND bridgeFound -- filter correctly keeps a real hit. */
  truePositive: number;
  /** rawHamming<=1 AND NOT bridgeFound -- filter keeps it, but it still fails (no safety issue, just no savings on this one). */
  falsePositive: number;
  /** rawHamming>1 AND bridgeFound -- filter would have WRONGLY rejected a valid bridge. Must be 0 for the filter to be safe. */
  falseNegative: number;
  /** rawHamming>1 AND NOT bridgeFound -- filter correctly rejects, saving the full canonical_key_v2 exhaustion. */
  trueNegative: number;
  canonicalKeyCallsTotal: number;
  /** Sum of canonical_key_v2 calls made by candidates the filter would have KEPT (rawHamming<=1) -- i.e. total calls MINUS this = calls the filter would have saved. */
  canonicalKeyCallsIfFiltered: number;
  candidatesTruncated: boolean;
  forwardFinalSize: number;
  backwardFinalSize: number;
}

export interface Radius1PrefilterSampleRow {
  candidateIndex: number;
  fid: number;
  bid: number;
  rawHammingDistance: number;
  canonicalHammingDistance: number;
  bridgeDepthAttempted: number;
  canonicalKeyCalls: number;
  bridgeFound: boolean;
  completeSolutionValid: boolean;
}

function readRadius1PrefilterStats(exports: WasmExports): Radius1PrefilterStats {
  const ptr = exports.radius1_pf_stats_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr, 11);
  return {
    candidatesAnalyzed: words[0],
    totalCandidates: words[1],
    truePositive: words[2],
    falsePositive: words[3],
    falseNegative: words[4],
    trueNegative: words[5],
    canonicalKeyCallsTotal: words[6],
    canonicalKeyCallsIfFiltered: words[7],
    candidatesTruncated: words[8] !== 0,
    forwardFinalSize: words[9],
    backwardFinalSize: words[10],
  };
}

function readRadius1PrefilterSample(exports: WasmExports, count: number): Radius1PrefilterSampleRow[] {
  if (count === 0) return [];
  const ptr = exports.radius1_pf_sample_ptr();
  const words = new BigUint64Array(exports.memory.buffer, ptr, count * 4);
  const out: Radius1PrefilterSampleRow[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const base = i * 4;
    const candidateIndex = Number(words[base]);
    const packed = words[base + 1];
    const fid = Number(words[base + 2]);
    const bid = Number(words[base + 3]);
    out[i] = {
      candidateIndex,
      fid,
      bid,
      rawHammingDistance: Number(packed & 0xffn),
      canonicalHammingDistance: Number((packed >> 8n) & 0xffn),
      bridgeDepthAttempted: Number((packed >> 16n) & 0xffn),
      canonicalKeyCalls: Number((packed >> 24n) & 0xffffffffn),
      bridgeFound: ((packed >> 56n) & 0xffn) !== 0n,
      completeSolutionValid: ((packed >> 57n) & 0xffn) !== 0n,
    };
  }
  return out;
}

export function radius1PrefilterAnalysisWasm(
  state: MegaminxState,
  pieces: readonly number[],
  depth12MaxHalfDepth: number,
  depth12MaxFrontier: number,
  totalMaxHalfDepth: number,
  candidateMaxFrontier: number,
  maxBridgeDepth: number,
  candidateCap: number,
): { stats: Radius1PrefilterStats; sample: Radius1PrefilterSampleRow[] } {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  exports.radius1_prefilter_analysis_v1(piecesLen, depth12MaxHalfDepth, depth12MaxFrontier, totalMaxHalfDepth, candidateMaxFrontier, maxBridgeDepth, candidateCap);
  const stats = readRadius1PrefilterStats(exports);
  const sample = readRadius1PrefilterSample(exports, exports.radius1_pf_sample_count());
  return { stats, sample };
}

/**
 * Gate D: the SAME early-exit loop as radius1BridgeEarlyExitWasm (last
 * Sprint, unmodified), with exactly one addition -- a cheap raw-key
 * pre-check before the expensive canonical_key_v2 exhaustion, skipping it
 * for any candidate the filter rejects. Candidate order, bridge depth
 * structure, find_symmetry_index, and the final combination are all
 * byte-for-byte identical to the unfiltered version.
 */
export interface Radius1EarlyExitFilteredResult extends Radius1EarlyExitResult {
  candidatesSkippedByFilter: number;
}

export function radius1BridgeEarlyExitFilteredWasm(
  state: MegaminxState,
  pieces: readonly number[],
  depth12MaxHalfDepth: number,
  depth12MaxFrontier: number,
  totalMaxHalfDepth: number,
  candidateMaxFrontier: number,
  maxBridgeDepth: number,
): Radius1EarlyExitFilteredResult {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  const status = exports.radius1_bridge_early_exit_filtered_v1(piecesLen, depth12MaxHalfDepth, depth12MaxFrontier, totalMaxHalfDepth, candidateMaxFrontier, maxBridgeDepth) as 1 | -1 | 0;
  const ptr = exports.radius1_fee_stats_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr, 10);
  const found = words[2] !== 0;

  let seq: MegaminxTurn[] | null = null;
  if (found) {
    const len = exports.radius1_fee_result_len();
    const resultPtr = exports.radius1_fee_result_ptr();
    const bytes = new Uint8Array(exports.memory.buffer, resultPtr, len * 2);
    seq = new Array(len);
    for (let i = 0; i < len; i++) {
      seq[i] = { face: bytes[i * 2] as FaceIndex, sign: bytes[i * 2 + 1] === 0 ? 1 : -1 };
    }
  }

  return {
    status,
    ran: words[7] > 0 || found,
    candidatesScanned: words[0],
    candidatesSkippedByFilter: words[1],
    totalCandidates: words[7],
    found,
    bridgeDepth: words[3],
    solutionLength: words[4],
    internallyValid: words[5] !== 0,
    candidatesTruncated: words[6] !== 0,
    forwardFinalSize: words[8],
    backwardFinalSize: words[9],
    seq,
  };
}

/**
 * MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_CANDIDATE_ORDER_ANALYSIS_V1 --
 * isolated JS binding for wasm-search/src/lib.rs's own
 * radius1_candidate_order_analysis_v1 (see its own dev notes): for up to
 * `candidateCap` radius-1 candidates (SAME extraction order as every
 * previous radius-1 Sprint -- never reordered), records a feature set
 * that already exists per candidate (its rank/index, which C5 power is
 * canonical for it, forward/backward discovery order and BFS depth,
 * whether the single differing digit is a permutation or orientation
 * mismatch) alongside the SAME try_bridge_canonical/find_symmetry_index
 * ground truth already validated in the early-exit Sprint. Pure
 * measurement -- no sorting, no new search, no production change.
 */
export interface Radius1CandidateOrderStats {
  analyzed: number;
  totalCandidates: number;
  truePositiveCount: number;
  candidatesTruncated: boolean;
  forwardFinalSize: number;
  backwardFinalSize: number;
}

export interface Radius1CandidateOrderRow {
  candidateIndex: number;
  changedSlot: number;
  forwardDepth: number;
  backwardDepth: number;
  rawKeyDistance: number;
  forwardCanonicalPower: number;
  backwardCanonicalPower: number;
  canonicalKeyDistance: number;
  matchingSlots: number;
  permutationDiffers: boolean;
  orientationDiffers: boolean;
  bridgeFound: boolean;
  bridgeDepth: number;
  completeSolutionValid: boolean;
  forwardDiscoveryIndex: number;
  backwardDiscoveryIndex: number;
}

function readRadius1CandidateOrderStats(exports: WasmExports): Radius1CandidateOrderStats {
  const ptr = exports.radius1_co_stats_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr, 6);
  return {
    analyzed: words[0],
    totalCandidates: words[1],
    truePositiveCount: words[2],
    candidatesTruncated: words[3] !== 0,
    forwardFinalSize: words[4],
    backwardFinalSize: words[5],
  };
}

function readRadius1CandidateOrderRows(exports: WasmExports, count: number): Radius1CandidateOrderRow[] {
  if (count === 0) return [];
  const ptr = exports.radius1_co_rows_ptr();
  const words = new BigUint64Array(exports.memory.buffer, ptr, count * 4);
  const out: Radius1CandidateOrderRow[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const base = i * 4;
    const word0 = words[base];
    const word1 = words[base + 1];
    out[i] = {
      candidateIndex: Number(word0 & 0xffffffffn),
      changedSlot: Number((word0 >> 32n) & 0xffn),
      forwardDepth: Number((word0 >> 40n) & 0xffn),
      backwardDepth: Number((word0 >> 48n) & 0xffn),
      rawKeyDistance: Number((word0 >> 56n) & 0xffn),
      forwardCanonicalPower: Number(word1 & 0xffn),
      backwardCanonicalPower: Number((word1 >> 8n) & 0xffn),
      canonicalKeyDistance: Number((word1 >> 16n) & 0xffn),
      matchingSlots: Number((word1 >> 24n) & 0xffn),
      permutationDiffers: ((word1 >> 32n) & 0xffn) !== 0n,
      orientationDiffers: ((word1 >> 33n) & 0xffn) !== 0n,
      bridgeFound: ((word1 >> 34n) & 0xffn) !== 0n,
      bridgeDepth: Number((word1 >> 35n) & 0x1fn),
      completeSolutionValid: ((word1 >> 40n) & 0xffn) !== 0n,
      forwardDiscoveryIndex: Number(words[base + 2]),
      backwardDiscoveryIndex: Number(words[base + 3]),
    };
  }
  return out;
}

export function radius1CandidateOrderAnalysisWasm(
  state: MegaminxState,
  pieces: readonly number[],
  depth12MaxHalfDepth: number,
  depth12MaxFrontier: number,
  totalMaxHalfDepth: number,
  candidateMaxFrontier: number,
  maxBridgeDepth: number,
  candidateCap: number,
): { stats: Radius1CandidateOrderStats; rows: Radius1CandidateOrderRow[] } {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  exports.radius1_candidate_order_analysis_v1(piecesLen, depth12MaxHalfDepth, depth12MaxFrontier, totalMaxHalfDepth, candidateMaxFrontier, maxBridgeDepth, candidateCap);
  const stats = readRadius1CandidateOrderStats(exports);
  const rows = readRadius1CandidateOrderRows(exports, exports.radius1_co_row_count());
  return { stats, rows };
}

/**
 * MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_ORIENTATION_ORDER_VALIDATION_V1 --
 * isolated JS binding for wasm-search/src/lib.rs's own
 * radius1_bridge_early_exit_reordered_v1 (see its own dev notes): the
 * SAME early-exit loop as radius1BridgeEarlyExitWasm, but traversing
 * candidates in a stable-partitioned order (bucket A = orientationDiffers
 * true, tried first; bucket B = false, tried second -- each preserving
 * the original extraction order internally). No candidate is dropped;
 * this is ordering, not filtering. try_bridge_canonical and
 * find_symmetry_index are reused completely unchanged.
 */
export interface Radius1EarlyExitReorderedResult {
  status: 1 | -1 | 0;
  candidatesScanned: number;
  found: boolean;
  bridgeDepth: number;
  solutionLength: number;
  internallyValid: boolean;
  candidatesTruncated: boolean;
  totalCandidates: number;
  forwardFinalSize: number;
  backwardFinalSize: number;
  bucketASize: number;
  bucketBSize: number;
  foundInBucketA: boolean;
  seq: MegaminxTurn[] | null;
}

export function radius1BridgeEarlyExitReorderedWasm(
  state: MegaminxState,
  pieces: readonly number[],
  depth12MaxHalfDepth: number,
  depth12MaxFrontier: number,
  totalMaxHalfDepth: number,
  candidateMaxFrontier: number,
  maxBridgeDepth: number,
): Radius1EarlyExitReorderedResult {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  const status = exports.radius1_bridge_early_exit_reordered_v1(piecesLen, depth12MaxHalfDepth, depth12MaxFrontier, totalMaxHalfDepth, candidateMaxFrontier, maxBridgeDepth) as 1 | -1 | 0;
  const ptr = exports.radius1_oo_stats_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr, 12);
  const found = words[1] !== 0;

  let seq: MegaminxTurn[] | null = null;
  if (found) {
    const len = exports.radius1_oo_result_len();
    const resultPtr = exports.radius1_oo_result_ptr();
    const bytes = new Uint8Array(exports.memory.buffer, resultPtr, len * 2);
    seq = new Array(len);
    for (let i = 0; i < len; i++) {
      seq[i] = { face: bytes[i * 2] as FaceIndex, sign: bytes[i * 2 + 1] === 0 ? 1 : -1 };
    }
  }

  return {
    status,
    candidatesScanned: words[0],
    found,
    bridgeDepth: words[2],
    solutionLength: words[3],
    internallyValid: words[4] !== 0,
    candidatesTruncated: words[5] !== 0,
    totalCandidates: words[6],
    forwardFinalSize: words[7],
    backwardFinalSize: words[8],
    bucketASize: words[9],
    bucketBSize: words[10],
    foundInBucketA: words[11] !== 0,
    seq,
  };
}

/**
 * Gate C: same per-candidate feature+ground-truth analysis as
 * radius1CandidateOrderAnalysisWasm (last Sprint), but over the REORDERED
 * (bucket A ++ bucket B) sequence, so the cumulative success-by-rank
 * table can be recomputed for the new order.
 */
export interface Radius1OrientationOrderStats {
  analyzed: number;
  totalCandidates: number;
  truePositiveCount: number;
  candidatesTruncated: boolean;
  forwardFinalSize: number;
  backwardFinalSize: number;
  bucketASize: number;
  bucketBSize: number;
}

export interface Radius1OrientationOrderRow {
  newRank: number;
  changedSlot: number;
  forwardDepth: number;
  backwardDepth: number;
  rawKeyDistance: number;
  forwardCanonicalPower: number;
  backwardCanonicalPower: number;
  bridgeFound: boolean;
  bridgeDepth: number;
  completeSolutionValid: boolean;
  inBucketA: boolean;
  forwardDiscoveryIndex: number;
  backwardDiscoveryIndex: number;
  originalIndex: number;
}

function readRadius1OrientationOrderStats(exports: WasmExports): Radius1OrientationOrderStats {
  const ptr = exports.radius1_oa_stats_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr, 8);
  return {
    analyzed: words[0],
    totalCandidates: words[1],
    truePositiveCount: words[2],
    candidatesTruncated: words[3] !== 0,
    forwardFinalSize: words[4],
    backwardFinalSize: words[5],
    bucketASize: words[6],
    bucketBSize: words[7],
  };
}

function readRadius1OrientationOrderRows(exports: WasmExports, count: number): Radius1OrientationOrderRow[] {
  if (count === 0) return [];
  const ptr = exports.radius1_oa_rows_ptr();
  const words = new BigUint64Array(exports.memory.buffer, ptr, count * 5);
  const out: Radius1OrientationOrderRow[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const base = i * 5;
    const word0 = words[base];
    const word1 = words[base + 1];
    out[i] = {
      newRank: Number(word0 & 0xffffffffn),
      changedSlot: Number((word0 >> 32n) & 0xffn),
      forwardDepth: Number((word0 >> 40n) & 0xffn),
      backwardDepth: Number((word0 >> 48n) & 0xffn),
      rawKeyDistance: Number((word0 >> 56n) & 0xffn),
      forwardCanonicalPower: Number(word1 & 0xffn),
      backwardCanonicalPower: Number((word1 >> 8n) & 0xffn),
      bridgeFound: ((word1 >> 34n) & 0xffn) !== 0n,
      bridgeDepth: Number((word1 >> 35n) & 0x1fn),
      completeSolutionValid: ((word1 >> 40n) & 0xffn) !== 0n,
      inBucketA: ((word1 >> 48n) & 0xffn) !== 0n,
      forwardDiscoveryIndex: Number(words[base + 2]),
      backwardDiscoveryIndex: Number(words[base + 3]),
      originalIndex: Number(words[base + 4]),
    };
  }
  return out;
}

export function radius1OrientationOrderAnalysisWasm(
  state: MegaminxState,
  pieces: readonly number[],
  depth12MaxHalfDepth: number,
  depth12MaxFrontier: number,
  totalMaxHalfDepth: number,
  candidateMaxFrontier: number,
  maxBridgeDepth: number,
  candidateCap: number,
): { stats: Radius1OrientationOrderStats; rows: Radius1OrientationOrderRow[] } {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  exports.radius1_orientation_order_analysis_v1(piecesLen, depth12MaxHalfDepth, depth12MaxFrontier, totalMaxHalfDepth, candidateMaxFrontier, maxBridgeDepth, candidateCap);
  const stats = readRadius1OrientationOrderStats(exports);
  const rows = readRadius1OrientationOrderRows(exports, exports.radius1_oa_row_count());
  return { stats, rows };
}

/**
 * MEGAMINX_SOLVECROSS_CANONICAL_KEY_V2_COST_PROFILE_V1 -- isolated JS
 * binding for wasm-search/src/lib.rs's own canonical_key_v2_cost_profile_v1
 * (see its own dev notes): reuses try_bridge_canonical_counted (previous
 * Sprint, unmodified) over real residual/comparison fixtures, recording
 * ONE (bridgeDepth category, canonical_key_v2 call count) pair per
 * candidate -- category 0 = not found within maxBridgeDepth (exhausted
 * the full sweep), 1/2/3 = the depth at which a match was found. Lets the
 * caller compute what share of TOTAL canonical_key_v2 calls across all
 * analyzed candidates comes from bridgeDepth=3 (found) + not-found
 * candidates specifically, and the P50/P95 call count per category.
 * canonical_key_v2/conjugate_state_v2/compute_edge_state_key_fast5 are
 * all reused unchanged -- pure profiling, no semantics change.
 */
export interface CanonicalKeyV2CostProfileStats {
  analyzed: number;
  totalCandidates: number;
  candidatesTruncated: boolean;
  forwardFinalSize: number;
  backwardFinalSize: number;
}

export interface CanonicalKeyV2CostProfileRow {
  /** 0 = not found within maxBridgeDepth; 1/2/3 = bridge depth at which found. */
  category: 0 | 1 | 2 | 3;
  canonicalKeyCalls: number;
}

function readCanonicalKeyV2CostProfileStats(exports: WasmExports): CanonicalKeyV2CostProfileStats {
  const ptr = exports.canonical_key_v2_cost_profile_stats_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr, 5);
  return {
    analyzed: words[0],
    totalCandidates: words[1],
    candidatesTruncated: words[2] !== 0,
    forwardFinalSize: words[3],
    backwardFinalSize: words[4],
  };
}

function readCanonicalKeyV2CostProfileRows(exports: WasmExports, count: number): CanonicalKeyV2CostProfileRow[] {
  if (count === 0) return [];
  const ptr = exports.canonical_key_v2_cost_profile_rows_ptr();
  const words = new BigUint64Array(exports.memory.buffer, ptr, count);
  const out: CanonicalKeyV2CostProfileRow[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const packed = words[i];
    out[i] = {
      category: Number(packed & 0xffn) as 0 | 1 | 2 | 3,
      canonicalKeyCalls: Number(packed >> 8n),
    };
  }
  return out;
}

export function canonicalKeyV2CostProfileWasm(
  state: MegaminxState,
  pieces: readonly number[],
  depth12MaxHalfDepth: number,
  depth12MaxFrontier: number,
  totalMaxHalfDepth: number,
  candidateMaxFrontier: number,
  maxBridgeDepth: number,
  candidateCap: number,
): { stats: CanonicalKeyV2CostProfileStats; rows: CanonicalKeyV2CostProfileRow[] } {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  exports.canonical_key_v2_cost_profile_v1(piecesLen, depth12MaxHalfDepth, depth12MaxFrontier, totalMaxHalfDepth, candidateMaxFrontier, maxBridgeDepth, candidateCap);
  const stats = readCanonicalKeyV2CostProfileStats(exports);
  const rows = readCanonicalKeyV2CostProfileRows(exports, exports.canonical_key_v2_cost_profile_row_count());
  return { stats, rows };
}

/**
 * MEGAMINX_SOLVECROSS_CONJUGATE_STATE_V2_TARGETED_OPT_V1 -- isolated JS
 * bindings for wasm-search/src/lib.rs's own canonical_key_v2_targeted_opt_verify
 * / bench_canonical_key_v2_targeted (see its own dev notes): V3
 * ("edges-only", skips conjugate_state_v2's own dead corner work) and V4
 * ("direct", no state materialization at all, derived closed-form from
 * conjugate_state_v2's own formula) candidate implementations of
 * canonical_key_v2, verified bit-for-bit against the EXISTING, trusted
 * canonical_key_v2 before any speed claim is trusted. canonical_key_v2
 * itself, try_bridge_canonical, and every production/search function are
 * completely unchanged. Not wired into any production path.
 */
export interface CanonicalKeyV2TargetedVerifyResult {
  edgesOnlyMismatches: number;
  directMismatches: number;
  statesChecked: number;
}

export function canonicalKeyV2TargetedOptVerifyWasm(state: MegaminxState, seed: number, randomCount: number, includeOrbit: boolean): CanonicalKeyV2TargetedVerifyResult {
  const exports = ensureWasm();
  const s = scratch!;
  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  exports.canonical_key_v2_targeted_opt_verify(seed, randomCount, includeOrbit ? 1 : 0);
  const ptr = exports.canonical_key_v2_targeted_opt_verify_result_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr, 3);
  return {
    edgesOnlyMismatches: words[0],
    directMismatches: words[1],
    statesChecked: words[2],
  };
}

/** variant: 0 = V0 (canonical_key_v2, existing/trusted), 3 = V3 (edges-only), 4 = V4 (direct, no materialization). */
export function benchCanonicalKeyV2TargetedWasm(state: MegaminxState, variant: 0 | 3 | 4, repeats: number): bigint {
  const exports = ensureWasm();
  const s = scratch!;
  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);
  return exports.bench_canonical_key_v2_targeted(variant, repeats);
}

/** variant: 0 = V0 (existing conjugate_state_v2), 3 = V3 (edges-only, this Sprint). */
export function benchConjugateStateTargetedWasm(state: MegaminxState, variant: 0 | 3, repeats: number): bigint {
  const exports = ensureWasm();
  const s = scratch!;
  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);
  return exports.bench_conjugate_state_targeted(variant, repeats);
}

/**
 * Gate B: the SAME early-exit loop as radius1BridgeEarlyExitWasm
 * (unmodified), with exactly one substitution -- canonical_key_direct
 * instead of canonical_key_v2 as the bridge-acceptance test. Confirms
 * found/notFound, bridgeDepth, and the winning candidate are IDENTICAL to
 * the existing V0 early-exit on real fixtures, not just that
 * canonical_key_direct matches canonical_key_v2 in isolation (Gate A).
 */
export interface Radius1EarlyExitDirectResult {
  status: 1 | -1 | 0;
  candidatesScanned: number;
  found: boolean;
  bridgeDepth: number;
  solutionLength: number;
  internallyValid: boolean;
  candidatesTruncated: boolean;
  totalCandidates: number;
  forwardFinalSize: number;
  backwardFinalSize: number;
  seq: MegaminxTurn[] | null;
}

export function radius1BridgeEarlyExitDirectWasm(
  state: MegaminxState,
  pieces: readonly number[],
  depth12MaxHalfDepth: number,
  depth12MaxFrontier: number,
  totalMaxHalfDepth: number,
  candidateMaxFrontier: number,
  maxBridgeDepth: number,
): Radius1EarlyExitDirectResult {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  const status = exports.radius1_bridge_early_exit_direct_v1(piecesLen, depth12MaxHalfDepth, depth12MaxFrontier, totalMaxHalfDepth, candidateMaxFrontier, maxBridgeDepth) as 1 | -1 | 0;
  const ptr = exports.radius1_dir_stats_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr, 9);
  const found = words[1] !== 0;

  let seq: MegaminxTurn[] | null = null;
  if (found) {
    const len = exports.radius1_dir_result_len();
    const resultPtr = exports.radius1_dir_result_ptr();
    const bytes = new Uint8Array(exports.memory.buffer, resultPtr, len * 2);
    seq = new Array(len);
    for (let i = 0; i < len; i++) {
      seq[i] = { face: bytes[i * 2] as FaceIndex, sign: bytes[i * 2 + 1] === 0 ? 1 : -1 };
    }
  }

  return {
    status,
    candidatesScanned: words[0],
    found,
    bridgeDepth: words[2],
    solutionLength: words[3],
    internallyValid: words[4] !== 0,
    candidatesTruncated: words[5] !== 0,
    totalCandidates: words[6],
    forwardFinalSize: words[7],
    backwardFinalSize: words[8],
    seq,
  };
}

/**
 * MEGAMINX_SOLVECROSS_RADIUS1_BRIDGE_PIPELINE_COST_PROFILE_V1 -- pure
 * measurement, no optimization. stage 0 = phase1+phase2 only (BFS-tree
 * construction cost); stage 1 = + extract_radius1_candidates (candidate
 * extraction / FastMap lookup cost, isolate via stage1-stage0); stage 2 =
 * full per-candidate loop up to candidateCap, using try_bridge_direct's own
 * canonical_key_direct-based sweep, instrumented with call counters.
 */
export interface Radius1PipelineCostProfileStats {
  stage: number;
  analyzed: number;
  totalCandidates: number;
  candidatesTruncated: boolean;
  forwardFinalSize: number;
  backwardFinalSize: number;
  totalCkdCalls: number;
  totalMoveCalls: number;
  totalFpathLen: number;
}

export interface Radius1PipelineCostProfileRow {
  category: number;
  ckdCalls: number;
  moveCalls: number;
  fpathLen: number;
}

export function radius1BridgePipelineCostProfileWasm(
  state: MegaminxState,
  pieces: readonly number[],
  depth12MaxHalfDepth: number,
  depth12MaxFrontier: number,
  totalMaxHalfDepth: number,
  candidateMaxFrontier: number,
  maxBridgeDepth: number,
  candidateCap: number,
  stage: 0 | 1 | 2,
): { stats: Radius1PipelineCostProfileStats; rows: Radius1PipelineCostProfileRow[] } {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  exports.radius1_bridge_pipeline_cost_profile_v1(piecesLen, depth12MaxHalfDepth, depth12MaxFrontier, totalMaxHalfDepth, candidateMaxFrontier, maxBridgeDepth, candidateCap, stage);

  const statsPtr = exports.radius1_pipe_stats_ptr();
  const words = new Uint32Array(exports.memory.buffer, statsPtr, 9);
  const stats: Radius1PipelineCostProfileStats = {
    stage: words[0],
    analyzed: words[1],
    totalCandidates: words[2],
    candidatesTruncated: words[3] !== 0,
    forwardFinalSize: words[4],
    backwardFinalSize: words[5],
    totalCkdCalls: words[6],
    totalMoveCalls: words[7],
    totalFpathLen: words[8],
  };

  const rowCount = exports.radius1_pipe_row_count();
  const rows: Radius1PipelineCostProfileRow[] = new Array(rowCount);
  if (rowCount > 0) {
    const rowsPtr = exports.radius1_pipe_rows_ptr();
    const packed = new BigUint64Array(exports.memory.buffer, rowsPtr, rowCount);
    for (let i = 0; i < rowCount; i++) {
      const p = packed[i];
      rows[i] = {
        category: Number(p & 0xffn),
        ckdCalls: Number((p >> 8n) & 0xffffffn),
        moveCalls: Number((p >> 32n) & 0xffffffn),
        fpathLen: Number((p >> 56n) & 0xffn),
      };
    }
  }

  return { stats, rows };
}

export function benchApplyMoveTargetedWasm(state: MegaminxState, repeats: number): bigint {
  const exports = ensureWasm();
  const s = scratch!;
  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);
  return exports.bench_apply_move_targeted(repeats);
}

export function benchReconstructGenericTargetedWasm(pathLen: number, repeats: number): bigint {
  const exports = ensureWasm();
  return exports.bench_reconstruct_generic_targeted(pathLen, repeats);
}

export function benchApplySeqTargetedWasm(state: MegaminxState, pathLen: number, repeats: number): bigint {
  const exports = ensureWasm();
  const s = scratch!;
  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);
  return exports.bench_apply_seq_targeted(pathLen, repeats);
}

export function noopFfiBenchWasm(): number {
  const exports = ensureWasm();
  return exports.noop_ffi_bench();
}

/**
 * MEGAMINX_SOLVECROSS_RESIDUAL_BFS_PIPELINE_COST_PROFILE_V1 -- pure
 * measurement, no optimization. rbfsPhase1Wasm seeds the resumable BFS
 * state (phase1 + fresh canonical backward, byte-for-byte the same as
 * production's own phase1/phase2 setup); rbfsRunOneRoundWasm advances
 * exactly one round and returns its stats, so JS can time each round
 * individually via performance.now().
 */
export interface RbfsRoundStats {
  side: 0 | 1;
  inputFrontierSize: number;
  generated: number;
  accepted: number;
  duplicate: number;
  frontierCapHit: boolean;
  meetingFound: boolean;
  roundsUsedAfter: number;
  forwardFinalSize: number;
  backwardFinalSize: number;
  stateKeyFast5Calls: number;
  canonicalKeyV2Calls: number;
}

export function rbfsPhase1Wasm(state: MegaminxState, pieces: readonly number[], depth12MaxHalfDepth: number, depth12MaxFrontier: number): { status: 1 | 0 | -1; seq: MegaminxTurn[] | null } {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  const status = exports.rbfs_phase1(piecesLen, depth12MaxHalfDepth, depth12MaxFrontier) as 1 | 0 | -1;

  let seq: MegaminxTurn[] | null = null;
  if (status === 1) {
    const len = exports.rbfs_result_len();
    const resultPtr = exports.rbfs_result_ptr();
    const bytes = new Uint8Array(exports.memory.buffer, resultPtr, len * 2);
    seq = new Array(len);
    for (let i = 0; i < len; i++) {
      seq[i] = { face: bytes[i * 2] as FaceIndex, sign: bytes[i * 2 + 1] === 0 ? 1 : -1 };
    }
  }

  return { status, seq };
}

export function rbfsRunOneRoundWasm(piecesLen: number, maxFrontierSize: number): { status: 1 | 0 | -1; stats: RbfsRoundStats; seq: MegaminxTurn[] | null } {
  const exports = ensureWasm();
  const status = exports.rbfs_run_one_round(piecesLen, maxFrontierSize) as 1 | 0 | -1;

  const ptr = exports.rbfs_round_stats_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr, 12);
  const stats: RbfsRoundStats = {
    side: words[0] as 0 | 1,
    inputFrontierSize: words[1],
    generated: words[2],
    accepted: words[3],
    duplicate: words[4],
    frontierCapHit: words[5] !== 0,
    meetingFound: words[6] !== 0,
    roundsUsedAfter: words[7],
    forwardFinalSize: words[8],
    backwardFinalSize: words[9],
    stateKeyFast5Calls: words[10],
    canonicalKeyV2Calls: words[11],
  };

  let seq: MegaminxTurn[] | null = null;
  if (status === 1) {
    const len = exports.rbfs_result_len();
    const resultPtr = exports.rbfs_result_ptr();
    const bytes = new Uint8Array(exports.memory.buffer, resultPtr, len * 2);
    seq = new Array(len);
    for (let i = 0; i < len; i++) {
      seq[i] = { face: bytes[i * 2] as FaceIndex, sign: bytes[i * 2 + 1] === 0 ? 1 : -1 };
    }
  }

  return { status, stats, seq };
}

export function benchFastmapInsertTargetedWasm(prepopulate: number, repeats: number): bigint {
  const exports = ensureWasm();
  return exports.bench_fastmap_insert_targeted(prepopulate, repeats);
}

export function benchFastmapLookupOnlyTargetedWasm(prepopulate: number, repeats: number): bigint {
  const exports = ensureWasm();
  return exports.bench_fastmap_lookup_only_targeted(prepopulate, repeats);
}

/**
 * MEGAMINX_SOLVECROSS_BACKWARD_TABLE_PRECOMPUTATION_V1 -- prototype only,
 * not wired into production. precomputedBackwardTableEnsureBuiltWasm
 * triggers (or reuses) the lazy-built, fixture-independent canonical
 * backward table; solveCrossCachedBackwardV1Wasm replaces phase2's
 * dynamic backward reconstruction with a single pass against that table.
 */
export interface PrecomputedBackwardTableStats {
  nodesPerRound: number[];
  totalNodes: number;
  maxRoundReached: number;
  frontierCapHit: boolean;
}

export function precomputedBackwardTableEnsureBuiltWasm(): number {
  const exports = ensureWasm();
  return exports.precomputed_backward_table_ensure_built();
}

export function wasmMemoryBytesWasm(): number {
  const exports = ensureWasm();
  return exports.memory.buffer.byteLength;
}

export function precomputedBackwardTableStatsWasm(): PrecomputedBackwardTableStats {
  const exports = ensureWasm();
  const ptr = exports.precomputed_backward_table_stats_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr, 11);
  return {
    nodesPerRound: Array.from(words.slice(0, 8)),
    totalNodes: words[8],
    maxRoundReached: words[9],
    frontierCapHit: words[10] !== 0,
  };
}

export interface CachedBackwardResult {
  status: number;
  found: boolean;
  solutionLength: number | null;
  phase1ForwardRounds: number;
  phase1BackwardRounds: number;
  phase1Termination: 0 | 1 | 2;
  effectiveMaxRound: number;
  matchRound: number;
  tableAlreadyBuilt: boolean;
  forwardFinalSize: number;
  tableInsufficientDepth: boolean;
  seq: MegaminxTurn[] | null;
}

export function solveCrossCachedBackwardV1Wasm(state: MegaminxState, pieces: readonly number[], depth12MaxHalfDepth: number, depth12MaxFrontier: number, totalMaxHalfDepth: number): CachedBackwardResult {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  const status = exports.solve_cross_cached_backward_v1(piecesLen, depth12MaxHalfDepth, depth12MaxFrontier, totalMaxHalfDepth);
  const ptr = exports.cached_bwd_stats_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr, 10);
  const found = words[0] !== 0;

  let seq: MegaminxTurn[] | null = null;
  if (found) {
    const len = exports.cached_bwd_result_len();
    const resultPtr = exports.cached_bwd_result_ptr();
    const bytes = new Uint8Array(exports.memory.buffer, resultPtr, len * 2);
    seq = new Array(len);
    for (let i = 0; i < len; i++) {
      seq[i] = { face: bytes[i * 2] as FaceIndex, sign: bytes[i * 2 + 1] === 0 ? 1 : -1 };
    }
  }

  return {
    status,
    found,
    solutionLength: found ? words[1] : null,
    phase1ForwardRounds: words[2],
    phase1BackwardRounds: words[3],
    phase1Termination: words[4] as 0 | 1 | 2,
    effectiveMaxRound: words[5],
    matchRound: words[6],
    tableAlreadyBuilt: words[7] !== 0,
    forwardFinalSize: words[8],
    tableInsufficientDepth: words[9] !== 0,
    seq,
  };
}

/**
 * MEGAMINX_SOLVECROSS_RESIDUAL3_MEETING_GAP_ANALYSIS_V1 -- pure
 * measurement, no production change. Scans EVERY forward node from
 * phase1's own captured tree against the full precomputed backward
 * table, counting exact canonical-key hits (see the Rust side's own dev
 * notes for why a single canon-key equality check per forward node IS
 * the complete C5-orbit-vs-orbit intersection test).
 */
export interface Residual3MeetingGapResult {
  status: 1 | 0 | -1;
  forwardFinalSize: number;
  hitCount: number;
  minHitRound: number;
  effectiveMaxRound: number;
  tableInsufficientDepth: boolean;
  phase1ForwardRounds: number;
}

export function residual3MeetingGapAnalysisWasm(state: MegaminxState, pieces: readonly number[], depth12MaxHalfDepth: number, depth12MaxFrontier: number, totalMaxHalfDepth: number): Residual3MeetingGapResult {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  const status = exports.residual3_meeting_gap_analysis_v1(piecesLen, depth12MaxHalfDepth, depth12MaxFrontier, totalMaxHalfDepth) as 1 | 0 | -1;
  const ptr = exports.residual3_meeting_gap_stats_ptr();
  const words = new Uint32Array(exports.memory.buffer, ptr, 6);

  return {
    status,
    forwardFinalSize: words[0],
    hitCount: words[1],
    minHitRound: words[2],
    effectiveMaxRound: words[3],
    tableInsufficientDepth: words[4] !== 0,
    phase1ForwardRounds: words[5],
  };
}

/**
 * MEGAMINX_SOLVECROSS_RESIDUAL3_STATE_INVARIANT_ANALYSIS_V1 -- pure
 * measurement, no production change. Signature = misplaced*72 +
 * external*12 + oriented*2 + orientParity, decoded from the RAW
 * (pre-canonicalization) fast5 key already stored per tree node -- NOT
 * canonical_key_v2 (see this Sprint's own Rust dev notes for why).
 */
export interface SignatureHistogramResult {
  foundInPhase1: boolean;
  frontierCapExceeded: boolean;
  totalStates: number;
  histogram: Uint32Array; // length 432, index = signature (see decodeSignature)
}

export interface DecodedSignature {
  misplaced: number;
  external: number;
  oriented: number;
  orientParity: number;
}
export function decodeSignature(sig: number): DecodedSignature {
  const orientParity = sig % 2;
  const oriented = Math.floor(sig / 2) % 6;
  const external = Math.floor(sig / 12) % 6;
  const misplaced = Math.floor(sig / 72) % 6;
  return { misplaced, external, oriented, orientParity };
}

export function residual3ForwardSignatureHistogramWasm(state: MegaminxState, pieces: readonly number[], depth12MaxHalfDepth: number, depth12MaxFrontier: number): SignatureHistogramResult {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  // Rust returns: 1 = phase1 already found a raw meeting, -1 = phase1's own
  // frontier cap was hit, else = cap.forward.key_to_id.len() (the actual
  // forward state count, NOT a status code).
  const raw = exports.residual3_forward_signature_histogram_v1(piecesLen, depth12MaxHalfDepth, depth12MaxFrontier);
  const foundInPhase1 = raw === 1;
  const frontierCapExceeded = raw === -1;
  const bucketCount = exports.residual3_sig_bucket_count();
  const histPtr = exports.residual3_sig_hist_ptr();
  const histogram = new Uint32Array(exports.memory.buffer, histPtr, bucketCount).slice();

  return { foundInPhase1, frontierCapExceeded, totalStates: foundInPhase1 || frontierCapExceeded ? 0 : histogram.reduce((a, b) => a + b, 0), histogram };
}

export function residual3BackwardSignatureHistogramWasm(): SignatureHistogramResult {
  const exports = ensureWasm();
  exports.residual3_backward_signature_histogram_v1(); // returns table.real_key.len(), not a status code -- this call never fails
  const bucketCount = exports.residual3_sig_bucket_count();
  const histPtr = exports.residual3_sig_hist_ptr();
  const histogram = new Uint32Array(exports.memory.buffer, histPtr, bucketCount).slice();

  return { foundInPhase1: false, frontierCapExceeded: false, totalStates: histogram.reduce((a, b) => a + b, 0), histogram };
}

/**
 * MEGAMINX_SOLVECROSS_RESIDUAL3_CLUSTER_ENTRY_ANALYSIS_V1 -- pure
 * measurement, no production change. For each of the caller-supplied
 * target signatures (up to 32), finds the shallowest depth at which
 * phase1's own forward tree first reaches it, one representative full
 * path to it, and a histogram of last-moves across every forward node
 * tied at that shallowest depth.
 */
export interface ClusterEntryRow {
  signature: number;
  bestDepth: number; // -1 = never reached within this fixture's forward tree
  path: MegaminxTurn[]; // empty if never reached
  moveHistogram: { face: FaceIndex; sign: 1 | -1; count: number }[]; // only nonzero entries, only meaningful if bestDepth >= 0
}

export function residual3ClusterEntryAnalysisWasm(state: MegaminxState, pieces: readonly number[], depth12MaxHalfDepth: number, depth12MaxFrontier: number, targetSignatures: readonly number[]): { totalForwardStates: number; rows: ClusterEntryRow[] } {
  const exports = ensureWasm();
  const s = scratch!;

  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  new Int8Array(exports.memory.buffer, s.pieces, piecesLen).set(pieces);

  const sigCount = Math.min(32, targetSignatures.length);
  const sigsPtr = exports.cluster_target_sigs_scratch_ptr();
  new Uint16Array(exports.memory.buffer, sigsPtr, sigCount).set(targetSignatures.slice(0, sigCount));

  exports.residual3_cluster_entry_analysis_v1(piecesLen, depth12MaxHalfDepth, depth12MaxFrontier, sigCount);

  const totalForwardStates = exports.residual3_cluster_total_forward();
  const bestDepthArr = new Int16Array(exports.memory.buffer, exports.residual3_cluster_best_depth_ptr(), 32);
  const pathLenArr = new Uint8Array(exports.memory.buffer, exports.residual3_cluster_best_path_len_ptr(), 32);
  const pathArr = new Uint8Array(exports.memory.buffer, exports.residual3_cluster_best_path_ptr(), 32 * 24);
  const moveHistArr = new Uint32Array(exports.memory.buffer, exports.residual3_cluster_move_hist_ptr(), 32 * 24);

  const rows: ClusterEntryRow[] = [];
  for (let slot = 0; slot < sigCount; slot++) {
    const bestDepth = bestDepthArr[slot];
    const path: MegaminxTurn[] = [];
    const plen = pathLenArr[slot];
    for (let i = 0; i < plen; i++) {
      const face = pathArr[slot * 24 + i * 2] as FaceIndex;
      const sign: 1 | -1 = pathArr[slot * 24 + i * 2 + 1] === 0 ? 1 : -1;
      path.push({ face, sign });
    }
    const moveHistogram: { face: FaceIndex; sign: 1 | -1; count: number }[] = [];
    for (let m = 0; m < 24; m++) {
      const count = moveHistArr[slot * 24 + m];
      if (count === 0) continue;
      const face = Math.floor(m / 2) as FaceIndex;
      const sign: 1 | -1 = m % 2 === 0 ? 1 : -1;
      moveHistogram.push({ face, sign, count });
    }
    rows.push({ signature: targetSignatures[slot], bestDepth, path, moveHistogram });
  }

  return { totalForwardStates, rows };
}
