// --- ValidationFramework (Multi-Component Merge Production Validation
// Sprint v1, STEP5) --------------------------------------------------------------
// Composes Gate A/B/C/E (solverPostReleaseValidationFramework/ReleaseGates.ts,
// UNMODIFIED) + decideFromGates (ValidationPipeline.ts, UNMODIFIED). Category
// C ("New Primitive", requiredGates=[A,B,C,E]) -- same choice the
// Short-Circuit Production Integration Sprint made, matching the Directive's
// own explicit STEP5 Gate list (A/B/C/E) exactly.
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
