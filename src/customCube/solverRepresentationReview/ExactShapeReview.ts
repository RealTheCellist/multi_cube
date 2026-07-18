// --- ExactShapeReview (Solver Representation Revalidation Sprint v1) -----
// STEP1: BP-4's Exact Shape Key re-measured on the now-150-replay Dataset,
// compared against the ORIGINAL 75-replay numbers (cited verbatim from
// Solver v3 Kickoff / BP-4's own committed reports -- not recomputed,
// since the original 75-replay subset is no longer separately addressable
// once merged into the same failures.json).
import { compareMetric, type BeforeAfterComparison, type StateRepresentationComparison } from "./RepresentationEvaluator";

// Cited from BP-4's own report (solverV2PrototypeBP4/data/shape-report.txt)
// and Solver v3 Kickoff's own STEP2 (solverV3Research/data/kickoff-report.txt).
export const EXACT_SHAPE_AT_75 = {
  uniqueGroups: 69,
  singletonRate: 0.928,
  reentryRate: 0.147,
  avgGroupSize: 1.09,
};

const LOOKUP_MIN_AVG_GROUP_SIZE = 2; // same threshold Dataset Roadmap Sprint v1 established

export interface ExactShapeReviewResult {
  before: typeof EXACT_SHAPE_AT_75;
  after: StateRepresentationComparison["baseline"];
  comparisons: BeforeAfterComparison[];
  crossesLookupThreshold: boolean;
  verdict: string;
}

export function reviewExactShape(representations: StateRepresentationComparison): ExactShapeReviewResult {
  const after = representations.baseline;
  const comparisons: BeforeAfterComparison[] = [
    compareMetric("Singleton 비율", EXACT_SHAPE_AT_75.singletonRate, after.singletonRate, false),
    compareMetric("재등장률", EXACT_SHAPE_AT_75.reentryRate, after.reentryRate, true),
    compareMetric("평균 Group Size", EXACT_SHAPE_AT_75.avgGroupSize, after.avgGroupSize, true),
  ];

  const crossesLookupThreshold = after.avgGroupSize >= LOOKUP_MIN_AVG_GROUP_SIZE;
  const improvedCount = comparisons.filter((c) => c.direction === "IMPROVED").length;

  const verdict = crossesLookupThreshold
    ? `Exact Shape Key가 150 replay에서 Lookup 최소 기준(평균 Group Size>=2)을 처음으로 통과했다 (${after.avgGroupSize.toFixed(2)}) -- BP-4류 접근을 재검토할 실측 근거가 생겼다.`
    : `Exact Shape Key는 150 replay에서도 여전히 Lookup 최소 기준(>=2)에 못 미친다 (${after.avgGroupSize.toFixed(2)}). 지표 ${improvedCount}/3개가 개선됐지만, 절대적인 Singleton 비율(${(after.singletonRate * 100).toFixed(1)}%)이 여전히 높아 실질적인 Lookup 접근에는 부족하다.`;

  return { before: EXACT_SHAPE_AT_75, after, comparisons, crossesLookupThreshold, verdict };
}
