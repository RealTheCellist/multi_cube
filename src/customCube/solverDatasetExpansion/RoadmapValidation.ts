// --- RoadmapValidation (Solver Failure Dataset Expansion Sprint v2) ------
// STEP6: compares the Dataset Roadmap Sprint's N=150 CRP-model projection
// (Coarse Shape, solverDatasetResearch/DatasetGrowthEstimator.ts, cited
// not recomputed -- that module's TARGET_SIZES are fixed milestones, not
// parametrized for an arbitrary achieved N) against the REAL measured
// values now that this Sprint has actually collected real data.
import type { DatasetSnapshot } from "./DatasetStatistics";

// Cited verbatim from the Dataset Roadmap Sprint v1's own committed run
// (src/customCube/solverDatasetResearch/data/dataset-research-report.txt,
// "[CoarseShape(v3 Kickoff)] ... N=150(추정)").
export const ROADMAP_N150_PREDICTION = {
  predictedN: 150,
  expectedUniqueCount: 67.6,
  expectedSingletonRate: 0.529,
  expectedReentryRate: 0.762,
  expectedAvgGroupSize: 2.22,
};

export interface PredictionErrorEntry {
  metric: string;
  predicted: number;
  actual: number;
  absoluteError: number;
  percentError: number; // relative to predicted
}

export interface RoadmapValidationReport {
  predictedN: number;
  actualN: number;
  nMismatchNote: string | null; // set if actualN meaningfully differs from predictedN, since the comparison is then less apples-to-apples
  errors: PredictionErrorEntry[];
  modelAssumptionHolds: boolean; // true if all errors stay within a disclosed tolerance
}

const TOLERANCE_PERCENT = 15; // matches the Dataset Roadmap Sprint's OWN stop-condition threshold ("15%p 이상 벌어지면 재보정 필요")

export function validateRoadmapPrediction(actual: DatasetSnapshot): RoadmapValidationReport {
  const nDiff = Math.abs(actual.size - ROADMAP_N150_PREDICTION.predictedN);
  const nMismatchNote =
    nDiff > 15
      ? `실제 달성 규모(${actual.size})가 예측 대상 규모(150)와 ${nDiff}건 차이 -- CRP 모델은 정확히 N=150에서의 예측이므로, 차이가 클수록 비교의 엄밀성이 떨어짐 (참고용으로만 사용).`
      : null;

  // uniqueCount is derivable from size/avgGroupSize (avgGroupSize := size / uniqueCount), so no separate tracking is needed.
  const actualUniqueCount = actual.avgGroupSize > 0 ? actual.size / actual.avgGroupSize : 0;

  const errors: PredictionErrorEntry[] = [
    {
      metric: "고유 Shape 수",
      predicted: ROADMAP_N150_PREDICTION.expectedUniqueCount,
      actual: actualUniqueCount,
      absoluteError: Math.abs(actualUniqueCount - ROADMAP_N150_PREDICTION.expectedUniqueCount),
      percentError: (Math.abs(actualUniqueCount - ROADMAP_N150_PREDICTION.expectedUniqueCount) / ROADMAP_N150_PREDICTION.expectedUniqueCount) * 100,
    },
    {
      metric: "Singleton 비율",
      predicted: ROADMAP_N150_PREDICTION.expectedSingletonRate,
      actual: actual.singletonRate,
      absoluteError: Math.abs(actual.singletonRate - ROADMAP_N150_PREDICTION.expectedSingletonRate),
      percentError: ROADMAP_N150_PREDICTION.expectedSingletonRate ? (Math.abs(actual.singletonRate - ROADMAP_N150_PREDICTION.expectedSingletonRate) / ROADMAP_N150_PREDICTION.expectedSingletonRate) * 100 : NaN,
    },
    {
      metric: "Shape 재등장률",
      predicted: ROADMAP_N150_PREDICTION.expectedReentryRate,
      actual: actual.shapeReentryRate,
      absoluteError: Math.abs(actual.shapeReentryRate - ROADMAP_N150_PREDICTION.expectedReentryRate),
      percentError: ROADMAP_N150_PREDICTION.expectedReentryRate ? (Math.abs(actual.shapeReentryRate - ROADMAP_N150_PREDICTION.expectedReentryRate) / ROADMAP_N150_PREDICTION.expectedReentryRate) * 100 : NaN,
    },
    {
      metric: "평균 Group Size",
      predicted: ROADMAP_N150_PREDICTION.expectedAvgGroupSize,
      actual: actual.avgGroupSize,
      absoluteError: Math.abs(actual.avgGroupSize - ROADMAP_N150_PREDICTION.expectedAvgGroupSize),
      percentError: ROADMAP_N150_PREDICTION.expectedAvgGroupSize ? (Math.abs(actual.avgGroupSize - ROADMAP_N150_PREDICTION.expectedAvgGroupSize) / ROADMAP_N150_PREDICTION.expectedAvgGroupSize) * 100 : NaN,
    },
  ];

  const modelAssumptionHolds = errors.every((e) => !Number.isNaN(e.percentError) && e.percentError <= TOLERANCE_PERCENT);

  return {
    predictedN: ROADMAP_N150_PREDICTION.predictedN,
    actualN: actual.size,
    nMismatchNote,
    errors,
    modelAssumptionHolds,
  };
}
