// --- ContractCostProfiler (Solver v3 Primitive Prototype Sprint v1 / BP-5)
// STEP4: Contract Feasibility Report -- real measured cost (STEP3) vs the
// Solver's own Task/Plan budgets. Same disclosed pattern Contract Analysis
// Sprint v1's CostEstimator.ts already used: read-only reference to the
// real Solver's own constants, cited by value (never imported, to avoid
// coupling this analysis-only Prototype to protected files beyond a plain
// numeric citation -- see fiveByFiveEdgeExecutor.ts's TASK_LOCAL_BUDGET_MS
// and fiveByFiveEdgeSolverEngine.ts's PLAN_TIME_BUDGET_MS).
import type { BoundedLookaheadResult } from "./BoundedLookaheadPrototype";

const TASK_LOCAL_BUDGET_MS = 120;
const PLAN_TIME_BUDGET_MS = 1000;

export interface ContractFeasibilityReport {
  candidateCount: number;
  avgBranchingFactor: number;
  maxBranchingFactor: number;
  minBranchingFactor: number;
  avgNodesVisited: number;
  maxNodesVisited: number;
  avgWallTimeMs: number;
  maxWallTimeMs: number;
  deadlineHitRate: number; // fraction of replays that hit the overall per-replay deadline before finishing
  taskLocalBudgetMs: number;
  planTimeBudgetMs: number;
  feasibleWithinTaskBudget: boolean; // avg per-replay wall time <= Task budget -- one BP-5 invocation maps to one Executor Task
  feasibleWithinPlanBudget: boolean; // worst-case (max) per-replay wall time <= Plan budget
  verdict: "PASS" | "FAIL";
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

export function profileContractCost(results: readonly BoundedLookaheadResult[]): ContractFeasibilityReport {
  const allBranchingSamples = results.flatMap((r) => r.branchingFactorSamples);
  const wallTimes = results.map((r) => r.wallTimeMs);
  const nodeCounts = results.map((r) => r.nodesVisited);
  const deadlineHits = results.filter((r) => r.hitOverallDeadline).length;

  const avgWallTimeMs = avg(wallTimes);
  const maxWallTimeMs = wallTimes.length ? Math.max(...wallTimes) : 0;

  const feasibleWithinTaskBudget = avgWallTimeMs <= TASK_LOCAL_BUDGET_MS;
  const feasibleWithinPlanBudget = maxWallTimeMs <= PLAN_TIME_BUDGET_MS;

  return {
    candidateCount: results.length,
    avgBranchingFactor: avg(allBranchingSamples),
    maxBranchingFactor: allBranchingSamples.length ? Math.max(...allBranchingSamples) : 0,
    minBranchingFactor: allBranchingSamples.length ? Math.min(...allBranchingSamples) : 0,
    avgNodesVisited: avg(nodeCounts),
    maxNodesVisited: nodeCounts.length ? Math.max(...nodeCounts) : 0,
    avgWallTimeMs,
    maxWallTimeMs,
    deadlineHitRate: results.length ? deadlineHits / results.length : 0,
    taskLocalBudgetMs: TASK_LOCAL_BUDGET_MS,
    planTimeBudgetMs: PLAN_TIME_BUDGET_MS,
    feasibleWithinTaskBudget,
    feasibleWithinPlanBudget,
    verdict: feasibleWithinTaskBudget && feasibleWithinPlanBudget ? "PASS" : "FAIL",
  };
}
