// --- CandidateExpansion (Solver Primitive Blueprint Refinement Sprint v1)
// STEP3: commits to REFINED preconditions for the 2 genuinely-novel
// Blueprint Sprint v1 candidates (choosing Level 2 from STEP2's sweep --
// disclosed as a middle-ground choice, not the loosest level, since the
// loosest level in STEP2 exists only to show a ceiling, not as a real
// recommendation), and adds 2 brand-new candidates grounded in STEP1's own
// "which precondition clause blocks uncovered replays most often" finding
// plus Primitive Blueprint Sprint v1's own STEP2 (conflict-dominance
// diagnosis for BASE's failure). Conforms to the SAME PrimitiveCandidate
// shape Blueprint Sprint v1 defined (unmodified import) so STEP4 can reuse
// its Coverage/Overlap/Union functions without duplicating them.
import type { GapReplayFeatures } from "../solverPrimitiveBlueprint/GapStructuralAnalysis";
import type { PrimitiveCandidate } from "../solverPrimitiveBlueprint/PrimitiveCandidates";

const REFINED_SLOT_PERTURBATION: PrimitiveCandidate = {
  name: "Slot Perturbation Primitive (완화됨, Level 2)",
  purpose: "목적지 slot이 '완성'으로 분류돼 WANTS-그래프 edge가 거의 없는 상태를 위해, 목적지 slot을 일시적으로 흐트러뜨려 공간을 만든 뒤 대상 wing을 옮기고 복귀시키는 3단계 연산 -- 원안(edge 전부 0)이 실측상 전혀 매칭되지 않아, '거의 없음'까지 완화.",
  preconditions: "Cycle 수<=1, Swap Edge 수<=2, Conflict Edge 수<=2 (STEP2 Level 2) -- 원안(전부=0)이 Gap 어디에도 없었기 때문에, 그래프 구조가 '희박'한 수준까지 완화.",
  allowedOperations: "원안과 동일: 1) 목적지 slot의 기존 wing 임시 이동(perturb). 2) 대상 wrong wing 이동(insert). 3) 원래 조각 복귀(restore).",
  expectedEffect: "원안과 동일 -- wrongWingCount 순감소 또는 고립됐던 wrong wing이 그래프상 새 WANTS edge를 갖는 상태로 전이.",
  failureConditions: "완화된 조건 안에서도 실제로 '완성 slot 흐트러뜨리기'가 필요 없는 replay가 섞여 들어와(그래프에 이미 edge가 몇 개 있으므로 BASE/BP-1이 다룰 수 있는 경우도 포함) Primitive가 불필요하게 발동할 수 있음 -- Preconditions가 여전히 목적과 정확히 일치하지 않을 위험.",
  groundedIn: "STEP1: 원안(cycle=0&swap=0&conflict=0)이 실측 Gap 전부에서 매칭 0건 -- 전제조건이 목표보다 지나치게 좁았음(Q1/Q2에 대한 실측 답). STEP2: Level 2 sweep 결과 채택.",
  matchesPrecondition: (f: GapReplayFeatures) => f.cycleCount <= 1 && f.swapEdgeCount <= 2 && f.conflictEdgeCount <= 2,
  isGenuinelyNovel: true,
};

const REFINED_MULTI_HOP_BRIDGE: PrimitiveCandidate = {
  name: "Low-Structure Multi-Hop Bridge (완화됨, Level 2)",
  purpose: "BP-1의 4+ Cycle 게이트가 놓치는 대역을 위한 2~3-hop 확장 탐색 -- 원안의 WrongWing 상한(8)과 Swap 조건(=0)을 완화해 더 넓은 대역을 커버.",
  preconditions: "WrongWingCount 3~11, Cycle 수<=2, Swap Edge 수<=1 (STEP2 Level 2).",
  allowedOperations: "원안과 동일: enumerateWingCandidates(기존, 미수정) 기반 2~3-hop bounded backtracking, Deferred Validation으로 최종 검증.",
  expectedEffect: "원안과 동일 -- 최장 Cycle이 짧아 BP-1이 커버 못하는 얽힘 해소.",
  failureConditions: "원안과 동일 + 완화로 인해 실제로는 사소한 wrongWingCount 12 근접 상태가 섞여 들어와 2~3-hop으로 부족한 경우 발생 가능.",
  groundedIn: "STEP1: 미커버 replay 중 WrongWing 상한 초과/Swap>0 조건 위반이 상당수 -- Q1(전제조건이 지나치게 좁은가)에 대한 실측 답이 '그렇다'. STEP2: Level 2 sweep 결과 채택.",
  matchesPrecondition: (f: GapReplayFeatures) => f.wrongWingCount >= 3 && f.wrongWingCount <= 11 && f.cycleCount <= 2 && f.swapEdgeCount <= 1,
  isGenuinelyNovel: true,
};

