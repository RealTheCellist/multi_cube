// --- RecoveryBenchmark (Solver Primitive Integration Prototype Sprint
// v1) -- core data collector shared by STEP2~6. Calls the REAL,
// now-modified production functions (generateRecoveryStrategies/
// executeTask from fiveByFiveEdgeRecovery.ts/fiveByFiveEdgeExecutor.ts --
// this Sprint's own STEP1 changes) directly on the 150-replay Dataset,
// treating each replay as an ENDGAME SolveTask (targetEdge=-1, matching
// how the real Planner already labels its final catch-all task --
// fiveByFiveEdgePlanner.ts's macroGoalToTask). No Planner/Engine code
// touched or reimplemented here -- only the Task/Executor/Recovery layer
// this Sprint's Integration Point lives in.
import { cloneCubies } from "../cubeState";
import type { Cubie } from "../cubeState";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import { executeTask, type ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { generateRecoveryStrategies, chooseBestRecovery } from "../fiveByFiveEdgeRecovery";
import type { SolveTask, TraceEntry } from "../fiveByFiveEdgeSolverTypes";
import { loadDataset, buildLibs } from "../solverPrimitivePrototype/PrototypeBenchmark";

export { loadDataset, buildLibs };

export const ENDGAME_TASK: SolveTask = { id: 0, type: "ENDGAME", description: "Integration Prototype Sprint v1 benchmark task", targetEdge: -1, score: 0 };
export const RECOVERY_DEADLINE_MS = 1000; // matches PLAN_TIME_BUDGET_MS (fiveByFiveEdgeSolverEngine.ts) -- the real whole-plan budget a single ENDGAME task's deadline would be drawn from

export interface RecoveryGenerationRecord {
  hash: string;
  repairGenerated: boolean;
  repairScore: number | null;
  repairChosen: boolean; // would chooseBestRecovery actually pick REPAIR over DISRUPT/SETUP
  candidateCount: number;
  candidateDescriptions: string[];
}

/** STEP2's own generation-level instrumentation: calls
 * generateRecoveryStrategies directly (read-only, works on internal
 * clones per its own existing contract) to see whether/how REPAIR
 * competes, independent of whether the full executeTask/attemptRecovery
 * path ultimately uses it. */
export function collectGenerationRecord(snapshot: FailureSnapshot, libs: ExecutorLibraries, deadlineMs: number): RecoveryGenerationRecord {
  const cubies = deserializeCube(snapshot.cubeState);
  const deadline = Date.now() + deadlineMs;
  const candidates = generateRecoveryStrategies(cubies, libs, deadline);
  const repair = candidates.find((c) => c.type === "REPAIR") ?? null;
  const best = chooseBestRecovery(candidates);
  return {
    hash: snapshot.hash,
    repairGenerated: !!repair,
    repairScore: repair ? repair.score : null,
    repairChosen: !!repair && !!best && best.id === repair.id,
    candidateCount: candidates.length,
    candidateDescriptions: candidates.map((c) => `${c.type}:${c.description}`),
  };
}

export interface RecoveryOutcomeRecord {
  hash: string;
  wrongWingBefore: number;
  wrongWingAfter: number;
  succeeded: boolean;
  regressed: boolean;
  timeMs: number;
  recoveryTriggered: boolean; // primary ENDGAME pipeline failed, Recovery ran at all
  repairShortCircuited: boolean; // trace contains "recovery-repair-short-circuit"
}

/** STEP2/3/5's own outcome-level instrumentation: runs the REAL
 * executeTask(allowRecovery=true) end to end -- exercises
 * runPrimaryPipeline -> (on failure) attemptRecovery ->
 * generateRecoveryStrategies(includeRepair) -> chooseBestRecovery ->
 * (short-circuit or retryTask), exactly the production path, with
 * includeRepair/shortCircuitRepair as the only knobs this Sprint added. */
export function runOutcome(
  snapshot: FailureSnapshot,
  libs: ExecutorLibraries,
  deadlineMs: number,
  includeRepair: boolean,
  shortCircuitRepair: boolean,
): RecoveryOutcomeRecord {
  const cubies: Cubie[] = deserializeCube(snapshot.cubeState);
  const clone = cloneCubies(cubies);
  const wrongWingBefore = wrongWingCount5(clone);
  const trace: TraceEntry[] = [];

  const start = Date.now();
  const deadline = start + deadlineMs;
  const moves = executeTask(clone, ENDGAME_TASK, libs, deadline, trace, true, undefined, includeRepair, shortCircuitRepair);
  const timeMs = Date.now() - start;

  if (moves.length > 0) applySeq(clone, moves);
  const wrongWingAfter = wrongWingCount5(clone);

  return {
    hash: snapshot.hash,
    wrongWingBefore,
    wrongWingAfter,
    succeeded: wrongWingAfter < wrongWingBefore,
    regressed: wrongWingAfter > wrongWingBefore,
    timeMs,
    recoveryTriggered: trace.some((t) => t.label === "recovery-triggered"),
    repairShortCircuited: trace.some((t) => t.label === "recovery-repair-short-circuit"),
  };
}
