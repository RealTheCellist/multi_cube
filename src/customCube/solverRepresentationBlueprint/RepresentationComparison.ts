// --- RepresentationComparison (Solver Representation Blueprint Sprint v1)
// STEP4: measures each STEP3 candidate's explanatory power on the real
// 150-replay Dataset ("실측 기반 평가만 수행") against the current best
// known Representation (Coarse Structural Shape, per Representation
// Revalidation Sprint v1's own corrected Ranking). Reuses evaluateGrouping's
// exact method (unique/singleton/reentry/avgGroupSize) already established
// by solverV3Research/StateRepresentationCandidates.ts -- re-implemented
// here (that function isn't exported) rather than duplicating that whole
// module's import surface, same disclosed-duplication pattern
// solverRepresentationReview/CapabilityFingerprintReview.ts already used.
import { cloneCubies } from "../cubeState";
import { applySeq, buildWingLibrary, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import { hasParity } from "../goalPlanner/GoalAnalyzer";
import { computeCoarseShapeKey } from "../solverV3Research/StateRepresentationCandidates";
import { profileAllReplays, type ReplayGapProfile } from "../solverV2Research/GapDetector";
import { tryBoundedMultiCycleResolver } from "../solverV2Prototype/BoundedResolver";
import { tryParityAwareCycleBreaker } from "../solverV2PrototypeBP2/ParityAwareResolver";
import { tryNonParityStructuralFix } from "../solverV2PrototypeBP3/NonParityStructuralFix";
import { histogramOf } from "../solverDatasetResearch/DatasetBiasReport";
import { computeShannonEntropy } from "../solverDatasetResearch/ReplayDiversityAnalysis";
import { computeSeverityTierKey, computeGraphTopologyKey, computeRescueStructuralHybridKey, CANDIDATE_DESIGNS } from "./RepresentationCandidates";
import { analyzeOneRepresentation, type RepresentationFailureResult } from "./RepresentationFailureAnalysis";

const LOOKUP_MIN_AVG_GROUP_SIZE = 2; // established threshold, reused throughout this project

// Cited from Solver Representation Revalidation Sprint v1's own real
// 150-replay measurement (solverRepresentationReview/data/
// representation-review-report.txt, section 3) -- the current best-known
// Representation, re-measured fresh below for an apples-to-apples,
// same-run comparison rather than relying purely on the citation.
export const COARSE_SHAPE_BASELINE_150 = {
  uniqueGroups: 81,
  singletonRate: 0.654,
  reentryRate: 0.647,
  avgGroupSize: 1.852,
};

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
  applySeq(clone, fix);
  return wrongWingCount5(clone) < before;
}

export interface RepresentationMeasurement {
  name: string;
  totalReplays: number;
  uniqueGroups: number;
  singletonGroups: number;
  singletonRate: number;
  reentryRate: number;
  avgGroupSize: number;
  entropyBits: number;
  lookupFeasible: boolean;
}

function evaluateGrouping(name: string, keys: readonly string[]): RepresentationMeasurement {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  const uniqueGroups = counts.size;
  const singletonGroups = [...counts.values()].filter((c) => c === 1).length;
  const multiMemberReplays = keys.filter((k) => (counts.get(k) ?? 0) >= 2).length;
  const avgGroupSize = uniqueGroups ? keys.length / uniqueGroups : 0;
  const entropyBits = computeShannonEntropy(histogramOf(keys.map((k) => ({ k })), (x) => x.k)).bits;
  return {
    name,
    totalReplays: keys.length,
    uniqueGroups,
    singletonGroups,
    singletonRate: uniqueGroups ? singletonGroups / uniqueGroups : 0,
    reentryRate: keys.length ? multiMemberReplays / keys.length : 0,
    avgGroupSize,
    entropyBits,
    lookupFeasible: avgGroupSize >= LOOKUP_MIN_AVG_GROUP_SIZE,
  };
}

export interface CandidateComparisonResult {
  name: string;
  targetWeakness: string;
  hypothesis: string;
  measurement: RepresentationMeasurement;
  hardGapExplanation: RepresentationFailureResult;
  avgGroupSizeVsBaseline: number; // measurement.avgGroupSize - COARSE_SHAPE_BASELINE_150.avgGroupSize
  singletonRateVsBaseline: number; // measurement.singletonRate - COARSE_SHAPE_BASELINE_150.singletonRate (negative = better)
  betterThanCoarseShape: boolean;
  usesOnlyExistingClusterAxis: boolean;
  verdict: string;
}

