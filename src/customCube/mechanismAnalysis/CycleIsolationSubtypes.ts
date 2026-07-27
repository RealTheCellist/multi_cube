// --- CycleIsolationSubtypes (State Taxonomy Sprint v2 STEP1) --------------
// Breaks the Cycle Isolation taxonomy class into subtypes by testing three
// concrete hypotheses the user's directive listed (cycleLength? bridge?
// DFS cutoff?) against the REAL persisted states, not just the bucketed
// cluster key Phase 2 STEP1 had to work with:
//
// 1. Bridge Missing: componentCount > 1 in the WANTS-graph -- the cycle is
//    isolated because no single piece bridges two disjoint components.
// 2. DFS/search cutoff: re-running the capability tester with a 12.5x
//    larger deadline (5000ms vs 400ms) reveals whether more search depth
//    would resolve it -- if a primitive newly succeeds, this is a budget
//    problem, not a structural one.
// 3. Pure structural isolation: neither of the above -- componentCount===1
//    AND extended budget still finds nothing. This is the genuine "no
//    existing mechanism can ever reach this shape" subtype.
import { testAllCapabilities } from "../capabilityAnalysis/primitiveCapabilityTester";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";
import type { CaseStructuralFeatures } from "./CaseTaxonomyClassifier";

export const EXTENDED_BUDGET_MS = 5000; // 12.5x the capability tester's baseline 400ms

export type CycleIsolationSubtype = "BRIDGE_MISSING" | "BUDGET_RECOVERABLE" | "PURE_STRUCTURAL_ISOLATION" | "BRIDGE_MISSING_AND_BUDGET_RECOVERABLE";

export interface CycleIsolationCaseAnalysis {
  label: string;
  componentCount: number;
  longestCycleLength: number;
  wrongWingCount: number;
  extendedBudgetAnyApplicable: boolean; // did extended-budget retest find ANY primitive that succeeds, that didn't at baseline?
  extendedBudgetNewlySucceededPrimitives: string[];
  subtype: CycleIsolationSubtype;
}

export function analyzeCycleIsolationCase(hole: HoleCase, features: CaseStructuralFeatures, libs: ExecutorLibraries): CycleIsolationCaseAnalysis {
  const baselineSucceeded = new Set(hole.capabilityResults.filter((r) => r.succeeded).map((r) => r.primitive));
  const extendedResults = testAllCapabilities(hole.cubies, libs, EXTENDED_BUDGET_MS);
  const extendedSucceeded = extendedResults.filter((r) => r.succeeded).map((r) => r.primitive);
  const newlySucceeded = extendedSucceeded.filter((p) => !baselineSucceeded.has(p));

  const bridgeMissing = features.componentCount > 1;
  const budgetRecoverable = newlySucceeded.length > 0;

  let subtype: CycleIsolationSubtype;
  if (bridgeMissing && budgetRecoverable) subtype = "BRIDGE_MISSING_AND_BUDGET_RECOVERABLE";
  else if (bridgeMissing) subtype = "BRIDGE_MISSING";
  else if (budgetRecoverable) subtype = "BUDGET_RECOVERABLE";
  else subtype = "PURE_STRUCTURAL_ISOLATION";

  return {
    label: hole.label,
    componentCount: features.componentCount,
    longestCycleLength: features.longestCycleLength,
    wrongWingCount: features.wrongWingCount,
    extendedBudgetAnyApplicable: budgetRecoverable,
    extendedBudgetNewlySucceededPrimitives: newlySucceeded,
    subtype,
  };
}

export interface CycleIsolationSummary {
  totalCases: number;
  subtypeCounts: Record<CycleIsolationSubtype, number>;
  cycleLengthDistribution: Record<number, number>;
}

export function summarizeCycleIsolation(analyses: CycleIsolationCaseAnalysis[]): CycleIsolationSummary {
  const subtypeCounts: Record<CycleIsolationSubtype, number> = {
    BRIDGE_MISSING: 0,
    BUDGET_RECOVERABLE: 0,
    PURE_STRUCTURAL_ISOLATION: 0,
    BRIDGE_MISSING_AND_BUDGET_RECOVERABLE: 0,
  };
  const cycleLengthDistribution: Record<number, number> = {};
  for (const a of analyses) {
    subtypeCounts[a.subtype]++;
    cycleLengthDistribution[a.longestCycleLength] = (cycleLengthDistribution[a.longestCycleLength] ?? 0) + 1;
  }
  return { totalCases: analyses.length, subtypeCounts, cycleLengthDistribution };
}
