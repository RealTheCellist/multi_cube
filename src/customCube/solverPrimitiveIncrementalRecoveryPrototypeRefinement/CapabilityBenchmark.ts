// --- CapabilityBenchmark (Incremental Recovery Prototype Refinement
// Sprint v1) -------------------------------------------------------------
// STEP5. Three-arm comparison: Baseline (no Incremental Recovery) /
// Prototype v1 configuration (reservedSlice 40ms, no Visited Registry --
// reproduced here through this Sprint's OWN instrumented core rather than
// calling Prototype v1's separate black-box functions, so all 3 arms are
// measured with the exact same instrumentation and are directly,
// consistently comparable -- disclosed methodology choice, not a claim
// that Prototype v1's own files were re-executed) / Prototype Refinement
// (best Budget policy from STEP1 + Visited Registry from STEP4).
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import type { WingLibrary } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { runBaselineMirror, runCandidateMirror, computeTaskLevelMetrics, compareWholeCube, type SolveMirrorResult, type CandidateMirrorResult } from "./TaskLevelEvaluation";
import type { BudgetPolicyId, BudgetPolicyContext } from "./BudgetRefinement";

export type BenchmarkArm = "baseline" | "prototypeV1Config" | "refinement";

export interface ArmMetrics {
  arm: BenchmarkArm;
  n: number;
  coverage: number;
  precision: number;
  recall: number;
  avgRuntimeMs: number;
  deadlineMissRate: number;
  totalDuplicateInvocations: number;
  avgFinalWrongWingCount: number;
}

function summarizeCandidateArm(arm: BenchmarkArm, results: readonly CandidateMirrorResult[]): ArmMetrics {
  const n = results.length;
  const allAttempts = results.flatMap((r) => r.attempts);
  const metrics = computeTaskLevelMetrics(allAttempts);
  const netImprovement = metrics.find((m) => m.name === "netImprovement")!;
  return {
    arm,
    n,
    coverage: netImprovement.coverage,
    precision: netImprovement.precision,
    recall: netImprovement.recall,
    avgRuntimeMs: n ? results.reduce((a, r) => a + r.totalMs, 0) / n : 0,
    deadlineMissRate: n ? results.filter((r) => r.deadlineMissed).length / n : 0,
    totalDuplicateInvocations: results.reduce((a, r) => a + r.duplicateInvocationCount, 0),
    avgFinalWrongWingCount: n ? results.reduce((a, r) => a + r.finalWrongWingCount, 0) / n : 0,
  };
}

function summarizeBaselineArm(results: readonly SolveMirrorResult[]): ArmMetrics {
  const n = results.length;
  return {
    arm: "baseline",
    n,
    coverage: 0,
    precision: 0,
    recall: 0,
    avgRuntimeMs: n ? results.reduce((a, r) => a + r.totalMs, 0) / n : 0,
    deadlineMissRate: n ? results.filter((r) => r.deadlineMissed).length / n : 0,
    totalDuplicateInvocations: 0,
    avgFinalWrongWingCount: n ? results.reduce((a, r) => a + r.finalWrongWingCount, 0) / n : 0,
  };
}

export interface ThreeArmRun {
  baseline: SolveMirrorResult[];
  prototypeV1Config: CandidateMirrorResult[];
  refinement: CandidateMirrorResult[];
}

export function runThreeArms(
  snapshots: readonly FailureSnapshot[],
  libs: ExecutorLibraries,
  lib: WingLibrary,
  refinementPolicy: BudgetPolicyId,
  policyCtx: Omit<BudgetPolicyContext, "remainingTimeMs">,
): ThreeArmRun {
  const baseline: SolveMirrorResult[] = [];
  const prototypeV1Config: CandidateMirrorResult[] = [];
  const refinement: CandidateMirrorResult[] = [];

  for (const s of snapshots) {
    const cubies = deserializeCube(s.cubeState);
    baseline.push(runBaselineMirror(cubies, libs));
    prototypeV1Config.push(runCandidateMirror(cubies, libs, lib, "reservedSlice", policyCtx, false));
    refinement.push(runCandidateMirror(cubies, libs, lib, refinementPolicy, policyCtx, true));
  }

  return { baseline, prototypeV1Config, refinement };
}

export interface ThreeArmSummary {
  baseline: ArmMetrics;
  prototypeV1Config: ArmMetrics;
  refinement: ArmMetrics;
  taskLevelImprovement: { arm: BenchmarkArm; wholeCube: ReturnType<typeof compareWholeCube> }[];
}

export function summarizeThreeArms(run: ThreeArmRun): ThreeArmSummary {
  return {
    baseline: summarizeBaselineArm(run.baseline),
    prototypeV1Config: summarizeCandidateArm("prototypeV1Config", run.prototypeV1Config),
    refinement: summarizeCandidateArm("refinement", run.refinement),
    taskLevelImprovement: [
      { arm: "prototypeV1Config", wholeCube: compareWholeCube(run.baseline, run.prototypeV1Config) },
      { arm: "refinement", wholeCube: compareWholeCube(run.baseline, run.refinement) },
    ],
  };
}
