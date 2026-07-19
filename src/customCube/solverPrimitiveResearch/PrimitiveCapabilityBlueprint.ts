// --- PrimitiveCapabilityBlueprint (Solver Primitive Capability Analysis
// Sprint v1) -------------------------------------------------------------
// STEP5: reaches this Sprint's own required A/B/C conclusion from STEP1~4's
// real measurements:
//   A. 새 Primitive 필요 -- the common-failure Gap is both substantial AND
//      describable (clusters coherently under Coarse Shape, not scattered
//      noise) -- a targeted new Primitive is justified by measurement.
//   B. 기존 Primitive 조합 개선 가능 -- the Gap is non-negligible but either
//      too small or too scattered to justify a NEW capability; existing
//      Primitives' redundancy/complementarity (STEP2) suggests combination
//      or sequencing still has headroom.
//   C. Primitive 추가 연구 불필요 -- the Gap is negligible; existing
//      Primitives already cover nearly everything.
import type { GapAnalysisResult } from "./PrimitiveGapAnalysis";
import type { OverlapPair } from "./PrimitiveOverlapAnalysis";

export type FinalDecision = "A" | "B" | "C";

// Disclosed thresholds -- 20% gap rate is the same rough order of
// magnitude this whole research series has treated as "substantial" (e.g.
// Dataset Roadmap Sprint's own Hard Gap rate citations were in the 40%+
// range and were treated as clearly worth acting on; 5% is the point below
// which a capability hole is closer to noise than a real design target).
const NEW_PRIMITIVE_GAP_RATE_THRESHOLD = 0.2;
const NEGLIGIBLE_GAP_RATE_THRESHOLD = 0.05;
// A Gap subset "coherent enough to describe" if its own reentry rate is at
// least half of what the WHOLE Dataset already shows under the same key --
// i.e. it isn't dramatically MORE scattered than the rest of the Dataset.
const COHERENCE_RATIO_THRESHOLD = 0.5;

export interface BlueprintDecision {
  decision: FinalDecision;
  rationale: string;
  targetDescription: string | null; // populated only for A: what the new Primitive should target
}

export function buildBlueprint(gap: GapAnalysisResult, overlap: readonly OverlapPair[]): BlueprintDecision {
  if (gap.gapRate <= NEGLIGIBLE_GAP_RATE_THRESHOLD) {
    return {
      decision: "C",
      rationale: `공통 실패(5개 Primitive 전부 실패) 비율이 ${(gap.gapRate * 100).toFixed(1)}%(${gap.gapCount}/${gap.totalReplays}건)로 무시할 수준이다 -- 기존 Primitive 조합이 이미 거의 모든 Failure를 커버하므로 추가 Primitive 연구는 불필요하다.`,
      targetDescription: null,
    };
  }

  const isCoherent = gap.gapCoarseShapeReentryRate >= gap.datasetCoarseShapeReentryRate * COHERENCE_RATIO_THRESHOLD;

  if (gap.gapRate >= NEW_PRIMITIVE_GAP_RATE_THRESHOLD && isCoherent) {
    const top = gap.gapTopCoarseShapeGroups[0];
    return {
      decision: "A",
      rationale:
        `공통 실패 비율 ${(gap.gapRate * 100).toFixed(1)}%(${gap.gapCount}/${gap.totalReplays}건)로 상당한 Capability Gap이 존재하고, ` +
        `이 부분집합의 Coarse Shape 재등장률(${(gap.gapCoarseShapeReentryRate * 100).toFixed(1)}%)이 전체 Dataset(${(gap.datasetCoarseShapeReentryRate * 100).toFixed(1)}%) 대비 ` +
        `무의미한 수준으로 떨어지지 않아(=흩어진 잡음이 아니라 서술 가능한 공통 구조 존재), 이 Gap을 겨냥한 새 Primitive 설계가 실측으로 정당화된다.`,
      targetDescription: `평균 WrongWing ${gap.gapWrongWingAvg.toFixed(1)}(범위 ${gap.gapWrongWingRange[0]}-${gap.gapWrongWingRange[1]}), Parity 비율 ${(gap.gapParityRate * 100).toFixed(1)}%, 최대 Coarse Shape 그룹 "${top?.key ?? "-"}"(${top?.count ?? 0}건, 전체 Gap 중 ${gap.gapCount ? (((top?.count ?? 0) / gap.gapCount) * 100).toFixed(1) : "0"}%)`,
    };
  }

  const redundant = overlap.filter((o) => o.classification === "HIGH_REDUNDANCY");
  const rationale =
    gap.gapRate >= NEW_PRIMITIVE_GAP_RATE_THRESHOLD
      ? `공통 실패 비율은 ${(gap.gapRate * 100).toFixed(1)}%로 상당하지만, 이 부분집합의 Coarse Shape 재등장률(${(gap.gapCoarseShapeReentryRate * 100).toFixed(1)}%)이 전체 Dataset(${(gap.datasetCoarseShapeReentryRate * 100).toFixed(1)}%) 대비 뚜렷하게 낮아 흩어진 잡음에 가깝다 -- 단일한 새 Primitive로 겨냥하기 어렵고, 기존 Primitive의 조합/순서 개선 여지를 먼저 검토하는 편이 합리적이다.`
      : `공통 실패 비율이 ${(gap.gapRate * 100).toFixed(1)}%로 완전히 무시할 수준은 아니지만 새 Primitive를 정당화할 만큼 크지도 않다 -- ${
          redundant.length > 0
            ? `${redundant.map((r) => `${r.primitiveA}~${r.primitiveB}(Jaccard=${r.jaccard.toFixed(2)})`).join(", ")} 등 중복도가 높은 조합이 있어 기존 Primitive 조합/순서 개선의 여지가 있다.`
            : "기존 Primitive 조합/순서를 재검토할 여지가 있다."
        }`;

  return { decision: "B", rationale, targetDescription: null };
}
