// --- RepresentationClassifier (Solver Representation Prototype Sprint v1)
// STEP1/STEP2: classifies all 150 replays under the 3 Representations this
// research series has produced so far -- Rescue-Structural Hybrid
// (Representation Blueprint Sprint v1's winner), Coarse Structural Shape,
// and Exact Shape Key (BP-4) -- using the EXACT SAME, unmodified
// computation functions those Sprints already built and measured. "Blueprint
// Sprint와 동일 계산 사용" per this Sprint's own work order: no
// recomputation of the Representation's own definition, only its
// application to classify the (still-unchanged) 150-replay Dataset.
import { cloneCubies } from "../cubeState";
import { applySeq, buildWingLibrary, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import { computeCycleShape } from "../solverV2PrototypeBP4/CycleShapeHasher";
import { computeCoarseShapeKey } from "../solverV3Research/StateRepresentationCandidates";
import { computeRescueStructuralHybridKey } from "../solverRepresentationBlueprint/RepresentationCandidates";
import { profileAllReplays, type ReplayGapProfile } from "../solverV2Research/GapDetector";
import { tryBoundedMultiCycleResolver } from "../solverV2Prototype/BoundedResolver";
import { tryParityAwareCycleBreaker } from "../solverV2PrototypeBP2/ParityAwareResolver";
import { tryNonParityStructuralFix } from "../solverV2PrototypeBP3/NonParityStructuralFix";

const CLASSIFY_DEADLINE_MS = 500;

function testResolver(
  resolver: (cubies: ReturnType<typeof deserializeCube>, lib: WingLibrary, deadline: number) => ReturnType<typeof tryBoundedMultiCycleResolver>,
  snapshot: FailureSnapshot,
  lib: WingLibrary,
): boolean {
  const cubies = deserializeCube(snapshot.cubeState);
  const before = wrongWingCount5(cubies);
  const clone = cloneCubies(cubies);
  const fix = resolver(clone, lib, Date.now() + CLASSIFY_DEADLINE_MS);
  if (!fix || fix.length === 0) return false;
  applySeq(clone, fix);
  return wrongWingCount5(clone) < before;
}

export interface ReplayRepresentations {
  hash: string;
  rescueHybrid: string;
  coarse: string;
  exact: string;
}

export function classifyAllReplays(failuresDbPath: string, gapDeadlineMs: number): ReplayRepresentations[] {
  const all150 = loadAll75(failuresDbPath);
  const profiles: ReplayGapProfile[] = profileAllReplays(failuresDbPath, gapDeadlineMs);
  const profileByHash = new Map(profiles.map((p) => [p.replayHash, p]));
  const lib = buildWingLibrary();

  return all150.map((snapshot) => {
    const cubies = deserializeCube(snapshot.cubeState);
    const profile = profileByHash.get(snapshot.hash);
    const bp1 = testResolver(tryBoundedMultiCycleResolver, snapshot, lib);
    const bp2 = testResolver(tryParityAwareCycleBreaker, snapshot, lib);
    const bp3 = testResolver(tryNonParityStructuralFix, snapshot, lib);

    return {
      hash: snapshot.hash,
      rescueHybrid: computeRescueStructuralHybridKey(cubies, profile, bp1, bp2, bp3),
      coarse: computeCoarseShapeKey(cubies),
      exact: computeCycleShape(cubies).shapeKey,
    };
  });
}

export interface RepresentationDistribution {
  representation: string;
  uniqueGroups: number;
  totalReplays: number;
  topGroups: { key: string; count: number }[]; // top 5 largest groups
}

function distributionOf(representation: string, keys: readonly string[]): RepresentationDistribution {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  const sorted = [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  return { representation, uniqueGroups: counts.size, totalReplays: keys.length, topGroups: sorted.slice(0, 5) };
}

export function summarizeDistributions(representations: readonly ReplayRepresentations[]): RepresentationDistribution[] {
  return [
    distributionOf("Rescue-Structural Hybrid", representations.map((r) => r.rescueHybrid)),
    distributionOf("Coarse Structural Shape", representations.map((r) => r.coarse)),
    distributionOf("Exact Shape Key (BP-4)", representations.map((r) => r.exact)),
  ];
}
