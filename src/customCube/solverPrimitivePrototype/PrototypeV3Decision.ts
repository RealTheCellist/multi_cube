// --- PrototypeV3Decision (Solver Primitive Prototype Sprint v3) ----------
// Final STEP: applies this Sprint's own Level 1~3 criteria to STEP1~5's
// real measurements and reaches the required A/B/C conclusion.
//   Level 1: Prototype 정상 구현 -- PASS if the full 150-replay run
//     completes without crashing (same convention PrototypeReport.ts,
//     Prototype Sprint v2, already established).
//   Level 2: Blueprint 메커니즘이 실측으로 확인됨 -- PASS only if
//     MechanismVerification.ts's direct conflictEdgeCount>0 vs ==0
//     comparison shows BOTH higher search diversity (avgCandidatesGenerated
//     AND avgLeavesExplored) AND a higher net-improving-leaf ratio in the
//     conflictEdgeCount>0 group. A precondition that merely correlates
//     with success (already known from Blueprint Sprint v2) is not enough
//     -- this Sprint's whole point is testing WHY, not re-confirming THAT.
//   Level 3: 기존 Prototype 대비 의미 있는 Capability 추가 -- PASS if v3
//     rescues >=3 replays that all 5 EXISTING allowed Primitives already
//     fail on (LEVEL3_MIN_RESCUED, reused from PrototypeReport.ts's own
//     established bar) AND zero true regressions.
import type { MechanismVerificationResult } from "./MechanismVerification";
import type { RegressionSummary } from "./RegressionAnalysis";
import type { SuccessFailureSummary } from "./SuccessFailureClassification";

const LEVEL3_MIN_RESCUED = 3;

export type FinalDecision = "A" | "B" | "C";

export interface PrototypeV3Outcome {
  decision: FinalDecision;
  rationale: string;
  level1Pass: boolean;
  level2Pass: boolean;
  level3Pass: boolean;
}

export function decideOutcome(mechanism: MechanismVerificationResult, regression: RegressionSummary, successFailure: SuccessFailureSummary): PrototypeV3Outcome {
  const level1Pass = true; // reaching this means the full 150-replay run completed
  const level2Pass = mechanism.mechanismConfirmed;
  const level3Pass = regression.rescuedByV3Count >= LEVEL3_MIN_RESCUED && regression.trueRegressionCount === 0;
  void successFailure; // referenced by the driver's own report text, not by this decision's gating logic

  if (regression.trueRegressionCount > 0) {
    return {
      decision: "B",
      rationale: `v3가 net-improvement 없이 이동을 채택한 사례가 ${regression.trueRegressionCount}건 발견되었다 -- DeferredValidator가 이를 막아야 하는데도 발생했으므로(예상 밖 결과) Prototype 구현을 재검토해야 한다.`,
      level1Pass,
      level2Pass,
      level3Pass: false,
    };
  }

  if (!level2Pass) {
    return {
      decision: "C",
      rationale: `Preconditions(cycleLength 2~3 AND conflictEdgeCount>0)는 재현 가능하지만(Blueprint Sprint v2 확인), 예상 메커니즘("Conflict Edge가 탐색 다양성을 높인다")은 실측에서 확인되지 않았다 -- conflictEdgeCount>0 그룹의 평균 후보 생성 수(${mechanism.withConflict.avgCandidatesGenerated.toFixed(2)})/leaves(${mechanism.withConflict.avgLeavesExplored.toFixed(2)})/net-improving 비율(${(mechanism.withConflict.avgNetImprovingLeafRatio * 100).toFixed(1)}%)이 conflictEdgeCount=0 그룹(${mechanism.withoutConflict.avgCandidatesGenerated.toFixed(2)}/${mechanism.withoutConflict.avgLeavesExplored.toFixed(2)}/${(mechanism.withoutConflict.avgNetImprovingLeafRatio * 100).toFixed(1)}%)보다 일관되게 높지 않다. Blueprint는 맞지만 메커니즘이 성립하지 않는다.`,
      level1Pass,
      level2Pass,
      level3Pass,
    };
  }

  if (!level3Pass) {
    return {
      decision: "B",
      rationale: `메커니즘은 실측으로 확인되었으나(Level2 PASS), 기존 5개 Primitive가 전부 실패하던 replay를 실제로 구제한 건수가 ${regression.rescuedByV3Count}건으로 기준(${LEVEL3_MIN_RESCUED}건) 미만이다 -- 의미 있는 신규 Capability로 보기엔 부족하다. Prototype 보완이 필요하다.`,
      level1Pass,
      level2Pass,
      level3Pass,
    };
  }

  return {
    decision: "A",
    rationale: `메커니즘이 실측으로 확인되었고(Level2 PASS), 기존 5개 Primitive가 전부 실패하던 replay를 ${regression.rescuedByV3Count}건 구제했다(Level3 PASS, Regression 0건) -- Prototype 성공.`,
    level1Pass,
    level2Pass,
    level3Pass,
  };
}
