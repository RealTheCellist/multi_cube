// --- CapabilityEvaluation (Move Representation Prototype Sprint v1,
// Required Analysis #1, Deliverable #1/#2) -----------------------------------
import type { AdaptiveCycleCommutatorResult } from "./AdaptiveCycleCommutatorPrototype";

export interface CaseResult {
  label: string;
  populationTag: "PRIMARY" | "SECONDARY_ONLY" | "REGRESSION";
  result: AdaptiveCycleCommutatorResult;
}

export interface CapabilitySummary {
  populationTag: string;
  n: number;
  solvedCount: number;
  successRate: number;
  baselineSolvedCount: number; // CCR's own known baseline on this population
  coverageDelta: number; // solvedCount - baselineSolvedCount
}

export function summarizeCapability(populationTag: string, cases: CaseResult[], baselineSolvedCount: number): CapabilitySummary {
  const solved = cases.filter((c) => !!c.result.moves);
  return {
    populationTag,
    n: cases.length,
    solvedCount: solved.length,
    successRate: cases.length ? solved.length / cases.length : 0,
    baselineSolvedCount,
    coverageDelta: solved.length - baselineSolvedCount,
  };
}
