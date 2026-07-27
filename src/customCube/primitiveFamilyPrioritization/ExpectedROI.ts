// --- ExpectedROI (Primitive Family Prioritization Sprint v1, RQ-3/RQ-4,
// Required Analysis #3) ------------------------------------------------------
import type { ResidualFailureClass } from "../primitiveSetCompleteness/ResidualFailureTaxonomy";
import type { PriorArtTestResult } from "./PriorArtReuseTest";
import type { OverlapDimension, OverlapMatrixResult } from "./OverlapMatrix";

export interface FamilyROI {
  failureClass: ResidualFailureClass;
  populationSize: number; // n within the 53-case residual
  shareOfResidual: number;
  shareOfTotalPopulation: number; // n / 142
  structuralIndependenceRate: number; // from OverlapMatrix -- share of this family's own condition-satisfying cases that satisfy ONLY this condition
  priorArtRealSuccessRate: number; // measured, not estimated -- existing prototype tested directly against these residual cases
  priorArtName: string;
  estimatedCoverageGainIfFullySolved: number; // populationSize / 142 (upper-bound structural estimate per Directive's own RQ-3 framing)
}

const DIMENSION_BY_CLASS: Record<string, OverlapDimension> = {
  BRIDGE_MISSING: "BRIDGE_MISSING",
  PURE_CYCLE_ISOLATION: "PURE_CYCLE_ISOLATION",
  CONFLICT_DEEP_DEPENDENCY: "CONFLICT_DEEP_DEPENDENCY",
};

export function buildFamilyROI(failureClass: ResidualFailureClass, n: number, totalResidual: number, totalPopulation: number, overlap: OverlapMatrixResult, priorArt: PriorArtTestResult): FamilyROI {
  const dimension = DIMENSION_BY_CLASS[failureClass];
  return {
    failureClass,
    populationSize: n,
    shareOfResidual: totalResidual ? n / totalResidual : 0,
    shareOfTotalPopulation: totalPopulation ? n / totalPopulation : 0,
    structuralIndependenceRate: dimension ? overlap.structuralIndependenceRate[dimension] : 0,
    priorArtRealSuccessRate: priorArt.successRate,
    priorArtName: priorArt.priorArtName,
    estimatedCoverageGainIfFullySolved: totalPopulation ? n / totalPopulation : 0,
  };
}
