// Web Worker entry point (created by axialWorkerClient.ts via
// `new Worker(new URL("./axialWorker.ts", import.meta.url), { type: "module" })`,
// same Vite bundling pattern as edgePdbWorker.ts). Runs meetInMiddleSolve's
// axial-only search with a MUCH bigger budget than the main thread ever
// uses, off the main thread -- see masterTetraminxSolver.ts's
// computeMasterTetraSolveProgress fallback comment for why: raising that
// budget in place was measured to take ~130-150s, which is fine for a
// background worker but would freeze a synchronous hint press.
//
// Not statically imported by anything else in the app (only referenced via
// the `new URL(...)` string above) -- same caveat as edgePdbWorker.ts about
// running under DedicatedWorkerGlobalScope, not DOM.
import { meetInMiddleSolve, precompute, type TetraMove } from "./masterTetraminxSolver";
import type { PieceType } from "./tetraState";

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

self.onmessage = (ev: MessageEvent<AxialWorkerRequest>) => {
  const { id, layerCount, axialPattern, maxDepthEachSide, maxStates } = ev.data;
  try {
    const pre = precompute(layerCount);
    const moves = meetInMiddleSolve(pre, axialPattern, new Set<PieceType>(["axial"]), maxDepthEachSide, maxStates);
    const response: AxialWorkerResponse = { id, moves };
    self.postMessage(response);
  } catch (err) {
    const response: AxialWorkerResponse = { id, moves: null, error: String(err) };
    self.postMessage(response);
  }
};
