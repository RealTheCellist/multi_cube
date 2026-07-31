// --- CommonMechanismAnalysis (Solver Primitive Discovery Sprint #5 --
// Unresolved Mechanism Validation Sprint v1, STEP5) --------------------------
// For the TRULY_UNKNOWN residual only: summarizes common structural
// features (reusing StructuralFeatureExtractionV4's own already-computed
// features, unmodified) -- no new Primitive is designed here, only
// feature commonality is measured, per the Directive's own "새 Primitive를
// 설계하지 않는다. Feature만 수집한다."
import type { UnresolvedCase } from "./UnresolvedHoleCollection";
import type { ResidualClassificationResult } from "./ResidualClassification";

export interface CommonMechanismSummary {
  unknownCount: number;
  dominantTaxonomyClass: string | null;
  dominantTaxonomyClassShare: number; // fraction of unknownCount sharing the dominant class
  taxonomyClassBreakdown: Record<string, number>;
  sourceBlueprintBreakdown: Record<string, number>;
  meanCycleCount: number;
  meanCycleLength: number;
  meanConflictEdgeCount: number;
  parityShare: number; // fraction with parityState===true
}

export function summarizeUnknownMechanism(cases: readonly UnresolvedCase[], classifications: readonly ResidualClassificationResult[]): CommonMechanismSummary {
  const unknownLabels = new Set(classifications.filter((c) => c.category === "TRULY_UNKNOWN").map((c) => c.label));
  const unknownCases = cases.filter((c) => unknownLabels.has(c.label));
  const unknownCount = unknownCases.length;

  const taxonomyClassBreakdown: Record<string, number> = {};
  const sourceBlueprintBreakdown: Record<string, number> = {};
  for (const c of unknownCases) {
    const taxClass = c.features.taxonomyClass;
    taxonomyClassBreakdown[taxClass] = (taxonomyClassBreakdown[taxClass] ?? 0) + 1;
    sourceBlueprintBreakdown[c.sourceBlueprint] = (sourceBlueprintBreakdown[c.sourceBlueprint] ?? 0) + 1;
  }

  let dominantTaxonomyClass: string | null = null;
  let dominantCount = 0;
  for (const [cls, count] of Object.entries(taxonomyClassBreakdown)) {
    if (count > dominantCount) {
      dominantCount = count;
      dominantTaxonomyClass = cls;
    }
  }

  const mean = (fn: (c: UnresolvedCase) => number) => (unknownCount > 0 ? unknownCases.reduce((s, c) => s + fn(c), 0) / unknownCount : 0);

  return {
    unknownCount,
    dominantTaxonomyClass,
    dominantTaxonomyClassShare: unknownCount > 0 ? dominantCount / unknownCount : 0,
    taxonomyClassBreakdown,
    sourceBlueprintBreakdown,
    meanCycleCount: mean((c) => c.features.cycleCount),
    meanCycleLength: mean((c) => c.features.cycleLength),
    meanConflictEdgeCount: mean((c) => c.features.conflictEdgeCount),
    parityShare: unknownCount > 0 ? unknownCases.filter((c) => c.features.parityState).length / unknownCount : 0,
  };
}
