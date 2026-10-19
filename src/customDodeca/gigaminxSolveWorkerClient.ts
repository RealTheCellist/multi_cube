// Main-thread side of gigaminxSolveWorker.ts. One long-lived worker (unlike
// solver/n6/royalSolveWorkerClient.ts's per-solve worker, there is no wasm
// memory to hand back here, and keeping the worker alive keeps its JIT warm
// and the heavy solver module loaded). Degrades gracefully: where Workers
// aren't available (Node/Vitest, old browsers) or the worker errors, the same
// solveFullGigaminx runs on the calling thread instead -- slower to respond
// (it blocks the page) but with an identical result.
import type { GigaminxState, GigaminxTurn } from "./gigaminxState";
import type { GigaminxSolveWorkerRequest, GigaminxSolveWorkerResponse } from "./gigaminxSolveWorker";

let worker: Worker | null = null;
let workerBroken = false;
let nextRequestId = 1;
const pending = new Map<number, { resolve: (moves: GigaminxTurn[]) => void; fallback: () => Promise<GigaminxTurn[]> }>();

async function solveOnMainThread(state: GigaminxState): Promise<GigaminxTurn[]> {
  // Dynamic import: the solver bundles 5 precomputed commutator libraries (~179KB gzip) that
  // only an actual Gigaminx solve needs.
  const { solveFullGigaminx } = await import("./gigaminxSolver");
  return solveFullGigaminx(state).moves;
}

function getWorker(): Worker | null {
  if (worker) return worker;
  if (workerBroken || typeof Worker === "undefined") return null;
  try {
    const w = new Worker(new URL("./gigaminxSolveWorker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev: MessageEvent<GigaminxSolveWorkerResponse>) => {
      const entry = pending.get(ev.data.id);
      if (!entry) return;
      pending.delete(ev.data.id);
      if (ev.data.moves) entry.resolve(ev.data.moves);
      else {
        console.error("gigaminx solve worker reported an error (non-fatal, solving on the main thread):", ev.data.error);
        entry.fallback().then(entry.resolve);
      }
    };
    w.onerror = (ev: ErrorEvent) => {
      console.error("gigaminx solve worker crashed (non-fatal, solving on the main thread):", ev.message);
      workerBroken = true;
      w.terminate();
      worker = null;
      const waiting = [...pending.values()];
      pending.clear();
      for (const p of waiting) p.fallback().then(p.resolve);
    };
    worker = w;
  } catch (err) {
    console.error("gigaminx solve worker failed to start (non-fatal, solving on the main thread):", err);
    workerBroken = true;
    return null;
  }
  return worker;
}

/** Starts the worker early (it loads the heavy solver module on startup) so the first solve doesn't pay for it. Safe to call repeatedly. */
export function preloadGigaminxSolveWorker(): void {
  getWorker();
}

export function solveFullGigaminxOffThread(state: GigaminxState): Promise<GigaminxTurn[]> {
  const w = getWorker();
  if (!w) return solveOnMainThread(state);
  return new Promise<GigaminxTurn[]>((resolve) => {
    const id = nextRequestId++;
    pending.set(id, { resolve, fallback: () => solveOnMainThread(state) });
    const request: GigaminxSolveWorkerRequest = { id, state };
    w.postMessage(request);
  });
}
