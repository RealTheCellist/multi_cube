// --- AlternativeMechanisms (Parity-Gated Cycle Alternative Primitive
// Blueprint Sprint v1, STEP2) --------------------------------------------------
// Design-only -- no implementation. Four candidate mechanisms meant to
// replace the current single-wing-relocation Bridge (STEP1's own
// FAILURE_MODEL_SUMMARY: 75.6% of failures are the physical move being
// found but rejected at the targetedComponentsMerged() check, because a
// single face turn also shuffles OTHER wrong wings as collateral).
export type MechanismId = "DUAL_WING_BRIDGE" | "BRIDGE_CHAIN" | "TEMPORARY_EXPANSION" | "MULTI_COMPONENT_MERGE";

export interface AlternativeMechanism {
  id: MechanismId;
  name: string;
  description: string;
  mechanismDifference: string; // how this differs from the current single-wing Bridge
  expectedEffect: string;
  complexityNote: string;
}

export const ALTERNATIVE_MECHANISMS: AlternativeMechanism[] = [
  {
    id: "DUAL_WING_BRIDGE",
    name: "Dual Wing Bridge",
    description:
      "compSource와 compTarget 사이에서 wing 1개가 아니라 2개를 동시에(같은 move sequence 안에서) 재배치한다 -- " +
      "예: compSource의 wing A를 compTarget의 slot으로, compTarget의 wing B를 compSource의 slot으로 동시에 교환.",
    mechanismDifference:
      "현재는 1개 wing만 이동시켜 targetedComponentsMerged()가 그 1건의 collateral 효과에 좌우된다. " +
      "2개를 동시에 옮기면 두 컴포넌트 사이에 2개의 새 WANTS edge가 생겨, 1개가 collateral로 무효화되어도 " +
      "나머지 1개가 병합을 완성할 수 있는 '이중 보험' 구조가 된다.",
    expectedEffect:
      "STEP2(Prototype Refinement Sprint)의 실측: 단일 이동의 targetedComponentsMerged() 통과율은 " +
      "avgValidCount=0.37/attempted 20.2(약 1.8%)로 극히 낮았다. 두 독립 시도 중 최소 1개가 성공할 확률은 " +
      "단순 독립 가정 시 1-(1-0.018)^2 ≈ 3.6%로 이론상 약 2배 개선 -- 이 자체는 크지 않지만, 두 이동이 " +
      "실제로는 독립이 아니라 서로의 collateral을 상쇄할 수 있다는 점(같은 컴포넌트 쌍에 대한 2번째 이동이 " +
      "1번째가 만든 새 구조를 활용)이 정성적으로 더 중요한 기대 효과다.",
    complexityNote: "BFS를 2회 순차 실행 + 병합 결과를 2-move 조합 단위로 검증 -- 탐색 공간이 조합적으로 커짐(O(n^2)).",
  },
  {
    id: "BRIDGE_CHAIN",
    name: "Bridge Chain",
    description:
      "단일 Bridge 시도가 실패(targetedComponentsMerged 통과 실패)하면, 그 결과 상태에서 다시 새로운 Bridge " +
      "후보를 생성해 재시도한다 -- 즉 Bridge를 1회성이 아니라 여러 번 연쇄적으로 시도.",
    mechanismDifference:
      "현재 genParityGatedCycle()은 Bridge 후보 목록(bridgeCandidates)을 순회하며 '최선의 1개'만 채택하고, " +
      "실패한 이동들은 상태에 반영되지 않은 채 버려진다. Chain은 실패한 이동도 실제로 적용한 뒤 그 새로운 " +
      "상태에서 다시 Bridge를 시도해, 여러 번의 재배치가 누적되도록 한다.",
    expectedEffect:
      "STEP2 실측에서 rejectedCount가 매우 컸다(avgRejectedCount=19.3) -- 이 각각의 '실패한' 이동이 그래도 " +
      "그래프 구조를 조금씩 바꾸므로, 연쇄적으로 여러 번 시도하면 결국 병합에 성공하는 경로가 존재할 가능성이 " +
      "있다. 다만 이는 검증되지 않은 가설이며(STEP4에서 이론적 추정만 가능, 실측 불가), 매 단계가 실제로 " +
      "구조를 '병합에 유리한 방향'으로 옮긴다는 보장이 없다.",
    complexityNote: "매 단계마다 실제로 이동을 적용하고 재평가해야 하므로 순차적 O(chain depth) 배 비용. 무한 루프 방지용 visited-state 체크 필요.",
  },
  {
    id: "TEMPORARY_EXPANSION",
    name: "Temporary Expansion",
    description:
      "targetedComponentsMerged()의 '즉시 병합' 요구를 일시적으로 완화해, 병합에 실패해도 Component 수가 " +
      "일시적으로 늘어나는 중간 상태를 허용한다 -- 이후 별도 단계에서 그 늘어난 Component들을 정리.",
    mechanismDifference:
      "현재는 즉시 병합(같은 move 안에서 componentOfSlot이 동일해짐)만 성공으로 인정한다. Temporary " +
      "Expansion은 '지금 당장 병합되지 않아도, 구조가 병합에 더 가까워졌으면' 받아들이고 여러 스텝에 걸쳐 " +
      "점진적으로 병합을 완성한다.",
    expectedEffect:
      "정성적으로는 Bridge Chain과 유사한 방향이지만, '병합 성공/실패'라는 이진 판정 대신 '병합까지의 거리'를 " +
      "측정하는 새로운 척도가 필요하다 -- 이 척도 자체를 설계하지 않으면 이 메커니즘은 구현 불가능하다. " +
      "이론적 상한은 Bridge Chain과 같은 수준으로 추정되나, 실질적으로는 '거리' 척도의 품질에 전적으로 좌우된다.",
    complexityNote: "가장 높은 설계 복잡도 -- 병합까지의 거리를 정의하는 새 evaluator가 필요하고, 언제 '충분히 가까워졌다'고 멈출지 판단 기준도 새로 설계해야 한다.",
  },
  {
    id: "MULTI_COMPONENT_MERGE",
    name: "Multi-Component Merge",
    description:
      "2개 컴포넌트가 아니라 3개 이상의 컴포넌트를 한 번에(또는 순차적으로 빠르게) 병합 대상으로 삼는다.",
    mechanismDifference:
      "현재는 항상 가장 큰 2개(또는 가장 작은 2개, largestTwo/smallestTwo 전략) 컴포넌트만 짝지어 시도한다. " +
      "Multi-Component Merge는 componentCount>2인 상태에서 여러 컴포넌트를 동시에 겨냥한다.",
    expectedEffect:
      "실측(이번 Sprint STEP4 그라운딩): 41개 실패 케이스 중 componentCount>2인 케이스는 단 6건(14.6%), " +
      "CANDIDATE_GENERATION_FAILURE 31건 중에서도 6건(19.4%)뿐이다 -- 이 메커니즘이 원천적으로 다룰 수 있는 " +
      "모집단 자체가 작다. 나머지 85.4%(정확히 2-컴포넌트)에는 적용 대상이 아니다.",
    complexityNote: "3개 이상을 동시에 다루려면 그래프 병합 판정 로직 자체를 일반화해야 함 -- Dual Wing Bridge/Bridge Chain보다 구현 범위가 크지만 적용 대상 모집단은 가장 작다.",
  },
];
