// --- CoarseShapeReview (Solver Representation Revalidation Sprint v1) ----
// STEP2: Coarse Structural Shape re-measured on the now-150-replay
// Dataset, compared against the ORIGINAL 75-replay numbers Solver v3
// Kickoff and Dataset Roadmap Sprint both reported. Also compared against
// the Roadmap Sprint's own N=150 CRP-model PREDICTION for this exact
// representation (which the Dataset Expansion Sprint already found did
// NOT hold on the real, Hybrid-Sampled data) -- included here again since
// this Sprint's own question ("is Coarse Shape still the right grain")
// needs that number restated alongside the fresh Exact/Fingerprint
// comparisons for a single coherent picture.
import { compareMetric, type BeforeAfterComparison, type StateRepresentationComparison } from "./RepresentationEvaluator";

// Cited from Solver v3 Kickoff (solverV3Research/data/kickoff-report.txt).
export const COARSE_SHAPE_AT_75 = {
  uniqueGroups: 45,
  singletonRate: 0.667,
  reentryRate: 0.6,
  avgGroupSize: 1.67,
};

// Cited from Dataset Roadmap Sprint v1's own N=150 CRP projection
// (solverDatasetResearch/data/dataset-research-report.txt) -- already
// shown by Dataset Expansion Sprint v2 to NOT hold on the real data.
export const ROADMAP_N150_PREDICTION_COARSE = {
  expectedUniqueCount: 67.6,
  expectedSingletonRate: 0.529,
  expectedReentryRate: 0.762,
  expectedAvgGroupSize: 2.22,
};

const LOOKUP_MIN_AVG_GROUP_SIZE = 2;

export interface CoarseShapeReviewResult {
  before75: typeof COARSE_SHAPE_AT_75;
  predicted150: typeof ROADMAP_N150_PREDICTION_COARSE;
  after150: StateRepresentationComparison["coarseShape"];
  comparisonsVs75: BeforeAfterComparison[];
  crossesLookupThreshold: boolean;
  verdict: string;
}

export function reviewCoarseShape(representations: StateRepresentationComparison): CoarseShapeReviewResult {
  const after150 = representations.coarseShape;
  const comparisonsVs75: BeforeAfterComparison[] = [
    compareMetric("Singleton 비율", COARSE_SHAPE_AT_75.singletonRate, after150.singletonRate, false),
    compareMetric("재등장률", COARSE_SHAPE_AT_75.reentryRate, after150.reentryRate, true),
    compareMetric("평균 Group Size", COARSE_SHAPE_AT_75.avgGroupSize, after150.avgGroupSize, true),
  ];

  const crossesLookupThreshold = after150.avgGroupSize >= LOOKUP_MIN_AVG_GROUP_SIZE;
  const improvedCount = comparisonsVs75.filter((c) => c.direction === "IMPROVED").length;

  const verdict = crossesLookupThreshold
    ? `Coarse Shape는 150 replay에서 Lookup 최소 기준(>=2)을 통과했다 (평균 Group Size ${after150.avgGroupSize.toFixed(2)}).`
    : `Coarse Shape는 150 replay에서도 Lookup 최소 기준(>=2)에 아직 못 미친다 (평균 Group Size ${after150.avgGroupSize.toFixed(2)}, Roadmap 예측치 ${ROADMAP_N150_PREDICTION_COARSE.expectedAvgGroupSize}보다 낮음). ` +
      `75건 대비 ${improvedCount}/3개 지표는 개선됐지만, 개선 속도는 Roadmap이 예측한 것보다 느리다 -- Dataset Expansion Sprint v2가 이미 밝힌 대로, Hybrid Sampling이 새로운/희소한 Shape을 의도적으로 확보했기 때문(수동적 재추출을 가정한 CRP 모델과의 괴리).`;

  return { before75: COARSE_SHAPE_AT_75, predicted150: ROADMAP_N150_PREDICTION_COARSE, after150, comparisonsVs75, crossesLookupThreshold, verdict };
}
