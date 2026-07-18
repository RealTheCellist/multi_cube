// --- CapabilityFingerprintReview (Solver Representation Revalidation
// Sprint v1) --------------------------------------------------------------
// STEP3: Capability Fingerprint re-measured on the 150-replay Dataset,
// specifically checking whether the "000000000" over-concentration
// (everything unsolved by all 9 known capabilities collapsing into one
// indistinguishable group -- Solver v3 Kickoff STEP2's own diagnosed
// weakness) persists. `evaluateStateRepresentationCandidates()` only
// returns aggregate stats (unique/singleton/reentry/avgGroupSize), not the
// raw per-fingerprint histogram this question needs, so this file
// recomputes the histogram directly -- reusing computeCapabilityFingerprintKey
// (existing, exported, unmodified) and the same disclosed BP-1/2/3-testing
// pattern already used identically in solverV3Research/
// StateRepresentationCandidates.ts and solverV3Research/HardGapReclassifier.ts.
import { cloneCubies } from "../cubeState";
import { applySeq, buildWingLibrary, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import { profileAllReplays, type ReplayGapProfile } from "../solverV2Research/GapDetector";
import { tryBoundedMultiCycleResolver } from "../solverV2Prototype/BoundedResolver";
import { tryParityAwareCycleBreaker } from "../solverV2PrototypeBP2/ParityAwareResolver";
import { tryNonParityStructuralFix } from "../solverV2PrototypeBP3/NonParityStructuralFix";
import { computeCapabilityFingerprintKey } from "../solverV3Research/StateRepresentationCandidates";
import { histogramOf, type Histogram } from "../solverDatasetResearch/DatasetBiasReport";
import { computeShannonEntropy } from "../solverDatasetResearch/ReplayDiversityAnalysis";
import { compareMetric, type BeforeAfterComparison, type StateRepresentationComparison } from "./RepresentationEvaluator";

// Cited from Solver v3 Kickoff's own final committed report
// (solverV3Research/data/kickoff-report.txt).
export const FINGERPRINT_AT_75 = {
  uniqueGroups: 21,
  singletonRate: 0.381,
  reentryRate: 0.893,
  avgGroupSize: 3.57,
};

const FINGERPRINT_DEADLINE_MS = 500;
const ALL_ZERO_FINGERPRINT = "000000000";

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
  applySeq(clone, fix);
  return wrongWingCount5(clone) < before;
}

export interface CapabilityFingerprintReviewResult {
  before75: typeof FINGERPRINT_AT_75;
  after150: StateRepresentationComparison["capabilityFingerprint"];
  comparisonsVs75: BeforeAfterComparison[];
  allZeroGroupSize: number;
  allZeroShareOfDataset: number;
  concentrationPersists: boolean;
  entropyBits: number;
  verdict: string;
}

export function reviewCapabilityFingerprint(failuresDbPath: string, gapDeadlineMs: number, representations: StateRepresentationComparison): CapabilityFingerprintReviewResult {
  const after150 = representations.capabilityFingerprint;

  const all150 = loadAll75(failuresDbPath);
  const profiles = profileAllReplays(failuresDbPath, gapDeadlineMs);
  const profileByHash = new Map<string, ReplayGapProfile>(profiles.map((p) => [p.replayHash, p]));
  const lib = buildWingLibrary();

  const fingerprintKeys = all150.map((snapshot) => {
    const profile = profileByHash.get(snapshot.hash);
    const bp1 = testResolver(tryBoundedMultiCycleResolver, snapshot, lib);
    const bp2 = testResolver(tryParityAwareCycleBreaker, snapshot, lib);
    const bp3 = testResolver(tryNonParityStructuralFix, snapshot, lib);
    return profile
      ? computeCapabilityFingerprintKey(profile, bp1, bp2, bp3)
      : computeCapabilityFingerprintKey({ succeeded: { BASE: false, FLIP: false, CASE: false, PARITY: false, RECOVERY: false, CYCLECHASE: false } } as ReplayGapProfile, bp1, bp2, bp3);
  });

  const hist: Histogram[] = histogramOf(fingerprintKeys.map((k) => ({ k })), (x) => x.k);
  const allZeroEntry = hist.find((h) => h.bucketLabel === ALL_ZERO_FINGERPRINT);
  const allZeroGroupSize = allZeroEntry ? allZeroEntry.count : 0;
  const allZeroShareOfDataset = fingerprintKeys.length ? allZeroGroupSize / fingerprintKeys.length : 0;

  const comparisonsVs75: BeforeAfterComparison[] = [
    compareMetric("Singleton 비율", FINGERPRINT_AT_75.singletonRate, after150.singletonRate, false),
    compareMetric("재등장률", FINGERPRINT_AT_75.reentryRate, after150.reentryRate, true),
    compareMetric("평균 Group Size", FINGERPRINT_AT_75.avgGroupSize, after150.avgGroupSize, true),
  ];

  // "과도한 집중이 유지되는가": all-zero 그룹이 여전히 전체 데이터셋의
  // 유의미한 비율(>=20%, 균등 분포라면 21개 그룹 기준 1/21≈4.8%를 훨씬
  // 초과)을 차지하면 집중 현상이 유지된 것으로 판정한다.
  const concentrationPersists = allZeroShareOfDataset >= 0.2;

  const verdict = concentrationPersists
    ? `"000000000"(9개 능력 전부 실패) 그룹이 여전히 전체의 ${(allZeroShareOfDataset * 100).toFixed(1)}%(${allZeroGroupSize}건)를 차지한다 -- Capability Fingerprint는 150 replay에서도 여전히 이 단일 그룹으로 정보가 과도하게 뭉치는 문제를 그대로 갖고 있다 (Solver v3 Kickoff의 원래 진단과 동일).`
    : `"000000000" 그룹의 비중이 ${(allZeroShareOfDataset * 100).toFixed(1)}%(${allZeroGroupSize}건)로 완화됐다 -- 과도한 집중 문제가 150 replay에서는 상대적으로 덜 두드러진다.`;

  const entropyBits = computeShannonEntropy(hist).bits;

  return { before75: FINGERPRINT_AT_75, after150, comparisonsVs75, allZeroGroupSize, allZeroShareOfDataset, concentrationPersists, entropyBits, verdict };
}
