// --- TaskTimeline (Recovery Architecture Review Sprint v1) -----------------
// Shared parser: turns one real, unmodified engine.solve() call's own
// TraceEntry[] into a structured per-task timeline. Reused by STEP1-3.
// Read-only -- never touches fiveByFiveEdgeSolverEngine.ts/Planner/Executor,
// just interprets the trace they already produce (same string-matching
// pattern solverPrimitiveIntegrationV2/ProductionPathAnalysis.ts and
// solverPrimitiveCCRProductionIntegration/ProductionPathCheck.ts already
// established for trace introspection).
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { FiveByFiveEdgeSolverEngine, warmupFiveByFiveEdgeLibraries } from "../fiveByFiveEdgeSolverEngine";

export type TaskTypeName = "PAIR" | "FLIP" | "PARITY" | "ENDGAME";

export interface TaskAttempt {
  type: TaskTypeName;
  atMs: number; // ms from solve() start when this task's own attempt finished
  progressed: boolean; // true if "task-N" (progress made), false if "task-N-skip" (no progress)
}

export interface SolveTimeline {
  hash: string;
  totalMs: number;
  planTasksAtMs: number | null;
  taskSequence: TaskTypeName[]; // from the plan-tasks trace entry, in planned order
  attempts: TaskAttempt[]; // in real execution order -- may be SHORTER than taskSequence if the budget ran out early
  recoveryTriggeredAtMs: number | null;
  doneAtMs: number | null;
}

const TASK_TYPE_RE = /(PAIR|FLIP|PARITY|ENDGAME)\((-?\d+)\)/g;

function parseTaskSequence(detail: string): TaskTypeName[] {
  const types: TaskTypeName[] = [];
  let m: RegExpExecArray | null;
  TASK_TYPE_RE.lastIndex = 0;
  while ((m = TASK_TYPE_RE.exec(detail)) !== null) types.push(m[1] as TaskTypeName);
  return types;
}

function buildTimeline(snapshot: FailureSnapshot): SolveTimeline {
  const cubies = deserializeCube(snapshot.cubeState);
  const engine = new FiveByFiveEdgeSolverEngine();
  const start = Date.now();
  engine.solve(cubies);
  const totalMs = Date.now() - start;
  const trace = engine.getTrace();

  const planTasksEntry = trace.find((t) => t.label === "plan-tasks");
  const taskSequence = planTasksEntry ? parseTaskSequence(planTasksEntry.detail ?? "") : [];

  const taskEntries = trace.filter((t) => /^task-\d+(-skip)?$/.test(t.label));
  const attempts: TaskAttempt[] = taskEntries.map((t, i) => ({
    type: taskSequence[i] ?? "ENDGAME", // fall back if the sequence ran out (shouldn't normally happen)
    atMs: t.at - start,
    progressed: !t.label.endsWith("-skip"),
  }));

  const recoveryTriggeredEntry = trace.find((t) => t.label === "recovery-triggered");
  const doneEntry = trace.find((t) => t.label === "done");

  return {
    hash: snapshot.hash,
    totalMs,
    planTasksAtMs: planTasksEntry ? planTasksEntry.at - start : null,
    taskSequence,
    attempts,
    recoveryTriggeredAtMs: recoveryTriggeredEntry ? recoveryTriggeredEntry.at - start : null,
    doneAtMs: doneEntry ? doneEntry.at - start : null,
  };
}

export function buildTimelines(snapshots: readonly FailureSnapshot[]): SolveTimeline[] {
  // The engine's own 1000ms deadline starts AFTER its internal library
  // build (buildWingLibrary/buildFlipLibrary/buildCaseLibrary) finishes --
  // but that build only happens once per PROCESS (module-level caching in
  // fiveByFiveEdges.ts) and costs ~1.3-2.5s cold. Without warming up first,
  // whichever snapshot happens to be processed FIRST would have its own
  // timeline polluted by that one-time cost (our own `start` marker is
  // captured before calling solve(), so it isn't excluded the way the
  // engine's internal deadline arithmetic already excludes it). Matches
  // the same warmup call failureAnalysis/failureReplay.ts's own
  // replayFailure() already makes for the identical reason.
  warmupFiveByFiveEdgeLibraries();
  return snapshots.map(buildTimeline);
}
