// --- FailureAnalysisEngine (Failure Analysis Engine v1) ---------------------
// The top-level orchestrator: runs real scrambles through the existing,
// UNMODIFIED FiveByFiveEdgeSolverEngine (imported and called exactly the way
// customSolvePlayback.ts already does -- solve()/syncAndPeekNextMove(), no
// different entry point), collects every genuine failure via
// FailureCollector, and persists them into a FailureDatabase. This is the
// only file in this directory that actually DRIVES the solver; every other
// module here only reads data this one produces.
import { applyRawQuarterTurn, buildSolvedCube, type Axis, type Cubie } from "../cubeState";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import { FiveByFiveEdgeSolverEngine, warmupFiveByFiveEdgeLibraries } from "../fiveByFiveEdgeSolverEngine";
import { collectFailure } from "./failureCollector";
import { addSnapshot, loadDatabase, saveDatabase, allSnapshots, type FailureDatabase } from "./failureDatabase";

const AXES: Axis[] = ["x", "y", "z"];

function scramble5(cubies: Cubie[], moves = 60): void {
  for (let i = 0; i < moves; i++) {
    const axis = AXES[Math.floor(Math.random() * 3)];
    const layer = Math.floor(Math.random() * 5);
    const sign = Math.random() < 0.5 ? 1 : -1;
    applyRawQuarterTurn(cubies, axis, layer, sign as 1 | -1);
  }
}

export interface CollectionSessionResult {
  scramblesRun: number;
  newFailures: number;
  totalFailuresInDb: number;
}

/**
 * Runs `numScrambles` fresh scrambles, each through the SAME "press until
 * solved or genuinely stuck" loop this project's own verification scripts
 * already used (consecutive-empty-plan as the stuck signal, not per-move
 * noise -- see the session's own established convention), and records
 * exactly one FailureSnapshot per scramble that ends up stuck (dedup by
 * hash still applies across the whole run/database).
 */
export function runFailureCollectionSession(numScrambles: number, dbPath: string): CollectionSessionResult {
  warmupFiveByFiveEdgeLibraries();
  const db: FailureDatabase = loadDatabase(dbPath);
  let newFailures = 0;

  for (let i = 0; i < numScrambles; i++) {
    const cubies = buildSolvedCube(5);
    scramble5(cubies);

    const engine = new FiveByFiveEdgeSolverEngine();
    let presses = 0;
    let consecutiveEmptyPlans = 0;
    const MAX_PRESSES = 3000;
    const MAX_EMPTY_PLANS = 20;

    // Captured at the exact moment each plan is produced (cubies here is
    // whatever solve() was just called against -- BEFORE any of that plan's
    // own moves have been applied), which is exactly what collectFailure
    // expects as `inputCubies` (it does its own replay of plan.moveQueue
    // internally). Every plan solve() ever returns is checked this way, so
    // the LAST plan of a run (the one the loop finally gets stuck on) is
    // captured here too -- no separate "final state" pass is needed.
    while (wrongWingCount5(cubies) > 0 && presses < MAX_PRESSES && consecutiveEmptyPlans < MAX_EMPTY_PLANS) {
      presses++;
      let move = engine.syncAndPeekNextMove(cubies);
      if (!move && !engine.hasValidPlan(cubies)) {
        const plan = engine.solve(cubies);
        consecutiveEmptyPlans = plan.moveQueue.length === 0 ? consecutiveEmptyPlans + 1 : 0;
        if (plan.score < 0) {
          const snapshot = collectFailure(cubies, plan, engine.getTrace());
          if (snapshot && addSnapshot(db, snapshot)) newFailures++;
        }
        move = engine.syncAndPeekNextMove(cubies);
      }
      if (!move) continue;
      applyRawQuarterTurn(cubies, move[0], move[1], move[2]);
    }
  }

  saveDatabase(dbPath, db);
  return { scramblesRun: numScrambles, newFailures, totalFailuresInDb: allSnapshots(db).length };
}
