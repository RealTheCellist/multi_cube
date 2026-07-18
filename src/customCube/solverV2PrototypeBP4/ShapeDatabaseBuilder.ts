// --- ShapeDatabaseBuilder (Solver v2 Primitive Prototype Sprint v4) ------
// STEP 2: groups real Replays by Shape Key and records, PER SHAPE, how each
// of the four existing Primitives (CycleChase/BP-1/BP-2/BP-3) actually
// performed -- no brute force, no new search: "실제 Replay 결과를 그대로
// 재사용한다" is implemented literally, by reusing BP-2/BP-3's own
// ReplayBenchmark.ts run functions (unmodified) to get the REAL measured
// outcome of each existing Primitive on each real Replay, then joining
// that with each Replay's Shape Key.
import type { WingLibrary } from "../fiveByFiveEdges";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import {
  runBoundedResolverOn,
  runCycleChaseOn,
  runNonParityStructuralOn,
  runParityAwareOn,
  type SingleRunResult,
} from "../solverV2PrototypeBP3/ReplayBenchmark";
import { computeCycleShape } from "./CycleShapeHasher";

export const PRIMITIVE_NAMES = ["BP1", "CycleChase", "BP3", "BP2"] as const;
export type PrimitiveName = (typeof PRIMITIVE_NAMES)[number];

export interface PrimitiveOutcome {
  improved: boolean;
  wrongWingDelta: number; // after - before, negative is good
}

export interface ShapeDatabaseRow {
  hash: string;
  shapeKey: string;
  outcomes: Record<PrimitiveName, PrimitiveOutcome>;
}

function toOutcome(r: SingleRunResult): PrimitiveOutcome {
  return { improved: r.wrongWingAfter < r.wrongWingBefore, wrongWingDelta: r.wrongWingAfter - r.wrongWingBefore };
}

/**
 * Builds one row per snapshot: its Shape Key (computed fresh from the real
 * cube state) plus the REAL measured outcome of all four existing
 * Primitives on that exact state (reusing BP-3's own benchmark runners,
 * unmodified -- these already do their own real move search/application,
 * nothing here is fabricated or interpolated).
 */
export function buildShapeDatabase(snapshots: readonly FailureSnapshot[], lib: WingLibrary, deadlineMs: number): ShapeDatabaseRow[] {
  const cycleChase = runCycleChaseOn(snapshots, lib, deadlineMs);
  const bp1 = runBoundedResolverOn(snapshots, lib, deadlineMs);
  const bp2 = runParityAwareOn(snapshots, lib, deadlineMs);
  const bp3 = runNonParityStructuralOn(snapshots, lib, deadlineMs);

  return snapshots.map((snapshot, i) => {
    const cubies = deserializeCube(snapshot.cubeState);
    const shape = computeCycleShape(cubies);
    return {
      hash: snapshot.hash,
      shapeKey: shape.shapeKey,
      outcomes: {
        BP1: toOutcome(bp1[i]),
        CycleChase: toOutcome(cycleChase[i]),
        BP3: toOutcome(bp3[i]),
        BP2: toOutcome(bp2[i]),
      },
    };
  });
}
