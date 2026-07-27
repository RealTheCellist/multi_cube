// --- CapabilitySpecification (Deep Cycle Resolver Validation Sprint v1,
// RQ-3) ---------------------------------------------------------------------
// "필요한 최소 Capability는 무엇인가" -- answered as a DATA specification
// only (no executable search code), built entirely from this Sprint's own
// measured evidence (MechanismIdentification.ts's Gate/strategy probes,
// PrimitiveFailureMap.ts's budget sweep + repeat-trial stability). Per the
// Directive's own "완료 기준": this Sprint's deliverable is the capability
// DEFINITION, never an implementation.
import type { CcrMechanismProbe } from "./MechanismIdentification";
import type { CaseFailureMap } from "./PrimitiveFailureMap";

export interface DeepCycleResolverCapabilitySpec {
  inputCondition: string;
  requiredState: string;
  expectedOutput: string;
  searchDirection: string;
  expectedCost: string;
  evidenceNote: string;
}

export function buildCapabilitySpec(probes: CcrMechanismProbe[], failureMaps: CaseFailureMap[]): DeepCycleResolverCapabilitySpec {
  const solvedLabels = failureMaps.filter((f) => f.sweeps.find((s) => s.primitive === "RECOVERY")?.minSucceedingBudgetMs !== null).map((f) => f.label);
  const unsolvedLabels = failureMaps.filter((f) => f.sweeps.find((s) => s.primitive === "RECOVERY")?.minSucceedingBudgetMs === null).map((f) => f.label);
  const stabilityNotes = failureMaps
    .map((f) => `${f.label}: ${(f.recoveryStability.successRate * 100).toFixed(0)}% (${f.recoveryStability.successCount}/${f.recoveryStability.trials} @ ${f.recoveryStability.atBudgetMs}ms)`)
    .join(", ");

  return {
    inputCondition:
      "WANTS-그래프 상 단일 컴포넌트(componentCount=1) 내 conflict edge 없이(conflictEdgeCount=0) 고립된 5~6-길이 cycle 하나 -- CCRGate.ts의 기존 Gate 정의와 정확히 일치. 이번 Sprint에서 확인한 RECOVERY_REQUIRED 3건 전원이 이 조건을 만족(allGateEligible=true).",
    requiredState:
      "Cycle을 구성하는 각 슬롯의 wrong wing이 enumerateWingCandidates()로 열거 가능한 후보 이동을 가져야 함(branchingFactor>0). 이 조건이 깨지면(후보 0개) 어떤 탐색 전략을 쓰든 애초에 진입조차 불가능.",
    expectedOutput: `cycle 전체를 net-improving하게 재배열하는 이동 시퀀스. 측정 결과 ${solvedLabels.length}/${solvedLabels.length + unsolvedLabels.length}건에서 기존 CCR(runCCRPrototype, singleCycle/multiCycle) 구현이 이미 이 출력을 생성함.`,
    searchDirection:
      "cycle 노드를 따라가며 매 hop마다 최대 3개 후보로 가지치기하는 bounded DFS(기존 CCRPrototype.ts의 runBoundedDfs) -- '새로운 탐색 알고리즘'이 아니라 이미 존재하는 정확히 이 메커니즘. 유일하게 측정으로 확인된 한계는 MAX_LEAVES_EXPLORED=64라는 고정 leaf cap: 예산(budget)을 140ms에서 30000ms(214배)로 늘려도 결과가 전혀 바뀌지 않는 케이스가 실측으로 확인됨(아래 evidenceNote) -- 즉 이 mechanism의 완전성 한계는 '시간'이 아니라 'leaf cap'.",
    expectedCost:
      "시간 비용은 이미 낮음(500~2000ms 내 해결되는 케이스 존재) -- 진짜 비용은 leaf cap을 늘릴 때의 탐색 폭발(3^6=729 조합 vs 현재 cap 64)이며, 이는 새 Primitive 설계 비용이 아니라 기존 CCR의 파라미터/휴리스틱 튜닝 비용에 해당.",
    evidenceNote: `Repeat-trial stability (N=${failureMaps[0]?.recoveryStability.trials ?? 10}): ${stabilityNotes}. Unsolved-at-any-tested-budget labels: ${unsolvedLabels.join(", ") || "(none)"}.`,
  };
}
