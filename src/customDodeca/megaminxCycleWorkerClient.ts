// Main-thread side of megaminxCycleWorker.ts: one long-lived worker. Resolves with null when the worker is
// unavailable (Node/Vitest, old browsers), crashes, or reports an error -- the caller then falls back to the older
// layer-by-layer solver, so a failure here never leaves the player without a hint.
import type { MegaminxCycleKind, MegaminxCycleRequest, MegaminxCycleResponse } from "./megaminxCycleWorker";
import type { TurnLike } from "./megaminxCycleSolver";

let worker: Worker | null = null;
let workerBroken = false;
let nextRequestId = 1;
const pending = new Map<number, (turns: TurnLike[] | null) => void>();

function getWorker(): Worker | null {
  if (worker) return worker;
  if (workerBroken || typeof Worker === "undefined") return null;
  try {
    const w = new Worker(new URL("./megaminxCycleWorker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev: MessageEvent<MegaminxCycleResponse>) => {
      const resolve = pending.get(ev.data.id);
      if (!resolve) return;
      pending.delete(ev.data.id);
      if (!ev.data.turns) console.error("macro solve worker reported an error (non-fatal, using the older solver):", ev.data.error);
      resolve(ev.data.turns ?? null);
    };
    w.onerror = (ev: ErrorEvent) => {
      console.error("macro solve worker crashed (non-fatal, using the older solver):", ev.message);
      workerBroken = true;
      w.terminate();
      worker = null;
      const waiting = [...pending.values()];
      pending.clear();
      for (const resolve of waiting) resolve(null);
    };
    worker = w;
  } catch (err) {
    console.error("macro solve worker failed to start (non-fatal, using the older solver):", err);
    workerBroken = true;
    return null;
  }
  return worker;
}

/** Starts the worker (which builds the macro tables on startup) so the first solve doesn't wait for them. Safe to call repeatedly. */
export function preloadMegaminxCycleWorker(): void {
  getWorker();
}

export function solveByCyclesOffThread(kind: MegaminxCycleKind, state: MegaminxCycleRequest["state"]): Promise<TurnLike[] | null> {
  const w = getWorker();
  if (!w) return Promise.resolve(null);
  return new Promise((resolve) => {
    const id = nextRequestId++;
    pending.set(id, resolve);
    const request: MegaminxCycleRequest = { id, kind, state };
    w.postMessage(request);
  });
}
