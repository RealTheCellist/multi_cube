// --- RawDataCollector (Solver Primitive Integration Sprint v2) ------------
// Collects ONE shared raw dataset per run across all 335 current-failure
// snapshots (the same dataset Primitive Discovery Sprint #2 and Gate
// Relaxation Validation Sprint v1 both used), measuring the 5 existing
// research-framework Primitives plus Baseline/Candidate simultaneously --
// the same "collect once per run, share across all downstream STEPs"
// discipline every prior Sprint in this series has used.
import { cloneCubies, type Cubie } from "../cubeState";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { applySeq, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { testAllAllowedSingleShot, type AllowedPrimitive } from "../solverRepresentationPrototype/RepresentationPrimitiveSelector";
import { runGateVariant, countConflictEdges } from "./GateComparisonVariants";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";
import type { SearchRunResult } from "../solverPrimitivePrototypeRefinementV2/SuccessOptimizationV2";

const EXISTING_PRIMITIVE_DEADLINE_MS = 300;
const GATE_VARIANT_DEADLINE_MS = 400;

export interface PerReplayRunRecord {
  hash: string;
  primitiveSuccess: Record<AllowedPrimitive, boolean>;
  wasExistingGap: boolean;
  cycleLength: number;
  conflictEdgeCount: number;
  baselineMatched: boolean;
  baselineSucceeded: boolean;
  baselineRegressed: boolean;
  candidateMatched: boolean;
  candidateSucceeded: boolean;
  candidateRegressed: boolean;
}

export type RunRecord = PerReplayRunRecord[];

interface Outcome {
  matched: boolean;
  succeeded: boolean;
  regressed: boolean;
}

function evalOutcome(wrongWingBefore: number, result: SearchRunResult, cubies: Cubie[]): Outcome {
  if (!result.matched || !result.moves) return { matched: result.matched, succeeded: false, regressed: false };
  const clone = cloneCubies(cubies);
  applySeq(clone, result.moves);
  const wrongWingAfter = wrongWingCount5(clone);
  return { matched: true, succeeded: wrongWingAfter < wrongWingBefore, regressed: wrongWingAfter > wrongWingBefore };
}

export function collectRun(snapshots: readonly FailureSnapshot[], lib: WingLibrary, libs: ExecutorLibraries): RunRecord {
  return snapshots.map((s) => {
    const cubies = deserializeCube(s.cubeState);
    const wrongWingBefore = wrongWingCount5(cubies);
    const primitiveSuccess = testAllAllowedSingleShot(cubies, libs, EXISTING_PRIMITIVE_DEADLINE_MS);
    const wasExistingGap = (Object.keys(primitiveSuccess) as AllowedPrimitive[]).every((p) => !primitiveSuccess[p]);

    const cycleAnalysis = analyzeMultiCycle(cubies);
    const conflictEdgeCount = countConflictEdges(cubies);

    const baselineResult = runGateVariant(cubies, lib, Date.now() + GATE_VARIANT_DEADLINE_MS, "baseline_strictGate");
    const baseline = evalOutcome(wrongWingBefore, baselineResult, cubies);
    const candidateResult = runGateVariant(cubies, lib, Date.now() + GATE_VARIANT_DEADLINE_MS, "candidate_relaxedGate");
    const candidate = evalOutcome(wrongWingBefore, candidateResult, cubies);

    return {
      hash: s.hash,
      primitiveSuccess,
      wasExistingGap,
      cycleLength: cycleAnalysis?.cycleLength ?? 0,
      conflictEdgeCount,
      baselineMatched: baseline.matched,
      baselineSucceeded: baseline.succeeded,
      baselineRegressed: baseline.regressed,
      candidateMatched: candidate.matched,
      candidateSucceeded: candidate.succeeded,
      candidateRegressed: candidate.regressed,
    };
  });
}

export function collectMultipleRuns(snapshots: readonly FailureSnapshot[], lib: WingLibrary, libs: ExecutorLibraries, times: number): RunRecord[] {
  const runs: RunRecord[] = [];
  for (let i = 0; i < times; i++) runs.push(collectRun(snapshots, lib, libs));
  return runs;
}
