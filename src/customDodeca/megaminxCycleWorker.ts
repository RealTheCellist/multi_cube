// Web Worker entry point for the Kilominx / Megaminx / Master Kilominx macro solve (created by
// megaminxCycleWorkerClient.ts via `new Worker(new URL("./megaminxCycleWorker.ts", import.meta.url), { type: "module" })`).
// Building the macro tables takes about a second the first time; doing it here keeps the page responsive, and it
// starts as soon as the worker does (the client starts it when the puzzle is opened), so it is normally done before
// the first solve is asked for.
import { solveKilominxByCycles, solveMegaminxByCycles, warmupMegaminxCycleSolver, type MegaminxLikeState, type TurnLike } from "./megaminxCycleSolver";

export type MegaminxCycleKind = "kilominx" | "megaminx";

export interface MegaminxCycleRequest {
  id: number;
  kind: MegaminxCycleKind;
  /** kilominx: { perm, orient }; megaminx / master kilominx: { cornerPerm, cornerOrient, edgePerm, edgeOrient } */
  state: { perm?: number[]; orient?: number[]; cornerPerm?: number[]; cornerOrient?: number[]; edgePerm?: number[]; edgeOrient?: number[] };
}

export interface MegaminxCycleResponse {
  id: number;
  turns?: TurnLike[];
  error?: string;
}

self.onmessage = (ev: MessageEvent<MegaminxCycleRequest>) => {
  const { id, kind, state } = ev.data;
  try {
    const turns = kind === "kilominx" ? solveKilominxByCycles({ perm: state.perm!, orient: state.orient! }) : solveMegaminxByCycles(state as MegaminxLikeState);
    const response: MegaminxCycleResponse = { id, turns };
    self.postMessage(response);
  } catch (err) {
    const response: MegaminxCycleResponse = { id, error: err instanceof Error ? err.message : String(err) };
    self.postMessage(response);
  }
};

setTimeout(() => {
  try {
    warmupMegaminxCycleSolver();
  } catch {
    // purely an optimisation
  }
}, 0);
