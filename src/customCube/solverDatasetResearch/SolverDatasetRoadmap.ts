// --- SolverDatasetRoadmap (Solver Dataset Expansion Research Sprint v1) --
// STEP6: synthesizes STEP1~5 (all imported, unmodified) into a concrete,
// executable roadmap and the required final A~E classification.
import type { DatasetBiasReport } from "./DatasetBiasReport";
import type { DatasetGrowthReport } from "./DatasetGrowthEstimator";
import { SAMPLING_STRATEGIES } from "./ReplaySamplingStrategy";
import type { DatasetMetricsSnapshot } from "./DatasetMetrics";

export type RoadmapOutcome = "A" | "B" | "C" | "D" | "E";

export interface DatasetRoadmap {
  outcome: RoadmapOutcome;
  outcomeLabel: string;
  targetSize: number;
  interimCheckpoint: number;
  recommendedRepresentation: string;
  recommendedSamplingStrategy: string;
  collectionOrder: string[];
  priorityTargets: string[];
  stopConditions: string[];
  researchEndConditions: string[];
  reasoning: string;
}

export function buildDatasetRoadmap(bias: DatasetBiasReport, growth: DatasetGrowthReport, metrics: DatasetMetricsSnapshot): DatasetRoadmap {
  const coarse300 = growth.coarse.projections.find((p) => p.targetN === 300)!;
  const coarse150 = growth.coarse.projections.find((p) => p.targetN === 150)!;
  const exact1000 = growth.exact.projections.find((p) => p.targetN === 1000)!;

  const hybridStrategy = SAMPLING_STRATEGIES.find((s) => s.strategy === "Hybrid")!;

  const clusterFinding = bias.findings.find((f) => f.dimension === "Cluster")!;
  const hardGapFinding = bias.findings.find((f) => f.dimension === "HardGap")!;

  return {
    outcome: "B",
    outcomeLabel: "Dataset 150~300 규모 확장 권고",
    targetSize: 300,
    interimCheckpoint: 150,
    recommendedRepresentation: "Coarse Structural Shape (Solver v3 Kickoff STEP2/STEP4가 이미 채택 권고한 grain)",
    recommendedSamplingStrategy: "Hybrid (Hard Gap 우선 40% + Shape 균등 30% + Failure 유형 균등 20% + Random 10%)",
    collectionOrder: [
      `1단계 (75 -> 150): ${clusterFinding.underrepresentedRegions.length}개 저대표 클러스터와 ${hardGapFinding.underrepresentedRegions.length}개 저대표 Hard Gap 구간을 우선 채움 -- Coarse Shape 평균 그룹 크기가 1.67 -> ${coarse150.expectedAvgGroupSize.toFixed(2)}로 Lookup 최소 기준(>=2)을 넘는 지점.`,
      `2단계 (150 -> 300): Shape 균등 비중을 늘려 나머지 저대표 Shape를 채움 -- Coarse Shape 평균 그룹 크기 ${coarse300.expectedAvgGroupSize.toFixed(2)}, Singleton 비율 ${(coarse300.expectedSingletonRate * 100).toFixed(1)}%까지 개선 예상.`,
      "3단계 (300 도달 후): 중단 조건을 재평가 -- 실측치가 STEP3 예측과 크게 어긋나면(모델 가정 붕괴) 500/1000 확장 여부를 이 시점에 재결정, 어긋나지 않으면 STEP3 projection에 따라 500까지 이어갈지 판단.",
    ],
    priorityTargets: [
      ...bias.findings.flatMap((f) => f.underrepresentedRegions.slice(0, 3).map((r) => `[${f.dimension}] ${r}`)),
    ],
    stopConditions: [
      "300건 도달 시점에 실측 Coarse Shape 재등장률이 STEP3 예측(86.3%)과 15%p 이상 벌어지면 -- CRP 모델의 '동일 분포 가정'이 깨진 것이므로 추가 확장 전에 재보정 필요.",
      "특정 Sampling 전략(Hard Gap 우선 등)으로 수집한 표본이 계속 기존 Shape/Cluster에만 재등장하고 새로운 카테고리를 전혀 만들지 못하면 -- 그 전략은 중단하고 비중 재조정.",
      "avg group size가 목표(>=3)에 도달했는데 실제 하위 연구(BP-4류 Lookup 재검증 등)에서 여전히 개선이 없으면 -- Dataset 문제가 아니라 다른 축(Representation/Primitive) 문제로 재분류.",
    ],
    researchEndConditions: [
      "300~500 구간에서 Coarse Shape avg group size가 3 이상, Singleton 비율 45% 이하로 안정화되면 -- 이 Sprint의 1차 목표 달성, Dataset Research를 종료하고 실제 수집/생성 Sprint로 이관.",
      `Exact Shape Key(BP-4의 원래 grain)는 N=1000까지 확장해도 평균 그룹 크기가 ${exact1000.expectedAvgGroupSize.toFixed(2)}에 그쳐 여전히 Lookup 최소 기준(>=2)에 못 미친다 -- 이 grain을 계속 쓰는 연구라면 Dataset 확장만으로는 해결되지 않으므로, 반드시 Coarse Shape(또는 더 거친 grain)로 전환한 뒤에 확장을 진행해야 한다.`,
      "확장이 목표 규모(300)에 도달했지만 Cluster 안정성(88.5%, Dataset 크기와 무관한 지표)이 여전히 낮다면 -- 그건 Dataset 문제가 아니라 Primitive 내부 randomness 문제이므로 별도 트랙으로 분리.",
    ],
    reasoning:
      `DatasetGrowthEstimator STEP3의 CRP 추정에 따르면, Coarse Shape 기준 평균 그룹 크기는 N=150에서 이미 ${coarse150.expectedAvgGroupSize.toFixed(2)}(Lookup 최소 기준 2를 통과)에 도달하고, N=300에서 ${coarse300.expectedAvgGroupSize.toFixed(2)}까지 개선된다. ` +
      `반면 500/1000까지 늘려도(N=1000: avg group ${growth.coarse.projections.find((p) => p.targetN === 1000)!.expectedAvgGroupSize.toFixed(2)}) 한계효용은 뚜렷이 감소한다. ` +
      "동시에 Exact Shape Key(BP-4의 원래 grain)로는 1000까지 늘려도 Lookup 최소 기준을 넘지 못해, 확장 규모보다 Representation 선택이 더 결정적임을 재확인했다 -- " +
      "이것이 500 이상(C)이 아니라 150~300(B)을 권고하는 핵심 근거다. Hybrid 전략을 권장하는 것은 단일 전략(Random/Hard Gap 우선/Shape 균등)이 각각 다른 축의 편향을 남기기 때문이다 (ReplaySamplingStrategy STEP4).",
  };
}

// Re-exported so the driver/report can quote the chosen strategy's own
// description without re-importing SAMPLING_STRATEGIES separately.
export function describeRecommendedStrategy(): string {
  const hybrid = SAMPLING_STRATEGIES.find((s) => s.strategy === "Hybrid")!;
  return `${hybrid.strategy}: ${hybrid.description}`;
}
