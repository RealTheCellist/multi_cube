// --- SafetyAnalysis (Incremental Recovery Blueprint Sprint v1) -------------
// STEP5. Reasoned, code-grounded safety analysis of what Incremental
// Recovery would need to guard against -- no new code is run here beyond
// what STEP1-4 already produced; this synthesizes real architectural
// facts already established in this whole research arc.
export interface SafetyFinding {
  category: "Primitive 중복" | "Scheduler 충돌" | "Budget 충돌" | "Regression 위험" | "Infinite Retry 가능성";
  severity: "low" | "medium" | "high";
  finding: string;
}

export function analyzeSafety(): SafetyFinding[] {
  return [
    {
      category: "Primitive 중복",
      severity: "low",
      finding:
        "CCR/REPAIR의 Gate/탐색 코드 자체는 그대로 재사용되므로 알고리즘 중복은 없다 -- 다만 '이 PAIR 태스크 지점에서 Incremental Recovery를 호출할지' 판단 로직이 ENDGAME의 Recovery 진입 로직과 별도로 존재해야 하므로, 호출부(call-site) 수준의 코드 중복은 불가피하다. 한 snapshot 내에서 PAIR 단계 성공이 ENDGAME 도달 자체를 막아 실질적 작업 중복(같은 상태에 대해 두 번 시도)은 자연히 방지된다.",
    },
    {
      category: "Scheduler 충돌",
      severity: "high",
      finding:
        "가장 중요한 위험. fiveByFiveEdgeExecutor.ts의 executeTask() 자체 주석이 이미 명시하듯, Recovery는 반드시 '실제 top-level 실행 루프'에서만 작동해야 하며 Planner v2의 simulateStrategy() 미리보기 경로에는 절대 배선되면 안 된다 -- Recovery의 타이밍 민감성(shuffle 기반 탐색 등)이 Planner의 '동일한 Cube는 항상 동일한 Strategy를 선택한다' 결정성 보장을 깨는 버그를 이미 한 번 유발했었다(이 세션 이전에 이미 수정된 이력). Incremental Recovery를 PAIR 태스크에 연결할 때 이 구분을 놓치면 동일한 버그가 재발한다 -- Blueprint의 Scheduling 명세에 '오직 top-level 실행 루프에서만, allowRecovery 플래그로 명시적으로 게이팅'을 반드시 포함해야 한다.",
    },
    {
      category: "Budget 충돌",
      severity: "medium",
      finding:
        "PAIR/FLIP 태스크는 이미 TASK_LOCAL_BUDGET_MS=120ms의 짧은 자체 예산 안에서 동작한다(한 개의 정체된 태스크가 전체 계획 예산을 다 쓰는 것을 막기 위한 기존 안전장치). Incremental Recovery를 이 120ms 창 '안에' 넣으면 기존 PAIR 검색(tryFixWing 등) 자체의 몫을 줄이게 되고, '밖에'(태스크별 예산과 별개로) 두면 전체 예산 구조 자체를 재설계해야 한다 -- 이번 Sprint의 STEP3 실측(예: reservedSlice 정책)은 전자에 가까운 절충안이다.",
    },
    {
      category: "Regression 위험",
      severity: "low",
      finding:
        "CCR/REPAIR 모두 이미 Deferred Validation(자기 자신의 validateDeferred 호출로 net-improvement만 채택)을 내장하고 있으므로, Incremental Recovery로 호출 위치만 바뀌어도 이 불변식은 그대로 유지된다 -- REPAIR가 4개 Sprint에 걸쳐 Regression 0건을 유지한 것과 동일한 안전장치.",
    },
    {
      category: "Infinite Retry 가능성",
      severity: "medium",
      finding:
        "attemptRecovery()는 이미 방문한 상태를 해시로 기록해(visited Set) 루프를 방지한다. Incremental Recovery가 매 PAIR 태스크마다 독립적으로 호출되면, 서로 다른 호출 간에는 이 visited 정보가 공유되지 않는다 -- 한 태스크에서 Incremental Recovery가 실패로 되돌린 상태를 다음 태스크가 다시 만들어 재시도를 유발하는 시나리오가 이론적으로 가능하다. Blueprint는 여러 PAIR 태스크에 걸친 전역 visited 추적, 혹은 태스크당 최대 1회 시도라는 명시적 상한을 Safety Contract에 포함해야 한다.",
    },
  ];
}