export interface RepresentationComparisonReport {
  totalReplays: number;
  coarseShapeFresh: RepresentationMeasurement;
  coarseShapeHardGap: RepresentationFailureResult;
  existingClusterAxisUniqueCount: number;
  candidates: CandidateComparisonResult[];
  bestCandidate: CandidateComparisonResult | null;
  summary: string;
}

export function compareRepresentationCandidates(failuresDbPath: string, gapDeadlineMs: number): RepresentationComparisonReport {
  const all150 = loadAll75(failuresDbPath);
  const profiles: ReplayGapProfile[] = profileAllReplays(failuresDbPath, gapDeadlineMs);
  const profileByHash = new Map(profiles.map((p) => [p.replayHash, p]));
  const lib = buildWingLibrary();

  const coarseKeys: string[] = [];
  const severityKeys: string[] = [];
  const topologyKeys: string[] = [];
  const hybridKeys: string[] = [];
  const existingClusterAxisKeys: string[] = [];
  const hardGapFlags: boolean[] = [];

  for (const snapshot of all150) {
    const cubies = deserializeCube(snapshot.cubeState);
    coarseKeys.push(computeCoarseShapeKey(cubies));
    severityKeys.push(computeSeverityTierKey(cubies));
    topologyKeys.push(computeGraphTopologyKey(cubies));
    // GapDetector.ts's own pre-existing clusterKey formula (w{exact}|p{parity}),
    // reused here read-only purely to CITE its unique-group count -- not to
    // add a 4th candidate. See STEP4/STEP5 disclosure below.
    existingClusterAxisKeys.push(`w${wrongWingCount5(cubies)}|p${hasParity(cubies) ? 1 : 0}`);

    const profile = profileByHash.get(snapshot.hash);
    const bp1 = testResolver(tryBoundedMultiCycleResolver, snapshot, lib);
    const bp2 = testResolver(tryParityAwareCycleBreaker, snapshot, lib);
    const bp3 = testResolver(tryNonParityStructuralFix, snapshot, lib);
    hybridKeys.push(computeRescueStructuralHybridKey(cubies, profile, bp1, bp2, bp3));
    hardGapFlags.push(profile ? profile.isHardGap : false);
  }

  const coarseShapeFresh = evaluateGrouping("Coarse Structural Shape (baseline, 재측정)", coarseKeys);
  const coarseShapeHardGap = analyzeOneRepresentation("Coarse Structural Shape", coarseKeys, hardGapFlags);

  const candidateKeySets: [string, string[]][] = [
    [CANDIDATE_DESIGNS[0].name, severityKeys],
    [CANDIDATE_DESIGNS[1].name, topologyKeys],
    [CANDIDATE_DESIGNS[2].name, hybridKeys],
  ];

  const candidates: CandidateComparisonResult[] = candidateKeySets.map(([name, keys], i) => {
    const design = CANDIDATE_DESIGNS[i];
    const measurement = evaluateGrouping(name, keys);
    const hardGapExplanation = analyzeOneRepresentation(name, keys, hardGapFlags);
    const avgGroupSizeVsBaseline = measurement.avgGroupSize - coarseShapeFresh.avgGroupSize;
    const singletonRateVsBaseline = measurement.singletonRate - coarseShapeFresh.singletonRate;
    const hardGapImprovement = hardGapExplanation.hardGapUnexplainedRate < coarseShapeHardGap.hardGapUnexplainedRate;
    const betterThanCoarseShape = avgGroupSizeVsBaseline > 0 && singletonRateVsBaseline < 0 && hardGapImprovement;

    const verdict = betterThanCoarseShape
      ? `평균 Group Size ${measurement.avgGroupSize.toFixed(2)}(기존 대비 ${avgGroupSizeVsBaseline >= 0 ? "+" : ""}${avgGroupSizeVsBaseline.toFixed(2)}), Singleton ${(measurement.singletonRate * 100).toFixed(1)}%(기존 대비 ${(singletonRateVsBaseline * 100).toFixed(1)}%p), Hard Gap 미설명율 ${(hardGapExplanation.hardGapUnexplainedRate * 100).toFixed(1)}%(기존 ${(coarseShapeHardGap.hardGapUnexplainedRate * 100).toFixed(1)}%) -- 3개 지표 모두 Coarse Shape보다 개선.`
      : `평균 Group Size ${measurement.avgGroupSize.toFixed(2)}(기존 대비 ${avgGroupSizeVsBaseline >= 0 ? "+" : ""}${avgGroupSizeVsBaseline.toFixed(2)}), Singleton ${(measurement.singletonRate * 100).toFixed(1)}%(기존 대비 ${(singletonRateVsBaseline * 100).toFixed(1)}%p), Hard Gap 미설명율 ${(hardGapExplanation.hardGapUnexplainedRate * 100).toFixed(1)}%(기존 ${(coarseShapeHardGap.hardGapUnexplainedRate * 100).toFixed(1)}%) -- Coarse Shape 대비 전부 개선되지는 않음.`;

    return {
      name,
      targetWeakness: design.targetWeakness,
      hypothesis: design.hypothesis,
      measurement,
      hardGapExplanation,
      avgGroupSizeVsBaseline,
      singletonRateVsBaseline,
      betterThanCoarseShape,
      usesOnlyExistingClusterAxis: design.usesOnlyExistingClusterAxis,
      verdict,
    };
  });

  const existingClusterAxisUniqueCount = new Set(existingClusterAxisKeys).size;

  // [정직 공개] 3개 지표 모두 Coarse Shape보다 개선됐다고 해서 그것이 곧
  // "새로운 정보"를 뜻하지는 않는다. usesOnlyExistingClusterAxis=true인
  // 후보(Severity Tier Key)는 GapDetector.ts가 이미 쓰고 있는 clusterKey와
  // 동일한 2개 필드(wrongWingCount, parity)만으로 만들어졌으므로, 그저 그
  // 축을 이 Dataset에서 관측된 exact clusterKey 고유값(${existingClusterAxisUniqueCount}개, 아래
  // 참조)보다 더 넓게 버킷팅한 것에 불과하다 -- 버킷을 더 넓히면 평균
  // Group Size는 얼마든지 더 "개선"될 수 있으므로(극단적으로는 버킷 1개로
  // 수렴), 이 축만으로는 STEP4의 3-지표 개선을 만족하는 후보가 항상
  // 나온다. 반면 usesOnlyExistingClusterAxis=false인 후보는 이 축에
  // 없던(그래프 위상/능력 비트) 정보를 실제로 사용한다. 따라서 최우수
  // 후보는 "3개 지표 개선" 후보들 중, 이 함정에 해당하지 않는(즉 진짜 새
  // 정보를 쓰는) 후보를 우선한다.
  const eligible = candidates.filter((c) => c.betterThanCoarseShape);
  const eligibleGenuine = eligible.filter((c) => !c.usesOnlyExistingClusterAxis);
  const pool = eligibleGenuine.length ? eligibleGenuine : eligible;
  const bestCandidate = pool.length ? pool.reduce((best, c) => (c.avgGroupSizeVsBaseline > best.avgGroupSizeVsBaseline ? c : best)) : null;

  const coarseningArtifact = eligible.find((c) => c.usesOnlyExistingClusterAxis);
  const disclosure =
    coarseningArtifact && bestCandidate?.name !== coarseningArtifact.name
      ? ` [정직 공개] "${coarseningArtifact.name}"도 3개 지표 모두 개선(평균 Group Size ${coarseningArtifact.measurement.avgGroupSize.toFixed(2)})됐지만, 이는 GapDetector의 기존 clusterKey(이 Dataset에서 고유 ${existingClusterAxisUniqueCount}개)와 동일한 2개 필드(wrongWingCount/parity)를 더 넓게 버킷팅한 것에 불과해 새로운 정보를 담고 있지 않다 -- 버킷 폭을 넓히기만 하면 무한정 "개선"되는 함정이므로 최우수 후보에서 제외했다.`
      : "";

  const summary = bestCandidate
    ? `Coarse Shape보다 3개 지표 모두 개선된 후보: ${eligible.map((c) => c.name).join(", ")}. 새로운 정보를 담은 후보 중 평균 Group Size 개선폭이 가장 큰 것은 "${bestCandidate.name}"이다.${disclosure}`
    : `Coarse Shape의 3개 지표(평균 Group Size/Singleton/Hard Gap 설명력)를 모두 능가하는, 새로운 정보를 담은 후보를 찾지 못했다.`;

  return { totalReplays: all150.length, coarseShapeFresh, coarseShapeHardGap, existingClusterAxisUniqueCount, candidates, bestCandidate, summary };
}
