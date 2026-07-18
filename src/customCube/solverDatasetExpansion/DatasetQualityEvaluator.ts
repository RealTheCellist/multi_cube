// --- DatasetQualityEvaluator (Solver Failure Dataset Expansion Sprint v2)
// STEP5b: Level 2's "다음 중 3개 이상 만족" check, comparing
// DatasetStatistics.ts's BEFORE (canonical 75) vs AFTER (expanded) snapshots.
// Cluster 안정성 is explicitly marked NOT_MEASURED (DatasetStatistics.ts
// doesn't recompute it) rather than silently assumed "satisfied" -- this
// Sprint's own failure condition ("실측과 추정을 구분하지 않음") applies
// here: an unmeasured criterion must not count toward the "3 of 5" total.
import type { DatasetSnapshot } from "./DatasetStatistics";

export type CriterionStatus = "IMPROVED" | "NOT_IMPROVED" | "NOT_MEASURED";

export interface QualityCriterion {
  name: string;
  before: number | null;
  after: number | null;
  status: CriterionStatus;
  detail: string;
}

export interface QualityEvaluation {
  criteria: QualityCriterion[];
  improvedCount: number; // out of the MEASURED criteria only
  measuredCount: number;
  level2Pass: boolean; // improvedCount >= 3 (spec's own literal threshold, out of the full set of 5, but only measured ones can count)
}

export function evaluateDatasetQuality(before: DatasetSnapshot, after: DatasetSnapshot): QualityEvaluation {
  const criteria: QualityCriterion[] = [
    {
      name: "Shape 재등장률 증가",
      before: before.shapeReentryRate,
      after: after.shapeReentryRate,
      status: after.shapeReentryRate > before.shapeReentryRate ? "IMPROVED" : "NOT_IMPROVED",
      detail: `${(before.shapeReentryRate * 100).toFixed(1)}% -> ${(after.shapeReentryRate * 100).toFixed(1)}%`,
    },
    {
      name: "Singleton 감소",
      before: before.singletonRate,
      after: after.singletonRate,
      status: after.singletonRate < before.singletonRate ? "IMPROVED" : "NOT_IMPROVED",
      detail: `${(before.singletonRate * 100).toFixed(1)}% -> ${(after.singletonRate * 100).toFixed(1)}%`,
    },
    {
      name: "평균 Group Size 증가",
      before: before.avgGroupSize,
      after: after.avgGroupSize,
      status: after.avgGroupSize > before.avgGroupSize ? "IMPROVED" : "NOT_IMPROVED",
      detail: `${before.avgGroupSize.toFixed(2)} -> ${after.avgGroupSize.toFixed(2)}`,
    },
    {
      name: "Cluster 안정성 유지 또는 향상",
      before: null,
      after: null,
      status: "NOT_MEASURED",
      detail: "이번 Sprint에서 재측정하지 않음 (Dataset Roadmap Sprint 자체 발견: Dataset 크기와 무관한 지표) -- Solver v3 Kickoff 인용치 88.5%만 참고",
    },
    {
      name: "Entropy 개선",
      before: before.shannonEntropyBits,
      after: after.shannonEntropyBits,
      // "개선" = 엔트로피 감소. Dataset Roadmap Sprint STEP2가 이미 확립한
      // 해석: 높은 엔트로피(균등 분포)는 "반복이 거의 없다"는 뜻이므로
      // Lookup/재사용 관점에서는 낮을수록(더 쏠릴수록) 개선이다.
      status: after.shannonEntropyBits < before.shannonEntropyBits ? "IMPROVED" : "NOT_IMPROVED",
      detail: `${before.shannonEntropyBits.toFixed(2)}bits -> ${after.shannonEntropyBits.toFixed(2)}bits (낮을수록 개선 -- 반복/재사용성 증가)`,
    },
  ];

  const measured = criteria.filter((c) => c.status !== "NOT_MEASURED");
  const improvedCount = measured.filter((c) => c.status === "IMPROVED").length;

  return {
    criteria,
    improvedCount,
    measuredCount: measured.length,
    level2Pass: improvedCount >= 3,
  };
}
