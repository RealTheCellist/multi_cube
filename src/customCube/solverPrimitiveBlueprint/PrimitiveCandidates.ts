// --- PrimitiveCandidates (Solver Primitive Blueprint Sprint v1) ----------
// STEP3: designs candidate new Primitives -- SPECIFICATION only, no
// implementation -- grounded in this Sprint's own real STEP1/STEP2
// findings (real run: Gap 47/150). The dominant, measured Gap signature is
// NOT "very messy states" -- it's the opposite: WrongWing 3-5 is
// over-represented 3.19x, Cycle count 0-1 is over-represented ~2.4x, Swap
// edges = 0 is over-represented 1.62x (80.9% of Gap vs 50.0% dataset-wide).
// In other words, Gap replays are disproportionately NEAR-SOLVED states
// whose remaining wrong wings have almost NO WANTS-graph structure to
// exploit -- exactly the states BASE/PARITY/BP-1 (all graph/cycle-driven)
// have nothing to grab onto, and BP-1 specifically requires a 4+ cycle
// (STEP2) that most of these states never have.
//
// Each candidate defines: 목적(purpose)/Preconditions/Allowed Operations/
// Expected Effect/실패 조건(failure conditions), plus a COMPUTABLE
// precondition predicate over GapReplayFeatures (STEP1's own structural
// fields) so STEP4 can count real, structural coverage -- never an actual
// solve/search, per this Sprint's "성능 측정 금지" scope.
import type { GapReplayFeatures } from "./GapStructuralAnalysis";

export interface PrimitiveCandidate {
  name: string;
  purpose: string;
  preconditions: string;
  allowedOperations: string;
  expectedEffect: string;
  failureConditions: string;
  groundedIn: string; // which STEP1/STEP2 finding this candidate targets
  matchesPrecondition: (f: GapReplayFeatures) => boolean;
  // Disclosed integrity flag (see PrimitiveBlueprint.ts): true only for a
  // candidate whose Allowed Operations introduce a genuinely NEW
  // capability the 5 existing Primitives don't have. A candidate whose
  // "new" behavior is really just an existing Primitive's search
  // budget/parameters widened (same operations, same preconditions it
  // already targets) is NOT a new Primitive by this Sprint's own Research
  // Exit Criteria ("② 모든 후보 Primitive가 기존 Primitive의 단순
  // 조합/변형으로 환원된다") -- its Coverage number must not be allowed to
  // carry the A/B/C decision on its own.
  isGenuinelyNovel: boolean;
}

