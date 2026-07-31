// --- CounterfactualIntegrationSimulation (Multi-Component Merge
// Production Integration Planning Sprint v1, STEP4) -----------------------------
// Design-only -- no new Replay, no Production Solver modification. Uses
// STEP2's own real GateSummary (componentCount>=3 Gate, already joined
// against the Comparative Prototype Sprint v1's real per-case Replay
// result) to estimate expected invocation / expected rescue / duplicate
// success / runtime cost. Interaction-with-existing-Primitives uses real,
// unmodified analyzeCcrGate (solverPrimitiveCCRPrototype/CCRGate.ts) and
// computeStructuralFeatures (recoveryNecessity/StructuralFeatures.ts)
// calls over the real componentCount>=3 subpopulation, not asserted.
import { computeStructuralFeatures } from "../recoveryNecessity/StructuralFeatures";
import { analyzeCcrGate } from "../solverPrimitiveCCRPrototype/CCRGate";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";
import type { GateSummary } from "./GateDesign";

export interface PrimitiveInteractionSummary {
  gateMatchedCount: number;
  ccrOverlapCount: number; // among Gate-matched cases, how many ALSO satisfy CCR's real Gate (analyzeCcrGate)
  ccrOverlapRate: number;
  repairOverlapCount: number; // among Gate-matched cases, how many ALSO satisfy REPAIR's necessary condition (conflictEdgeCount>0)
  repairOverlapRate: number;
}

export function computePrimitiveInteraction(holes: readonly HoleCase[], gateTest: (componentCount: number) => boolean): PrimitiveInteractionSummary {
  const matched = holes.filter((h) => gateTest(computeStructuralFeatures(h.cubies, h.label).componentCount));
  const ccrOverlap = matched.filter((h) => analyzeCcrGate(h.cubies).eligible);
  const repairOverlap = matched.filter((h) => computeStructuralFeatures(h.cubies, h.label).conflictEdgeCount > 0);
  return {
    gateMatchedCount: matched.length,
    ccrOverlapCount: ccrOverlap.length,
    ccrOverlapRate: matched.length ? ccrOverlap.length / matched.length : 0,
    repairOverlapCount: repairOverlap.length,
    repairOverlapRate: matched.length ? repairOverlap.length / matched.length : 0,
  };
}

export interface CounterfactualIntegrationResult {
  populationN: number;
  expectedInvocationCount: number; // gateSummary.matchedCount
  expectedInvocationRate: number;
  expectedRescueCount: number; // gateSummary.newCapabilityCount -- genuinely NEW over what production PARITY_GATED_CYCLE already provides
  expectedRescueRate: number;
  duplicateSuccessCount: number; // gateSummary.duplicateOfProductionCount -- already covered by live PARITY_GATED_CYCLE, would be 0-value re-computation if MCM ran independently on these too (moot once Gate excludes componentCount===2)
  runtimeCostTotalMs: number; // avgRuntimeMs paid once per gate-matched invocation
  runtimeCostPerRescueMs: number;
  interaction: PrimitiveInteractionSummary;
}

export function computeCounterfactualIntegration(
  populationN: number,
  gateSummary: GateSummary,
  avgRuntimeMs: number,
  interaction: PrimitiveInteractionSummary
): CounterfactualIntegrationResult {
  const runtimeCostTotalMs = gateSummary.matchedCount * avgRuntimeMs;
  return {
    populationN,
    expectedInvocationCount: gateSummary.matchedCount,
    expectedInvocationRate: gateSummary.coverage,
    expectedRescueCount: gateSummary.newCapabilityCount,
    expectedRescueRate: populationN ? gateSummary.newCapabilityCount / populationN : 0,
    duplicateSuccessCount: gateSummary.duplicateOfProductionCount,
    runtimeCostTotalMs,
    runtimeCostPerRescueMs: gateSummary.newCapabilityCount ? runtimeCostTotalMs / gateSummary.newCapabilityCount : Infinity,
    interaction,
  };
}
