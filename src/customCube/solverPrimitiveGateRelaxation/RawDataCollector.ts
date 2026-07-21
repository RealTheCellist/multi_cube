// --- RawDataCollector (Gate Relaxation Validation Sprint v1) --------------
// Collects ONE shared raw dataset per run across all 335 current-failure
// snapshots (Primitive Discovery Sprint #2's own recollected dataset),
// measuring the 5 existing research-framework Primitives (BASE/FLIP/CASE/
// PARITY/BP1, via testAllAllowedSingleShot -- UNMODIFIED) plus G0/G1
// (GateRelaxationVariants.ts) simultaneously -- matching the "collect
// once per run, share across all downstream STEPs" discipline every
// prior Sprint in this series has used.
import { cloneCubies, type Cubie } from "../cubeState";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { applySeq, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { testAllAllowedSingleShot, type AllowedPrimitive } from "../solverRepresentationPrototype/RepresentationPrimitiveSelector";
import { runGateRelaxationVariant, countConflictEdges, type GateRelaxationResult } from "./GateRelaxationVariants";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";

const EXISTING_PRIMITIVE_DEADLINE_MS = 300;
const GATE_VARIANT_DEADLINE_MS = 400;

export interface PerReplayRunRecord {
  hash: string;
  primitiveSuccess: Record<AllowedPrimitive, boolean>;
  wasExistingGap: boolean; // all 5 existing Primitives failed
  cycleLength: number; // 0 if no cycle found -- ground truth, independent of G0/G1
  conflictEdgeCount: number; // ground truth
  g0Matched: boolean;
  g0Succeeded: boolean; // matched, moves accepted, net wrongWingCount improvement
  g0Regressed: boolean; // matched, accepted a move, but wrongWingCount increased
  g1Matched: boolean;
  g1Succeeded: boolean;
  g1Regressed: boolean;
}

export type RunRecord = PerReplayRunRecord[];

interface Outcome {
  matched: boolean;
  succeeded: boolean;
  regressed: boolean;
}

function evalOutcome(wrongWingBefore: number, result: GateRelaxationResult, cubies: Cubie[]): Outcome {
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

    const g0Result = runGateRelaxationVariant(cubies, lib, Date.now() + GATE_VARIANT_DEADLINE_MS, "G0_existing");
    const g0 = evalOutcome(wrongWingBefore, g0Result, cubies);
    const g1Result = runGateRelaxationVariant(cubies, lib, Date.now() + GATE_VARIANT_DEADLINE_MS, "G1_relaxed");
    const g1 = evalOutcome(wrongWingBefore, g1Result, cubies);

    return {
      hash: s.hash,
      primitiveSuccess,
      wasExistingGap,
      cycleLength: cycleAnalysis?.cycleLength ?? 0,
      conflictEdgeCount,
      g0Matched: g0.matched,
      g0Succeeded: g0.succeeded,
      g0Regressed: g0.regressed,
      g1Matched: g1.matched,
      g1Succeeded: g1.succeeded,
      g1Regressed: g1.regressed,
    };
  });
}

export function collectMultipleRuns(snapshots: readonly FailureSnapshot[], lib: WingLibrary, libs: ExecutorLibraries, times: number): RunRecord[] {
  const runs: RunRecord[] = [];
  for (let i = 0; i < times; i++) runs.push(collectRun(snapshots, lib, libs));
  return runs;
}