export const CANDIDATE_PRIMITIVES: PrimitiveCandidate[] = [
  {
    name: "Slot Perturbation Primitive (고립 Wrong Wing 해소)",
    purpose:
      "목적지 slot이 이미 '완성(SolvedPair/WingPair)'으로 분류되어 WANTS-그래프에 edge가 아예 생기지 않는 '고립된' wrong wing을 위해, 목적지 slot을 일시적으로 흐트러뜨려(perturb) 공간을 만든 뒤 대상 wing을 옮기고, 원래 있던 조각을 복귀(restore)시키는 3단계 연산.",
    preconditions: "대상 replay의 Cycle 수=0, Swap Edge 수=0, Conflict Edge 수=0 (WANTS-그래프에 edge가 전혀 없음 -- 그래프 기반 5개 기존 Primitive 전부가 신호를 못 받는 상태).",
    allowedOperations: "1) 목적지 slot의 기존 wing 하나를 임시 위치로 이동(perturb, 기존 enumerateWingCandidates 재사용). 2) 대상 wrong wing을 비워진 목적지로 이동(insert). 3) 원래 있던 wing을 그 다음 목적지(혹은 원위치)로 복귀(restore, BASE 로직 재귀 재사용).",
    expectedEffect: "wrongWingCount가 최소 1 감소하거나, 고립됐던 wrong wing이 그래프상 새 WANTS edge를 갖게 되어 후속 BASE/BP-1 적용이 가능한 상태로 전이된다.",
    failureConditions: "perturb 대상 slot 자체도 또 다른 finished slot에 의존적이라 연쇄적으로 막히는 경우(다단계 의존 체인), 또는 restore 단계의 목적지가 이미 다른 조각에 점유된 경우.",
    groundedIn: "STEP1: Cycle count=0(over-rep 2.48x)/Swap count=0(over-rep 1.62x, Gap의 80.9%) 동시 발생. STEP2: BASE/PARITY/BP-1 모두 그래프 edge가 있어야 작동하는데, 이 부분집합은 edge 자체가 없다.",
    matchesPrecondition: (f) => f.cycleCount === 0 && f.swapEdgeCount === 0 && f.conflictEdgeCount === 0,
    isGenuinelyNovel: true, // "finished" slot을 의도적으로 흐트러뜨리는 연산은 5개 기존 Primitive 어디에도 없음
  },
  {
    name: "Low-Structure Multi-Hop Bridge (2~3-hop 확장 탐색)",
    purpose: "BP-1(BoundedResolver)이 요구하는 4+ Cycle에 못 미치지만(길이 2~3), BASE의 1-hop 탐색만으로는 풀리지 않는 '작은 규모의 얽힘'을 위해, 2~3-hop까지 허용하는 경계 탐색.",
    preconditions: "WrongWingCount 3~8 (STEP1에서 이 구간이 over-represented), Cycle 수 <=1, Swap Edge 수=0 -- BP-1의 4+ Cycle 게이트 미달이면서 완전한 무구조(Candidate 1 대상)도 아닌 중간 지대.",
    allowedOperations: "enumerateWingCandidates(기존, 미수정)를 재사용하되 BASE의 '1-hop만 허용' 게이트를 풀어 2~3-hop까지 bounded backtracking (BP-1의 접근 방식을 재사용하되 4+ Cycle 게이트 없이 저구조 상태에도 적용, Deferred Validation으로 최종 검증).",
    expectedEffect: "최장 Cycle이 짧아 BP-1이 커버하지 못하는 '작은 규모 얽힘'을 해소, wrongWingCount 순감소.",
    failureConditions: "2~3-hop 이내에 유효한 경로가 전혀 없는 경우(진짜 고립된 조각 -- Candidate 1이 다뤄야 할 케이스).",
    groundedIn: "STEP1: Cycle count=0(gap 14.9%/dataset 6.0%, ratio 2.48), count=1(gap 29.8%/dataset 12.7%, ratio 2.35) 모두 over-rep, count=3은 오히려 under-rep(ratio 0.40) -- '구조가 적을수록 못 푼다'는 패턴이 뚜렷. STEP2: BP-1은 4+ Cycle에서만 활성화되므로 이 대역은 애초에 BP-1의 사각지대.",
    matchesPrecondition: (f) => f.wrongWingCount >= 3 && f.wrongWingCount <= 8 && f.cycleCount <= 1 && f.swapEdgeCount === 0,
    isGenuinelyNovel: true, // BP-1의 4+ Cycle 게이트를 낮춘 2~3-hop 탐색은 기존 5개 Primitive 중 누구도 커버하지 않는 길이 대역
  },
  {
    name: "Parity-Aware Extended Search (탐색 폭 확장)",
    purpose: "기존 PARITY(bestFixOverall/tryEndgameMultiPly)가 Parity=true인 Gap replay에서도 실패하는 경우를 위해, 더 넓은 탐색 폭/깊이를 허용.",
    preconditions: "Parity=true.",
    allowedOperations: "기존 bestFixOverall/tryEndgameMultiPly와 동일한 탐색 방식을 유지하되 deadline/후보 수 파라미터만 확장.",
    expectedEffect: "PARITY가 시간/폭 부족으로 놓치던 해를 찾을 가능성 증가.",
    failureConditions: "탐색 폭을 넓혀도 애초에 존재하지 않는 해(구조적으로 도달 불가능한 경우).",
    groundedIn: "STEP2: Gap 47건 중 Parity=true 25건(53.2%) -- PARITY의 대상 조건과 겹치는 replay가 많음에도 실패.",
    matchesPrecondition: (f) => f.parity,
    // 정직 공개: 이 후보는 Allowed Operations가 기존 bestFixOverall/
    // tryEndgameMultiPly와 완전히 동일하고(파라미터만 확장), Preconditions도
    // 기존 PARITY가 이미 대상으로 삼는 조건(Parity=true)과 동일하다 -- 이는
    // Research Exit Criteria ②("후보 Primitive가 기존 Primitive의 단순
    // 조합/변형으로 환원된다")에 해당할 가능성이 높은, 새 Primitive가 아닌
    // 기존 Primitive 튜닝이다. Coverage 수치가 가장 높다는 이유만으로
    // Blueprint 결정을 이 후보가 좌우하게 두지 않는다(PrimitiveBlueprint.ts
    // 참고).
    isGenuinelyNovel: false,
  },
];
