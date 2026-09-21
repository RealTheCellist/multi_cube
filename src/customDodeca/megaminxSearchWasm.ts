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
  build_reachable(statePtr: number, kind: number, piecesPtr: number, piecesLen: number, maxDepth: number, maxReachable: number): void;
  query(keyLo: number, keyHi: number): number;
  result_ptr(): number;
}

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

  const statePtr = exports.alloc(100);
  // Re-read exports.memory.buffer fresh after each alloc: a call that
  // grows Wasm memory detaches any previously-created view over it.
  const stateView = new Int8Array(exports.memory.buffer, statePtr, 100);
  stateView.set(state.cornerPerm, 0);
  stateView.set(state.cornerOrient, 20);
  stateView.set(state.edgePerm, 40);
  stateView.set(state.edgeOrient, 70);

  const piecesLen = pieces.length;
  const piecesPtr = exports.alloc(Math.max(1, piecesLen));
  new Int8Array(exports.memory.buffer, piecesPtr, piecesLen).set(pieces);

  exports.build_reachable(statePtr, kind, piecesPtr, piecesLen, maxDepth, maxReachable);
  exports.dealloc(statePtr, 100);
  exports.dealloc(piecesPtr, Math.max(1, piecesLen));

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
