// --- PlannerReachabilityAnalysis (Solver System Bottleneck Attribution
// Refinement Sprint v1, STEP1) -----------------------------------------------
// READ-ONLY analysis Sprint -- zero Production code changes. Reuses the
// prior Sprint's own StageInstrumentedMirror.ts (mirrorExecuteTask) plus the
// real, unmodified planEdgeTasks() to classify every snapshot's real ENDGAME
// reachability.
//
// DISCLOSED CORRECTION of the work order's own framing: reading
// fiveByFiveEdgePlanner.ts's real planEdgeTasks() directly shows ENDGAME is
// NOT a candidate the Planner selectively "skips" -- whenever
// `wrongWingCount5(cubies) > 0` at plan time (`stillNeedsParity`), EVERY
// candidate strategy unconditionally gets `[...goals, LAST_TWO, ENDGAME]`
// appended (see planEdgeTasks's own `stillNeedsParity` branch). So an
// ENDGAME task is always QUEUED whenever the cube isn't already solved.
// What actually varies is whether the real top-level task loop (solve()'s
// own `for (const task of tasks) { if (Date.now() > deadline) break; ... }`)
// ever REACHES that queue position before the outer 1-second plan deadline
// fires -- a deadline-starvation/queue-ordering effect, not a Planner
// selection decision. This module measures that real mechanism precisely
// under the corrected name "PlannerSkipped" (kept for continuity with the
// work order), while documenting what it actually is.
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import { planEdgeTasks } from "../fiveByFiveEdgePlanner";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { SolveTask } from "../fiveByFiveEdgeSolverTypes";
import { mirrorExecuteTask, type StageEvent } from "../solverPrimitiveSystemBottleneckAttribution/StageInstrumentedMirror";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import { PLAN_TIME_BUDGET_MS } from "../fiveByFiveEdgeSolverEngine";
import { cloneCubies, type Cubie } from "../cubeState";

// "AlreadySolvedBeforeEndgame": the loop finished (wrongWingCount5 hit 0)
// via PAIR/FLIP/PARITY tasks alone, before ever reaching the queued ENDGAME
// task -- a genuine SUCCESS, not an opportunity loss, so it must NOT be
// folded into "PlannerSkipped" (which is reserved for the real
// deadline-starvation case STEP3 needs to simulate a fix for).
export type ReachabilityCase = "Reachable" | "PlannerSkipped" | "AlreadySolvedBeforeEndgame" | "StructurallyImpossible";

export interface ReachabilityRecord {
  hash: string;
  case: ReachabilityCase;
  tasks: SolveTask[];
  endgameTaskIndex: number; // -1 if no ENDGAME task was ever queued (StructurallyImpossible)
  reachedIndex: number; // last task index the real loop actually attempted (-1 if none)
  wrongWingAtPlanTime: number;
  preEndgameCubies: Cubie[] | null; // real intermediate state right before the ENDGAME task, for STEP2/3 reuse (Reachable only)
  preEndgameDeadline: number | null; // the REAL remaining deadline at that exact point, for STEP2/3 reuse (Reachable only)
  skippedCubies: Cubie[] | null; // real intermediate state at the moment the deadline fired, for STEP3's counterfactual (PlannerSkipped only)
}

/** Mirrors solve()'s own loop up to (and stopping at, WITHOUT executing) the queued ENDGAME task, classifying reachability. */
export function analyzeReachability(hash: string, cubies: Cubie[], libs: ExecutorLibraries): ReachabilityRecord {
  const working = cloneCubies(cubies);
  const wrongWingAtPlanTime = wrongWingCount5(working);
  const deadline = Date.now() + PLAN_TIME_BUDGET_MS;
  const planDeadline = Math.min(deadline, Date.now() + 200);
  const { tasks } = planEdgeTasks(working, libs, undefined, planDeadline, deadline);

  const endgameTaskIndex = tasks.findIndex((t) => t.type === "ENDGAME");
  if (endgameTaskIndex === -1) {
    return {
      hash,
      case: "StructurallyImpossible",
      tasks,
      endgameTaskIndex: -1,
      reachedIndex: -1,
      wrongWingAtPlanTime,
      preEndgameCubies: null,
      preEndgameDeadline: null,
      skippedCubies: null,
    };
  }

  const events: StageEvent[] = [];
  let reachedIndex = -1;
  let preEndgameCubies: Cubie[] | null = null;
  let preEndgameDeadline: number | null = null;
  let stopReason: "reachedEndgame" | "deadlineExceeded" | "alreadySolved" | "ranOffQueue" = "ranOffQueue";

  for (let i = 0; i < tasks.length; i++) {
    if (Date.now() > deadline) {
      stopReason = "deadlineExceeded";
      break;
    }
    if (wrongWingCount5(working) === 0) {
      stopReason = "alreadySolved";
      break;
    }
    if (i === endgameTaskIndex) {
      // Stop RIGHT BEFORE executing the ENDGAME task itself -- this is the
      // real, live intermediate state STEP2/3 need, captured with zero risk
      // of this analysis module itself consuming any of the real budget
      // that would have gone to ENDGAME.
      preEndgameCubies = cloneCubies(working);
      preEndgameDeadline = deadline;
      reachedIndex = i;
      stopReason = "reachedEndgame";
      break;
    }
    reachedIndex = i;
    mirrorExecuteTask(hash, working, tasks[i], libs, deadline, DEFAULT_EVALUATOR_WEIGHTS, events);
  }

  const caseLabel: ReachabilityCase =
    stopReason === "reachedEndgame" ? "Reachable" : stopReason === "alreadySolved" ? "AlreadySolvedBeforeEndgame" : "PlannerSkipped";

  return {
    hash,
    case: caseLabel,
    tasks,
    endgameTaskIndex,
    reachedIndex,
    wrongWingAtPlanTime,
    preEndgameCubies,
    preEndgameDeadline,
    skippedCubies: caseLabel === "PlannerSkipped" ? cloneCubies(working) : null,
  };
}

export function analyzeAllReachability(
  snapshots: readonly FailureSnapshot[],
  libs: ExecutorLibraries
): ReachabilityRecord[] {
  return snapshots.map((s) => analyzeReachability(s.hash, deserializeCube(s.cubeState), libs));
}

export interface ReachabilitySummary {
  n: number;
  reachableCount: number;
  reachablePct: number;
  plannerSkippedCount: number;
  plannerSkippedPct: number;
  alreadySolvedCount: number;
  alreadySolvedPct: number;
  structurallyImpossibleCount: number;
  structurallyImpossiblePct: number;
}

export function summarizeReachability(records: readonly ReachabilityRecord[]): ReachabilitySummary {
  const n = records.length;
  const reachableCount = records.filter((r) => r.case === "Reachable").length;
  const plannerSkippedCount = records.filter((r) => r.case === "PlannerSkipped").length;
  const alreadySolvedCount = records.filter((r) => r.case === "AlreadySolvedBeforeEndgame").length;
  const structurallyImpossibleCount = records.filter((r) => r.case === "StructurallyImpossible").length;
  return {
    n,
    reachableCount,
    reachablePct: n ? (reachableCount / n) * 100 : 0,
    plannerSkippedCount,
    plannerSkippedPct: n ? (plannerSkippedCount / n) * 100 : 0,
    alreadySolvedCount,
    alreadySolvedPct: n ? (alreadySolvedCount / n) * 100 : 0,
    structurallyImpossibleCount,
    structurallyImpossiblePct: n ? (structurallyImpossibleCount / n) * 100 : 0,
  };
}
