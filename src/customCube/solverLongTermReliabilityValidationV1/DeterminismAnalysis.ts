// --- DeterminismAnalysis (Solver Long-term Reliability Validation
// Sprint v1, STEP5) -------------------------------------------------------
// Real repeated solve() calls on the SAME fixed input (no shuffle -- the
// Hole Dataset's own cubies are a fixed snapshot, not re-scrambled per
// call) to characterize how much real outcome variance exists purely from
// Date.now()-based timing (Recovery's own reservedBudget/genDeadline
// mechanics are wall-clock-driven, so two calls starting at slightly
// different real timestamps can walk different candidate-generation
// paths even with byte-identical input state).
import { solveE2EProbe, type SolveE2EProbeResult } from "../solverPrimitiveMultiComponentMergeValidationMethodology/SharedProbes";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export interface DeterminismCaseResult {
  label: string;
  repeats: SolveE2EProbeResult[];
  allChosenTypesIdentical: boolean;
  allImprovedIdentical: boolean;
  allWrongWingAfterIdentical: boolean;
  distinctChosenTypes: string[];
  distinctWrongWingAfter: number[];
}

export function runDeterminismAnalysis(cases: readonly HoleCase[], repeatCount: number): DeterminismCaseResult[] {
  return cases.map((hole) => {
    const repeats: SolveE2EProbeResult[] = [];
    for (let i = 0; i < repeatCount; i++) {
      repeats.push(solveE2EProbe(hole, 250));
    }
    const distinctChosenTypes = [...new Set(repeats.map((r) => r.chosenType))];
    const distinctWrongWingAfter = [...new Set(repeats.map((r) => r.wrongWingAfter))];
    return {
      label: hole.label,
      repeats,
      allChosenTypesIdentical: distinctChosenTypes.length === 1,
      allImprovedIdentical: new Set(repeats.map((r) => r.improved)).size === 1,
      allWrongWingAfterIdentical: distinctWrongWingAfter.length === 1,
      distinctChosenTypes,
      distinctWrongWingAfter,
    };
  });
}
