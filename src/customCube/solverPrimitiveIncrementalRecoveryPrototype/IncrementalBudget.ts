// --- IncrementalBudget (Incremental Recovery Prototype Sprint v1) ---------
// STEP2. Implements ONLY the Blueprint's adopted `reservedSlice` policy
// (INCREMENTAL_RECOVERY_BLUEPRINT.md section 3) -- fixed/remainingTime/
// adaptiveSlice were already compared and rejected at the Blueprint stage;
// re-implementing them here would be new Budget-policy exploration, which
// this Sprint's work order explicitly forbids ("새 구현 금지 -- reservedSlice만
// 구현").
export const RESERVED_SLICE_MS = 40; // Blueprint's own adopted cap

export interface BudgetAllocation {
  budgetMs: number; // min(remainingTimeAtCapture, RESERVED_SLICE_MS), never negative
  deadline: number; // Date.now() + budgetMs at allocation time
}

export function allocateReservedSlice(remainingTimeMs: number): BudgetAllocation {
  const budgetMs = Math.max(0, Math.min(remainingTimeMs, RESERVED_SLICE_MS));
  return { budgetMs, deadline: Date.now() + budgetMs };
}

export interface BudgetUsageRecord {
  budgetMs: number;
  usedMs: number; // actual wall-clock elapsed during the attempt
  timedOut: boolean; // usedMs >= budgetMs -- the attempt ran until its own deadline
  overrun: boolean; // usedMs exceeded budgetMs by more than a small tolerance -- the search didn't respect its own deadline check promptly
}

// Small allowance for Date.now() polling granularity between DFS node
// expansions inside runCCRPrototype/runSuccessV2 (both check the deadline
// only between candidate branches, not mid-branch) -- not a new policy,
// just a measurement tolerance.
const OVERRUN_TOLERANCE_MS = 5;

export function measureUsage(budgetMs: number, actualElapsedMs: number): BudgetUsageRecord {
  return {
    budgetMs,
    usedMs: actualElapsedMs,
    timedOut: budgetMs > 0 && actualElapsedMs >= budgetMs,
    overrun: actualElapsedMs > budgetMs + OVERRUN_TOLERANCE_MS,
  };
}
