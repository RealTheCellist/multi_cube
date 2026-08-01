// --- ValidationFramework (Multi-Component Merge Production Integration
// Refinement Sprint v2, STEP5 continued) ---------------------------------------
// Composes Gate A/B/C/E (solverPostReleaseValidationFramework/ReleaseGates.ts,
// UNMODIFIED) + decideFromGates (ValidationPipeline.ts, UNMODIFIED), Category
// B ("Performance Optimization" -- "Runtime/Budget 조정, 알고리즘 결과 자체는
// 불변", ChangeClassification.ts's own category, requiredGates=[A,B,C] --
// fits this Sprint exactly since only the outer deadline/Budget Contract is
// varied, the Primitive/Scheduler themselves are untouched), applied to the
// Arm C vs Arm A comparison (this Sprint's own key question: does extending
// the outer deadline to 2000ms recover Capability?).
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
  const spec = getCategorySpec("B"); // Performance Optimization (Runtime/Budget adjustment, requiredGates=[A,B,C])
  const pipelineResult = decideFromGates(spec, comparison.n, gateResults, "production");

  return { gateResults, pipelineResult };
}
