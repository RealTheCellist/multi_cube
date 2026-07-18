// --- ReplayDiversityAnalysis (Solver Dataset Expansion Research Sprint v1)
// STEP2: quantifies the current 75-replay Dataset's information content
// along 4 dimensions (Shape/Replay/Cluster/Primitive diversity) using
// Shannon entropy -- a real, computable information-theoretic measure over
// the ALREADY-collected real distribution (DatasetBiasReport.ts's own
// histogramOf(), reused unmodified within this same new Sprint).
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import { computeCycleShape } from "../solverV2PrototypeBP4/CycleShapeHasher";
import { profileAllReplays } from "../solverV2Research/GapDetector";
import { histogramOf, type Histogram } from "./DatasetBiasReport";

export function computeShannonEntropy(hist: readonly Histogram[]): { bits: number; normalized: number } {
  const total = hist.reduce((a, h) => a + h.count, 0);
  if (total === 0 || hist.length === 0) return { bits: 0, normalized: 0 };
  let bits = 0;
  for (const h of hist) {
    if (h.count === 0) continue;
    const p = h.count / total;
    bits -= p * Math.log2(p);
  }
  const maxBits = hist.length > 1 ? Math.log2(hist.length) : 1;
  return { bits, normalized: maxBits > 0 ? bits / maxBits : 0 };
}

export interface DiversityMetric {
  dimension: "Shape" | "Replay(WrongWing)" | "Cluster" | "Primitive(6-bit fingerprint)";
  uniqueCount: number;
  totalCount: number;
  diversityRatio: number; // uniqueCount / totalCount
  shannonEntropyBits: number;
  normalizedEntropy: number; // in [0,1] -- 1 means every observed category is perfectly evenly represented
  interpretation: string;
}

export interface ReplayDiversityReport {
  metrics: DiversityMetric[];
  overallInformationSummary: string;
}

export function analyzeReplayDiversity(failuresDbPath: string, gapDeadlineMs: number): ReplayDiversityReport {
  const all75 = loadAll75(failuresDbPath);
  const cubiesList = all75.map((s) => ({ hash: s.hash, cubies: deserializeCube(s.cubeState) }));
  const profiles = profileAllReplays(failuresDbPath, gapDeadlineMs);
  const profileByHash = new Map(profiles.map((p) => [p.replayHash, p]));
  const total = cubiesList.length;

  const shapeHist = histogramOf(cubiesList, (c) => computeCycleShape(c.cubies).shapeKey);
  const wrongWingHist = histogramOf(cubiesList, (c) => String(wrongWingCount5(c.cubies)));
  const clusterHist = histogramOf(cubiesList, (c) => {
    const p = profileByHash.get(c.hash);
    return p ? p.clusterKey : `w${wrongWingCount5(c.cubies)}|p?`;
  });
  const fingerprintHist = histogramOf(cubiesList, (c) => {
    const p = profileByHash.get(c.hash);
    if (!p) return "unknown";
    const s = p.succeeded;
    return [s.BASE, s.FLIP, s.CASE, s.PARITY, s.RECOVERY, s.CYCLECHASE].map((b) => (b ? "1" : "0")).join("");
  });

  function buildMetric(dimension: DiversityMetric["dimension"], hist: Histogram[]): DiversityMetric {
    const entropy = computeShannonEntropy(hist);
    return {
      dimension,
      uniqueCount: hist.length,
      totalCount: total,
      diversityRatio: total ? hist.length / total : 0,
      shannonEntropyBits: entropy.bits,
      normalizedEntropy: entropy.normalized,
      interpretation:
        entropy.normalized > 0.85
          ? "거의 균등 분포 -- 다양성은 높지만 반복(재사용 가능한 패턴)이 거의 없다는 뜻이기도 하다."
          : entropy.normalized < 0.5
            ? "일부 카테고리에 강하게 쏠림 -- 다양성이 낮고 특정 패턴이 과대표집됨."
            : "중간 수준의 쏠림 -- 일부 반복은 있으나 여전히 다수 카테고리가 희소함.",
    };
  }

  const metrics: DiversityMetric[] = [
    buildMetric("Shape", shapeHist),
    buildMetric("Replay(WrongWing)", wrongWingHist),
    buildMetric("Cluster", clusterHist),
    buildMetric("Primitive(6-bit fingerprint)", fingerprintHist),
  ];

  const shapeMetric = metrics.find((m) => m.dimension === "Shape")!;
  const clusterMetric = metrics.find((m) => m.dimension === "Cluster")!;

  const overallInformationSummary =
    `Shape 축은 정규화 엔트로피 ${shapeMetric.normalizedEntropy.toFixed(2)}로 거의 균등에 가깝다 -- 이는 "다양성이 풍부하다"가 아니라 ` +
    `"거의 모든 Shape가 정확히 1번씩만 등장해 재사용 가능한 반복 패턴이 없다"는 뜻이다 (uniqueCount=${shapeMetric.uniqueCount}/${total}). ` +
    `Cluster 축(w|p 시그니처, 더 거친 grain)은 정규화 엔트로피 ${clusterMetric.normalizedEntropy.toFixed(2)}로 상대적으로 덜 균등해, ` +
    `이 grain에서는 실제로 재사용 가능한 반복이 더 많이 존재함을 시사한다 -- Representation의 grain을 어디에 두느냐가 "정보량"의 해석 자체를 바꾼다.`;

  return { metrics, overallInformationSummary };
}
