// --- IntegrationPointAnalysis (CCR Integration Blueprint Sprint v1) --------
// STEP1. Compares 4 candidate Integration Points, grounded in the REAL
// pipeline architecture (fiveByFiveEdgeSolverEngine.ts/
// fiveByFiveEdgeExecutor.ts/fiveByFiveEdgeRecovery.ts, read ONLY, never
// modified here):
//
//   - "REPAIR 이전"/"REPAIR 이후": inside the Recovery layer
//     (generateRecoveryStrategies' own candidate list -- DISRUPT, DISRUPT,
//     SETUP, REPAIR today). This is the ONLY layer Recovery ever runs at
//     all: executeTask() gates recoveryEligible on `task.type === "ENDGAME"`
//     -- PAIR/FLIP/PARITY tasks never trigger Recovery, no matter what.
//     REPAIR itself was placed here (Integration Blueprint Sprint v1, per
//     fiveByFiveEdgeRecovery.ts's own comment), so this placement is a
//     directly measurable extension of an already-proven pattern -- CCR
//     Prototype Sprint v1's own 335-snapshot benchmark already tested
//     CCR exactly as if it were here (a Recovery-style candidate called
//     directly against a real residual cube state).
//   - "PARITY 이전"/"PARITY 이후": inside the main Planner-driven task
//     loop, as a NEW SolveTaskType alongside PAIR/FLIP/PARITY/ENDGAME
//     (fiveByFiveEdgeSolverTypes.ts's own SolveTaskType union). This would
//     require Planner changes (a new MacroGoalType/task-generation rule)
//     -- explicitly out of scope for a "no product code" Blueprint Sprint,
//     and, more importantly, its true Coverage is NOT measurable from the
//     existing 335-snapshot dataset: every snapshot there is a state
//     captured AFTER the full pipeline (including PARITY/ENDGAME/Recovery)
//     already ran and failed -- there is no captured "cube state exactly
//     before PARITY runs" to test a pre-PARITY Gate check against. This
//     limitation is disclosed explicitly, not glossed over.
import type { ProductionPathRecord } from "../solverPrimitiveIntegrationV2/ProductionPathAnalysis";

export type IntegrationPointId = "repair_before" | "repair_after" | "parity_before" | "parity_after";

export interface IntegrationPointProfile {
  id: IntegrationPointId;
  label: string;
  layer: "Recovery" | "MainPipeline";
  measurable: boolean; // can Coverage/callFrequency be measured from the existing 335-snapshot dataset, or only reasoned architecturally?
  callFrequencyNote: string;
  coverageNote: string;
  interactionNote: string;
}

