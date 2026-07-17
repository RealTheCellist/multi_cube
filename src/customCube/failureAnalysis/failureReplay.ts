// --- Failure Replay (Failure Analysis Engine v1) ----------------------------
// Restores a captured failure's exact cube state and runs the REAL,
// unmodified FiveByFiveEdgeSolverEngine against it again, purely for
// debugging -- this only ever calls the engine's existing public API
// (solve/getTrace), never reaches into its internals, so it can't and
// doesn't change solver behavior.
import { FiveByFiveEdgeSolverEngine, warmupFiveByFiveEdgeLibraries } from "../fiveByFiveEdgeSolverEngine";
import type { SolvePlan, TraceEntry } from "../fiveByFiveEdgeSolverTypes";
import type { Cubie } from "../cubeState";
import { deserializeCube } from "./cubeSerialization";
import { getByHash, type FailureDatabase } from "./failureDatabase";

export function loadFailure(db: FailureDatabase, hash: string): Cubie[] | null {
  const snapshot = getByHash(db, hash);
  if (!snapshot) return null;
  return deserializeCube(snapshot.cubeState);
}

export interface ReplayResult {
  plan: SolvePlan;
  trace: readonly TraceEntry[];
}

/** loadFailure(hash) -> Cube 복원 -> Solver 실행 (spec's own diagram). */
export function replayFailure(db: FailureDatabase, hash: string): ReplayResult | null {
  const cubies = loadFailure(db, hash);
  if (!cubies) return null;
  warmupFiveByFiveEdgeLibraries();
  const engine = new FiveByFiveEdgeSolverEngine();
  const plan = engine.solve(cubies);
  return { plan, trace: engine.getTrace() };
}
