// --- ReplayBenchmark (Solver v2 Primitive Prototype Sprint v4) -----------
// STEP 5: CycleChase vs BP-1 vs BP-2 vs BP-3 vs BP-4 (Cycle-Shape Lookup),
// all on the exact same real states. The first four run functions are
// re-exported UNMODIFIED from BP-3's own ReplayBenchmark.ts (same numbers
// this whole series has already reported), so this file only adds what's
// new: `runCycleShapeLookupOn`, which performs leave-one-out per Replay
// (see ShapeLookupTable.ts) before calling BP-4's resolver.
import { cloneCubies } from "../cubeState";
import { applySeq, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf, hasParity } from "../goalPlanner/GoalAnalyzer";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import {
  loadAll75,
  runBoundedResolverOn,
  runCycleChaseOn,
  runNonParityStructuralOn,
  runParityAwareOn,
  summarize,
  type BenchmarkSummary,
  type SingleRunResult,
} from "../solverV2PrototypeBP3/ReplayBenchmark";
import type { ShapeDatabaseRow } from "./ShapeDatabaseBuilder";
import { tryCycleShapeLookup } from "./CycleShapeResolver";

export { loadAll75, runBoundedResolverOn, runCycleChaseOn, runNonParityStructuralOn, runParityAwareOn, summarize };
export type { BenchmarkSummary, SingleRunResult };

function runShapeLookupOne(snapshot: FailureSnapshot, rows: readonly ShapeDatabaseRow[], lib: WingLibrary, deadlineMs: number): SingleRunResult {
  const cubies = deserializeCube(snapshot.cubeState);
  const wrongWingBefore = wrongWingCount5(cubies);
  const pairBefore = pairCountOf(cubies);
  const parityBefore = hasParity(cubies);

  const startedAt = Date.now();
  const fix = tryCycleShapeLookup(cubies, lib, startedAt + deadlineMs, rows, snapshot.hash); // excludeHash: leave-one-out
  const timeMs = Date.now() - startedAt;

  if (!fix) {
    return { hash: snapshot.hash, activated: false, wrongWingBefore, wrongWingAfter: wrongWingBefore, pairBefore, pairAfter: pairBefore, parityBefore, parityAfter: parityBefore, timeMs, regression: false };
  }

  applySeq(cubies, fix);
  const wrongWingAfter = wrongWingCount5(cubies);
  const pairAfter = pairCountOf(cubies);
  const parityAfter = hasParity(cubies);

  return {
    hash: snapshot.hash,
    activated: true,
    wrongWingBefore,
    wrongWingAfter,
    pairBefore,
    pairAfter,
    parityBefore,
    parityAfter,
    timeMs,
    regression: pairAfter < pairBefore || wrongWingAfter > wrongWingBefore,
  };
}

export function runCycleShapeLookupOn(snapshots: readonly FailureSnapshot[], rows: readonly ShapeDatabaseRow[], lib: WingLibrary, deadlineMs: number): SingleRunResult[] {
  return snapshots.map((s) => runShapeLookupOne(s, rows, lib, deadlineMs));
}
