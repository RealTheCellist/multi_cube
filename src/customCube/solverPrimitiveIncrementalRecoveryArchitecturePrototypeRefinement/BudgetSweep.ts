// --- BudgetSweep (Incremental Recovery Architecture Prototype Refinement
// Sprint v1, STEP1) ---------------------------------------------------------
// Sweeps the real 40ms-200ms budget space against bfsMoveWingToPosition()'s
// Traversal Interruptibility -- the exact, unmodified Production mechanism
// added in Architecture Prototype Sprint v1. No Production code changes
// this Sprint; only the budget VALUE and queuePop granularity (already the
// winning choice from that Sprint) are varied.
//
// Abort detection is EXACT, not heuristic: because bfsMoveWingToPosition's
// deadline check fires on every queue-pop (frequent, ~0.84ms avg / 3ms max
// overshoot per Architecture Prototype Sprint v1's own measurement), the
// ONLY way a call's wall time can reach or exceed its own budget is if the
// deadline check actually fired -- a natural completion (success or
// exhaustion) always returns strictly before the deadline elapses. So
// `aborted := runtimeMs >= budgetMs` is a sound, exact criterion, not an
// approximation.
import { bfsMoveWingToPosition } from "../fiveByFiveEdges";
import { REAL_MAX_DEPTH, type InterruptibilityTestCase } from "../solverPrimitiveIncrementalRecoveryArchitecturePrototype/TraversalInterruptibilityCore";
import { OVERRUN_TOLERANCE_MS, BEST_GRANULARITY, CHECK_EVERY_NODES } from "../solverPrimitiveIncrementalRecoveryArchitecturePrototype/BudgetCompliance";

export const BUDGET_VALUES_MS = [40, 60, 80, 100, 120, 140, 160, 200];

export interface BudgetSweepRecord {
  hash: string;
  pieceId: number;
  budgetMs: number;
  runtimeMs: number;
  foundPath: boolean;
  overrun: boolean; // runtimeMs > budgetMs + OVERRUN_TOLERANCE_MS
  aborted: boolean; // exact: runtimeMs >= budgetMs (see file header)
}

export function runOneBudget(cases: readonly InterruptibilityTestCase[], budgetMs: number): BudgetSweepRecord[] {
  return cases.map((c) => {
    const start = Date.now();
    const deadline = start + budgetMs;
    const result = bfsMoveWingToPosition(
      c.edges,
      c.pieceId,
      c.targetPosKey,
      REAL_MAX_DEPTH,
      c.pins,
      deadline,
      BEST_GRANULARITY,
      CHECK_EVERY_NODES
    );
    const runtimeMs = Date.now() - start;
    return {
      hash: c.hash,
      pieceId: c.pieceId,
      budgetMs,
      runtimeMs,
      foundPath: result !== null,
      overrun: runtimeMs > budgetMs + OVERRUN_TOLERANCE_MS,
      aborted: runtimeMs >= budgetMs,
    };
  });
}

/** Also runs the unconstrained (no-deadline) arm once -- the ceiling reference every budget is measured against. */
export function runBaselineNoDeadline(cases: readonly InterruptibilityTestCase[]): BudgetSweepRecord[] {
  return cases.map((c) => {
    const start = Date.now();
    const result = bfsMoveWingToPosition(c.edges, c.pieceId, c.targetPosKey, REAL_MAX_DEPTH, c.pins);
    const runtimeMs = Date.now() - start;
    return {
      hash: c.hash,
      pieceId: c.pieceId,
      budgetMs: Infinity,
      runtimeMs,
      foundPath: result !== null,
      overrun: false, // no target to overrun against
      aborted: false,
    };
  });
}

export function runBudgetSweep(
  cases: readonly InterruptibilityTestCase[],
  budgets: readonly number[] = BUDGET_VALUES_MS
): Map<number, BudgetSweepRecord[]> {
  const results = new Map<number, BudgetSweepRecord[]>();
  for (const budgetMs of budgets) {
    results.set(budgetMs, runOneBudget(cases, budgetMs));
  }
  return results;
}

export interface BudgetSweepSummary {
  budgetMs: number;
  n: number;
  avgRuntimeMs: number;
  overrunRate: number;
  abortRate: number; // "Deadline Abort" -- fraction where the deadline actually fired
  completionRate: number; // "Traversal Completion" -- 1 - abortRate
}

export function summarizeBudgetSweep(records: readonly BudgetSweepRecord[]): BudgetSweepSummary {
  const n = records.length;
  const overrunCount = records.filter((r) => r.overrun).length;
  const abortCount = records.filter((r) => r.aborted).length;
  return {
    budgetMs: n ? records[0].budgetMs : 0,
    n,
    avgRuntimeMs: n ? records.reduce((a, r) => a + r.runtimeMs, 0) / n : 0,
    overrunRate: n ? overrunCount / n : 0,
    abortRate: n ? abortCount / n : 0,
    completionRate: n ? 1 - abortCount / n : 0,
  };
}
