// --- VisitedRegistry (Incremental Recovery Prototype Refinement Sprint
// v1) -------------------------------------------------------------------
// STEP4. Prototype Sprint v1 found 2315 Duplicate Invocation occurrences
// (the same cube state, reached via two different PAIR task slots within
// one solve, both triggering an Incremental Recovery attempt) -- a real
// instance of the Blueprint's own flagged risk (INCREMENTAL_RECOVERY_BLUEPRINT.md
// section 5.4: per-task caps alone don't share visited-state information
// across DIFFERENT task slots in the same solve). TaskLevelEvaluation.ts's
// runCandidateMirror() already implements the fix as a `useVisitedRegistry`
// flag (a solve-scoped Set<number> of state hashes, shared across all task
// slots) -- this module runs the SAME population with the flag off vs on
// and reports the before/after effect.
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import type { WingLibrary } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { runCandidateMirror, type CandidateMirrorResult } from "./TaskLevelEvaluation";
import type { BudgetPolicyId, BudgetPolicyContext } from "./BudgetRefinement";

export interface VisitedRegistryComparisonRow {
  useVisitedRegistry: boolean;
  n: number;
  totalDuplicateInvocations: number;
  avgDuplicateInvocationsPerSolve: number;
  avgTotalMs: number;
  avgFinalWrongWingCount: number; // lower = better -- the Capability signal
  successfulAttemptsCount: number; // sum of appliedNetImprovement across all solves -- Regression-adjacent proxy: does skipping duplicates cost any real successes?
}

function summarizeRun(results: readonly CandidateMirrorResult[], useVisitedRegistry: boolean): VisitedRegistryComparisonRow {
  const n = results.length;
  const totalDuplicateInvocations = results.reduce((a, r) => a + r.duplicateInvocationCount, 0);
  const successfulAttemptsCount = results.reduce((a, r) => a + r.attempts.filter((x) => x.appliedNetImprovement).length, 0);
  return {
    useVisitedRegistry,
    n,
    totalDuplicateInvocations,
    avgDuplicateInvocationsPerSolve: n ? totalDuplicateInvocations / n : 0,
    avgTotalMs: n ? results.reduce((a, r) => a + r.totalMs, 0) / n : 0,
    avgFinalWrongWingCount: n ? results.reduce((a, r) => a + r.finalWrongWingCount, 0) / n : 0,
    successfulAttemptsCount,
  };
}

export interface VisitedRegistryComparison {
  withoutRegistry: VisitedRegistryComparisonRow;
  withRegistry: VisitedRegistryComparisonRow;
  duplicateReductionRate: number; // 1 - (with.totalDuplicateInvocations / without.totalDuplicateInvocations)
  capabilityDelta: number; // without.avgFinalWrongWingCount - with.avgFinalWrongWingCount -- positive means the registry HELPS (lower final wrongWingCount)
  regressionCount: number; // solves where WITH the registry finalWrongWingCount got WORSE than WITHOUT
}

export function compareVisitedRegistry(
  snapshots: readonly FailureSnapshot[],
  libs: ExecutorLibraries,
  lib: WingLibrary,
  policy: BudgetPolicyId,
  policyCtx: Omit<BudgetPolicyContext, "remainingTimeMs">,
): VisitedRegistryComparison {
  const withoutResults: CandidateMirrorResult[] = [];
  const withResults: CandidateMirrorResult[] = [];

  for (const s of snapshots) {
    const cubies = deserializeCube(s.cubeState);
    withoutResults.push(runCandidateMirror(cubies, libs, lib, policy, policyCtx, false));
    withResults.push(runCandidateMirror(cubies, libs, lib, policy, policyCtx, true));
  }

  const withoutRegistry = summarizeRun(withoutResults, false);
  const withRegistry = summarizeRun(withResults, true);

  let regressionCount = 0;
  for (let i = 0; i < withoutResults.length; i++) {
    if (withResults[i].finalWrongWingCount > withoutResults[i].finalWrongWingCount) regressionCount++;
  }

  return {
    withoutRegistry,
    withRegistry,
    duplicateReductionRate: withoutRegistry.totalDuplicateInvocations ? 1 - withRegistry.totalDuplicateInvocations / withoutRegistry.totalDuplicateInvocations : 0,
    capabilityDelta: withoutRegistry.avgFinalWrongWingCount - withRegistry.avgFinalWrongWingCount,
    regressionCount,
  };
}
