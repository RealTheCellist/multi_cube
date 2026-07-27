// --- OverlapMatrix (Primitive Family Prioritization Sprint v1, RQ-2,
// Required Analysis #2) ------------------------------------------------------
// ResidualFailureTaxonomy.ts's classifier assigns each residual case to
// exactly ONE bucket (first-match-wins over BRIDGE_MISSING ->
// PURE_CYCLE_ISOLATION -> CONFLICT_DEEP_DEPENDENCY), so the buckets are
// disjoint BY CONSTRUCTION -- that alone doesn't prove the underlying
// CAPABILITIES are independent. This module re-checks each family's own
// RAW defining condition against every residual case (not just its
// assigned bucket) to measure genuine co-occurrence: does a case that
// happens to land in BRIDGE_MISSING also independently satisfy
// PURE_CYCLE_ISOLATION's or CONFLICT_DEEP_DEPENDENCY's own condition?
import type { DeepCycleStructuralProfile } from "../deepCycleResolverValidation/StructuralProfile";
import type { ResidualFailureClass } from "../primitiveSetCompleteness/ResidualFailureTaxonomy";

export type OverlapDimension = "BRIDGE_MISSING" | "PURE_CYCLE_ISOLATION" | "CONFLICT_DEEP_DEPENDENCY";
const DIMENSIONS: OverlapDimension[] = ["BRIDGE_MISSING", "PURE_CYCLE_ISOLATION", "CONFLICT_DEEP_DEPENDENCY"];

function satisfiesCondition(dimension: OverlapDimension, profile: DeepCycleStructuralProfile): boolean {
  if (dimension === "BRIDGE_MISSING") return profile.componentCount > 1;
  if (dimension === "PURE_CYCLE_ISOLATION") return profile.cycleCount >= 1 && profile.conflictEdgeCount === 0;
  return profile.conflictEdgeCount > 0; // CONFLICT_DEEP_DEPENDENCY
}

export interface OverlapCell {
  rowDimension: OverlapDimension;
  colDimension: OverlapDimension;
  coOccurrenceCount: number; // cases satisfying BOTH conditions (diagonal = cases satisfying that condition alone, at minimum)
}

export interface OverlapMatrixResult {
  cells: OverlapCell[];
  perDimensionSatisfiedCount: Record<OverlapDimension, number>;
  exclusivelyOneConditionCount: number; // cases satisfying EXACTLY one of the 3 raw conditions
  multiConditionCount: number; // cases satisfying 2 or more raw conditions simultaneously
  structuralIndependenceRate: Record<OverlapDimension, number>; // per dimension: share of its satisfying cases that satisfy ONLY that condition (no other)
}

export function buildOverlapMatrix(profiles: DeepCycleStructuralProfile[]): OverlapMatrixResult {
  const cells: OverlapCell[] = [];
  for (const row of DIMENSIONS) {
    for (const col of DIMENSIONS) {
      const count = profiles.filter((p) => satisfiesCondition(row, p) && satisfiesCondition(col, p)).length;
      cells.push({ rowDimension: row, colDimension: col, coOccurrenceCount: count });
    }
  }

  const perDimensionSatisfiedCount: Record<OverlapDimension, number> = {
    BRIDGE_MISSING: profiles.filter((p) => satisfiesCondition("BRIDGE_MISSING", p)).length,
    PURE_CYCLE_ISOLATION: profiles.filter((p) => satisfiesCondition("PURE_CYCLE_ISOLATION", p)).length,
    CONFLICT_DEEP_DEPENDENCY: profiles.filter((p) => satisfiesCondition("CONFLICT_DEEP_DEPENDENCY", p)).length,
  };

  let exclusivelyOneConditionCount = 0;
  let multiConditionCount = 0;
  const exclusiveByDimension: Record<OverlapDimension, number> = { BRIDGE_MISSING: 0, PURE_CYCLE_ISOLATION: 0, CONFLICT_DEEP_DEPENDENCY: 0 };
  for (const p of profiles) {
    const satisfied = DIMENSIONS.filter((d) => satisfiesCondition(d, p));
    if (satisfied.length === 1) {
      exclusivelyOneConditionCount++;
      exclusiveByDimension[satisfied[0]]++;
    } else if (satisfied.length >= 2) {
      multiConditionCount++;
    }
  }

  const structuralIndependenceRate: Record<OverlapDimension, number> = {
    BRIDGE_MISSING: perDimensionSatisfiedCount.BRIDGE_MISSING ? exclusiveByDimension.BRIDGE_MISSING / perDimensionSatisfiedCount.BRIDGE_MISSING : 0,
    PURE_CYCLE_ISOLATION: perDimensionSatisfiedCount.PURE_CYCLE_ISOLATION ? exclusiveByDimension.PURE_CYCLE_ISOLATION / perDimensionSatisfiedCount.PURE_CYCLE_ISOLATION : 0,
    CONFLICT_DEEP_DEPENDENCY: perDimensionSatisfiedCount.CONFLICT_DEEP_DEPENDENCY ? exclusiveByDimension.CONFLICT_DEEP_DEPENDENCY / perDimensionSatisfiedCount.CONFLICT_DEEP_DEPENDENCY : 0,
  };

  return { cells, perDimensionSatisfiedCount, exclusivelyOneConditionCount, multiConditionCount, structuralIndependenceRate };
}
