// --- PopulationClassification (Recovery Necessity Validation Sprint v1)
// -------------------------------------------------------------------------
// Final population split (Required/Optional/Unnecessary) plus RQ-3's
// structural correlation: what shape of state is the "Required" class
// concentrated in?
import type { NecessityGroundTruthRow } from "./NecessityGroundTruth";
import type { RecoveryNecessityFeatures } from "./StructuralFeatures";

export type NecessityClass = "RECOVERY_REQUIRED" | "RECOVERY_OPTIONAL" | "RECOVERY_UNNECESSARY";

export interface ClassifiedCase {
  label: string;
  necessityClass: NecessityClass;
  features: RecoveryNecessityFeatures;
}

export function classifyPopulation(rows: NecessityGroundTruthRow[], featuresByLabel: Map<string, RecoveryNecessityFeatures>): ClassifiedCase[] {
  return rows.map((r) => {
    const necessityClass: NecessityClass = r.requiresRecovery ? "RECOVERY_REQUIRED" : r.recoveryOptional ? "RECOVERY_OPTIONAL" : "RECOVERY_UNNECESSARY";
    const features = featuresByLabel.get(r.label)!;
    return { label: r.label, necessityClass, features };
  });
}

export interface StructuralProfile {
  avgCycleLength: number;
  avgWrongWingCount: number;
  avgConflictEdgeCount: number;
  avgComponentCount: number;
  parityRate: number;
  n: number;
}

function profileOf(cases: ClassifiedCase[]): StructuralProfile {
  const n = cases.length;
  const avg = (f: (c: ClassifiedCase) => number) => (n ? cases.reduce((a, c) => a + f(c), 0) / n : 0);
  return {
    avgCycleLength: avg((c) => c.features.cycleLength),
    avgWrongWingCount: avg((c) => c.features.wrongWingCount),
    avgConflictEdgeCount: avg((c) => c.features.conflictEdgeCount),
    avgComponentCount: avg((c) => c.features.componentCount),
    parityRate: n ? cases.filter((c) => c.features.hasParity).length / n : 0,
    n,
  };
}

export interface PopulationClassificationSummary {
  requiredCount: number;
  optionalCount: number;
  unnecessaryCount: number;
  requiredProfile: StructuralProfile;
  optionalProfile: StructuralProfile;
  unnecessaryProfile: StructuralProfile;
  requiredCaseLabels: string[]; // small population expected -- list directly for inspection
}

export function summarizePopulationClassification(classified: ClassifiedCase[]): PopulationClassificationSummary {
  const required = classified.filter((c) => c.necessityClass === "RECOVERY_REQUIRED");
  const optional = classified.filter((c) => c.necessityClass === "RECOVERY_OPTIONAL");
  const unnecessary = classified.filter((c) => c.necessityClass === "RECOVERY_UNNECESSARY");
  return {
    requiredCount: required.length,
    optionalCount: optional.length,
    unnecessaryCount: unnecessary.length,
    requiredProfile: profileOf(required),
    optionalProfile: profileOf(optional),
    unnecessaryProfile: profileOf(unnecessary),
    requiredCaseLabels: required.map((c) => c.label),
  };
}
