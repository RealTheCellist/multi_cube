// --- LimitingFactorAnalysis (Mixed Commutator Design Space Validation
// Sprint v1, Required Analysis #4) ---------------------------------------
// Disclosed, measured-data-driven decision tree (first match wins),
// comparing Stage-2 (mixed pattern) and Stage-3/4 (setup length) results
// against Stage-1 (same pattern, L1 only -- the prior Sprint's own
// search) to see which lever, if any, actually moved the global minimum
// footprintRatio.
import type { StagePoint } from "./ConvergenceAnalysis";

export type LimitingFactor = "PATTERN_CHOICE" | "SETUP_LENGTH" | "EXISTING_ALGORITHM" | "UNKNOWN";

export interface LimitingFactorResult {
  limitingFactor: LimitingFactor;
  rationale: string;
  stage1GlobalMin: number | null;
  stage2GlobalMin: number | null;
  stage3GlobalMin: number | null;
  stage4GlobalMin: number | null;
  mixedPatternImproved: boolean; // stage2 min < stage1 min
  setupLengthImproved: boolean; // stage4 min < stage2 min
}

const IMPROVEMENT_EPSILON = 1e-9;

export function analyzeLimitingFactor(points: StagePoint[]): LimitingFactorResult {
  const byStage = new Map(points.map((p) => [p.stage, p]));
  const s1 = byStage.get("stage1_same_pattern_L1")?.globalMinFootprintRatio ?? null;
  const s2 = byStage.get("stage2_mixed_pattern_L1")?.globalMinFootprintRatio ?? null;
  const s3 = byStage.get("stage3_setup_length_L2")?.globalMinFootprintRatio ?? null;
  const s4 = byStage.get("stage4_setup_length_L3")?.globalMinFootprintRatio ?? null;

  const mixedPatternImproved = s1 !== null && s2 !== null && s2 < s1 - IMPROVEMENT_EPSILON;
  const setupLengthImproved = s2 !== null && s4 !== null && s4 < s2 - IMPROVEMENT_EPSILON;

  let limitingFactor: LimitingFactor;
  let rationale: string;

  if (mixedPatternImproved && !setupLengthImproved) {
    limitingFactor = "SETUP_LENGTH";
    rationale = `Mixed Pattern이 실제로 global min을 ${s1?.toFixed(2)} -> ${s2?.toFixed(2)}로 낮췄으나(Pattern 선택은 한계가 아님), Setup 길이를 2/3으로 늘려도 추가 개선이 없었다(${s2?.toFixed(2)} -> ${s4?.toFixed(2)}) -- Setup 길이가 현재 한계 요인이다.`;
  } else if (!mixedPatternImproved && setupLengthImproved) {
    limitingFactor = "PATTERN_CHOICE";
    rationale = `Setup 길이를 늘리자 global min이 ${s2?.toFixed(2)} -> ${s4?.toFixed(2)}로 개선되었으나, Mixed Pattern 자체는 Same Pattern 대비 개선을 만들지 못했다(${s1?.toFixed(2)} -> ${s2?.toFixed(2)}) -- Pattern 선택이 현재 한계 요인이다.`;
  } else if (mixedPatternImproved && setupLengthImproved) {
    limitingFactor = "UNKNOWN";
    rationale = `Mixed Pattern(${s1?.toFixed(2)} -> ${s2?.toFixed(2)})과 Setup 길이(${s2?.toFixed(2)} -> ${s4?.toFixed(2)}) 모두 개선을 만들었다 -- 단일 한계 요인으로 귀속시킬 수 없으며, 두 축 모두 아직 탐색 여지가 남아있다는 뜻이다.`;
  } else {
    limitingFactor = "EXISTING_ALGORITHM";
    rationale = `Mixed Pattern(${s1?.toFixed(2)} -> ${s2?.toFixed(2)})도, Setup 길이 확장(${s2?.toFixed(2)} -> ${s4?.toFixed(2)})도 global min을 개선하지 못했다 -- 두 축 모두 소진했는데도 한계가 그대로라는 것은, 문제가 Pattern 선택이나 Setup 조합이 아니라 BASE_ALG/FLIP_ALG/PARITY_ALG 자체의 고유 footprint(Intrinsic Footprint)에 있다는 뜻이다.`;
  }

  return {
    limitingFactor,
    rationale,
    stage1GlobalMin: s1,
    stage2GlobalMin: s2,
    stage3GlobalMin: s3,
    stage4GlobalMin: s4,
    mixedPatternImproved,
    setupLengthImproved,
  };
}
