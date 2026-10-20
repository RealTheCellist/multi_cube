// Web Worker entry point for the heavy, synchronous part of the 4x4x4 solve (created by
// fourByFourWorkerClient.ts via `new Worker(new URL("./fourByFourWorker.ts", import.meta.url), { type: "module" })`):
// edge pairing and center solving. Both run for up to a second or two of uninterrupted computation on a hard
// scramble, which froze the page after every scramble when they ran on the main thread. The 3x3x3 reduction that
// follows stays on the main thread -- it is quick and goes through cubing/search's own worker.
import type { Move } from "./customSolvePlayback";
import { deserializeCubies, type SerializedCubie } from "./cubieSerialization";
import { solveCenters } from "./fourByFourCenters";
import { solveEdgePairing, warmupFourByFourEdgeLibrary } from "./fourByFourEdges";

export interface FourByFourWorkerRequest {
  id: number;
  cubies: SerializedCubie[];
}

/** One message per finished phase (`phase`: "edges" then, if edges were solved, "centers"), then `done`; or `error`. */
export interface FourByFourWorkerResponse {
  id: number;
  phase?: "edges" | "centers";
  moves?: Move[];
  solved?: boolean;
  done?: true;
  error?: string;
}

self.onmessage = async (ev: MessageEvent<FourByFourWorkerRequest>) => {
  const { id, cubies: data } = ev.data;
  try {
    const cubies = deserializeCubies(data);
    const edges = await solveEdgePairing(cubies, 150000);
    const edgeMessage: FourByFourWorkerResponse = { id, phase: "edges", moves: edges.moves, solved: edges.solved };
    self.postMessage(edgeMessage);
    if (edges.solved) {
      const centers = solveCenters(cubies, 15000);
      const centerMessage: FourByFourWorkerResponse = { id, phase: "centers", moves: centers.moves, solved: centers.solved };
      self.postMessage(centerMessage);
    }
    const done: FourByFourWorkerResponse = { id, done: true };
    self.postMessage(done);
  } catch (err) {
    const response: FourByFourWorkerResponse = { id, error: err instanceof Error ? err.message : String(err) };
    self.postMessage(response);
  }
};

// Build the edge algorithm library as soon as the worker starts, so the first real solve doesn't pay for it.
warmupFourByFourEdgeLibrary();
