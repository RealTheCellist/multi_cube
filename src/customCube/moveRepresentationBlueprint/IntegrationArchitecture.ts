// --- IntegrationArchitecture (Move Representation Blueprint Sprint v1,
// Required Analysis #3, Deliverable #3) --------------------------------------
// Defines WHERE a future "Cycle Rotation via Commutator composition"
// mechanism would plug into the existing, unmodified production
// architecture -- citing real existing types/patterns, never proposing a
// change to any protected file.
export interface IntegrationArchitectureSpec {
  input: string;
  output: string;
  plannerInterface: string;
  recoveryRelationship: string;
  primitiveLayerRelationship: string;
}

export function buildIntegrationArchitecture(): IntegrationArchitectureSpec {
  return {
    input: "cubies: Cubie[] (scratch clone, 기존 모든 Primitive와 동일한 계약), lib: WingLibrary, 그리고 analyzeMultiCycle()이 이미 제공하는 cycleNodes: string[] (기존 export, 재사용).",
    output: "기존 RecoveryStrategy 타입과 동일한 계약: Move[] | null -- 성공 시 cycle 전체를 net-improving하게 재배열하는 이동 시퀀스, 실패 시 null. 새 타입을 만들 필요 없이 기존 CandidateType 목록에 새 태그(예: \"CYCLE_COMMUTATOR\")만 추가하는 형태로 표현 가능.",
    plannerInterface: "Planner(SolveTask 생성 계층)는 변경 불필요 -- 이 메커니즘은 기존 BASE/FLIP/CASE/PARITY가 모두 실패하고 CCR도 실패한 이후 시점에, Recovery Layer의 generateRecoveryStrategies()가 이미 호출하는 것과 동일한 지점(genCCR과 같은 자리)에 새 genXxx() 후보 생성 함수 하나를 추가하는 형태로 통합 가능 -- Planner 자체의 Task 생성 로직과는 무관.",
    recoveryRelationship: "CCR과 동일한 통합 지점(Recovery의 candidate generator)을 공유하지만 메커니즘은 다르다: CCR은 기존 enumerateWingCandidates() 출력을 그대로 bounded DFS로 조합하려 하고(측정 결과 이 조합이 근본적으로 개선 leaf를 못 만듦), 새 메커니즘은 애초에 부작용이 적은 이동 단위(commutator)를 생성해 조합한다 -- Recovery의 후보 중 하나로 추가되는 것이지 Recovery 자체의 스케줄링/선택 로직(attemptRecovery, chooseBestRecovery)은 변경하지 않는다.",
    primitiveLayerRelationship: "BASE/FLIP/CASE/PARITY와 마찬가지로 '한 번 호출해 Move[] | null을 받는' 하나의 Primitive로 계약을 맞출 수 있다 -- 다만 내부적으로 여러 개의 저-부작용 이동을 조합(setup+commutator+setup역연산)하는 복합 구조라는 점이 다르다. 기존 CASE Library/BASE_ALG/FLIP_ALG/PARITY_ALG는 수정하지 않는다.",
  };
}
