// --- RawDataCollectorV2 (Solver Primitive Prototype Refinement Sprint v2)
// Collects ONE shared raw dataset per run for this Sprint's own variant
// set (V0_baseline=A1_wideCycle, V1_wideCycle5, W1_reordered,
// W2_widerHop) plus the 5 existing Primitives' success -- reused by the
// Majority-Vote Gap classification and paired-diff CI analysis, matching
// the "collect once per run, share across all downstream analysis"
// discipline established across Refinement Sprint v1 and both
// Evaluation Stabilization Sprints.
import { cloneCubies } from "../cubeState";
import type { Cubie } from "../cubeState";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { applySeq, wrongWingCount5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { testAllAllowedSingleShot, type AllowedPrimitive } from "../solverRepresentationPrototype/RepresentationPrimitiveSelector";
import { runGateV2, V0_BASELINE, V1_WIDE_CYCLE_5 } from "./GateExpansionV2";
import { runSuccessV2, W1_REORDERED, W2_WIDER_HOP } from "./SuccessOptimizationV2";

const EXISTING_PRIMITIVE_DEADLINE_MS = 300;

export const VARIANT_NAMES = ["V0_baseline", "V1_wideCycle5", "W1_reordered", "W2_widerHop"] as const;
export type VariantName = (typeof VARIANT_NAMES)[number];

export interface PerReplayRunRecordV2 {
  hash: string;
  primitiveSuccess: Record<AllowedPrimitive, boolean>;
  variantMatched: Record<VariantName, boolean>;
  variantSucceeded: Record<VariantName, boolean>; // implies matched=true, net wrongWingCount improvement
  variantRegressed: Record<VariantName, boolean>; // matched, accepted a move, but wrongWingCount increased (should never happen -- checked empirically anyway)
}

export type RunRecordV2 = PerReplayRunRecordV2[];

interface Outcome {
  matched: boolean;
  succeeded: boolean;
  regressed: boolean;
}

function evalOutcome(wrongWingBefore: number, result: { matched: boolean; moves: Move[] | null }, cubies: Cubie[]): Outcome {
  if (!result.matched || !result.moves) return { matched: result.matched, succeeded: false, regressed: false };
  const clone = cloneCubies(cubies);
  applySeq(clone, result.moves);
  const wrongWingAfter = wrongWingCount5(clone);
  return { matched: true, succeeded: wrongWingAfter < wrongWingBefore, regressed: wrongWingAfter > wrongWingBefore };
}

export function collectRunV2(snapshots: readonly FailureSnapshot[], lib: WingLibrary, libs: ExecutorLibraries, deadlineMs: number): RunRecordV2 {
  return snapshots.map((s) => {
    const cubies = deserializeCube(s.cubeState);
    const wrongWingBefore = wrongWingCount5(cubies);
    const primitiveSuccess = testAllAllowedSingleShot(cubies, libs, EXISTING_PRIMITIVE_DEADLINE_MS);

    const v0 = evalOutcome(wrongWingBefore, runGateV2(cubies, lib, Date.now() + deadlineMs, V0_BASELINE), cubies);
    const v1 = evalOutcome(wrongWingBefore, runGateV2(cubies, lib, Date.now() + deadlineMs, V1_WIDE_CYCLE_5), cubies);
    const w1 = evalOutcome(wrongWingBefore, runSuccessV2(cubies, lib, Date.now() + deadlineMs, W1_REORDERED), cubies);
    const w2 = evalOutcome(wrongWingBefore, runSuccessV2(cubies, lib, Date.now() + deadlineMs, W2_WIDER_HOP), cubies);

    const outcomes: Record<VariantName, Outcome> = { V0_baseline: v0, V1_wideCycle5: v1, W1_reordered: w1, W2_widerHop: w2 };

    const variantMatched = {} as Record<VariantName, boolean>;
    const variantSucceeded = {} as Record<VariantName, boolean>;
    const variantRegressed = {} as Record<VariantName, boolean>;
    for (const name of VARIANT_NAMES) {
      variantMatched[name] = outcomes[name].matched;
      variantSucceeded[name] = outcomes[name].succeeded;
      variantRegressed[name] = outcomes[name].regressed;
    }

    return { hash: s.hash, primitiveSuccess, variantMatched, variantSucceeded, variantRegressed };
  });
}

export function collectMultipleRunsV2(snapshots: readonly FailureSnapshot[], lib: WingLibrary, libs: ExecutorLibraries, deadlineMs: number, times: number): RunRecordV2[] {
  const runs: RunRecordV2[] = [];
  for (let i = 0; i < times; i++) runs.push(collectRunV2(snapshots, lib, libs, deadlineMs));
  return runs;
}
