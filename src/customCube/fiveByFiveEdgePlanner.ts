// --- Planner (Architecture Spec v2.0 section 8) ---------------------------
// The Planner ONLY decides strategy: which edge slot to work on, in what
// order, and why (PAIR/FLIP/PARITY/ENDGAME). It never generates a Move --
// that's the Executor's job (fiveByFiveEdgeExecutor.ts). Keeping these
// separate is what makes the Evaluator's scoring swappable/tunable without
// touching move-generation, and vice versa (spec section 20, SOLID).
import type { Cubie } from "./cubeState";
import { buildSolvedCube } from "./cubeState";
import { wrongWingCount5 } from "./fiveByFiveEdges";
import { analyzeEdgeSlots, detectEdgeSlotPattern } from "./fiveByFiveHumanEdges";
import { computeSlotMetrics, scoreMetrics, type EvaluatorWeights, DEFAULT_EVALUATOR_WEIGHTS } from "./fiveByFiveEdgeEvaluator";
import type { SolveTask } from "./fiveByFiveEdgeSolverTypes";

// Canonical 0-11 numbering for the 12 true-edge slots, derived once from a
// solved reference cube (stable regardless of any particular scramble's own
// iteration order) -- gives SolveTask.targetEdge a real, stable meaning
// instead of an arbitrary per-call index.
let cachedSlotOrder: string[] | null = null;
function slotOrder(): string[] {
  if (cachedSlotOrder) return cachedSlotOrder;
  const solved = buildSolvedCube(5);
  cachedSlotOrder = analyzeEdgeSlots(solved)
    .map((s) => s.slot)
    .sort();
  return cachedSlotOrder;
}
function slotIndex(slot: string): number {
  const idx = slotOrder().indexOf(slot);
  return idx; // -1 is a legitimate "not one of the 12 canonical slots" signal
}
/** Reverse of slotIndex -- the Executor needs to go from a task's
 * targetEdge number back to the actual slot key to find its Cubies. */
export function slotKeyForIndex(index: number): string | null {
  return slotOrder()[index] ?? null;
}

let nextTaskId = 1;

/**
 * Analyzes the cube and produces an ordered list of SolveTasks covering
 * every edge slot that isn't fully paired yet, plus a trailing PARITY task
 * (try the known Last-2-Edges case library) and a trailing ENDGAME task
 * (catch-all grinder) -- so the Executor always has something to try even
 * once every named slot-level task is exhausted. Tasks are ordered by the
 * Evaluator's score (see fiveByFiveEdgeEvaluator.ts): nearly-finished edges
 * first, matching the design doc's own "이미 짝지어진 것 유지, 가장 쉬운
 * 것부터" priority, rather than fixing wrong wings in arbitrary order.
 */
export function planEdgeTasks(cubies: Cubie[], weights: EvaluatorWeights = DEFAULT_EVALUATOR_WEIGHTS): SolveTask[] {
  const allStats = analyzeEdgeSlots(cubies);
  const tasks: SolveTask[] = [];

  const unfinished = allStats.filter((s) => s.pairedCount < 2);
  const scored = unfinished.map((stats) => {
    const pattern = detectEdgeSlotPattern(stats);
    const metrics = computeSlotMetrics(cubies, stats, allStats);
    const score = scoreMetrics(metrics, weights);
    return { stats, pattern, score };
  });
  scored.sort((a, b) => b.score - a.score);

  for (const { stats, pattern, score } of scored) {
    const type = pattern === "flipped-pair" ? "FLIP" : "PAIR";
    tasks.push({
      id: nextTaskId++,
      type,
      description: type === "FLIP" ? `${stats.slot} 슬롯 flip 보정` : `${stats.slot} 슬롯 wing 페어링`,
      targetEdge: slotIndex(stats.slot),
      score,
    });
  }

  if (wrongWingCount5(cubies) > 0) {
    tasks.push({ id: nextTaskId++, type: "PARITY", description: "Last-2-Edges 케이스 매칭 시도", targetEdge: -1, score: 0 });
    tasks.push({ id: nextTaskId++, type: "ENDGAME", description: "잔여 wing 그라인더 (bestFixOverall 등)", targetEdge: -1, score: -1 });
  }

  return tasks;
}
