// --- ArchitectureCostAnalysis (Recovery Architecture Review Sprint v1) -----
// STEP5. Runtime/Complexity/Primitive-utilization comparison for each of
// the 4 architectures, grounded in STEP1-4's own real numbers plus
// disclosed, reasoned qualitative estimates for the parts no existing
// measurement can cover (implementing an alternative architecture is out
// of this Sprint's own scope -- this is a design-cost comparison, not a
// benchmark of code that doesn't exist yet).
import type { ArchitectureId } from "./AlternativeArchitectureComparison";
import type { PerTypeProgressStats } from "./RecoveryNecessityAnalysis";

export interface ArchitectureCostProfile {
  id: ArchitectureId;
  runtimeImpact: string;
  implementationComplexity: "low" | "medium" | "high";
  primitiveUtilization: string;
}

export function analyzeArchitectureCosts(progressStats: readonly PerTypeProgressStats[]): ArchitectureCostProfile[] {
  const nonEndgameTotal = progressStats.filter((s) => s.type !== "ENDGAME").reduce((a, s) => a + s.attemptedCount, 0);
  const nonEndgameNoProgress = progressStats.filter((s) => s.type !== "ENDGAME").reduce((a, s) => a + s.noProgressCount, 0);

  return [
    {
      id: "current",
      runtimeImpact: "기준선(baseline) -- 이미 production에서 실측됨(CCR Production Integration Sprint v1: 평균 +3.3%, CCR 실제 기여 거의 0).",
      implementationComplexity: "low",
      primitiveUtilization: "REPAIR/CCR 모두 사실상 활용되지 못함(생성률 0%에 가까움) -- Primitive 자체의 잠재력 대비 실제 활용도가 매우 낮다.",
    },
    {
      id: "early",
      runtimeImpact: "PAIR/FLIP/PARITY/ENDGAME 기본 파이프라인의 몫이 줄어들어 그쪽 성공률이 낮아질 위험 -- 전체 Runtime 자체는 크게 늘지 않을 수 있으나(예산 총량은 동일), 기본 파이프라인의 Coverage가 희생될 수 있다.",
      implementationComplexity: "medium",
      primitiveUtilization: "Recovery(REPAIR/CCR 포함)의 활용도는 개선되나, Blueprint Revision Sprint v1의 counterfactual 실측상 개선 폭이 제한적(+300ms에도 CCR 4.1%)이라 큰 폭의 개선은 기대하기 어렵다.",
    },
    {
      id: "incremental",
      runtimeImpact: `PAIR/FLIP/PARITY 태스크의 no-progress 발생 시마다 소규모 Recovery를 추가하면, 그 발생 빈도(${nonEndgameTotal ? ((nonEndgameNoProgress / nonEndgameTotal) * 100).toFixed(1) : "0"}%)에 비례해 Runtime이 증가한다 -- 빈도가 낮으면 영향도 작다.`,
      implementationComplexity: "high",
      primitiveUtilization: "이론상 Primitive 활용도가 가장 높아질 수 있다(ENDGAME 도달 전에도 기회가 생김) -- 단, PAIR/FLIP 태스크 각각에 Recovery 개념을 이식하는 설계/구현 복잡도가 상당하다.",
    },
    {
      id: "opportunistic",
      runtimeImpact: "매 태스크마다 '시도할 가치가 있는가' 판단 자체의 오버헤드가 작게 추가되나(Gate 체크는 저렴), 실제 Recovery 실행 여부는 남은 예산에 의해 자연스럽게 제한된다.",
      implementationComplexity: "medium",
      primitiveUtilization: "Incremental보다는 보수적이지만 Current보다는 개선된 활용도 -- 예산이 남는 경우에만 선택적으로 활용하므로 위험 대비 실익의 균형이 상대적으로 낫다.",
    },
  ];
}
