// --- CostEstimator (Solver Contract Analysis Sprint v1) --------------------
// Spec STEP 5: if the "immediate net improvement" contract were relaxed
// into an N-step lookahead (accepting a non-improving move now, betting on
// recovery within N steps -- an EXHAUSTIVE version, trying every candidate
// at every step rather than just the first, since a real implementation
// would need to try more than one branch to reliably find the delayed
// improvement), what would it cost in real, measured terms? Grounded in
// this Sprint's OWN measured branching factor and per-call timing, not
// assumed in the abstract.
export interface CostEstimate {
  measuredAvgBranchingFactor: number; // avg candidateCount per step, from real PairConflictAnalyzer data
  measuredAvgMsPerCandidateCheck: number; // avg enumerateWingCandidates() wall time per call, measured directly
  lookaheadDepth: number;
  estimatedNodesExplored: number; // branchingFactor ^ depth (exhaustive)
  estimatedTimeMs: number;
  taskLocalBudgetMs: number; // fiveByFiveEdgeExecutor.ts's own TASK_LOCAL_BUDGET_MS (120ms), read-only reference
  planTimeBudgetMs: number; // fiveByFiveEdgeSolverEngine.ts's own PLAN_TIME_BUDGET_MS (1000ms), read-only reference
  feasibleWithinTaskBudget: boolean;
  feasibleWithinPlanBudget: boolean;
}

// Read-only references to the real Solver's own existing constants (never
// imported at runtime to avoid coupling this analysis-only Sprint to
// protected files beyond a plain numeric citation -- see
// fiveByFiveEdgeExecutor.ts's TASK_LOCAL_BUDGET_MS and
// fiveByFiveEdgeSolverEngine.ts's PLAN_TIME_BUDGET_MS).
const TASK_LOCAL_BUDGET_MS = 120;
const PLAN_TIME_BUDGET_MS = 1000;

export function estimateCost(avgBranchingFactor: number, avgMsPerCandidateCheck: number, lookaheadDepth: number): CostEstimate {
  const estimatedNodesExplored = Math.pow(avgBranchingFactor, lookaheadDepth);
  const estimatedTimeMs = estimatedNodesExplored * avgMsPerCandidateCheck;

  return {
    measuredAvgBranchingFactor: avgBranchingFactor,
    measuredAvgMsPerCandidateCheck: avgMsPerCandidateCheck,
    lookaheadDepth,
    estimatedNodesExplored,
    estimatedTimeMs,
    taskLocalBudgetMs: TASK_LOCAL_BUDGET_MS,
    planTimeBudgetMs: PLAN_TIME_BUDGET_MS,
    feasibleWithinTaskBudget: estimatedTimeMs <= TASK_LOCAL_BUDGET_MS,
    feasibleWithinPlanBudget: estimatedTimeMs <= PLAN_TIME_BUDGET_MS,
  };
}
