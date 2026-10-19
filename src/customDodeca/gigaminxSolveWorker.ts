// Web Worker entry point for the full Gigaminx solve (created by
// gigaminxSolveWorkerClient.ts via `new Worker(new URL("./gigaminxSolveWorker.ts",
// import.meta.url), { type: "module" })`, same Vite pattern as
// solver/n6/royalSolveWorker.ts). solveFullGigaminx is synchronous and takes
// about a second on a warm engine (its commutator libraries make the module
// heavy to load too), so running it here keeps the page responsive while the
// plan is prepared right after a scramble.
import { solveFullGigaminx } from "./gigaminxSolver";
import { applyGigaminxScramble, randomGigaminxScramble, solvedGigaminxState, type GigaminxState, type GigaminxTurn } from "./gigaminxState";

export interface GigaminxSolveWorkerRequest {
  id: number;
  state: GigaminxState;
}

export interface GigaminxSolveWorkerResponse {
  id: number;
  moves?: GigaminxTurn[];
  error?: string;
}

self.onmessage = (ev: MessageEvent<GigaminxSolveWorkerRequest>) => {
  const { id, state } = ev.data;
  try {
    const response: GigaminxSolveWorkerResponse = { id, moves: solveFullGigaminx(state).moves };
    self.postMessage(response);
  } catch (err) {
    const response: GigaminxSolveWorkerResponse = { id, error: err instanceof Error ? err.message : String(err) };
    self.postMessage(response);
  }
};

// Warm the JIT (and the solver's lazily built tables) on a lightly scrambled puzzle as soon as the module has
// loaded, so the first real solve doesn't pay for it. A fixed-seed scramble keeps this deterministic.
setTimeout(() => {
  try {
    let seed = 12345;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    solveFullGigaminx(applyGigaminxScramble(solvedGigaminxState(), randomGigaminxScramble(12, rng)));
  } catch {
    // purely an optimisation
  }
}, 0);
