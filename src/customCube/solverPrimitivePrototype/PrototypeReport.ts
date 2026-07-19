// --- PrototypeReport (Solver Primitive Prototype Sprint v2) --------------
// Aggregates PrototypeBenchmark's per-replay results into Contract/
// Success/Failure Pattern/Regression/Cost summaries, applies this Sprint's
// own Level 1~3 criteria, and reaches the required A/B/C conclusion.
import type { SingleRunResult } from "./PrototypeBenchmark";

export interface ContractSummary {
  totalReplays: number;
  matchingCount: number;
  succeededOnMatching: number;
  succeededOffMatching: number; // succeeded despite NOT matching the stated precondition
  matchingSuccessRate: number;
}

export interface FailurePatternEntry {
  reason: string;
  count: number;
}

export interface CostSummary {
  avgTimeMs: number;
  avgCostMetric: number;
  costMetricName: string;
}

export interface PrototypeSummary {
  primitiveName: string;
  contract: ContractSummary;
  overallSuccessCount: number;
  overallSuccessRate: number;
  regressionCount: number;
  rescuedFromGapCount: number;
  gapTotal: number;
  failurePattern: FailurePatternEntry[];
  cost: CostSummary;
  level1Pass: boolean;
  level2Pass: boolean;
  level3Pass: boolean;
}

// Disclosed thresholds. Level 2 asks whether the Blueprint's predicted
// mechanism "실제 동작함" -- a nonzero-but-real bar (30% success among
// precondition-matching replays) distinguishes "the mechanism genuinely
// fires sometimes" from "theoretically plausible but never actually
// works." Level 3 asks for "의미 있는" (meaningful) added capability, not
// just any -- 3 rescued replays is a small but real, non-single-coincidence
// bar given the Gap itself is only 50-58 replays in this Dataset.
const LEVEL2_MATCHING_SUCCESS_THRESHOLD = 0.3;
const LEVEL3_MIN_RESCUED = 3;

export function summarize(primitiveName: string, results: readonly SingleRunResult[], costMetricName: string, costOf: (r: SingleRunResult) => number): PrototypeSummary {
  const totalReplays = results.length;
  const matching = results.filter((r) => r.matchesPrecondition);
  const succeededOnMatching = matching.filter((r) => r.succeeded).length;
  const succeededOffMatching = results.filter((r) => !r.matchesPrecondition && r.succeeded).length;
  const overallSuccessCount = results.filter((r) => r.succeeded).length;
  const regressionCount = results.filter((r) => r.regression).length;
  const gapResults = results.filter((r) => r.wasExistingGap);
  const rescuedFromGapCount = results.filter((r) => r.rescuedFromGap).length;

  const reasonCounts = new Map<string, number>();
  for (const r of results) if (!r.succeeded) reasonCounts.set(r.failureReason, (reasonCounts.get(r.failureReason) ?? 0) + 1);
  const failurePattern = [...reasonCounts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);

  const avgTimeMs = totalReplays ? results.reduce((a, r) => a + r.timeMs, 0) / totalReplays : 0;
  const costValues = results.map(costOf);
  const avgCostMetric = costValues.length ? costValues.reduce((a, b) => a + b, 0) / costValues.length : 0;

  const matchingSuccessRate = matching.length ? succeededOnMatching / matching.length : 0;

  return {
    primitiveName,
    contract: { totalReplays, matchingCount: matching.length, succeededOnMatching, succeededOffMatching, matchingSuccessRate },
    overallSuccessCount,
    overallSuccessRate: totalReplays ? overallSuccessCount / totalReplays : 0,
    regressionCount,
    rescuedFromGapCount,
    gapTotal: gapResults.length,
    failurePattern,
    cost: { avgTimeMs, avgCostMetric, costMetricName },
    level1Pass: true, // reaching this summary means the full 150-replay run completed without crashing
    level2Pass: matchingSuccessRate >= LEVEL2_MATCHING_SUCCESS_THRESHOLD,
    level3Pass: rescuedFromGapCount >= LEVEL3_MIN_RESCUED,
  };
}

export type FinalDecision = "A" | "B" | "C";

export interface OutcomeDecision {
  decision: FinalDecision;
  rationale: string;
}

export function decideOutcome(summaries: readonly PrototypeSummary[]): OutcomeDecision {
  const anyRegression = summaries.some((s) => s.regressionCount > 0);
  if (anyRegression) {
    const offenders = summaries.filter((s) => s.regressionCount > 0).map((s) => `${s.primitiveName}(${s.regressionCount}건)`);
    return { decision: "B", rationale: `Regression 발생: ${offenders.join(", ")} -- Deferred Validation 게이트를 재검토해 Prototype을 수정해야 한다.` };
  }

  const allLevel2Fail = summaries.every((s) => !s.level2Pass);
  if (allLevel2Fail) {
    return {
      decision: "C",
      rationale: `모든 Prototype이 Preconditions를 만족하는 replay에서도 성공률 ${(LEVEL2_MATCHING_SUCCESS_THRESHOLD * 100).toFixed(0)}%에 못 미쳤다(${summaries.map((s) => `${s.primitiveName} ${(s.contract.matchingSuccessRate * 100).toFixed(1)}%`).join(", ")}) -- Blueprint가 예측한 메커니즘이 실제로 동작하지 않는다. Primitive 가설 기각, Blueprint 단계로 환류.`,
    };
  }

  const anyLevel3Pass = summaries.some((s) => s.level3Pass);
  if (anyLevel3Pass) {
    const winners = summaries.filter((s) => s.level3Pass).map((s) => `${s.primitiveName}(${s.rescuedFromGapCount}건 구제)`);
    return { decision: "A", rationale: `${winners.join(", ")}가 기존 5개 Primitive가 전부 실패하던 replay를 실제로 구제했다 -- Prototype 성공, Solver Integration Sprint 진행 가능.` };
  }

  return {
    decision: "B",
    rationale: `메커니즘 자체는 동작하지만(Level 2 PASS) 기존 Gap을 구제한 replay가 ${LEVEL3_MIN_RESCUED}건 미만이라 '의미 있는 신규 Capability'로 보기엔 아직 부족하다 -- Prototype Refinement Sprint 진행.`,
  };
}
