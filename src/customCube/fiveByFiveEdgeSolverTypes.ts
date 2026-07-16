// ============================================================================
// 5x5x5 Edge Solver -- Architecture Specification v2.0 shared types.
//
// Plan-once, consume-many model: pressing the solve button computes ONE
// complete SolvePlan (every task through edge-pairing completion) and caches
// it; each subsequent press just dequeues the next Move from that same plan.
// A new plan is only computed when the cached one is invalidated (the
// user's actual cube state no longer matches what the plan expects -- see
// fiveByFiveEdgeStateHash.ts). This deliberately replaces the older
// preview-and-revert contract (see customSolvePlayback.ts's
// computeFiveByFiveSolveMoves/previewNextFiveByFiveMove), which recomputed
// the whole solve from scratch on every single button press.
//
// Planner / Executor / Evaluator / Library are kept as separate modules on
// purpose (see fiveByFiveEdgePlanner.ts, fiveByFiveEdgeExecutor.ts,
// fiveByFiveEdgeEvaluator.ts): the Planner only ever decides WHICH edge to
// work on next (a SoveTask), never HOW (no Move[] generation); the Executor
// only ever turns an already-chosen Task into Move[] using the existing,
// untouched fiveByFiveEdges.ts/fiveByFiveHumanEdges.ts library, never
// choosing which task to run next. Neither one owns move-generation AND
// goal-selection at once.
// ============================================================================

import type { Move } from "./fiveByFiveEdges";

export type SolveTaskType = "PAIR" | "FLIP" | "PARITY" | "ENDGAME";

export interface SolveTask {
  id: number;
  type: SolveTaskType;
  description: string;
  // Canonical 0-11 index of the true-edge slot this task targets (see
  // fiveByFiveEdgeStateHash.ts's SLOT_ORDER) -- ENDGAME tasks (the final
  // catch-all, not tied to one specific slot) use -1.
  targetEdge: number;
  score: number;
}

export interface SolvePlan {
  stateHash: number;
  tasks: SolveTask[];
  moveQueue: Move[];
  currentMove: number;
  score: number;
  createdAt: number;
}

export interface TraceEntry {
  at: number;
  label: string;
  detail?: string;
}
