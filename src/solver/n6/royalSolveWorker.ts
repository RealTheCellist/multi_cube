// Web Worker entry point for the full N=6 solve (created by
// royalSolveWorkerClient.ts via `new Worker(new URL("./royalSolveWorker.ts",
// import.meta.url), { type: "module" })`, same Vite pattern as
// customTetra/axialWorker.ts). Runs solveRoyalPyraminx -- the wasm axial
// search plus the commutator fallback, including the orbit2+5 wasm search
// that can take a second or more and, on the hardest scrambles, hundreds of
// MB of wasm memory -- off the page's main thread, so the UI never freezes
// while it runs, and the memory goes away with the worker (the client
// terminates it after each solve).
import { solveRoyalPyraminx, type RoyalSolveTrace } from "./royalPyraminxSolver";
import type { RoyalPyraminxState } from "./royalPyraminxState";

export interface RoyalSolveWorkerRequest {
  id: number;
  state: RoyalPyraminxState;
  axialMaxDepthEachSide: number;
  axialMaxStates: number;
}

export interface RoyalSolveWorkerResponse {
  id: number;
  moves?: string[];
  trace?: RoyalSolveTrace;
  error?: string;
}

self.onmessage = async (ev: MessageEvent<RoyalSolveWorkerRequest>) => {
  const { id, state, axialMaxDepthEachSide, axialMaxStates } = ev.data;
  try {
    let trace: RoyalSolveTrace | undefined;
    const moves = await solveRoyalPyraminx(state, axialMaxDepthEachSide, axialMaxStates, (t) => (trace = t));
    const response: RoyalSolveWorkerResponse = { id, moves, trace };
    self.postMessage(response);
  } catch (err) {
    const response: RoyalSolveWorkerResponse = { id, error: err instanceof Error ? err.message : String(err) };
    self.postMessage(response);
  }
};
