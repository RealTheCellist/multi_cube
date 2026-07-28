// --- SearchCostEvaluation (Move Representation Prototype Sprint v1,
// Measurement: expandedStates/generatedMoves/runtime/averageDepth) ---------
import type { CaseResult } from "./CapabilityEvaluation";

export interface SearchCostSummary {
  avgLeavesExplored: number;
  avgMaxDepthReached: number;
  avgRuntimeMs: number;
}

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function summarizeSearchCost(cases: (CaseResult & { runtimeMs: number })[]): SearchCostSummary {
  return {
    avgLeavesExplored: avg(cases.map((c) => c.result.leavesExplored)),
    avgMaxDepthReached: avg(cases.map((c) => c.result.maxDepthReached)),
    avgRuntimeMs: avg(cases.map((c) => c.runtimeMs)),
  };
}
