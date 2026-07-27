// --- SearchSpaceEstimation (CCR Completeness Validation Sprint v1,
// Required Analysis #4 + Measurement's "estimatedBranch^Depth vs
// MAX_LEAVES_EXPLORED") -----------------------------------------------------
import { MAX_LEAVES_EXPLORED } from "../solverV2Prototype/BoundedResolver";
import type { ShadowDfsInstrumentation } from "./CCRShadowInstrumentation";

export interface SearchSpaceEstimateRow {
  label: string;
  cycleLength: number;
  avgBranchingFactor: number; // mean of ShadowDfsInstrumentation.perHopBranchCounts -- a REAL measured average across every hop actually visited during this case's own DFS, not a first-hop-only probe
  estimatedSearchTree: number; // avgBranchingFactor ^ cycleLength
  maxLeavesExplored: number; // MAX_LEAVES_EXPLORED, read directly from BoundedResolver.ts -- never hardcoded separately
  ratioToLeafCap: number; // estimatedSearchTree / MAX_LEAVES_EXPLORED
}

export function estimateSearchSpace(label: string, cycleLength: number, instrumentation: ShadowDfsInstrumentation): SearchSpaceEstimateRow {
  const avgBranchingFactor = instrumentation.perHopBranchCounts.length
    ? instrumentation.perHopBranchCounts.reduce((a, b) => a + b, 0) / instrumentation.perHopBranchCounts.length
    : 0;
  const estimatedSearchTree = avgBranchingFactor > 0 ? Math.pow(avgBranchingFactor, cycleLength) : 0;
  return {
    label,
    cycleLength,
    avgBranchingFactor,
    estimatedSearchTree,
    maxLeavesExplored: MAX_LEAVES_EXPLORED,
    ratioToLeafCap: MAX_LEAVES_EXPLORED > 0 ? estimatedSearchTree / MAX_LEAVES_EXPLORED : 0,
  };
}
