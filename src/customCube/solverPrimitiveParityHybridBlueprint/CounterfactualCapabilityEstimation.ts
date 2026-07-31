// --- CounterfactualCapabilityEstimation (Parity-Gated Cycle Hybrid
// Primitive Blueprint Sprint v1, STEP4) ----------------------------------------
// Design-only -- no new Replay. Computes Expected Rescue / Upper Bound /
// Duplicate Success directly from STEP1's real OverlapSummary (itself
// derived from the Comparative Prototype Sprint v1's own real 142-case
// Replay), per the Directive's own principle: judge Hybrid viability by
// these overlap-derived numbers, not the raw 11-vs-13 improved counts.
import type { OverlapSummary } from "./CapabilityOverlapAnalysis";

export interface CounterfactualCapabilityResult {
  expectedRescueOverBestSingle: number; // unionSuccessCount - max(dual, multi) -- the ACTUAL marginal gain Hybrid offers beyond just deploying the single better Primitive
  upperBoundSuccessCount: number; // unionSuccessCount -- the absolute best any Hybrid (even a perfect oracle) could achieve
  duplicateSuccessCount: number; // bothCount -- cases where running BOTH is wasted computation (either alone already succeeds)
  bestSinglePrimitive: "DUAL" | "MULTI";
  bestSingleSuccessCount: number;
  marginalRescuePercentOfPopulation: number; // expectedRescueOverBestSingle / totalCases * 100
  extraRuntimeCostForMarginalRescueMs: number; // the OTHER primitive's own avgRuntimeMs, paid on every one of the (duplicateSuccessCount + neitherCount) cases that gain NOTHING from it
}

export function estimateCounterfactualCapability(overlap: OverlapSummary, dualAvgRuntimeMs: number, multiAvgRuntimeMs: number): CounterfactualCapabilityResult {
  const bestSinglePrimitive: "DUAL" | "MULTI" = overlap.multiTotalSuccessCount >= overlap.dualTotalSuccessCount ? "MULTI" : "DUAL";
  const bestSingleSuccessCount = Math.max(overlap.dualTotalSuccessCount, overlap.multiTotalSuccessCount);
  const expectedRescueOverBestSingle = overlap.unionSuccessCount - bestSingleSuccessCount;
  const upperBoundSuccessCount = overlap.unionSuccessCount;
  const duplicateSuccessCount = overlap.bothCount;

  // Running the "extra" primitive (the one NOT already chosen as the
  // best single) still costs its own real runtime on every case where it
  // does not change the outcome -- i.e. all cases except its own
  // exclusive-capability cases.
  const extraPrimitiveAvgRuntimeMs = bestSinglePrimitive === "MULTI" ? dualAvgRuntimeMs : multiAvgRuntimeMs;
  const noGainCaseCount = overlap.totalCases - expectedRescueOverBestSingle;
  const extraRuntimeCostForMarginalRescueMs = noGainCaseCount > 0 ? extraPrimitiveAvgRuntimeMs : 0;

  return {
    expectedRescueOverBestSingle,
    upperBoundSuccessCount,
    duplicateSuccessCount,
    bestSinglePrimitive,
    bestSingleSuccessCount,
    marginalRescuePercentOfPopulation: overlap.totalCases > 0 ? (expectedRescueOverBestSingle / overlap.totalCases) * 100 : 0,
    extraRuntimeCostForMarginalRescueMs,
  };
}
