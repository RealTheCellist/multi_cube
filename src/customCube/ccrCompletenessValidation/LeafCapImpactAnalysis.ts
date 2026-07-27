// --- LeafCapImpactAnalysis (CCR Completeness Validation Sprint v1,
// Deliverable #3) ------------------------------------------------------------
import type { DeepCycleStructuralProfile } from "../deepCycleResolverValidation/StructuralProfile";
import type { PerCaseCompletenessRow } from "./CompletenessMatrix";
import type { SearchSpaceEstimateRow } from "./SearchSpaceEstimation";

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export interface LeafCapImpactSummary {
  affectedCount: number; // terminationReason === LEAF_CAP_REACHED
  totalGatePassed: number;
  affectedShare: number;
  affectedAvgRatioToLeafCap: number; // avg estimatedSearchTree/MAX_LEAVES_EXPLORED among affected cases
  unaffectedAvgRatioToLeafCap: number; // same, among non-leaf-cap-bound cases (for contrast)
  affectedAvgCycleLength: number;
  affectedAvgBranchingFactor: number;
  affectedLabels: string[];
}

export function analyzeLeafCapImpact(
  completenessRows: PerCaseCompletenessRow[],
  searchSpaceRows: SearchSpaceEstimateRow[],
  profileByLabel: Map<string, DeepCycleStructuralProfile>
): LeafCapImpactSummary {
  const affected = completenessRows.filter((r) => r.terminationReason === "LEAF_CAP_REACHED");
  const unaffected = completenessRows.filter((r) => r.terminationReason !== "LEAF_CAP_REACHED");
  const searchSpaceByLabel = new Map(searchSpaceRows.map((s) => [s.label, s]));

  const affectedRatios = affected.map((r) => searchSpaceByLabel.get(r.label)?.ratioToLeafCap ?? 0);
  const unaffectedRatios = unaffected.map((r) => searchSpaceByLabel.get(r.label)?.ratioToLeafCap ?? 0);
  const affectedCycleLengths = affected.map((r) => profileByLabel.get(r.label)?.cycleLength ?? 0);
  const affectedBranching = affected.map((r) => searchSpaceByLabel.get(r.label)?.avgBranchingFactor ?? 0);

  return {
    affectedCount: affected.length,
    totalGatePassed: completenessRows.length,
    affectedShare: completenessRows.length ? affected.length / completenessRows.length : 0,
    affectedAvgRatioToLeafCap: avg(affectedRatios),
    unaffectedAvgRatioToLeafCap: avg(unaffectedRatios),
    affectedAvgCycleLength: avg(affectedCycleLengths),
    affectedAvgBranchingFactor: avg(affectedBranching),
    affectedLabels: affected.map((r) => r.label),
  };
}
