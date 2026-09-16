// Web Worker entry point (created by axialWorkerClient.ts via
// `new Worker(new URL("./axialWorker.ts", import.meta.url), { type: "module" })`,
// same Vite bundling pattern as edgePdbWorker.ts). Runs the axial-only
// search with a MUCH bigger budget than the main thread ever uses, off the
// main thread -- see masterTetraminxSolver.ts's computeMasterTetraSolveProgress
// fallback comment for why: raising that budget in place was measured to
// take ~130-150s, which is fine for a background worker but would freeze a
// synchronous hint press.
//
// Tries a Rust/wasm port of the same search first (axialSolver.wasm, built
// from the research scratchpad's axial-wasm/ crate -- no external crates,
// crates.io is unreachable from this sandbox, so it's hand-rolled std-only
// Rust). Measured (this feature's own investigation): the JS version
// (meetInMiddleSolveAxialFast, a typed-hash-table specialization of
// meetInMiddleSolve) only got real scrambles from ~150s down to ~90s in an
// actual browser Worker, well short of its ~19s offline Node number --
// frontier-buffer pooling barely moved that further. The wasm port's
// STEADY-STATE calls (i.e. every call after the first, which pays a
// one-time warm-up/memory-growth cost -- offline: ~18s cold, ~6.5s warm)
// came in far faster than either JS version, so it's tried first here; the
// JS version stays as a fallback for whatever fraction of environments
// don't support WebAssembly or fail to load it.
import { meetInMiddleSolveAxialFast, precompute, resolveAxialWasmUrl, type TetraMove } from "./masterTetraminxSolver";

interface AxialWorkerRequest {
  id: number;
  layerCount: number;
  axialPattern: number[];
  maxDepthEachSide: number;
  maxStates: number;
}

interface AxialWorkerResponse {
  id: number;
  moves: TetraMove[] | null;
  error?: string;
}

const AXIAL_N = 40; // axial slot count, N=5-specific (matches the wasm crate's own constant)
const AXIAL_NUM_MOVES = 32; // raw primitive move count, N=5-specific

interface WasmExports {
  start_ptr(): number;
  perms_ptr(): number;
  out_ptr(): number;
  solve(maxDepthEachSide: number, maxStates: number): number;
  memory: WebAssembly.Memory;
}

let wasmExportsPromise: Promise<WasmExports | null> | null = null;

/** Fetches and instantiates axialSolver.wasm once, kicked off immediately
 * (module load time) so it's likely ready before the first request needs
 * it -- same head-start spirit as preloadEdgePdbWorker/preloadOuterPdb.
 * Never throws; a failed load just means solveAxialFastest below falls
 * back to the JS version. */
function loadWasm(): Promise<WasmExports | null> {
  if (!wasmExportsPromise) {
    wasmExportsPromise = fetch(resolveAxialWasmUrl())
      .then((res) => {
        if (!res.ok) throw new Error(`axial wasm fetch failed: HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => WebAssembly.instantiate(buf, {}))
      .then((result) => result.instance.exports as unknown as WasmExports)
      .catch((err) => {
        console.error("axial wasm failed to load (non-fatal, falling back to the JS search):", err);
        return null;
      });
  }
  return wasmExportsPromise;
}
loadWasm();

function moveKeyOf(m: { vertexIndex: number; depth: number; sign: number }): string {
  return `${m.vertexIndex}_${m.depth}_${m.sign}`;
}

interface AxialWasmTools {
  axialSlots: number[];
  axialIndex: Map<number, number>;
  localPermByMove: number[][]; // AXIAL_NUM_MOVES entries, each AXIAL_N long
}

const axialWasmToolsCache = new Map<number, AxialWasmTools>();

function buildAxialWasmTools(pre: ReturnType<typeof precompute>): AxialWasmTools {
  const cached = axialWasmToolsCache.get(pre.ns);
  if (cached) return cached;
  const axialSlots: number[] = [];
  for (let i = 0; i < pre.pieceTypes.length; i++) if (pre.pieceTypes[i] === "axial") axialSlots.push(i);
  const axialIndex = new Map(axialSlots.map((slot, i) => [slot, i]));
  const localPermByMove = pre.allMoves.map((m) => {
    const fullPerm = pre.permByMove.get(moveKeyOf(m))!;
    return axialSlots.map((slot) => axialIndex.get(fullPerm[slot])!);
  });
  const tools: AxialWasmTools = { axialSlots, axialIndex, localPermByMove };
  axialWasmToolsCache.set(pre.ns, tools);
  return tools;
}

/** Runs the search via wasm if it's loaded (writing the start state +
 * generator table into wasm linear memory, calling solve(), reading the
 * result back out), or returns null if wasm isn't ready/available/failed
 * -- caller falls back to meetInMiddleSolveAxialFast in that case. */
function solveAxialViaWasm(wasm: WasmExports, pre: ReturnType<typeof precompute>, axialPattern: readonly number[], maxDepthEachSide: number, maxStates: number): TetraMove[] | null {
  const tools = buildAxialWasmTools(pre);
  const startView = new Uint8Array(wasm.memory.buffer, wasm.start_ptr(), AXIAL_N);
  for (let i = 0; i < AXIAL_N; i++) startView[i] = tools.axialIndex.get(axialPattern[tools.axialSlots[i]])!;
  const permsView = new Uint8Array(wasm.memory.buffer, wasm.perms_ptr(), AXIAL_NUM_MOVES * AXIAL_N);
  for (let mi = 0; mi < AXIAL_NUM_MOVES; mi++) {
    for (let i = 0; i < AXIAL_N; i++) permsView[mi * AXIAL_N + i] = tools.localPermByMove[mi][i];
  }

  const count = wasm.solve(maxDepthEachSide, maxStates);
  if (count < 0) return null;
  // wasm memory can be resized by solve() (Rust's allocator growing the
  // heap for its hash tables), which can detach any previously-created
  // views -- re-read out_ptr() and re-wrap AFTER solve() returns, not
  // before, or this can read garbage/throw on a detached ArrayBuffer.
  const outView = new Int32Array(wasm.memory.buffer, wasm.out_ptr(), count);
  const moves: TetraMove[] = [];
  for (let i = 0; i < count; i++) {
    const raw = outView[i];
    const gm = pre.allMoves[raw < AXIAL_NUM_MOVES ? raw : raw - AXIAL_NUM_MOVES];
    moves.push(raw < AXIAL_NUM_MOVES ? gm : { vertexIndex: gm.vertexIndex, depth: gm.depth, sign: (-gm.sign) as 1 | -1 });
  }
  return moves;
}

self.onmessage = async (ev: MessageEvent<AxialWorkerRequest>) => {
  const { id, layerCount, axialPattern, maxDepthEachSide, maxStates } = ev.data;
  try {
    const pre = precompute(layerCount);
    let moves: TetraMove[] | null = null;
    // wasm's exported constants (AXIAL_N/AXIAL_NUM_MOVES) are N=5-specific
    // by construction, so only try it for that layerCount -- other layer
    // counts fall straight through to the general JS search.
    if (layerCount === 5) {
      const wasm = await loadWasm();
      if (wasm) moves = solveAxialViaWasm(wasm, pre, axialPattern, maxDepthEachSide, maxStates);
    }
    if (moves === null) moves = meetInMiddleSolveAxialFast(pre, axialPattern, maxDepthEachSide, maxStates);
    const response: AxialWorkerResponse = { id, moves };
    self.postMessage(response);
  } catch (err) {
    const response: AxialWorkerResponse = { id, moves: null, error: String(err) };
    self.postMessage(response);
  }
};
