// --- DatasetBiasReport (Solver Dataset Expansion Research Sprint v1) -----
// STEP1: analyzes the EXISTING 75-replay Failure DB (read-only, no new
// Failures generated) along 4 dimensions -- Shape/Replay/Hard Gap/Cluster
// distribution -- and identifies underrepresented regions. Reuses
// loadAll75/deserializeCube/wrongWingCount5/pairCountOf/hasParity
// (existing, unmodified), computeCoarseShapeKey (solverV3Research/,
// unmodified), computeCycleShape (solverV2PrototypeBP4/, unmodified), and
// GapDetector's own profileAllReplays/ReplayGapProfile.clusterKey
// (solverV2Research/, unmodified) for the Cluster axis.
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import { pairCountOf, hasParity } from "../goalPlanner/GoalAnalyzer";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import { computeCycleShape } from "../solverV2PrototypeBP4/CycleShapeHasher";
import { computeCoarseShapeKey } from "../solverV3Research/StateRepresentationCandidates";
import { profileAllReplays } from "../solverV2Research/GapDetector";

export interface Histogram {
  bucketLabel: string;
  count: number;
}

export interface BiasFinding {
  dimension: "Shape" | "Replay" | "HardGap" | "Cluster";
  histogram: Histogram[];
  underrepresentedRegions: string[]; // buckets with count <= UNDERREPRESENTED_THRESHOLD
  summary: string;
}

const UNDERREPRESENTED_THRESHOLD = 2; // a bucket with 1-2 replays cannot support leave-one-out or majority-vote style analysis

function bucketWrongWing(n: number): string {
  const lo = Math.floor(n / 3) * 3;
  return `WW${lo}-${lo + 2}`;
}

export function histogramOf<T>(items: readonly T[], keyFn: (t: T) => string): Histogram[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = keyFn(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()].map(([bucketLabel, count]) => ({ bucketLabel, count })).sort((a, b) => b.count - a.count);
}

function underrepresented(hist: Histogram[]): string[] {
  return hist.filter((h) => h.count <= UNDERREPRESENTED_THRESHOLD).map((h) => `${h.bucketLabel} (${h.count}건)`);
}

export interface DatasetBiasReport {
  totalReplays: number;
  findings: BiasFinding[];
}

export function analyzeDatasetBias(failuresDbPath: string, gapDeadlineMs: number): DatasetBiasReport {
  const all75 = loadAll75(failuresDbPath);
  const cubiesList = all75.map((s) => ({ hash: s.hash, cubies: deserializeCube(s.cubeState) }));
  const profiles = profileAllReplays(failuresDbPath, gapDeadlineMs);
  const profileByHash = new Map(profiles.map((p) => [p.replayHash, p]));

  // --- Shape 분포 (exact BP-4 Shape Key -- the finest grain we have) ------
  const shapeHist = histogramOf(cubiesList, (c) => computeCycleShape(c.cubies).shapeKey);
  const coarseShapeHist = histogramOf(cubiesList, (c) => computeCoarseShapeKey(c.cubies));

  // --- Replay 분포 (WrongWing / Pair / Parity) ------------------------------
  const wrongWingHist = histogramOf(cubiesList, (c) => bucketWrongWing(wrongWingCount5(c.cubies)));
  const parityHist = histogramOf(cubiesList, (c) => (hasParity(c.cubies) ? "parity=true" : "parity=false"));
  const pairHist = histogramOf(cubiesList, (c) => bucketWrongWing(pairCountOf(c.cubies)).replace("WW", "P"));

  // --- Hard Gap 분포 (WrongWing bucket x Hard Gap 여부) ---------------------
  const hardGapHist = histogramOf(cubiesList, (c) => {
    const profile = profileByHash.get(c.hash);
    const wwBucket = bucketWrongWing(wrongWingCount5(c.cubies));
    return `${wwBucket}|hardGap=${profile ? profile.isHardGap : "unknown"}`;
  });

  // --- Cluster 분포 (GapDetector.ts의 clusterKey = w{wrongWing}|p{parity}) --
  const clusterHist = histogramOf(cubiesList, (c) => {
    const profile = profileByHash.get(c.hash);
    return profile ? profile.clusterKey : `w${wrongWingCount5(c.cubies)}|p${hasParity(c.cubies) ? 1 : 0}`;
  });

  const findings: BiasFinding[] = [
    {
      dimension: "Shape",
      histogram: shapeHist,
      underrepresentedRegions: underrepresented(shapeHist),
      summary: `정밀 Shape Key 기준 고유 ${shapeHist.length}개 (전체 ${cubiesList.length}건) -- ${underrepresented(shapeHist).length}개 Shape가 1~${UNDERREPRESENTED_THRESHOLD}건뿐. Coarse Shape 기준으로는 고유 ${coarseShapeHist.length}개로 완화되지만 여전히 ${underrepresented(coarseShapeHist).length}개가 대표성 부족.`,
    },
    {
      dimension: "Replay",
      histogram: [...wrongWingHist, ...parityHist, ...pairHist],
      underrepresentedRegions: [...underrepresented(wrongWingHist), ...underrepresented(pairHist)],
      summary: `WrongWing/Pair 구간별 분포에 뚜렷한 쏠림이 존재 -- 극단값(매우 낮거나 매우 높은 WrongWing) 구간이 대표성 부족.`,
    },
    {
      dimension: "HardGap",
      histogram: hardGapHist,
      underrepresentedRegions: underrepresented(hardGapHist),
      summary: `Hard Gap 여부가 WrongWing 구간별로 고르게 분포하지 않음 -- 일부 구간은 Hard Gap 표본이 ${UNDERREPRESENTED_THRESHOLD}건 이하.`,
    },
    {
      dimension: "Cluster",
      histogram: clusterHist,
      underrepresentedRegions: underrepresented(clusterHist),
      summary: `GapDetector.ts의 clusterKey(w|p) 기준 고유 ${clusterHist.length}개 클러스터 중 ${underrepresented(clusterHist).length}개가 ${UNDERREPRESENTED_THRESHOLD}건 이하 -- Policy Generalization Sprint v1이 정성적으로 겪었던 다수결 불성립 문제와 동일한 근본 원인.`,
    },
  ];

  return { totalReplays: cubiesList.length, findings };
}
