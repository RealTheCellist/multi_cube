// --- RawDataCollector (Solver Primitive Evaluation Stabilization Sprint
// v1) -- collects ONE shared raw dataset per run, reused by every STEP
// module below, instead of each STEP re-running testAllAllowedSingleShot
// independently (the exact anti-pattern Refinement Sprint v1 disclosed
// and fixed). Reuses testAllAllowedSingleShot (solverRepresentationPrototype/
// RepresentationPrimitiveSelector, UNMODIFIED) for the 5 existing
// Primitives' per-replay success, and runGateVariant + GATE_VARIANTS[0]/[1]
// (solverPrimitivePrototypeRefinement/GateExpansionVariants, UNMODIFIED --
// this Sprint touches ZERO Prototype/Solver/Planner/Executor/Recovery/
// Primitive code, evaluation code only) for the baseline(A0)/candidate(A1)
// worked example STEP3/4 need.
import { cloneCubies } from "../cubeState";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { applySeq, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { testAllAllowedSingleShot, type AllowedPrimitive } from "../solverRepresentationPrototype/RepresentationPrimitiveSelector";
import { GATE_VARIANTS, runGateVariant, type GateVariant } from "../solverPrimitivePrototypeRefinement/GateExpansionVariants";

const EXISTING_PRIMITIVE_DEADLINE_MS = 300;

const A0: GateVariant = GATE_VARIANTS[0]; // baseline: cycleLength 2~3 AND conflictEdgeCount>0
const A1: GateVariant = GATE_VARIANTS[1]; // candidate: cycleLength 2~4 AND conflictEdgeCount>0 (Refinement Sprint v1's own reproducible partial signal)

export interface PerReplayRunRecord {
  hash: string;
  primitiveSuccess: Record<AllowedPrimitive, boolean>;
  wasExistingGap: boolean; // all 5 existing Primitives failed
  baselineSucceeded: boolean; // A0 succeeded on this replay this run
  a1Succeeded: boolean; // A1_wideCycle succeeded on this replay this run
}

export type RunRecord = PerReplayRunRecord[];

function checkVariantSuccess(cubies: ReturnType<typeof deserializeCube>, lib: WingLibrary, variant: GateVariant, deadlineMs: number): boolean {
  const wrongWingBefore = wrongWingCount5(cubies);
  const result = runGateVariant(cubies, lib, Date.now() + deadlineMs, variant);
  if (!result.matched || !result.moves) return false;
  const clone = cloneCubies(cubies);
  applySeq(clone, result.moves);
  return wrongWingCount5(clone) < wrongWingBefore;
}

export function collectRun(snapshots: readonly FailureSnapshot[], lib: WingLibrary, libs: ExecutorLibraries, deadlineMs: number): RunRecord {
  return snapshots.map((s) => {
    const cubies = deserializeCube(s.cubeState);
    const primitiveSuccess = testAllAllowedSingleShot(cubies, libs, EXISTING_PRIMITIVE_DEADLINE_MS);
    const wasExistingGap = (Object.keys(primitiveSuccess) as AllowedPrimitive[]).every((p) => !primitiveSuccess[p]);
    const baselineSucceeded = checkVariantSuccess(cubies, lib, A0, deadlineMs);
    const a1Succeeded = checkVariantSuccess(cubies, lib, A1, deadlineMs);
    return { hash: s.hash, primitiveSuccess, wasExistingGap, baselineSucceeded, a1Succeeded };
  });
}

export function collectMultipleRuns(snapshots: readonly FailureSnapshot[], lib: WingLibrary, libs: ExecutorLibraries, deadlineMs: number, times: number): RunRecord[] {
  const runs: RunRecord[] = [];
  for (let i = 0; i < times; i++) runs.push(collectRun(snapshots, lib, libs, deadlineMs));
  return runs;
}
