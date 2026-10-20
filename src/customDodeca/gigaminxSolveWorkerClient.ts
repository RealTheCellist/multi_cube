// Main-thread side of gigaminxSolveWorker.ts. One long-lived worker (unlike
// solver/n6/royalSolveWorkerClient.ts's per-solve worker, there is no wasm
// memory to hand back here, and keeping the worker alive keeps its JIT warm
// and the heavy solver module loaded). The solve is streamed: each finished
// phase's moves arrive as a chunk, so the first move is available after the
// (fast) corner phase instead of after the whole ~2s solve. Degrades
// gracefully: where Workers aren't available (Node/Vitest, old browsers) or
// the worker errors, the same staged solve runs on the calling thread
// instead -- slower to respond (it blocks the page) but with identical moves.
import type { GigaminxState, GigaminxTurn } from "./gigaminxState";
import type { GigaminxSolveWorkerRequest, GigaminxSolveWorkerResponse } from "./gigaminxSolveWorker";

interface Pending {
  onChunk: (moves: GigaminxTurn[]) => void;
  resolve: () => void;
  fallback: () => Promise<void>;
}

let worker: Worker | null = null;
let workerBroken = false;
let nextRequestId = 1;
const pending = new Map<number, Pending>();

async function solveOnMainThread(state: GigaminxState, onChunk: (moves: GigaminxTurn[]) => void): Promise<void> {
  // Dynamic import: the solver bundles 5 precomputed commutator libraries (~179KB gzip) that
  // only an actual Gigaminx solve needs.
  const { solveFullGigaminxStaged } = await import("./gigaminxSolver");
  solveFullGigaminxStaged(state, onChunk);
}

function getWorker(): Worker | null {
  if (worker) return worker;
  if (workerBroken || typeof Worker === "undefined") return null;
  try {
    const w = new Worker(new URL("./gigaminxSolveWorker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev: MessageEvent<GigaminxSolveWorkerResponse>) => {
      const entry = pending.get(ev.data.id);
      if (!entry) return;
      if (ev.data.chunk) entry.onChunk(ev.data.chunk);
      else if (ev.data.done) {
        pending.delete(ev.data.id);
        entry.resolve();
      } else {
        console.error("gigaminx solve worker reported an error (non-fatal, solving on the main thread):", ev.data.error);
        pending.delete(ev.data.id);
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

/**
 * Solves `state`, calling `onChunk` with the moves of each finished phase (in plan order; the chunks
 * concatenate to the whole plan). Resolves once every chunk has been delivered. On a worker failure partway
 * through, the solve restarts on the main thread and the already-delivered chunks are not repeated.
 */
export function solveFullGigaminxStreaming(state: GigaminxState, onChunk: (moves: GigaminxTurn[]) => void): Promise<void> {
  const w = getWorker();
  if (!w) return solveOnMainThread(state, onChunk);
  return new Promise<void>((resolve) => {
    const id = nextRequestId++;
    let delivered = 0;
    const countingChunk = (moves: GigaminxTurn[]) => {
      delivered += moves.length;
      onChunk(moves);
    };
    pending.set(id, {
      onChunk: countingChunk,
      resolve,
      // restart on the main thread; skip what the worker already delivered
      fallback: () => {
        let skip = delivered;
        return solveOnMainThread(state, (moves) => {
          if (skip >= moves.length) {
            skip -= moves.length;
            return;
          }
          const rest = skip > 0 ? moves.slice(skip) : moves;
          skip = 0;
          onChunk(rest);
        });
      },
    });
    const request: GigaminxSolveWorkerRequest = { id, state };
    w.postMessage(request);
  });
}
