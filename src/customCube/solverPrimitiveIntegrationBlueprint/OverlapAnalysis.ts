// --- OverlapAnalysis (Solver Primitive Integration Blueprint Sprint v1)
// STEP3: measures how much W2_widerHop overlaps with the REAL production
// capabilities -- not the research-only AllowedPrimitive labels, which
// this Sprint's own STEP1 finding showed map onto DIFFERENT production
// code than their names suggest (research PARITY = production ENDGAME
// grinder; research BP1 was never wired into production at all). Uses
// the ALREADY-MEASURED real numbers from this research series
// (Evaluation Stabilization Sprint v2 / Prototype Refinement Sprint v2's
// own reports, cited, not re-derived) rather than running a new
// benchmark -- this Sprint does not execute the Prototype.
export interface OverlapEntry {
  productionCapability: string; // the REAL production code, not the research label
  researchLabelEquivalent: string; // what this corresponds to in the AllowedPrimitive research harness, for cross-reference
  coverageOverlap: string;
  gapOverlap: string;
  expectedRedundancy: string;
  expectedReplacement: string;
}

export const OVERLAP_ANALYSIS: OverlapEntry[] = [
  {
    productionCapability: "PAIR task (tryFixWing per wrong wing)",
    researchLabelEquivalent: "research BASE",
    coverageOverlap: "낮음 -- BASE는 슬롯 하나의 wrong wing을 개별적으로 고치는 것이고, W2는 cycleLength 2~4의 다중 슬롯 cycle을 다룬다. Evaluation Stabilization Sprint v1의 Noise Source 분해에서 BASE 자체의 flipRate가 낮다는 것(2.7%)은 확인했지만, W2가 다루는 cycle 구조 자체를 BASE가 직접 다루지는 않는다.",
    gapOverlap: "낮음 -- W2의 Gate(cycleLength 2~4 AND conflictEdgeCount>0)를 만족하는 상태는 정의상 BASE의 단순 wing-by-wing 접근으로 이미 실패한 이후에나 남는 잔여 상태(Prototype Sprint v3의 wasExistingGap 정의: BASE 포함 5개 Primitive가 전부 실패).",
    expectedRedundancy: "낮음",
    expectedReplacement: "없음 -- PAIR task 대체 대상 아님, REPAIR 통합 지점에서는 PAIR task 자체를 건드리지 않는다.",
  },
  {
    productionCapability: "FLIP task (tryFlipWingsInPlace)",
    researchLabelEquivalent: "research FLIP",
    coverageOverlap: "없음 -- FLIP은 방향만 뒤집힌 쌍을 고치는 좁은 케이스, W2의 Gate와 구조적으로 겹치지 않는다.",
    gapOverlap: "없음 (Evaluation Stabilization Sprint v1/v2에서 FLIP은 150-replay Dataset 기준 성공 0/150 -- 이 Dataset 자체가 FLIP으로 이미 못 푸는 잔여만 모은 것이라 당연한 결과)",
    expectedRedundancy: "없음",
    expectedReplacement: "없음",
  },
  {
    productionCapability: "PARITY task (tryExactCaseMatch)",
    researchLabelEquivalent: "research CASE",
    coverageOverlap: "없음 -- Last-2-Edges Case Library의 정확 매칭이며, W2의 cycle 기반 탐색과 메커니즘이 다르다.",
    gapOverlap: "없음 (동일 이유로 CASE도 150-replay Dataset에서 0/150)",
    expectedRedundancy: "없음",
    expectedReplacement: "없음",
  },
  {
    productionCapability: "ENDGAME task grinder (bestFixOverall 반복 + tryEndgameMultiPly + tryEndgameThroughDisruption)",
    researchLabelEquivalent: "research PARITY",
    coverageOverlap: "중간 -- research PARITY(=bestFixOverall 기반)는 평균 성공 수 58.20/150(Evaluation Stabilization Sprint v2 STEP4)로 5개 중 가장 넓은 범위를 커버한다. W2의 Gate(6.7~18.7% Coverage, Prototype Refinement Sprint v1/v2 실측)는 이 안에 부분적으로 겹칠 수 있다 -- 정확한 교집합은 이번 Sprint에서 측정하지 않았다(Prototype 실행 금지).",
    gapOverlap: "확인됨: existing-Gap 정의 자체가 '5개 Primitive(PARITY 포함) 전부 실패'이므로, W2가 실제로 구제하는 replay는 정의상 이 grinder가 이미 실패한 자리다 -- Prototype Refinement Sprint v2의 GapRescue 평균 2.87(W2_widerHop)이 그 증거.",
    expectedRedundancy: "낮음 -- 다른 메커니즘(그리디 단일-wing vs 구조적 cycle 탐색)",
    expectedReplacement: "없음 -- ENDGAME grinder 자체를 대체하지 않는다. REPAIR 통합은 Recovery(= grinder가 이미 실패한 이후)에서만 개입한다.",
  },
  {
    productionCapability: "Recovery (DISRUPT: tryEndgameThroughDisruption, SETUP: tryEndgameMultiPly)",
    researchLabelEquivalent: "research 프레임워크에 대응 없음 (Recovery는 production 고유 계층)",
    coverageOverlap: "낮음 -- DISRUPT/SETUP은 '즉시 개선이 아닐 수 있는' 수를 시도하는 반면, W2는 항상 net-improvement만 채택(Deferred Validation) -- 접근 자체가 다르다.",
    gapOverlap: "미측정 -- Recovery는 이미 ENDGAME이 실패한 이후에만 발동하므로, W2를 Recovery 후보 풀에 추가했을 때 실제로 DISRUPT/SETUP이 못 구제하는 것 중 몇 건을 W2가 구제하는지는 이 Blueprint 단계에서 알 수 없다(Prototype 구현 금지) -- Integration Prototype Sprint의 몫.",
    expectedRedundancy: "낮음 (메커니즘이 명확히 다름: 구조 인식 vs 교란/설정)",
    expectedReplacement: "없음 -- DISRUPT/SETUP을 대체하지 않고 세 번째 후보 유형(REPAIR)으로 나란히 추가된다.",
  },
  {
    productionCapability: "(참고) research BP1 -- production에 없음",
    researchLabelEquivalent: "research BP1 (tryBoundedMultiCycleResolver, solverV2Prototype/)",
    coverageOverlap: "해당 없음 -- production 코드가 아니므로 겹칠 대상 자체가 없다.",
    gapOverlap: "해당 없음",
    expectedRedundancy: "해당 없음",
    expectedReplacement: "해당 없음 -- W2는 BP1의 연구 계보를 잇는 Primitive이지만, production에는 BP1이 존재한 적이 없으므로 '대체'가 아니라 '신규 도입'이다.",
  },
];
