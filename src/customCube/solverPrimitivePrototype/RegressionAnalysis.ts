// --- RegressionAnalysis (Solver Primitive Prototype Sprint v3) -----------
// STEP4: three distinct checks the work order's "기존 성공 사례 악화
// 여부" covers together --
//   (a) TRUE regression: does any accepted v3 move ever increase
//       wrongWingCount vs the state before it ran? (DeferredValidator's
//       own accept-only-on-improvement gate should make this impossible
//       by construction -- this checks that empirically, not just by
//       reading the code.)
//   (b) Coverage narrowing vs v2: v3's gate (cycleLength 2~3 AND
//       conflictEdgeCount>0) is a strict SUBSET of v2's gate (cycleLength
//       2~3 only, MultiHopBridgePrototype.ts, UNMODIFIED). Replays v2
//       used to succeed on purely because of the (now-excluded)
//       conflictEdgeCount==0 slice are no longer attempted by v3 at all --
//       not a "regression" (v3 never claims to handle them, and skipping
//       is not making them worse), but honestly disclosed as lost
//       Coverage, distinct from Level3's "rescued from Gap" measurement.
//   (c) Rescued-from-Gap: same "existing 5 Primitives all fail"
//       cross-reference PrototypeBenchmark.ts (Prototype Sprint v2)
//       established, reused here via testAllAllowedSingleShot
//       (unmodified) for v3's own Level3 criterion.
import { cloneCubies } from "../cubeState";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { applySeq, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { testAllAllowedSingleShot, type AllowedPrimitive } from "../solverRepresentationPrototype/RepresentationPrimitiveSelector";
import { tryMultiHopBridge } from "./MultiHopBridgePrototype";
import { tryMultiHopBridgeV3 } from "./MultiHopBridgePrototypeV3";

const EXISTING_PRIMITIVE_DEADLINE_MS = 300;

function existingPrimitivesAllFail(cubies: ReturnType<typeof deserializeCube>, libs: ExecutorLibraries): boolean {
  const success = testAllAllowedSingleShot(cubies, libs, EXISTING_PRIMITIVE_DEADLINE_MS);
  return (Object.keys(success) as AllowedPrimitive[]).every((p) => !success[p]);
}

export interface RegressionRecord {
  hash: string;
  v3Succeeded: boolean;
  v2OnlySucceeded: boolean; // v2 succeeded but v3's tighter gate excludes this replay
  wasExistingGap: boolean;
  rescuedByV3: boolean;
  trueRegression: boolean; // v3 accepted a move that increased wrongWingCount (should never happen)
}

export interface RegressionSummary {
  totalReplays: number;
  trueRegressionCount: number;
  v2OnlySuccessCount: number; // Coverage narrowing, disclosed separately from regression
  rescuedByV3Count: number;
  gapTotal: number;
}

export function analyzeRegression(snapshots: readonly FailureSnapshot[], lib: WingLibrary, libs: ExecutorLibraries, deadlineMs: number): { records: RegressionRecord[]; summary: RegressionSummary } {
  const records: RegressionRecord[] = snapshots.map((s) => {
    const cubies = deserializeCube(s.cubeState);
    const wrongWingBefore = wrongWingCount5(cubies);
    const wasExistingGap = existingPrimitivesAllFail(cubies, libs);

    const v3Result = tryMultiHopBridgeV3(cubies, lib, Date.now() + deadlineMs);
    let v3Succeeded = false;
    let trueRegression = false;
    if (v3Result.moves) {
      const clone = cloneCubies(cubies);
      applySeq(clone, v3Result.moves);
      const wrongWingAfter = wrongWingCount5(clone);
      v3Succeeded = wrongWingAfter < wrongWingBefore;
      trueRegression = wrongWingAfter > wrongWingBefore;
    }

    let v2OnlySucceeded = false;
    if (!v3Succeeded) {
      const v2Result = tryMultiHopBridge(cubies, lib, Date.now() + deadlineMs);
      if (v2Result.moves) {
        const clone = cloneCubies(cubies);
        applySeq(clone, v2Result.moves);
        v2OnlySucceeded = wrongWingCount5(clone) < wrongWingBefore;
      }
    }

    return {
      hash: s.hash,
      v3Succeeded,
      v2OnlySucceeded,
      wasExistingGap,
      rescuedByV3: v3Succeeded && wasExistingGap,
      trueRegression,
    };
  });

  return {
    records,
    summary: {
      totalReplays: records.length,
      trueRegressionCount: records.filter((r) => r.trueRegression).length,
      v2OnlySuccessCount: records.filter((r) => r.v2OnlySucceeded).length,
      rescuedByV3Count: records.filter((r) => r.rescuedByV3).length,
      gapTotal: records.filter((r) => r.wasExistingGap).length,
    },
  };
}
