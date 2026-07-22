// --- ProductionSolveMirror (Incremental Recovery Production Integration
// Sprint v1) -----------------------------------------------------------------
// Real, unmodified planEdgeTasks()/executeTask() -- the exact same
// real solve() loop FiveByFiveEdgeSolverEngine.solve() itself uses --
// mirrored here (same pattern established by Incremental Recovery Blueprint
// Sprint v1's own PairFailurePopulationAnalysis.ts) ONLY so this Sprint's
// benchmark can pass an EXPLICIT `pairBudgetMs` value through to
// executeTask, reconstructing the pre-Sprint counterfactual (`undefined`)
// for the required Baseline-vs-Candidate comparison. solve() itself doesn't
// expose this -- it always uses the real production default
// (FIXED_BUDGET_MS=140) now that this Sprint has wired it in.
//
// The Candidate arm of every STEP below calls the REAL, un-mirrored
// FiveByFiveEdgeSolverEngine.solve() directly (zero reimplementation) --
// this mirror exists ONLY for the Baseline arm's counterfactual
// reconstruction.
import { cloneCubies, type Cubie } from "../cubeState";
import { buildWingLibrary, buildFlipLibrary, buildCaseLibrary, wrongWingCount5 } from "../fiveByFiveEdges";
import type { Move } from "../fiveByFiveEdges";
import { planEdgeTasks } from "../fiveByFiveEdgePlanner";
import { executeTask, type ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { PLAN_TIME_BUDGET_MS } from "../fiveByFiveEdgeSolverEngine";

export interface MirrorSolveResult {
  wallMs: number;
  wrongWingBefore: number;
  wrongWingAfter: number;
  improved: boolean; // wrongWingAfter < wrongWingBefore
  solved: boolean; // wrongWingAfter === 0
  moveCount: number;
  tasksCompleted: number;
  deadlineMissed: boolean; // did the whole plan loop run past PLAN_TIME_BUDGET_MS
}

/**
 * Byte-identical to FiveByFiveEdgeSolverEngine.solve()'s own body (library
 * build, planEdgeTasks, per-task executeTask loop, allowRecovery=true),
 * EXCEPT it accepts an explicit `pairBudgetMs` passed straight through to
 * every executeTask call -- undefined reconstructs this Sprint's own
 * pre-integration counterfactual; any other value (or omitting the
 * argument, which defaults to real production behavior inside executeTask
 * itself) matches real solve().
 */
export function mirrorSolve(cubies: Cubie[], libs: ExecutorLibraries, pairBudgetMs: number | undefined): MirrorSolveResult {
  const start = Date.now();
  const working = cloneCubies(cubies);
  const wrongWingBefore = wrongWingCount5(working);

  const deadline = Date.now() + PLAN_TIME_BUDGET_MS;
  const planDeadline = Math.min(deadline, Date.now() + 200);
  const { tasks } = planEdgeTasks(working, libs, undefined, planDeadline, deadline);

  const moveQueue: Move[] = [];
  let tasksCompleted = 0;
  let deadlineMissed = false;

  for (const task of tasks) {
    if (Date.now() > deadline) {
      deadlineMissed = true;
      break;
    }
    if (wrongWingCount5(working) === 0) break;
    const moves = executeTask(working, task, libs, deadline, undefined, true, undefined, true, true, "reservedBudget", pairBudgetMs);
    if (moves.length > 0) {
      moveQueue.push(...moves);
      tasksCompleted++;
    }
  }

  const wrongWingAfter = wrongWingCount5(working);
  return {
    wallMs: Date.now() - start,
    wrongWingBefore,
    wrongWingAfter,
    improved: wrongWingAfter < wrongWingBefore,
    solved: wrongWingAfter === 0,
    moveCount: moveQueue.length,
    tasksCompleted,
    deadlineMissed,
  };
}

export function buildLibs(): ExecutorLibraries {
  return { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };
}

export type { Cubie };
