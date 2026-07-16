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

// --- Planner v2: Strategy-based planning (Architecture Spec v2.0 "Planner
// v2 Upgrade") -----------------------------------------------------------
// Adds a layer ABOVE SolveTask: the Planner no longer sorts edge slots by
// their own immediate score and calls that a plan (a plain priority queue),
// it generates several whole-cube STRATEGIES (each an ORDERED sequence of
// MacroGoals), previews each one a few goals deep against a cloned cube,
// and only THEN commits to the highest-scoring one's full goal sequence --
// see fiveByFiveEdgePlanner.ts's generateCandidateStrategies/simulateStrategy.
// SolveTask (above) is unchanged and still what the Executor actually
// consumes; MacroGoal sits one level above it (a Strategy is built from
// MacroGoals, and each chosen MacroGoal expands to exactly one SolveTask --
// see fiveByFiveEdgePlanner.ts's macroGoalToTask).

export type MacroGoalType = "PAIR_EDGE" | "FIX_FLIP" | "LAST_TWO" | "PARITY" | "ENDGAME";

export interface MacroGoal {
  type: MacroGoalType;
  targetEdge: number;
  priority: number;
}

export interface SolveStrategy {
  id: number;
  description: string;
  expectedScore: number;
  estimatedRemainingWork: number;
  goals: MacroGoal[];
}

// --- Adaptive Executor v2: Recovery Strategy (Planner is not involved --
// this is purely an Executor-level fallback for when the ordinary
// BASE/FLIP/CASE/PARITY/ENDGAME pipeline finds no progress at all) --------
// A Recovery deliberately disrupts an already-solved slot (DISRUPT) or
// applies a move that doesn't help by itself but sets up an easier
// follow-on case (SETUP), always evaluated against a scratch clone before
// ever touching the real cube -- see fiveByFiveEdgeRecovery.ts.

export type RecoveryType = "DISRUPT" | "SETUP" | "REPAIR";

export interface RecoveryStrategy {
  id: number;
  type: RecoveryType;
  description: string;
  moves: Move[];
  expectedWrongWingDelta: number;
  expectedFuturePotential: number;
  score: number;
}
