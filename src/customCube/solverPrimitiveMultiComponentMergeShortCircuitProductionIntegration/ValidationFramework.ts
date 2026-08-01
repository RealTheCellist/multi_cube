// --- ValidationFramework (Multi-Component Merge Short-Circuit Production
// Integration Sprint v1, STEP6) -----------------------------------------------
// Composes Gate A/B/C/E (solverPostReleaseValidationFramework/ReleaseGates.ts,
// UNMODIFIED) + decideFromGates (ValidationPipeline.ts, UNMODIFIED). Uses
// Category C ("New Primitive", requiredGates=[A,B,C,E]) -- not because this
// is literally a new Primitive, but because the Directive's own STEP6 asks
// for exactly Gate A/B/C/E, which is Category C's requiredGates list
// byte-for-byte; Category A ("Bug Fix") would only require Gates A+C.
import { evaluateGateA, evaluateGateB, evaluateGateC, evaluateGateE, type GateResult } from "../solverPostReleaseValidationFramework/ReleaseGates";
import { getCategorySpec } from "../solverPostReleaseValidationFramework/ChangeClassification";
import { decideFromGates, type PipelineResult } from "../solverPostReleaseValidationFramework/ValidationPipeline";
import type { PairwiseComparison } from "./StatisticalValidation";

export interface FrameworkValidationResult {
  gateResults: GateResult[];
  pipelineResult: PipelineResult;
}

export function runValidationFramework(comparison: PairwiseComparison, duplicateCount: number, starvedTypeCount: number): FrameworkValidationResult {
  const gateA = evaluateGateA(comparison.trueRegressionDiff, comparison.trueRegressionDiff);
  const gateB = evaluateGateB(comparison.runtimeDiffMs, Math.max(1, comparison.baselineP95RuntimeMs));
  const gateC = evaluateGateC(comparison.improvedCountDiff, true);
  const gateE = evaluateGateE({ duplicateCount, starvedTypeCount });

  const gateResults = [gateA, gateB, gateC, gateE];
  const spec = getCategorySpec("C");
  const pipelineResult = decideFromGates(spec, comparison.n, gateResults, "production");

  return { gateResults, pipelineResult };
}
