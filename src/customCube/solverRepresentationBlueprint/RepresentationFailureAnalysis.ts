// --- RepresentationFailureAnalysis (Solver Representation Blueprint Sprint
// v1) -------------------------------------------------------------------
// STEP1: quantifies which Hard Gap replays each of the 3 EXISTING
// Representations (Exact Shape Key/Coarse Structural Shape/Capability
// Fingerprint -- all reused unmodified from solverV3Research/ and
// solverRepresentationReview/'s own already-measured code paths) fail to
// explain, on the 150-replay Dataset.
//
// "설명하지 못한다" is operationalized concretely: a Hard Gap replay is
// UNEXPLAINED by a Representation if, among the WHOLE 150-replay dataset
// (not just other Hard Gaps), no OTHER Hard Gap replay shares its key.
// A Representation that leaves a Hard Gap replay unexplained gives a
// Primitive designer nothing to generalize from -- that single state
// looks structurally unlike every other hard state under this grain, so
// no Primitive could be designed to cover it plus similar cases.
//
// Hard Gap itself reuses GapDetector.ts's own `isHardGap` definition
// (existing, unmodified) -- the same definition Dataset Roadmap Sprint's
// "Hard Gap rate 42.7%" and every later Sprint's Hard Gap citations use.
import { cloneCubies } from "../cubeState";
import { applySeq, buildWingLibrary, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import { computeCycleShape } from "../solverV2PrototypeBP4/CycleShapeHasher";
import { computeCoarseShapeKey, computeCapabilityFingerprintKey } from "../solverV3Research/StateRepresentationCandidates";
import { profileAllReplays, type ReplayGapProfile } from "../solverV2Research/GapDetector";
import { tryBoundedMultiCycleResolver } from "../solverV2Prototype/BoundedResolver";
import { tryParityAwareCycleBreaker } from "../solverV2PrototypeBP2/ParityAwareResolver";
import { tryNonParityStructuralFix } from "../solverV2PrototypeBP3/NonParityStructuralFix";

const FINGERPRINT_DEADLINE_MS = 500;

function testResolver(
  resolver: (cubies: ReturnType<typeof deserializeCube>, lib: WingLibrary, deadline: number) => ReturnType<typeof tryBoundedMultiCycleResolver>,
  snapshot: FailureSnapshot,
  lib: WingLibrary,
): boolean {
  const cubies = deserializeCube(snapshot.cubeState);
  const before = wrongWingCount5(cubies);
  const clone = cloneCubies(cubies);
  const fix = resolver(clone, lib, Date.now() + FINGERPRINT_DEADLINE_MS);
  if (!fix || fix.length === 0) return false;
  applySeq(clone, fix); // resolvers return a move sequence, they don't mutate their input in place
  return wrongWingCount5(clone) < before;
}

export interface RepresentationFailureResult {
  representation: string;
  hardGapTotal: number;
  hardGapExplained: number; // shares its key with >=1 other Hard Gap
  hardGapUnexplained: number; // singleton among Hard Gaps under this key
  hardGapUnexplainedRate: number;
  usableClusterCount: number; // distinct keys among Hard Gaps with size>=2
  avgUsableClusterSize: number;
}

export function analyzeOneRepresentation(representation: string, allKeys: readonly string[], hardGapFlags: readonly boolean[]): RepresentationFailureResult {
  const groupCounts = new Map<string, number>();
  for (const k of allKeys) groupCounts.set(k, (groupCounts.get(k) ?? 0) + 1);

  const hardGapKeys = allKeys.filter((_, i) => hardGapFlags[i]);
  const hardGapTotal = hardGapKeys.length;

  const hardGapGroupCounts = new Map<string, number>();
  for (const k of hardGapKeys) hardGapGroupCounts.set(k, (hardGapGroupCounts.get(k) ?? 0) + 1);

  const hardGapExplained = hardGapKeys.filter((k) => (hardGapGroupCounts.get(k) ?? 0) >= 2).length;
  const hardGapUnexplained = hardGapTotal - hardGapExplained;
  const usableClusters = [...hardGapGroupCounts.entries()].filter(([, c]) => c >= 2);

  return {
    representation,
    hardGapTotal,
    hardGapExplained,
    hardGapUnexplained,
    hardGapUnexplainedRate: hardGapTotal ? hardGapUnexplained / hardGapTotal : 0,
    usableClusterCount: usableClusters.length,
    avgUsableClusterSize: usableClusters.length ? usableClusters.reduce((a, [, c]) => a + c, 0) / usableClusters.length : 0,
  };
}

export interface RepresentationFailureAnalysisReport {
  totalReplays: number;
  hardGapTotal: number;
  hardGapRate: number;
  exact: RepresentationFailureResult;
  coarse: RepresentationFailureResult;
  fingerprint: RepresentationFailureResult;
  summary: string;
}

export function analyzeRepresentationFailures(failuresDbPath: string, gapDeadlineMs: number): RepresentationFailureAnalysisReport {
  const all150 = loadAll75(failuresDbPath);
  const profiles: ReplayGapProfile[] = profileAllReplays(failuresDbPath, gapDeadlineMs);
  const profileByHash = new Map(profiles.map((p) => [p.replayHash, p]));
  const lib = buildWingLibrary();

  const exactKeys: string[] = [];
  const coarseKeys: string[] = [];
  const fingerprintKeys: string[] = [];
  const hardGapFlags: boolean[] = [];

  for (const snapshot of all150) {
    const cubies = deserializeCube(snapshot.cubeState);
    exactKeys.push(computeCycleShape(cubies).shapeKey);
    coarseKeys.push(computeCoarseShapeKey(cubies));

    const profile = profileByHash.get(snapshot.hash);
    const bp1 = testResolver(tryBoundedMultiCycleResolver, snapshot, lib);
    const bp2 = testResolver(tryParityAwareCycleBreaker, snapshot, lib);
    const bp3 = testResolver(tryNonParityStructuralFix, snapshot, lib);
    fingerprintKeys.push(
      profile
        ? computeCapabilityFingerprintKey(profile, bp1, bp2, bp3)
        : computeCapabilityFingerprintKey({ succeeded: { BASE: false, FLIP: false, CASE: false, PARITY: false, RECOVERY: false, CYCLECHASE: false } } as ReplayGapProfile, bp1, bp2, bp3),
    );
    hardGapFlags.push(profile ? profile.isHardGap : false);
  }

  const exact = analyzeOneRepresentation("Exact Shape Key (BP-4)", exactKeys, hardGapFlags);
  const coarse = analyzeOneRepresentation("Coarse Structural Shape", coarseKeys, hardGapFlags);
  const fingerprint = analyzeOneRepresentation("Capability Fingerprint", fingerprintKeys, hardGapFlags);

  const hardGapTotal = hardGapFlags.filter(Boolean).length;

  const summary =
    `Hard Gap ${hardGapTotal}/${all150.length}건(${((hardGapTotal / all150.length) * 100).toFixed(1)}%) 중 ` +
    `Exact Shape Key는 ${(exact.hardGapUnexplainedRate * 100).toFixed(1)}%를, Coarse Shape는 ${(coarse.hardGapUnexplainedRate * 100).toFixed(1)}%를, ` +
    `Capability Fingerprint는 ${(fingerprint.hardGapUnexplainedRate * 100).toFixed(1)}%를 설명하지 못한다(다른 Hard Gap과 전혀 묶이지 않는 단일 상태로 남음).`;

  return { totalReplays: all150.length, hardGapTotal, hardGapRate: all150.length ? hardGapTotal / all150.length : 0, exact, coarse, fingerprint, summary };
}
