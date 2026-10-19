// Main-thread side of royalSolveWorker.ts. One worker per solve, terminated
// as soon as it answers: a wasm memory can only grow, never shrink, so
// reusing one long-lived worker would keep the hardest scrambles' hundreds
// of MB resident for the rest of the session; a fresh worker per solve
// (startup is tens of ms, and the wasm files come from the HTTP cache after
// the first load) hands all of it back.
//
// Degrades gracefully: where Workers aren't available (Node/Vitest, very old
// browsers), or the worker errors/crashes, it falls back to running the same
// solveRoyalPyraminx on the calling thread -- slower to respond (it blocks
// the page) but with an identical result.
import { solveRoyalPyraminx, type RoyalSolveTrace } from "./royalPyraminxSolver";
import type { RoyalPyraminxState } from "./royalPyraminxState";
import type { RoyalSolveWorkerRequest, RoyalSolveWorkerResponse } from "./royalSolveWorker";

let nextRequestId = 1;

const SLOW_SOLVE_MS = 3000;
/** Logs where the time went for a solve slower than SLOW_SOLVE_MS, so a rare outlier explains itself the next time it happens. */
function reportIfSlow(trace: RoyalSolveTrace | undefined, wallMs: number, via: "worker" | "main thread"): void {
  if (wallMs <= SLOW_SOLVE_MS && !(trace && trace.totalMs > SLOW_SOLVE_MS)) return;
  console.warn(`[royal] slow N=6 solve (${via}): ${Math.round(wallMs)}ms wall`, trace ?? "(no trace)");
}

async function solveOnMainThread(state: RoyalPyraminxState, axialMaxDepthEachSide: number, axialMaxStates: number): Promise<string[]> {
  const startedAt = performance.now();
  let trace: RoyalSolveTrace | undefined;
  const moves = await solveRoyalPyraminx(state, axialMaxDepthEachSide, axialMaxStates, (t) => (trace = t));
  reportIfSlow(trace, performance.now() - startedAt, "main thread");
  return moves;
}

export function solveRoyalPyraminxOffThread(state: RoyalPyraminxState, axialMaxDepthEachSide: number, axialMaxStates: number): Promise<string[]> {
  if (typeof Worker === "undefined") return solveOnMainThread(state, axialMaxDepthEachSide, axialMaxStates);

  return new Promise<string[]>((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./royalSolveWorker.ts", import.meta.url), { type: "module" });
    } catch (err) {
      console.error("royal solve worker failed to start (non-fatal, solving on the main thread):", err);
      resolve(solveRoyalPyraminx(state, axialMaxDepthEachSide, axialMaxStates));
      return;
    }

    const id = nextRequestId++;
    const startedAt = performance.now();
    let settled = false;
    const finish = (run: () => Promise<string[]> | string[]) => {
      if (settled) return;
      settled = true;
      worker.terminate();
      resolve(Promise.resolve(run()));
    };

    worker.onmessage = (ev: MessageEvent<RoyalSolveWorkerResponse>) => {
      if (ev.data.id !== id) return;
      if (ev.data.moves) {
        const moves = ev.data.moves;
        reportIfSlow(ev.data.trace, performance.now() - startedAt, "worker");
        finish(() => moves);
      } else {
        console.error("royal solve worker reported an error (non-fatal, solving on the main thread):", ev.data.error);
        finish(() => solveRoyalPyraminx(state, axialMaxDepthEachSide, axialMaxStates));
      }
    };
    worker.onerror = (ev: ErrorEvent) => {
      console.error("royal solve worker crashed (non-fatal, solving on the main thread):", ev.message);
      finish(() => solveRoyalPyraminx(state, axialMaxDepthEachSide, axialMaxStates));
    };

    const request: RoyalSolveWorkerRequest = { id, state, axialMaxDepthEachSide, axialMaxStates };
    worker.postMessage(request);
  });
}
