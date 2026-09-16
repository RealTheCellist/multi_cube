// Main-thread owner of the axial-retry Web Worker. Exists only because
// meetInMiddleSolve's axial-only search, given the bigger budget that
// actually solves the 3 scrambles it fails on within the normal 6,000,000-
// state budget (confirmed offline: ~11,590,974 states, depth<=6 each side,
// ~130-150s), is too slow to run on the page's main thread -- see
// masterTetraminxSolver.ts's computeMasterTetraSolveProgress fallback
// comment for the measured numbers. The actual search code lives in
// masterTetraminxSolver.ts (meetInMiddleSolve) and is reused as-is inside
// axialWorker.ts; this file is just the postMessage plumbing plus graceful
// degradation when a Worker isn't available -- same shape as
// edgePdbClient.ts for the edge PDB worker.
import type { TetraMove } from "./masterTetraminxSolver";

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

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, (moves: TetraMove[] | null) => void>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (typeof Worker === "undefined") return null; // not in a browser (SSR, Node scripts/tests)
  try {
    const w = new Worker(new URL("./axialWorker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev: MessageEvent<AxialWorkerResponse>) => {
      const resolve = pending.get(ev.data.id);
      if (!resolve) return;
      pending.delete(ev.data.id);
      resolve(ev.data.moves);
    };
    w.onerror = (ev: ErrorEvent) => {
      console.error("axial worker error (non-fatal, affected solves just miss this extra attempt):", ev.message);
      for (const resolve of pending.values()) resolve(null);
      pending.clear();
    };
    worker = w;
  } catch (err) {
    console.error("axial worker failed to start (non-fatal, solves just miss this extra attempt):", err);
    return null;
  }
  return worker;
}

/** Starts the worker (if not already running) so it's warm ahead of any
 * actual solve needing it. Safe to call multiple times, or never --
 * solveAxialViaWorker creates the worker lazily on its own either way;
 * this is purely a head start (there's no asset to fetch here, unlike
 * edgePdbClient's preload, so the benefit is just avoiding worker startup
 * latency on the first request). */
export function preloadAxialWorker(): void {
  getWorker();
}

/**
 * Sends one axial-only retry request to the worker. Resolves with the raw
 * primitive TetraMove sequence that solves axial, or null if: the
 * worker/Worker API is unavailable, no solution was found within the given
 * budget, or the worker itself errored. Never throws or rejects -- callers
 * can always just fall back to their pre-existing greedy-move result.
 */
export function solveAxialViaWorker(layerCount: number, axialPattern: number[], maxDepthEachSide: number, maxStates: number): Promise<TetraMove[] | null> {
  const w = getWorker();
  if (!w) return Promise.resolve(null);
  const id = nextRequestId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    const request: AxialWorkerRequest = { id, layerCount, axialPattern, maxDepthEachSide, maxStates };
    w.postMessage(request);
  });
}
