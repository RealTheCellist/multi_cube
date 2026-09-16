// Main-thread owner of the edge-PDB Web Worker. Exists only because the
// PDB-guided IDA* search (runPdbGuidedEdgeSearch in masterTetraminxSolver.ts)
// is too slow to run on the page's main thread at any useful node budget --
// see that file's edge-PDB section comment for the measured numbers. The
// actual search code lives in masterTetraminxSolver.ts and is reused
// as-is inside edgePdbWorker.ts; this file is just the postMessage
// plumbing plus graceful degradation when a Worker isn't available.
import type { TetraMove } from "./masterTetraminxSolver";

interface EdgePdbWorkerRequest {
  id: number;
  layerCount: number;
  edgePattern: number[];
  maxThreshold: number;
  maxNodes: number;
}

interface EdgePdbWorkerResponse {
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
    const w = new Worker(new URL("./edgePdbWorker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev: MessageEvent<EdgePdbWorkerResponse>) => {
      const resolve = pending.get(ev.data.id);
      if (!resolve) return;
      pending.delete(ev.data.id);
      resolve(ev.data.moves);
    };
    w.onerror = (ev: ErrorEvent) => {
      console.error("edge PDB worker error (non-fatal, affected solves just miss this extra attempt):", ev.message);
      for (const resolve of pending.values()) resolve(null);
      pending.clear();
    };
    worker = w;
  } catch (err) {
    console.error("edge PDB worker failed to start (non-fatal, solves just miss this extra attempt):", err);
    return null;
  }
  return worker;
}

/** Starts the worker (if not already running) so it can begin fetching the
 * PDB asset immediately, ahead of any actual solve needing it. Safe to
 * call multiple times, or never -- solveEdgesViaPdbWorker creates the
 * worker lazily on its own either way; this is purely a head start. */
export function preloadEdgePdbWorker(): void {
  getWorker();
}

/**
 * Sends one edge-cleanup request to the PDB worker. Resolves with the raw
 * primitive TetraMove sequence that solves the edges, or null if: the
 * worker/Worker API is unavailable, the PDB hasn't finished loading inside
 * the worker yet, no solution was found within the given budget, or the
 * worker itself errored. Never throws or rejects -- callers can always
 * just fall back to their pre-existing solved:false behavior.
 */
export function solveEdgesViaPdbWorker(layerCount: number, edgePattern: number[], maxThreshold = 9, maxNodes = 8_000_000): Promise<TetraMove[] | null> {
  const w = getWorker();
  if (!w) return Promise.resolve(null);
  const id = nextRequestId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    const request: EdgePdbWorkerRequest = { id, layerCount, edgePattern, maxThreshold, maxNodes };
    w.postMessage(request);
  });
}
