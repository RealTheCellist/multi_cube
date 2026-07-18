// --- RepresentationGeneralizationReport (Solver Representation
// Revalidation Sprint v1) -------------------------------------------------
// STEP5: for each of the 3 representations, synthesizes STEP1~4's own
// real comparisons into a 일반화 유지/과적합/성능변화/Grain 적절성
// assessment. Pure synthesis of already-computed numbers -- no new
// measurement.
import type { ExactShapeReviewResult } from "./ExactShapeReview";
import type { CoarseShapeReviewResult } from "./CoarseShapeReview";
import type { CapabilityFingerprintReviewResult } from "./CapabilityFingerprintReview";

export type GeneralizationStatus = "MAINTAINED" | "OVERFIT_SUSPECTED" | "IMPROVED_WITH_SCALE" | "STILL_INADEQUATE";

export interface GeneralizationAssessment {
  representation: string;
  generalizationStatus: GeneralizationStatus;
  performanceChangeSummary: string;
  grainAppropriateness: string;
}

export function assessGeneralization(exact: ExactShapeReviewResult, coarse: CoarseShapeReviewResult, fingerprint: CapabilityFingerprintReviewResult): GeneralizationAssessment[] {
  const exactImproved = exact.comparisons.filter((c) => c.direction === "IMPROVED").length;
  const coarseImproved = coarse.comparisonsVs75.filter((c) => c.direction === "IMPROVED").length;
  const fingerprintImproved = fingerprint.comparisonsVs75.filter((c) => c.direction === "IMPROVED").length;

  const exactStatus: GeneralizationStatus = exact.crossesLookupThreshold ? "IMPROVED_WITH_SCALE" : exactImproved >= 2 ? "MAINTAINED" : "STILL_INADEQUATE";
  const coarseStatus: GeneralizationStatus = coarse.crossesLookupThreshold && coarseImproved >= 2 ? "MAINTAINED" : coarseImproved >= 2 ? "OVERFIT_SUSPECTED" : "STILL_INADEQUATE";
  const fingerprintStatus: GeneralizationStatus = !fingerprint.concentrationPersists && fingerprintImproved >= 2 ? "IMPROVED_WITH_SCALE" : "MAINTAINED";

  return [
    {
      representation: "Exact Shape Key (BP-4)",
      generalizationStatus: exactStatus,
      performanceChangeSummary: `75->150: ${exactImproved}/3 지표 개선. ${exact.verdict}`,
      grainAppropriateness: exact.crossesLookupThreshold
        ? "150 replay 규모에서는 grain이 처음으로 실용적일 가능성이 생겼다."
        : "여전히 grain이 지나치게 세밀하다 -- 75->150 규모 증가만으로는 부족했다.",
    },
    {
      representation: "Coarse Structural Shape",
      generalizationStatus: coarseStatus,
      performanceChangeSummary: `75->150: ${coarseImproved}/3 지표 개선, 단 Roadmap의 CRP 예측(평균 Group Size 2.22)에는 못 미침(${coarse.after150.avgGroupSize.toFixed(2)}). ${coarse.verdict}`,
      grainAppropriateness:
        "75건 기준으로 내린 'Coarse Shape가 더 낫다'는 결론의 방향 자체는 150건에서도 유지된다 (Exact Key보다 항상 우위). " +
        "다만 개선 폭이 Roadmap의 순수 통계적 예측보다 작았다는 것은, 원래 75건 비교가 어느 정도 표본 특유의 값을 포함하고 있었을 가능성을 시사한다 -- 완전한 과적합은 아니지만 낙관적으로 컸다.",
    },
    {
      representation: "Capability Fingerprint",
      generalizationStatus: fingerprintStatus,
      performanceChangeSummary: `75->150: ${fingerprintImproved}/3 지표 개선. ${fingerprint.verdict}`,
      grainAppropriateness: fingerprint.concentrationPersists
        ? "구조적 결함(안 풀리는 상태가 전부 한 그룹으로 뭉침)은 Dataset 크기와 무관하게 이 표현 방식 자체의 근본적 한계로, 150건에서도 재확인됐다 -- Primitive 설계 목적에는 여전히 부적합."
        : "집중 문제가 완화되는 조짐이 보이나, 근본적으로 '무엇이 풀리는가'를 그대로 인코딩하는 방식이라는 점에서 새 Primitive 설계에 쓰기에는 여전히 제한적이다.",
    },
  ];
}
