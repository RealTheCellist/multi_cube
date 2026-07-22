// --- RealSolveProbe (Incremental Recovery Production Integration Sprint
// v1) -----------------------------------------------------------------------
// The Candidate arm: calls the REAL, completely unmodified
// FiveByFiveEdgeSolverEngine.solve() directly (zero reimplementation) --
// this is what real production now does by default, since executeTask's
// own `pairBudgetMs` default is FIXED_BUDGET_MS (140) after this Sprint's
// wiring. Extracts the same MirrorSolveResult shape as
// ProductionSolveMirror.ts's Baseline arm for a direct, apples-to-apples
// comparison.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import { FiveByFiveEdgeSolverEngine, warmupFiveByFiveEdgeLibraries } from "../fiveByFiveEdgeSolverEngine";
import type { MirrorSolveResult } from "./ProductionSolveMirror";

let warmed = false;
export function ensureWarm(): void {
  if (!warmed) {
    warmupFiveByFiveEdgeLibraries();
    warmed = true;
  }
}

export function realSolveProbe(cubies: Cubie[]): MirrorSolveResult {
  ensureWarm();
  const start = Date.now();
  const wrongWingBefore = wrongWingCount5(cubies);
  const engine = new FiveByFiveEdgeSolverEngine();
  const plan = engine.solve(cubies);
  const after = cloneCubies(cubies);
  applySeq(after, plan.moveQueue);
  const wrongWingAfter = wrongWingCount5(after);
  const deadlineMissed = engine.getTrace().some((t) => t.label === "budget-exhausted");
  return {
    wallMs: Date.now() - start,
    wrongWingBefore,
    wrongWingAfter,
    improved: wrongWingAfter < wrongWingBefore,
    solved: wrongWingAfter === 0,
    moveCount: plan.moveQueue.length,
    tasksCompleted: plan.tasks.length,
    deadlineMissed,
  };
}
