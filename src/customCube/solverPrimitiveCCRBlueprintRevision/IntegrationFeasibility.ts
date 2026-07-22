// --- IntegrationFeasibility (CCR Integration Blueprint Revision Sprint
// v1) --------------------------------------------------------------------
// STEP5. Compares 3 strategies using STEP1-4's own already-real numbers --
// no new measurement, pure synthesis.
import type { CounterfactualResult } from "./CounterfactualSimulation";
import type { DependencyFinding } from "./ArchitectureDependencyAnalysis";

export interface StrategyProfile {
  strategy: "A_keepCurrent" | "B_budgetReservation" | "C_triggerChange";
  label: string;
  expectedCapability: string;
  expectedRuntime: string;
  risk: string;
  modificationScope: string;
}

export function compareIntegrationStrategies(counterfactuals: readonly CounterfactualResult[], dependencyFindings: readonly DependencyFinding[]): StrategyProfile[] {
  const zeroOffset = counterfactuals.find((c) => c.offsetMs === 0)!;
  const maxOffset = counterfactuals[counterfactuals.length - 1];
  const executorFinding = dependencyFindings.find((f) => f.category === "Executor Timing")!;

  return [
    {
      strategy: "A_keepCurrent",
      label: "A. 현 구조 유지 (Executor/Recovery 타이밍 변경 없음)",
      expectedCapability: `CCR 생성률 ${(zeroOffset.ccrGeneratedRate * 100).toFixed(1)}% 수준 유지 -- 실질적으로 REPAIR와 마찬가지로 드문(rare) 기여만 기대 가능.`,
      expectedRuntime: "변화 없음 (이미 실측된 +3.3% 수준).",
      risk: "낮음 -- 이미 production에 반영되어 Regression 0건으로 검증됨. 단, CCR이 설계 의도만큼 기여하지 못하는 상태가 계속됨.",
      modificationScope: "없음 (이미 완료된 상태 유지).",
    },
    {
      strategy: "B_budgetReservation",
      label: "B. Recovery Budget Reservation 변경 (RECOVERY_RESERVE_MS 확대 등)",
      expectedCapability: `Counterfactual(offset=${maxOffset.offsetMs}ms)이 실측한 CCR 생성률 ${(maxOffset.ccrGeneratedRate * 100).toFixed(1)}%까지 개선 가능성 -- Executor Timing이 dominant 원인이라는 STEP4 결과와 일치.`,
      expectedRuntime: "Recovery에 더 많은 예산을 미리 떼어주는 만큼, 기본 파이프라인(PAIR/FLIP/PARITY/ENDGAME)의 몫이 줄어들어 그쪽 성공률이 낮아질 위험 -- 상쇄 효과를 별도로 측정해야 함.",
      risk: `중간 -- ${executorFinding.evidence.slice(0, 80)}... Executor(fiveByFiveEdgeExecutor.ts)의 RECOVERY_RESERVE_MS 수정이 필요해 이번 Blueprint Revision Sprint의 범위를 벗어난다(Executor 수정 금지).`,
      modificationScope: "fiveByFiveEdgeExecutor.ts (RECOVERY_RESERVE_MS 등) -- Executor 수정 필요.",
    },
    {
      strategy: "C_triggerChange",
      label: "C. Recovery Trigger 변경 (더 일찍 호출하도록 SolverEngine/Executor 자체 재설계)",
      expectedCapability: "이론상 가장 큰 개선 여지 -- 기본 파이프라인이 예산을 다 쓰기 전에 Recovery가 개입할 기회를 구조적으로 확보.",
      expectedRuntime: "예측 어려움 -- 기본 파이프라인 자체의 동작 방식(태스크 순서/개별 예산)을 바꿔야 하므로 기존에 이미 튜닝된 PAIR/FLIP/PARITY/ENDGAME 균형이 깨질 위험.",
      risk: "높음 -- Executor.ts와 fiveByFiveEdgeSolverEngine.ts(Production Solver Core)의 근본적 재설계가 필요. 이번 Sprint(및 다음 Refinement/Retry Sprint)의 허용 범위를 크게 벗어난다.",
      modificationScope: "fiveByFiveEdgeExecutor.ts + fiveByFiveEdgeSolverEngine.ts (Production Solver Core) -- 광범위한 재설계 필요.",
    },
  ];
}
