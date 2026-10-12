import { MOVE_TABLE, type KilominxState, type KilominxTurn } from "./kilominxState";
import type { FaceIndex } from "./dodecaMath";
// Reuses the SAME compiled wasm-search/megaminx_search.wasm binary as
// megaminxSearchWasm.ts/masterKilominxSearchWasm.ts -- the Rust search
// engine's own algorithms operate purely on abstract perm/orient arrays and
// don't care what puzzle they came from (confirmed when Master Kilominx
// reused it with a completely different move table). Kilominx has only ONE
// piece kind (20 corners, mod-3 orientation, no edges at all), so this
// module always uses kind=0 (corner) and feeds the Wasm "edge" slot (kind=1,
// mod-2 math -- see lib.rs's own apply_move) a pure identity/no-op move
// table it never actually exercises, rather than trying to repurpose it for
// Kilominx's own mod-3 data (which the Rust side's `& 1` edge-orientation
// math would silently corrupt).
import kilominxWasmUrl from "./wasm-search/megaminx_search.wasm?url";

interface WasmExports {
  memory: WebAssembly.Memory;
  alloc(len: number): number;
  dealloc(ptr: number, len: number): void;
  init_move_table(ptr: number): void;
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
}

interface ScratchPointers {
  state: number;
  pieces: number;
  fixedCorners: number;
  fixedEdges: number;
  targetPositions: number;
}
let scratch: ScratchPointers | null = null;

function nodeWasmPath(): string {
  const { dirname, join } = require("node:path");
  const { fileURLToPath } = require("node:url");
  return join(dirname(fileURLToPath(import.meta.url)), "wasm-search", "megaminx_search.wasm");
}

let wasm: WasmExports | null = null;
let cachedWasmBytes: Uint8Array | null = null;

/** Same async pre-fetch pattern as megaminxSearchWasm.ts's own warmupMegaminxSearchWasm -- see its own docstring. */
export async function warmupKilominxSearchWasm(): Promise<void> {
  if (cachedWasmBytes || typeof window === "undefined") return;
  const res = await fetch(kilominxWasmUrl);
  if (!res.ok) throw new Error(`kilominx wasm fetch failed: HTTP ${res.status}`);
  cachedWasmBytes = new Uint8Array(await res.arrayBuffer());
}

/** [face 0..12][sign 0=+1,1=-1] x (cornerPerm[20] ++ cornerOrientDelta[20] ++ edgePerm[30] ++ edgeOrientDelta[30]) -- same layout megaminxSearchWasm.ts's own flattenMoveTable uses. Corner slot carries Kilominx's own real MOVE_TABLE (mod 3); edge slot is a fixed identity no-op, never read by any kind=0 call this module makes. */
function flattenMoveTable(): Int8Array {
  const out = new Int8Array(2400);
  let offset = 0;
  const identity30 = Array.from({ length: 30 }, (_, i) => i);
  const zero30 = new Array(30).fill(0);
  for (let face = 0; face < 12; face++) {
    for (let signIdx = 0; signIdx < 2; signIdx++) {
      const table = MOVE_TABLE[face][signIdx];
      out.set(table.perm, offset);
      offset += 20;
      out.set(table.orientDelta, offset);
      offset += 20;
      out.set(identity30, offset);
      offset += 30;
      out.set(zero30, offset);
      offset += 30;
    }
  }
  return out;
}

