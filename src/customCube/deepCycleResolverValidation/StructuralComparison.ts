// --- StructuralComparison (Deep Cycle Resolver Validation Sprint v1,
// "Structural Comparison" deliverable) -------------------------------------
// RECOVERY_REQUIRED vs RECOVERY_OPTIONAL vs RECOVERY_UNNECESSARY, across
// both the already-established features (cycleLength/wrongWing/conflict/
// component/parity, from Recovery Necessity Validation Sprint v1) and this
// Sprint's 3 new topology metrics (dependencyDepth/bridgeDistance/
// branchingFactor).
import type { DeepCycleStructuralProfile } from "./StructuralProfile";
import type { NecessityClass } from "../recoveryNecessity/PopulationClassification";

export interface GroupAverage {
  necessityClass: NecessityClass;
  n: number;
  avgCycleLength: number;
  avgCycleCount: number;
  avgComponentCount: number;
  avgWrongWingCount: number;
  avgConflictEdgeCount: number;
  avgSwapEdgeCount: number;
  avgDependencyDepth: number;
  avgBridgeDistance: number;
  avgBranchingFactor: number;
  parityRate: number;
  singleCycleShare: number; // share of cases whose cycleTopology.isSingleCycle is true
}

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function summarizeGroup(necessityClass: NecessityClass, profiles: DeepCycleStructuralProfile[]): GroupAverage {
  return {
    necessityClass,
    n: profiles.length,
    avgCycleLength: avg(profiles.map((p) => p.cycleLength)),
    avgCycleCount: avg(profiles.map((p) => p.cycleCount)),
    avgComponentCount: avg(profiles.map((p) => p.componentCount)),
    avgWrongWingCount: avg(profiles.map((p) => p.wrongWingCount)),
    avgConflictEdgeCount: avg(profiles.map((p) => p.conflictEdgeCount)),
    avgSwapEdgeCount: avg(profiles.map((p) => p.swapEdgeCount)),
    avgDependencyDepth: avg(profiles.map((p) => p.dependencyDepth)),
    avgBridgeDistance: avg(profiles.map((p) => p.bridgeDistance)),
    avgBranchingFactor: avg(profiles.map((p) => p.branchingFactor)),
    parityRate: profiles.length ? profiles.filter((p) => p.hasParity).length / profiles.length : 0,
    singleCycleShare: profiles.length ? profiles.filter((p) => p.cycleTopology.isSingleCycle).length / profiles.length : 0,
  };
}

export interface StructuralComparisonResult {
  required: GroupAverage;
  optional: GroupAverage;
  unnecessary: GroupAverage;
}

export function buildStructuralComparison(
  requiredProfiles: DeepCycleStructuralProfile[],
  optionalProfiles: DeepCycleStructuralProfile[],
  unnecessaryProfiles: DeepCycleStructuralProfile[]
): StructuralComparisonResult {
  return {
    required: summarizeGroup("RECOVERY_REQUIRED", requiredProfiles),
    optional: summarizeGroup("RECOVERY_OPTIONAL", optionalProfiles),
    unnecessary: summarizeGroup("RECOVERY_UNNECESSARY", unnecessaryProfiles),
  };
}