export function describeIntegrationPoints(): IntegrationPointProfile[] {
  return [
    {
      id: "repair_before",
      label: "REPAIR 이전 (Recovery 후보 순서에서 REPAIR보다 먼저 생성)",
      layer: "Recovery",
      measurable: true,
      callFrequencyNote:
        "Recovery 자체가 트리거되는 빈도(=ENDGAME 태스크가 기본 파이프라인에서 0 progress일 때만)로 상한이 정해진다 -- 이 335건 dataset에서 실측 가능 (본 Sprint STEP5에서 재측정).",
      coverageNote:
        "REPAIR와 CCR의 Gate가 서로소(cycleLength 2~4 vs 5~6)이므로, 생성 순서(이전/이후)는 최종 결과에 영향이 없다 -- 어느 쪽이 성공하든 같은 State에서 동시에 성공할 수 없기 때문. 순서는 오직 '이 state가 REPAIR 대상이 아님을 얼마나 빨리 아는가'라는 지연시간 문제일 뿐이다.",
      interactionNote:
        "REPAIR를 먼저 시도하면 REPAIR의 Gate 체크(analyzeMultiCycle+countConflictEdges, 매우 저렴)가 즉시 실패를 반환하므로 CCR 차례로 넘어가는 데 걸리는 추가 지연은 무시할 수준이다. CCR을 먼저 시도해도 대칭적으로 마찬가지.",
    },
    {
      id: "repair_after",
      label: "REPAIR 이후 (현재 REPAIR가 생성되는 순서, 그 다음에 CCR)",
      layer: "Recovery",
      measurable: true,
      callFrequencyNote: "REPAIR 이전과 동일 -- Recovery 트리거 빈도가 상한.",
      coverageNote: "REPAIR 이전과 동일 (Gate 서로소).",
      interactionNote:
        "REPAIR가 이미 이 연구 전체에서 '가장 나중에 추가된 후보'로 자리잡은 관례(RepresentationPrimitiveSelector.ts의 FIXED_BASELINE_ORDER 주석: 'BP1 appended last as the newest/most expensive addition')와 일치 -- CCR을 REPAIR 뒤에 추가하는 것이 기존 코드베이스의 확립된 패턴과 가장 자연스럽게 들어맞는다.",
    },
    {
      id: "parity_before",
      label: "PARITY 이전 (메인 파이프라인, PARITY 태스크보다 먼저 실행되는 새 SolveTaskType)",
      layer: "MainPipeline",
      measurable: false,
      callFrequencyNote:
        "이론상 100%에 가까움(모든 solve() 호출이 도달) -- 하지만 이는 Planner에 새 MacroGoalType/Task 생성 규칙을 추가해야 함을 의미하며, 이번 Sprint의 '절대 금지: Planner 수정'을 위반한다.",
      coverageNote:
        "측정 불가능: 335개 snapshot은 전부 '전체 파이프라인(PARITY/ENDGAME/Recovery 포함)이 이미 실행되고 실패한 이후'의 상태다. PARITY 실행 '이전' 상태의 cube를 이 dataset에서 재구성할 방법이 없다 -- 새로운 데이터 수집(PARITY 실행 전 시점의 snapshot capture)이 필요하며 이는 이번 Sprint 범위 밖이다.",
      interactionNote:
        "PAIR/FLIP/PARITY 태스크들은 실제로 cube 상태를 변경한다 -- CCR가 의존하는 WANTS-그래프 cycle 구조가 이 태스크들의 부수효과로 생성되거나 파괴될 수 있어, '이전' 배치의 실제 상호작용은 근거 있는 추측 이상이 되기 어렵다.",
    },
    {
      id: "parity_after",
      label: "PARITY 이후 (메인 파이프라인, PARITY와 ENDGAME 사이의 새 SolveTaskType)",
      layer: "MainPipeline",
      measurable: false,
      callFrequencyNote: "PARITY 이전과 동일한 이유로 측정 불가 + Planner 수정 필요.",
      coverageNote:
        "PARITY 태스크 자체(tryExactCaseMatch)가 진행을 만들면 cube 상태가 바뀌어 CCR의 Gate 적합성이 달라질 수 있다 -- 이 역시 이 dataset만으로는 검증 불가.",
      interactionNote:
        "Recovery 레이어(REPAIR 이전/이후)와 기능적으로 유사한 지점이지만, ENDGAME이 아니라 자체 SolveTaskType이 되면 TASK_LOCAL_BUDGET_MS(120ms) 같은 PAIR/FLIP/PARITY용 짧은 예산 체계에 종속될 위험이 있다 -- CCR 자신의 큰 예산 요구(STEP3 참고)와 충돌한다.",
    },
  ];
}

// STEP1's own measurable half: real call-frequency at the Recovery layer,
// computed from the SAME real production-path records STEP5's Integration
// Simulation collects (analyzeProductionPath, read-only, unmodified) --
// avoids a second, separate real-solve() pass just for this STEP.
export interface RecoveryLayerCallFrequency {
  totalSnapshots: number;
  recoveryTriggeredCount: number;
  recoveryTriggeredRate: number;
}

export function measureRecoveryLayerCallFrequency(records: readonly ProductionPathRecord[]): RecoveryLayerCallFrequency {
  const totalSnapshots = records.length;
  const recoveryTriggeredCount = records.filter((r) => r.recoveryTriggered).length;
  return {
    totalSnapshots,
    recoveryTriggeredCount,
    recoveryTriggeredRate: totalSnapshots ? recoveryTriggeredCount / totalSnapshots : 0,
  };
}

export interface IntegrationPointRecommendation {
  chosen: IntegrationPointId;
  rationale: string;
}

export function recommendIntegrationPoint(freq: RecoveryLayerCallFrequency): IntegrationPointRecommendation {
  return {
    chosen: "repair_after",
    rationale:
      `측정 가능한 두 후보(REPAIR 이전/이후)는 Gate가 서로소이므로 결과상 동등하다 -- 결정은 관례와 코드 가독성 문제다: REPAIR를 이미 '가장 나중에 추가된 후보'로 두는 기존 패턴을 그대로 따라 CCR도 REPAIR 뒤에 둔다. ` +
      `측정 불가능한 두 후보(PARITY 이전/이후)는 Planner 수정이 필요하고(이번 Sprint 절대 금지 항목), Coverage/상호작용을 검증할 데이터가 없다 -- 따라서 이번 Blueprint에서는 채택할 수 없다. ` +
      `Recovery 레이어 자체의 실측 호출 빈도는 ${(freq.recoveryTriggeredRate * 100).toFixed(1)}%(${freq.recoveryTriggeredCount}/${freq.totalSnapshots})로, CCR이 실제로 차례를 받을 수 있는 상한을 이 값이 정의한다.`,
  };
}