function ensureWasm(): WasmExports {
  if (wasm) return wasm;
  const bytes = cachedWasmBytes ?? (typeof window === "undefined" ? require("node:fs").readFileSync(nodeWasmPath()) : (() => { throw new Error("kilominx wasm not warmed -- call warmupKilominxSearchWasm() and await it before solving"); })());
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

function writeStateScratch(exports: WasmExports, s: ScratchPointers, state: KilominxState): void {
  const stateView = new Int8Array(exports.memory.buffer, s.state, 100);
  stateView.set(state.perm, 0);
  stateView.set(state.orient, 20);
  // Edge half of the buffer (kind=1) is never read by any kind=0 call this
  // module makes, but kept at a harmless identity in case a future caller
  // mixes kinds -- cheap enough to write every call.
  for (let i = 0; i < 30; i++) stateView[40 + i] = i;
  stateView.fill(0, 70, 100);
}

function readState(bytes: Uint8Array, offset: number): KilominxState {
  return {
    perm: Array.from(bytes.subarray(offset, offset + 20)),
    orient: Array.from(bytes.subarray(offset + 20, offset + 40)),
  };
}

export interface UploadableCommutator {
  seq: readonly KilominxTurn[];
  support: readonly number[];
  movingSupport: readonly number[];
  destination: readonly number[];
}

/** Always kind=0 (corner) -- see this module's own top comment. Returns an opaque library handle, same contract as megaminxSearchWasm.ts's own uploadLibraryWasm. */
export function uploadLibraryWasm(entries: readonly UploadableCommutator[]): number {
  const exports = ensureWasm();
  const destLen = 20;

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
  const handle = exports.upload_library(0, entries.length, buf.length, ptr);
  exports.dealloc(ptr, buf.length);
  return handle;
}

export interface WasmMatchResult {
  state: KilominxState;
  seq: KilominxTurn[];
}

/** Wasm-backed drop-in for kilominxSolver.ts's own findSafeApplication, always kind=0 (corner), fixedEdges always empty. */
export function findSafeApplicationWasm(
  libHandle: number,
  current: KilominxState,
  target: number,
  displaced: number,
  fixedCorners: readonly number[],
  targetPositions: readonly number[],
  wrongBefore: number,
  requireImprovement: boolean,
): WasmMatchResult | null {
  const exports = ensureWasm();
  const s = scratch!;
  writeStateScratch(exports, s, current);

  const fcLen = fixedCorners.length;
  new Uint8Array(exports.memory.buffer, s.fixedCorners, fcLen).set(fixedCorners);

  const tpLen = targetPositions.length;
  new Uint8Array(exports.memory.buffer, s.targetPositions, tpLen).set(targetPositions);

  const len = exports.find_safe_application(libHandle, 0, target, displaced, fcLen, 0, tpLen, wrongBefore, requireImprovement ? 1 : 0);
  if (len < 0) return null;

  const ptr = exports.fsa_result_ptr();
  const bytes = new Uint8Array(exports.memory.buffer, ptr, 100 + len * 2);
  const state = readState(bytes, 0);
  const seq: KilominxTurn[] = new Array(len);
  for (let i = 0; i < len; i++) seq[i] = { face: bytes[100 + i * 2] as FaceIndex, sign: bytes[100 + i * 2 + 1] === 0 ? 1 : -1 };
  return { state, seq };
}

/** Wasm-backed drop-in for kilominxSolver.ts's own findFinishingApplication (also reused for the compound/subset fallback -- `wrongPositions` can be any subset, not just the full wrong set), always kind=0, fixedEdges always empty. */
export function findFinishingApplicationWasm(libHandle: number, current: KilominxState, wrongPositions: readonly number[], fixedCorners: readonly number[], maxDepth: number, maxReachable: number): WasmMatchResult | null {
  const exports = ensureWasm();
  const s = scratch!;
  writeStateScratch(exports, s, current);

  const wpLen = wrongPositions.length;
  new Uint8Array(exports.memory.buffer, s.pieces, wpLen).set(wrongPositions);

  const fcLen = fixedCorners.length;
  new Uint8Array(exports.memory.buffer, s.fixedCorners, fcLen).set(fixedCorners);

  const len = exports.find_finishing_application(libHandle, 0, wpLen, fcLen, 0, maxDepth, maxReachable);
  if (len < 0) return null;

  const ptr = exports.fsa_result_ptr();
  const bytes = new Uint8Array(exports.memory.buffer, ptr, 100 + len * 2);
  const state = readState(bytes, 0);
  const seq: KilominxTurn[] = new Array(len);
  for (let i = 0; i < len; i++) seq[i] = { face: bytes[100 + i * 2] as FaceIndex, sign: bytes[100 + i * 2 + 1] === 0 ? 1 : -1 };
  return { state, seq };
}
