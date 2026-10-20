// Main-thread side of fourByFourWorker.ts. One long-lived worker (keeps the edge algorithm library and the JIT
// warm); requests are answered in order. The solve is streamed: the edge phase's moves are delivered as soon as
// that phase finishes, so the player can start on them while the center phase is still being computed.
// Degrades gracefully: where Workers aren't available (Node/Vitest, old browsers) or the worker errors, the same
// edge + center solve runs on the calling thread instead -- slower to respond (it blocks the page) but with an
// equivalent result, delivered through the same callback.
import { cloneCubies, type Cubie } from "./cubeState";
import { serializeCubies } from "./cubieSerialization";
import type { Move } from "./customSolvePlayback";
import { solveCenters } from "./fourByFourCenters";
import { warmupFourByFourEdgeLibrary } from "./fourByFourEdges";
import { pairWings4 } from "./fourByFourPairing";
import type { FourByFourWorkerRequest, FourByFourWorkerResponse } from "./fourByFourWorker";

export interface PairingChunk {
  phase: "edges" | "centers";
  moves: Move[];
  solved: boolean;
}

interface Pending {
  onChunk: (chunk: PairingChunk) => void;
  resolve: () => void;
  fallback: () => Promise<void>;
}

let worker: Worker | null = null;
let workerBroken = false;
let nextRequestId = 1;
const pending = new Map<number, Pending>();

async function solveOnMainThread(cubies: readonly Cubie[], onChunk: (chunk: PairingChunk) => void): Promise<void> {
  const work = cloneCubies(cubies as Cubie[]);
  const edges = await pairWings4(work, 150000);
  onChunk({ phase: "edges", moves: edges.moves, solved: edges.solved });
  if (!edges.solved) return;
  const centers = solveCenters(work, 15000);
  onChunk({ phase: "centers", moves: centers.moves, solved: centers.solved });
}

function getWorker(): Worker | null {
  if (worker) return worker;
  if (workerBroken || typeof Worker === "undefined") return null;
  try {
    const w = new Worker(new URL("./fourByFourWorker.ts", import.meta.url), { type: "module" });
    w.onmessage = (ev: MessageEvent<FourByFourWorkerResponse>) => {
      const entry = pending.get(ev.data.id);
      if (!entry) return;
      if (ev.data.phase && ev.data.moves) entry.onChunk({ phase: ev.data.phase, moves: ev.data.moves, solved: !!ev.data.solved });
      else if (ev.data.done) {
        pending.delete(ev.data.id);
        entry.resolve();
      } else {
        console.error("4x4 solve worker reported an error (non-fatal, solving on the main thread):", ev.data.error);
        pending.delete(ev.data.id);
        entry.fallback().then(entry.resolve);
      }
    };
    w.onerror = (ev: ErrorEvent) => {
      console.error("4x4 solve worker crashed (non-fatal, solving on the main thread):", ev.message);
      workerBroken = true;
      w.terminate();
      worker = null;
      const waiting = [...pending.values()];
      pending.clear();
      for (const p of waiting) p.fallback().then(p.resolve);
    };
    worker = w;
  } catch (err) {
    console.error("4x4 solve worker failed to start (non-fatal, solving on the main thread):", err);
    workerBroken = true;
    return null;
  }
  return worker;
}

/** Starts the worker (which builds the edge algorithm library on startup) so the first solve doesn't wait for it; without a Worker, builds the library here. */
export function preloadFourByFourWorker(): void {
  if (!getWorker()) warmupFourByFourEdgeLibrary();
}

/**
 * Edge pairing, then (if that succeeded) center solving, for a 4x4x4 -- off the main thread where possible.
 * `onChunk` receives each phase's moves as that phase finishes; the promise resolves once all chunks have been
 * delivered. Does not mutate `cubies`. If the worker dies partway, the whole solve restarts on the main thread
 * and the chunks already delivered are not repeated.
 */
export function solveEdgesAndCentersStreaming(cubies: readonly Cubie[], onChunk: (chunk: PairingChunk) => void): Promise<void> {
  const w = getWorker();
  if (!w) return solveOnMainThread(cubies, onChunk);
  return new Promise<void>((resolve) => {
    const id = nextRequestId++;
    const delivered = new Set<string>();
    const deliver = (chunk: PairingChunk) => {
      delivered.add(chunk.phase);
      onChunk(chunk);
    };
    pending.set(id, {
      onChunk: deliver,
      resolve,
      fallback: () => solveOnMainThread(cubies, (chunk) => (delivered.has(chunk.phase) ? undefined : deliver(chunk))),
    });
    const request: FourByFourWorkerRequest = { id, cubies: serializeCubies(cubies) };
    w.postMessage(request);
  });
}
