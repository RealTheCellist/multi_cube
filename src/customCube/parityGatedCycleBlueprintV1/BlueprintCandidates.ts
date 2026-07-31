// --- BlueprintCandidates (Solver Primitive Discovery Sprint #6 -- Parity-
// Gated Cycle Blueprint Sprint v1, STEP4) ------------------------------------
// Directive: "아직 구현하지 않는다." Each candidate is a structure-only Gate
// predicate (same BlueprintGateSpec shape STEP3 already used, no solve()
// anywhere) plus a written design description. Grounded directly in
// STEP2/STEP3's own measured numbers:
//   - cycleCount>=2 (96.2% coverage, ablationGap 3.8%) and
//     conflictEdgeCount===0 (96.2% coverage, ablationGap 3.8%) are the
//     two strongest single causal axes -- far stronger than parityState
//     alone (64.2% coverage, lift only 1.08 vs baseline, i.e. barely
//     enriched over the general population despite the population's own
//     taxonomyClass label being "PARITY_GATED_CYCLE").
//   - componentCount splits the Unknown population cleanly in two:
//     componentCount>1 (Bridge-Injection-sourced, 36/53=67.9%) vs
//     componentCount===1 (Deep-Cycle-sourced, 17/53=32.1%) -- this is a
//     pre-existing split from which source Sprint each case came from,
//     not a discovered pattern, and it directly explains why every
//     existing Primitive's Gate (all of which either require
//     componentCount===1 or don't check it) structurally rejects the
//     componentCount>1 majority.
//   - Mixed Commutator's own Gate is maximally permissive (cycleCount>0,
//     98.1% structurally eligible) yet it improved 0/68 residual cases in
//     Unresolved Mechanism Validation Sprint v1's own STEP2 -- meaning its
//     bottleneck is its SEARCH mechanics (LowFootprintCoreSearch's bounded
//     DFS + SetupConjugation), not its Gate. Any new candidate's real
//     differentiator must be search-side, not just a wider Gate.
//   - solverPrimitiveCCRPrototype/CCRPrototype.ts's own real code already
//     has a `strategy: "multiCycle"` option (concatenates every disjoint
//     cycle's nodes into one traversal) -- but
//     blueprintAttributionRefinementV1/BlueprintGateDefinitions.ts's own
//     declared CCR Gate requires cycleCount===1, and
//     unresolvedMechanismValidationV1/PrimitiveRegistry.ts's wrapper only
//     ever called CCR with the DEFAULT "singleCycle" strategy -- so CCR's
//     own multiCycle option was NEVER actually tried against this Unknown
//     population. Disclosed prominently: Candidate B below is likely not
//     a new Primitive at all, just an untested existing option.
import type { StructuralFeatureSetV4 } from "../solverPrimitiveDiscovery4/StructuralFeatureExtractionV4";
import type { BlueprintGateSpec } from "../blueprintAttributionRefinementV1/BlueprintGateDefinitions";

export interface BlueprintCandidate {
  id: "A" | "B" | "C";
  name: string;
  targetState: string;
  gate: BlueprintGateSpec;
  expectedPrimitiveBehavior: string;
  differenceFromExisting: string;
}

