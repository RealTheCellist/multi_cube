// --- MechanismSentences (State Taxonomy Sprint v2 STEP4) ------------------
// Synthesizes STEP1-3's structural findings into explicit sentence-form
// mechanism definitions per subtype -- no new computation, just naming
// what STEP1-3 already measured.
import type { CycleIsolationSubtype } from "./CycleIsolationSubtypes";
import type { ConflictOrigin } from "./ConflictCauseEffect";
import type { ParityGatedVerdict } from "./ParityGatedSplit";

export const CYCLE_ISOLATION_MECHANISMS: Record<CycleIsolationSubtype, string> = {
  BRIDGE_MISSING:
    "Bridge 생성 불가 -- WANTS-그래프가 2개 이상의 분리된 컴포넌트로 나뉘어 있어, 하나의 조각이 두 컴포넌트를 연결(bridge)하지 못하면 cycle을 완성할 수 없다. Directive의 'Bridge Missing' 카테고리가 실제로 이 데이터셋에 존재함을 확인.",
  BUDGET_RECOVERABLE:
    "탐색 예산 부족(DFS cutoff) -- 기존 Primitive가 구조적으로는 도달 가능하지만 400ms 기준 예산 내에서는 못 찾고 5000ms에서는 찾는다. 새 Primitive이 아니라 예산/우선순위 조정으로 해결 가능.",
  PURE_STRUCTURAL_ISOLATION:
    "순수 구조적 고립 -- 단일 컴포넌트, 예산을 늘려도 안 풀림. 기존 Primitive의 탐색 전략 자체가 이 cycle 형태에 도달하지 못하는 구조적 한계. 새 Capability 필요.",
  BRIDGE_MISSING_AND_BUDGET_RECOVERABLE:
    "Bridge Missing이면서 동시에 예산을 늘리면 풀리는 케이스 -- 컴포넌트가 분리되어 있지만 5000ms 내에서 우연히 발견됨. 드문 조합으로, 개별 검토 필요.",
};

export const CONFLICT_DOMINANT_MECHANISMS: Record<ConflictOrigin, string> = {
  PRECONDITION:
    "원래부터 있던 Conflict -- 스크램블/스냅샷 자체에 이미 존재하던 one-sided WANTS 의존성. 새 Primitive가 이 conflict를 깨는 sacrifice/setup move를 도입해야 함.",
  BYPRODUCT:
    "Pipeline이 스스로 만든 Conflict -- 원래 상태엔 없던 관계를 centers/wing-pairing 단계의 이동 자체가 만들어냄. Task 순서/우선순위 조정만으로 애초에 conflict가 생기지 않게 예방할 수 있는 가능성 -- 새 Primitive보다 Planner 개선을 먼저 검토해야 함.",
  MIXED: "혼합 -- 일부 conflict edge는 원래 있었고 일부는 pipeline 자체가 만들어냄. 두 메커니즘이 같은 케이스에 공존.",
};

export const PARITY_GATED_MECHANISMS: Record<ParityGatedVerdict, string> = {
  RECOVERY_RECOVERABLE:
    "Recovery layer(DISRUPT/SETUP/REPAIR/CCR)가 이미 풀 수 있음 -- production 루프가 50회 반복 안에 Recovery를 트리거하지 못함. 순수 Scheduling 문제, 새 Primitive 불필요.",
  BASE_PIPELINE_RECOVERABLE:
    "메인 파이프라인 Primitive(BASE/FLIP/CASE/PARITY)가 이미 풀 수 있음 -- 순서/우선순위 문제로 50회 반복 안에 못 찾음. 새 Primitive 불필요.",
  BUDGET_RECOVERABLE: "예산 확장 시 해결 -- 새 Primitive 불필요, 탐색 시간만 늘리면 됨.",
  TRUE_GAP: "진짜 Coverage Hole -- Parity + Cycle 조합에 특화된 새 Primitive Capability가 필요함.",
};
