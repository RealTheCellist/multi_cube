// Web Worker entry point (created by edgePdbClient.ts via
// `new Worker(new URL("./edgePdbWorker.ts", import.meta.url), { type: "module" })`,
// Vite's standard pattern for bundling a worker). Runs the PDB-guided edge
// IDA* search (runPdbGuidedEdgeSearch, defined once in
// masterTetraminxSolver.ts and reused here unmodified) off the main thread
// -- see that file's edge-PDB section comment for why this can't run
// inline in a normal solve call.
//
// Not statically imported by anything else in the app (only referenced via
// the `new URL(...)` string above, which the bundler picks up but
// TypeScript's project-wide type-checking does not follow) -- if this file
// is ever included in a stricter type-check pass, note it intentionally
// runs under the worker global scope, not DOM, so `self` here is a
// DedicatedWorkerGlobalScope, not a Window.
import { precompute, parseEdgePdbBuffer, resolveEdgePdbUrl, runPdbGuidedEdgeSearch, type TetraMove } from "./masterTetraminxSolver";

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

let pdbPromise: Promise<Map<string, number>> | null = null;

function loadPdb(): Promise<Map<string, number>> {
  if (!pdbPromise) {
    pdbPromise = fetch(resolveEdgePdbUrl())
      .then((res) => {
        if (!res.ok) throw new Error(`edge PDB fetch failed: HTTP ${res.status}`);
        return res.arrayBuffer();
      })
      .then((buf) => parseEdgePdbBuffer(buf));
  }
  return pdbPromise;
}

// Kick off the fetch the moment this worker is created, not only once a
// request arrives -- overlaps the download/parse with whatever the main
// thread's own synchronous solve phases are doing in the meantime.
loadPdb().catch((err) => {
  console.error("edge PDB worker: background preload fetch failed (will retry on first request):", err);
});

self.onmessage = async (ev: MessageEvent<EdgePdbWorkerRequest>) => {
  const { id, layerCount, edgePattern, maxThreshold, maxNodes } = ev.data;
  try {
    const pdb = await loadPdb();
    const pre = precompute(layerCount);
    const moves = runPdbGuidedEdgeSearch(pre, edgePattern, pdb, maxThreshold, maxNodes);
    const response: EdgePdbWorkerResponse = { id, moves };
    self.postMessage(response);
  } catch (err) {
    const response: EdgePdbWorkerResponse = { id, moves: null, error: String(err) };
    self.postMessage(response);
  }
};