export const CANDIDATE_A: BlueprintCandidate = {
  id: "A",
  name: "Cross-Component Bridge Cycle Resolver",
  targetState: "componentCount>1인 WANTS 그래프에서, 서로 분리된 컴포넌트에 걸쳐 존재하는 cycleCount>=2개의 다중 사이클을 컴포넌트를 실제로 연결한 뒤 순회 해소한다.",
  gate: {
    name: "Cross-Component Bridge Cycle Resolver",
    conditions: [
      { name: "componentCount>1", test: (f: StructuralFeatureSetV4) => f.componentCount > 1 },
      { name: "cycleCount>=2", test: (f: StructuralFeatureSetV4) => f.cycleCount >= 2 },
      { name: "conflictEdgeCount===0", test: (f: StructuralFeatureSetV4) => f.conflictEdgeCount === 0 },
    ],
  },
  expectedPrimitiveBehavior:
    "(1) 두 컴포넌트를 잇는 최소 비용의 bridge wing 이동을 먼저 탐색해 componentCount를 실질적으로 1로 낮추는 setup 단계, (2) 그 결과 상태 위에서 BoundedResolver류의 다중 사이클 순회 탐색(모든 cycleCount개 사이클을 이어서)을 실행하는 2단계 파이프라인.",
  differenceFromExisting:
    "MultiHopBridge/BP-1/CCR 전부 componentCount===1을 명시적으로 요구하거나(BP-1/CCR) 아예 확인하지 않고 우연히 통과하는 것뿐(MultiHopBridge) -- '컴포넌트를 실제로 연결하는' setup 로직은 이 아크 전체에서 단 한 번도 구현된 적이 없다(Bridge Injection Refinement Sprint v1이 이미 disclosed한 그 공백을 정면으로 겨냥한다).",
};

export const CANDIDATE_B: BlueprintCandidate = {
  id: "B",
  name: "Multi-Cycle CCR Extension (componentCount=1 subset)",
  targetState: "componentCount===1인 하나의 연결된 컴포넌트 안에 cycleCount>=2개의 독립 사이클이 동시에 존재하는 상태를 전부 순회 해소한다.",
  gate: {
    name: "Multi-Cycle CCR Extension",
    conditions: [
      { name: "componentCount===1", test: (f: StructuralFeatureSetV4) => f.componentCount === 1 },
      { name: "cycleCount>=2", test: (f: StructuralFeatureSetV4) => f.cycleCount >= 2 },
      { name: "conflictEdgeCount===0", test: (f: StructuralFeatureSetV4) => f.conflictEdgeCount === 0 },
    ],
  },
  expectedPrimitiveBehavior: "CCRPrototype.ts가 이미 보유한 strategy=\"multiCycle\"(모든 분리 사이클의 노드를 이어붙여 한 번의 bounded search로 순회)을 그대로 호출.",
  differenceFromExisting:
    "사실상 차이가 거의 없다 -- 새 Primitive가 아니라 기존 CCR 코드의 미시험 옵션(strategy=\"multiCycle\")일 가능성이 높다. blueprintAttributionRefinementV1의 CCR Gate 정의(cycleCount===1)가 실제 CCRPrototype.ts 코드의 능력보다 보수적으로 좁혀져 있었다는 것 자체가 이번 Sprint의 발견이다.",
};

export const CANDIDATE_C: BlueprintCandidate = {
  id: "C",
  name: "Unified Parity-Gated Multi-Cycle Resolver",
  targetState: "componentCount에 관계없이(1이든 1보다 크든) cycleCount>=2 AND conflictEdgeCount===0인 모든 상태를 단일 메커니즘으로 순회 해소한다 -- Candidate A+B를 하나의 Primitive로 통합.",
  gate: {
    name: "Unified Parity-Gated Multi-Cycle Resolver",
    conditions: [
      { name: "cycleCount>=2", test: (f: StructuralFeatureSetV4) => f.cycleCount >= 2 },
      { name: "conflictEdgeCount===0", test: (f: StructuralFeatureSetV4) => f.conflictEdgeCount === 0 },
    ],
  },
  expectedPrimitiveBehavior: "Gate 통과 시 componentCount를 먼저 검사해 1보다 크면 Candidate A의 bridge setup을 조건부로 실행한 뒤, 공통된 다중 사이클 순회 탐색 코어로 이어지는 분기형 파이프라인.",
  differenceFromExisting: "Candidate A와 B를 합친 상위집합 -- 새 코드 자체는 Candidate A와 사실상 동일하지만(B는 기존 CCR 재사용), 하나의 진입점 안에 조건부 분기를 넣어야 하므로 복잡도와 회귀 위험이 A보다 크다.",
};

export const BLUEPRINT_CANDIDATES: BlueprintCandidate[] = [CANDIDATE_A, CANDIDATE_B, CANDIDATE_C];
