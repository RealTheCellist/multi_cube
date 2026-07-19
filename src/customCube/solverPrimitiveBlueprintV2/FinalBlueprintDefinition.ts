// --- FinalBlueprintDefinition (Solver Primitive Blueprint Sprint v2) -----
// STEP5: decides Level 1~3 from STEP1~4's real multi-run measurements and
// writes the final, Prototype-ready Blueprint specification for whichever
// candidate wins (or declines to name one, if none survives reproducibility
// scrutiny).
import type { ReproducibilityResult, CandidatePredicate } from "./ReproducibilityCheck";
import type { PrecisionRecallResult } from "./CoveragePrecisionRecallAnalysis";

export interface CandidateEvaluation {
  reproducibility: ReproducibilityResult;
  precisionRecall: PrecisionRecallResult;
  // PASS only if the candidate beats the old Blueprint's success rate on
  // EVERY one of the 5 independent runs -- not just on average. A
  // candidate that wins on average but loses on 1-2 runs is not
  // "consistently" better, per this Sprint's own Level 2 wording.
  dominatesOldBlueprintEveryRun: boolean;
}

const MIN_AVG_SUCCESS_RATE_FOR_LEVEL1 = 0.2;
const MIN_AVG_MATCHED_COUNT = 5; // a candidate matching <5 replays on average can't be trusted regardless of its rate

export function evaluateCandidate(reproducibility: ReproducibilityResult, precisionRecall: PrecisionRecallResult, oldBlueprintReproducibility: ReproducibilityResult): CandidateEvaluation {
  const dominatesOldBlueprintEveryRun = reproducibility.perRun.every((run, i) => run.successRate > oldBlueprintReproducibility.perRun[i].successRate);
  return { reproducibility, precisionRecall, dominatesOldBlueprintEveryRun };
}

export interface BlueprintSpec {
  representationName: string;
  preconditions: string;
  allowedOperations: string;
  expectedMechanism: string;
  expectedScope: string;
  exclusions: string;
}

export function buildBlueprintSpec(winnerName: string): BlueprintSpec {
  return {
    representationName: winnerName,
    preconditions: "Cycle 길이(longest cycle) 2~3 (BP-1의 MIN_CYCLE_LENGTH=4 미만) AND Conflict Edge 수 > 0 (WANTS-그래프에 순환에 속하지 않는 일방적 의존 엣지가 최소 1개 존재).",
    allowedOperations: "MultiHopBridgePrototype.ts(미수정)의 tryMultiHopBridge -- BoundedResolver.ts의 analyzeMultiCycle/resolveBoundedMultiCycle(둘 다 미수정)을 그대로 호출, Deferred Validation으로 net-improvement만 채택. Preconditions는 '언제 호출할지'를 결정하는 게이트로만 쓰이며, Allowed Operations 자체는 기존 Prototype 코드에서 전혀 바뀌지 않는다.",
    expectedMechanism: "Conflict Edge가 존재하는 상태는 WANTS-그래프가 순수 순환 구조가 아니라 순환+일방적 의존이 혼재된 구조다. 이 혼재 구조에서 resolveBoundedMultiCycle의 bounded backtracking이 Conflict Edge가 전혀 없는(=순수하게 짧은 순환뿐인) 상태보다 더 많은 후보 경로를 탐색할 수 있어 net-improving leaf를 찾을 확률이 높아지는 것으로 추정된다(가설, 다음 Sprint에서 별도 검증 필요).",
    expectedScope: "cycleLength 2~3 AND conflictEdgeCount>0을 동시에 만족하는 replay -- 150-replay Dataset 기준 실측 평균 매칭 수는 STEP1 재현성 결과를 참고.",
    exclusions: "cycleLength>=4(BP-1 자체 영역, 중복), cycleLength<2(Cycle 없음, 활성화 불가), conflictEdgeCount=0(순수 순환만 있는 경우, STEP2/3 실측상 성공률이 낮음).",
  };
}

export type FinalDecision = "A" | "B" | "C";

export interface BlueprintV2Outcome {
  decision: FinalDecision;
  rationale: string;
  level1Pass: boolean;
  level2Pass: boolean;
  level3Pass: boolean;
  winner: CandidateEvaluation | null;
}

export function decideOutcome(candidates: readonly CandidateEvaluation[], oldBlueprint: ReproducibilityResult): BlueprintV2Outcome {
  const viable = candidates.filter((c) => c.reproducibility.avgMatchedCount >= MIN_AVG_MATCHED_COUNT && c.reproducibility.minSuccessRate > 0 && c.reproducibility.avgSuccessRate >= MIN_AVG_SUCCESS_RATE_FOR_LEVEL1);

  if (viable.length === 0) {
    return {
      decision: "C",
      rationale: `모든 후보가 5회 반복 실행 중 최소 1회 이상 성공률 0%를 기록하거나(우연한 표본 효과), 평균 성공률이 ${(MIN_AVG_SUCCESS_RATE_FOR_LEVEL1 * 100).toFixed(0)}%에 못 미쳤다 -- 새 Blueprint도 재현되지 않는다.`,
      level1Pass: false,
      level2Pass: false,
      level3Pass: false,
      winner: null,
    };
  }

  const consistentWinners = viable.filter((c) => c.dominatesOldBlueprintEveryRun);
  if (consistentWinners.length === 0) {
    const best = viable.reduce((a, b) => (b.reproducibility.avgSuccessRate > a.reproducibility.avgSuccessRate ? b : a));
    return {
      decision: "B",
      rationale: `"${best.reproducibility.candidateName}"는 재현 가능(Level1 PASS, 평균 ${(best.reproducibility.avgSuccessRate * 100).toFixed(1)}%)하지만, 5회 중 일부 run에서는 기존 Blueprint(${(oldBlueprint.avgSuccessRate * 100).toFixed(1)}%)를 넘지 못해 '일관되게 높은 설명력'(Level2) 기준을 충족하지 못한다 -- 추가 보완이 필요하다.`,
      level1Pass: true,
      level2Pass: false,
      level3Pass: false,
      winner: best,
    };
  }

  const winner = consistentWinners.reduce((a, b) => (b.reproducibility.avgSuccessRate > a.reproducibility.avgSuccessRate ? b : a));
  return {
    decision: "A",
    rationale: `"${winner.reproducibility.candidateName}"가 5회 반복 실행 전부에서 기존 Blueprint(${(oldBlueprint.avgSuccessRate * 100).toFixed(1)}%)보다 높은 성공률을 기록했다(평균 ${(winner.reproducibility.avgSuccessRate * 100).toFixed(1)}%, 범위 ${(winner.reproducibility.minSuccessRate * 100).toFixed(1)}~${(winner.reproducibility.maxSuccessRate * 100).toFixed(1)}%) -- Blueprint를 확정한다.`,
    level1Pass: true,
    level2Pass: true,
    level3Pass: true,
    winner,
  };
}
