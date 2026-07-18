// --- SparseWrongnessDetector (Solver v3 Primitive Prototype Sprint v1 / BP-5)
// STEP2: selects the exact candidate population BP-5 targets --
// Extended Hard Gap (all 9 known capabilities fail: BASE/FLIP/CASE/PARITY/
// RECOVERY/CYCLECHASE/BP-1/BP-2/BP-3, reusing GapDetector.ts's own 6-test
// plus BP-1/2/3's real resolvers, exact same disclosed pattern already used
// in solverV3Research/HardGapReclassifier.ts and StateRepresentationCandidates.ts)
// AND matching the "sparse wrongness" profile Research Kickoff STEP3
// measured for the still-unrescued group (lower WrongWing, fewer Cycles
// than the BP-1/2/3-rescued group).
//
// Honesty note: Research Kickoff STEP3 also measured average Conflict edge
// count for both groups, but which group had MORE Conflict edges FLIPPED
// direction between two different runs in that Sprint (rescued 3.43 vs
// still-hard 1.70 in one run; rescued 1.17 vs still-hard 1.96 in the final
// run) -- i.e. it is not a stable discriminator on this dataset. This
// detector therefore does NOT filter on Conflict edge count, only on
// WrongWing and Cycle count, which were consistently lower for the
// still-hard group across both runs.
import { cloneCubies } from "../cubeState";
import { applySeq, buildWingLibrary, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { profileAllReplays, type ReplayGapProfile } from "../solverV2Research/GapDetector";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import { tryBoundedMultiCycleResolver } from "../solverV2Prototype/BoundedResolver";
import { tryParityAwareCycleBreaker } from "../solverV2PrototypeBP2/ParityAwareResolver";
import { tryNonParityStructuralFix } from "../solverV2PrototypeBP3/NonParityStructuralFix";
import { analyzeCoarseShape, type CoarseShapeProfile } from "./CoarseShapeSelector";

// Sparse-wrongness thresholds, grounded in Research Kickoff STEP3's real
// measured averages for the still-unrescued group (avg WrongWing ~8.3~8.6,
// avg Cycle count ~1.9) -- set with margin above those averages (bucket
// boundary, not the exact mean) so the candidate set isn't gerrymandered to
// only the most extreme cases.
const MAX_WRONG_WING_BUCKET = 3; // bucket3(n) <= 3 => WrongWing <= 11
const MAX_CYCLE_COUNT = 2;

export interface SparseWrongnessCandidate {
  hash: string;
  shapeProfile: CoarseShapeProfile;
  extendedHardGap: boolean;
  matchesSparseProfile: boolean;
  isCandidate: boolean; // extendedHardGap && matchesSparseProfile
}

const CANDIDATE_DEADLINE_MS = 500;

function testExtraResolver(
  resolver: (cubies: ReturnType<typeof deserializeCube>, lib: WingLibrary, deadline: number) => ReturnType<typeof tryBoundedMultiCycleResolver>,
  snapshot: FailureSnapshot,
  lib: WingLibrary,
): boolean {
  const cubies = deserializeCube(snapshot.cubeState);
  const before = wrongWingCount5(cubies);
  const clone = cloneCubies(cubies);
  const fix = resolver(clone, lib, Date.now() + CANDIDATE_DEADLINE_MS);
  if (!fix || fix.length === 0) return false;
  applySeq(clone, fix);
  return wrongWingCount5(clone) < before;
}

function matchesSparseProfile(profile: CoarseShapeProfile): boolean {
  return profile.wrongWingBucket <= MAX_WRONG_WING_BUCKET && profile.cycleCount <= MAX_CYCLE_COUNT;
}

export function detectSparseWrongnessCandidates(failuresDbPath: string, gapDeadlineMs: number): SparseWrongnessCandidate[] {
  const all75 = loadAll75(failuresDbPath);
  const profiles = profileAllReplays(failuresDbPath, gapDeadlineMs);
  const profileByHash = new Map<string, ReplayGapProfile>(profiles.map((p) => [p.replayHash, p]));
  const lib = buildWingLibrary();

  return all75.map((snapshot) => {
    const cubies = deserializeCube(snapshot.cubeState);
    const shapeProfile = analyzeCoarseShape(cubies);

    const baseProfile = profileByHash.get(snapshot.hash);
    const baseHardGap = baseProfile ? baseProfile.isHardGap : false;

    let extendedHardGap = false;
    if (baseHardGap) {
      const rescuedByBP1 = testExtraResolver(tryBoundedMultiCycleResolver, snapshot, lib);
      const rescuedByBP2 = testExtraResolver(tryParityAwareCycleBreaker, snapshot, lib);
      const rescuedByBP3 = testExtraResolver(tryNonParityStructuralFix, snapshot, lib);
      extendedHardGap = !rescuedByBP1 && !rescuedByBP2 && !rescuedByBP3;
    }

    const sparseMatch = matchesSparseProfile(shapeProfile);

    return {
      hash: snapshot.hash,
      shapeProfile,
      extendedHardGap,
      matchesSparseProfile: sparseMatch,
      isCandidate: extendedHardGap && sparseMatch,
    };
  });
}
