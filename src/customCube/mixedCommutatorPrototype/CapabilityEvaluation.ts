// --- CapabilityEvaluation (Mixed Commutator Prototype Sprint v1,
// Required Analysis #1, Deliverable #1) --------------------------------------
import type { MixedCommutatorPrototypeResult } from "./MixedCommutatorPrototype";

export interface CaseResult {
  label: string;
  populationTag: "PRIMARY" | "SECONDARY_ONLY" | "REGRESSION";
  budgetMs: number;
  result: MixedCommutatorPrototypeResult;
  runtimeMs: number;
}

export interface CapabilitySummary {
  populationTag: string;
  budgetMs: number;
  n: number;
  solvedCount: number;
  successRate: number;
  lowFootprintCount: number; // solved cases with footprintRatio <= 2.0
  lowFootprintRate: number; // relative to solvedCount
}

const FOOTPRINT_RATIO_TARGET = 2.0; // same disclosed bar this whole arc uses

export function summarizeCapability(populationTag: string, budgetMs: number, cases: CaseResult[]): CapabilitySummary {
  const solved = cases.filter((c) => !!c.result.moves);
  const lowFootprint = solved.filter((c) => c.result.footprintRatio !== null && c.result.footprintRatio <= FOOTPRINT_RATIO_TARGET);
  return {
    populationTag,
    budgetMs,
    n: cases.length,
    solvedCount: solved.length,
    successRate: cases.length ? solved.length / cases.length : 0,
    lowFootprintCount: lowFootprint.length,
    lowFootprintRate: solved.length ? lowFootprint.length / solved.length : 0,
  };
}

export { FOOTPRINT_RATIO_TARGET };
