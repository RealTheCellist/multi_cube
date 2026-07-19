// --- PrototypeBenchmark (Solver Primitive Prototype Sprint v2) -----------
// Verification items 2-5: runs both Prototypes on the real 150-replay
// Dataset, measuring Success Rate, Failure Pattern, Regression, and
// execution cost. Also cross-references against the 5 EXISTING allowed
// Primitives' own single-shot test (solverRepresentationPrototype/
// RepresentationPrimitiveSelector.ts's testAllAllowedSingleShot, existing/
// unmodified) to determine whether a Prototype's success represents
// genuinely NEW capability (rescuing a replay all 5 existing Primitives
// already fail on) or just overlaps what BASE/FLIP/CASE/PARITY/BP-1
// already cover.
import { cloneCubies } from "../cubeState";
import { applySeq, buildCaseLibrary, buildFlipLibrary, buildWingLibrary, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import { testAllAllowedSingleShot, type AllowedPrimitive } from "../solverRepresentationPrototype/RepresentationPrimitiveSelector";
import { tryMultiHopBridge } from "./MultiHopBridgePrototype";
import { tryConflictDominantSacrifice } from "./ConflictDominantSacrificePrototype";
import { checkPreconditions, type PreconditionCheck } from "./ContractValidator";

const PROTOTYPE_DEADLINE_MS = 400;
const EXISTING_PRIMITIVE_DEADLINE_MS = 300;

export interface SingleRunResult {
  hash: string;
  matchesPrecondition: boolean;
  wasExistingGap: boolean; // all 5 EXISTING allowed Primitives already failed here
  activated: boolean; // Prototype produced a non-empty move sequence
  succeeded: boolean; // net wrongWingCount improvement after applying it
  rescuedFromGap: boolean; // succeeded AND wasExistingGap
  wrongWingBefore: number;
  wrongWingAfter: number;
  regression: boolean;
  timeMs: number;
  failureReason: string;
  costLeavesExplored?: number;
  costConflictEdgesTried?: number;
}

function existingPrimitivesAllFail(cubies: ReturnType<typeof deserializeCube>, libs: ExecutorLibraries): boolean {
  const success = testAllAllowedSingleShot(cubies, libs, EXISTING_PRIMITIVE_DEADLINE_MS);
  return (Object.keys(success) as AllowedPrimitive[]).every((p) => !success[p]);
}

export function runMultiHopBridgeOn(snapshots: readonly FailureSnapshot[], preconditions: readonly PreconditionCheck[], lib: WingLibrary, libs: ExecutorLibraries): SingleRunResult[] {
  const preByHash = new Map(preconditions.map((p) => [p.hash, p]));
  return snapshots.map((s) => {
    const cubies = deserializeCube(s.cubeState);
    const wrongWingBefore = wrongWingCount5(cubies);
    const wasExistingGap = existingPrimitivesAllFail(cubies, libs);

    const startedAt = Date.now();
    const result = tryMultiHopBridge(cubies, lib, startedAt + PROTOTYPE_DEADLINE_MS);
    const timeMs = Date.now() - startedAt;

    const activated = !!result.moves && result.moves.length > 0;
    let wrongWingAfter = wrongWingBefore;
    if (activated) {
      const clone = cloneCubies(cubies);
      applySeq(clone, result.moves!);
      wrongWingAfter = wrongWingCount5(clone);
    }
    const succeeded = wrongWingAfter < wrongWingBefore;
    const failureReason = succeeded ? "succeeded" : !result.hadCycle ? "no_cycle" : !result.inBand ? "out_of_band" : "deferred_validation_rejected_or_deadline";

    return {
      hash: s.hash,
      matchesPrecondition: preByHash.get(s.hash)?.matchesMultiHopBridge ?? false,
      wasExistingGap,
      activated,
      succeeded,
      rescuedFromGap: succeeded && wasExistingGap,
      wrongWingBefore,
      wrongWingAfter,
      regression: wrongWingAfter > wrongWingBefore,
      timeMs,
      failureReason,
      costLeavesExplored: result.leavesExplored,
    };
  });
}

export function runConflictSacrificeOn(snapshots: readonly FailureSnapshot[], preconditions: readonly PreconditionCheck[], lib: WingLibrary, libs: ExecutorLibraries): SingleRunResult[] {
  const preByHash = new Map(preconditions.map((p) => [p.hash, p]));
  return snapshots.map((s) => {
    const cubies = deserializeCube(s.cubeState);
    const wrongWingBefore = wrongWingCount5(cubies);
    const wasExistingGap = existingPrimitivesAllFail(cubies, libs);

    const startedAt = Date.now();
    const result = tryConflictDominantSacrifice(cubies, lib, startedAt + PROTOTYPE_DEADLINE_MS);
    const timeMs = Date.now() - startedAt;

    const activated = !!result.moves && result.moves.length > 0;
    let wrongWingAfter = wrongWingBefore;
    if (activated) {
      const clone = cloneCubies(cubies);
      applySeq(clone, result.moves!);
      wrongWingAfter = wrongWingCount5(clone);
    }
    const succeeded = wrongWingAfter < wrongWingBefore;
    const lastStage = result.attempts.length > 0 ? result.attempts[result.attempts.length - 1].stage : "no_conflict_edge";
    const failureReason = succeeded ? "succeeded" : lastStage;

    return {
      hash: s.hash,
      matchesPrecondition: preByHash.get(s.hash)?.matchesConflictSacrifice ?? false,
      wasExistingGap,
      activated,
      succeeded,
      rescuedFromGap: succeeded && wasExistingGap,
      wrongWingBefore,
      wrongWingAfter,
      regression: wrongWingAfter > wrongWingBefore,
      timeMs,
      failureReason,
      costConflictEdgesTried: result.attempts.length,
    };
  });
}

export function buildLibs(): { lib: WingLibrary; libs: ExecutorLibraries } {
  const lib = buildWingLibrary();
  const libs: ExecutorLibraries = { lib, flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };
  return { lib, libs };
}

export { checkPreconditions };
export function loadDataset(failuresDbPath: string): FailureSnapshot[] {
  return loadAll75(failuresDbPath);
}