const CONFLICT_DOMINANT_SACRIFICE: PrimitiveCandidate = {
  name: "Conflict-Dominant Sacrifice Move (신규)",
  purpose: "Conflict Edge(순환에 속하지 않는 일방적 WANTS 의존)가 Swap+Cycle Edge보다 많아 BASE가 순 개선을 만들 수 없는 상태를 위해, 이미 맞춰진 다른 조각 하나를 '의도적으로' 잠시 훼손(sacrifice)해 Conflict를 Cycle로 전환한 뒤 해소하는 연산.",
  preconditions: "Conflict Edge 수 > (Swap Edge 수 + Cycle Edge 수).",
  allowedOperations: "1) Conflict의 대상이 되는 slot의 조각을 임시로 다른 빈 자리(또는 저비용 위치)로 이동(sacrifice, BASE 로직 재사용). 2) 원래 Conflict를 유발하던 wrong wing을 그 자리로 이동. 3) 희생된 조각을 최종 목적지로 복귀(BASE/BP-1 재귀 재사용).",
  expectedEffect: "Conflict-dominant 상태를 Cycle-dominant 상태로 전환해, 이후 BASE/BP-1이 다룰 수 있는 구조로 변환.",
  failureConditions: "sacrifice 대상 조각 자체가 또 다른 Conflict의 근원이라 연쇄적으로 악화되는 경우, 혹은 복귀 경로가 막혀 순수 손해로 끝나는 경우.",
  groundedIn: "Primitive Blueprint Sprint v1 STEP2: Gap의 28.0%가 Conflict Edge 수 > (Swap+Cycle Edge 수) -- BASE가 구조적으로 못 다루는 명확한 하위 유형.",
  matchesPrecondition: (f: GapReplayFeatures) => f.conflictEdgeCount > f.swapEdgeCount + f.cycleEdgeCount,
  isGenuinelyNovel: true,
};

const WIDE_BAND_STRUCTURAL_BRIDGE: PrimitiveCandidate = {
  name: "Wide-Band Structural Bridge (참고용, Cycle<=2 전 대역)",
  purpose: "Multi-Hop Bridge의 핵심 아이디어(BP-1의 4+ Cycle 게이트 미만 대역 처리)를 WrongWing/Swap 제약 없이 Cycle 길이 기준만으로 넓게 적용 -- STEP2 Level 3 sweep(참고용 상한선)을 그대로 후보 형태로 옮긴 것.",
  preconditions: "Cycle 수<=2 (WrongWing/Swap 무관).",
  allowedOperations: "Multi-Hop Bridge와 완전히 동일한 2~3-hop bounded backtracking -- 새 연산이 전혀 없다.",
  expectedEffect: "Multi-Hop Bridge와 동일하되 더 넓은 대역 커버.",
  failureConditions: "조건이 넓어진 만큼, 실제로는 Conflict-dominant라 이 Primitive로는 해소되지 않는 replay가 섞여 들어올 수 있음(Conflict-Dominant Sacrifice Move와의 역할 구분 필요).",
  groundedIn:
    "정직 공개: STEP2 Level 3는 그 자체가 '참고용 상한선'(실제 권고 아님)으로 설계됐다. 실측 결과 이 후보 단독 Coverage(73.1%)가 4개 후보 전체 Union(73.1%)과 정확히 일치하고, Multi-Hop Bridge와의 Jaccard가 0.737(사실상 동일 집합)이며, 다른 3개 후보 대비 순수 기여(Unique Contribution)는 3.8%(2건)뿐이다 -- Allowed Operations도 Multi-Hop Bridge와 완전히 동일해 '새 Primitive'가 아니라 '동일 연산의 과도하게 느슨한 게이트'에 불과하다. Representation Blueprint Sprint v1의 '버킷만 넓히면 무한정 개선되는 함정'과 동일한 패턴이므로, Coverage 결정에서는 신규성 없음으로 제외한다.",
  matchesPrecondition: (f: GapReplayFeatures) => f.cycleCount <= 2,
  isGenuinelyNovel: false,
};

export const REFINED_CANDIDATES: PrimitiveCandidate[] = [REFINED_SLOT_PERTURBATION, REFINED_MULTI_HOP_BRIDGE, CONFLICT_DOMINANT_SACRIFICE, WIDE_BAND_STRUCTURAL_BRIDGE];
