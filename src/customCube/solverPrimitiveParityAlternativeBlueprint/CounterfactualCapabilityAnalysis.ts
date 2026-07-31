// --- CounterfactualCapabilityAnalysis (Parity-Gated Cycle Alternative
// Primitive Blueprint Sprint v1, STEP4) ----------------------------------------
// No new mechanism is implemented here. This module computes REAL
// structural grounding data (component-count distribution among the 41
// real PRIMITIVE_FAILURE cases, via the real, unmodified
// ComponentDetection.ts) to bound each STEP2 mechanism's theoretical
// ceiling, and combines that with clearly-disclosed qualitative
// reasoning (since none of the 4 mechanisms can be measured without
// implementing them, which this Sprint explicitly does not do).
import { detectComponents } from "../parityGatedCyclePrototypeV1/ComponentDetection";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";
import type { MechanismId } from "./AlternativeMechanisms";

export interface StructuralGrounding {
  totalFailureCases: number;
  exactlyTwoComponentsCount: number;
  moreThanTwoComponentsCount: number;
  candidateGenerationFailureCount: number;
  candidateGenerationFailureExactlyTwoCount: number;
  candidateGenerationFailureMoreThanTwoCount: number;
  avgSmallestComponentSize: number;
  avgLargestComponentSize: number;
  observedSingleWingValidRate: number; // avgValidCount/avgPairsAttempted from Prototype Refinement Sprint v1, cited not re-derived
}

export function computeStructuralGrounding(
  failureHoles: readonly HoleCase[],
  candidateGenerationFailureLabels: ReadonlySet<string>,
  observedSingleWingValidRate: number
): StructuralGrounding {
  const rows = failureHoles.map((h) => {
    const components = detectComponents(h.cubies);
    const sizes = components.components.map((c) => c.length).sort((a, b) => b - a);
    return { label: h.label, componentCount: components.components.length, sizes };
  });

  const exactlyTwoComponentsCount = rows.filter((r) => r.componentCount === 2).length;
  const moreThanTwoComponentsCount = rows.filter((r) => r.componentCount > 2).length;
  const cgfRows = rows.filter((r) => candidateGenerationFailureLabels.has(r.label));
  const cgfExactlyTwo = cgfRows.filter((r) => r.componentCount === 2).length;
  const cgfMoreThanTwo = cgfRows.filter((r) => r.componentCount > 2).length;

  return {
    totalFailureCases: rows.length,
    exactlyTwoComponentsCount,
    moreThanTwoComponentsCount,
    candidateGenerationFailureCount: cgfRows.length,
    candidateGenerationFailureExactlyTwoCount: cgfExactlyTwo,
    candidateGenerationFailureMoreThanTwoCount: cgfMoreThanTwo,
    avgSmallestComponentSize: rows.reduce((s, r) => s + r.sizes[r.sizes.length - 1], 0) / rows.length,
    avgLargestComponentSize: rows.reduce((s, r) => s + r.sizes[0], 0) / rows.length,
    observedSingleWingValidRate,
  };
}

export interface TheoreticalCapabilityEstimate {
  mechanismId: MechanismId;
  applicablePopulationPercent: number; // % of the 41 failure cases this mechanism could in principle ever address
  estimatedResolutionPercentRange: [number, number]; // [low, high] rough theoretical bound, heavily caveated
  confidenceLevel: "grounded" | "qualitative" | "speculative";
  rationale: string;
}

export function estimateTheoreticalCapability(grounding: StructuralGrounding): TheoreticalCapabilityEstimate[] {
  const p = grounding.observedSingleWingValidRate; // e.g. 0.37/20.2 ≈ 0.018

  return [
    {
      mechanismId: "DUAL_WING_BRIDGE",
      applicablePopulationPercent: 100, // applies to the same population the current mechanism already targets (2-wing coordination doesn't require >2 components)
      estimatedResolutionPercentRange: [(1 - (1 - p) ** 2) * 100, 15],
      confidenceLevel: "qualitative",
      rationale:
        `단순 독립 시행 가정 시 이론적 하한은 1-(1-${p.toFixed(4)})^2 ≈ ${((1 - (1 - p) ** 2) * 100).toFixed(1)}% ` +
        `(단일 이동 성공률의 약 2배) -- 이는 최소 추정치이며, 실제로는 두 이동이 서로의 collateral을 상쇄할 ` +
        `가능성이 있어 상한은 정성적으로만 "15% 내외"로 잡았다(실측 없이는 검증 불가, "qualitative" 신뢰도).`,
    },
    {
      mechanismId: "BRIDGE_CHAIN",
      applicablePopulationPercent: 100,
      estimatedResolutionPercentRange: [0, 20],
      confidenceLevel: "speculative",
      rationale:
        "매 단계가 실제로 병합에 '더 가까워지는 방향'으로 상태를 옮긴다는 보장이 전혀 없다 -- 반복이 " +
        "오히려 상태를 더 나쁘게 만들 수도 있다(rejected 이동도 다른 wing을 shuffle함). 그라운딩 데이터가 " +
        "없어 상한/하한 모두 speculative -- 구현 후 실측이 필수.",
    },
    {
      mechanismId: "TEMPORARY_EXPANSION",
      applicablePopulationPercent: 100,
      estimatedResolutionPercentRange: [0, 20],
      confidenceLevel: "speculative",
      rationale:
        "'병합까지의 거리' 척도 자체가 설계되지 않아 이론적 추정이 사실상 불가능하다 -- Bridge Chain과 " +
        "같은 상한을 잠정 적용했으나 근거는 없음(척도 설계 이전에는 Level4 분석 자체가 성립하지 않음).",
    },
    {
      mechanismId: "MULTI_COMPONENT_MERGE",
      applicablePopulationPercent: (grounding.moreThanTwoComponentsCount / grounding.totalFailureCases) * 100,
      estimatedResolutionPercentRange: [0, (grounding.moreThanTwoComponentsCount / grounding.totalFailureCases) * 100],
      confidenceLevel: "grounded",
      rationale:
        `실측(이번 Sprint 그라운딩): componentCount>2인 실패 케이스는 ${grounding.moreThanTwoComponentsCount}/` +
        `${grounding.totalFailureCases}(${((grounding.moreThanTwoComponentsCount / grounding.totalFailureCases) * 100).toFixed(1)}%)뿐이다 -- ` +
        "이 메커니즘이 원천적으로 다룰 수 있는 케이스 자체가 이 비율로 상한이 정해진다(설령 100% 성공해도 " +
        `${((grounding.moreThanTwoComponentsCount / grounding.totalFailureCases) * 100).toFixed(1)}% 초과 불가능).`,
    },
  ];
}
