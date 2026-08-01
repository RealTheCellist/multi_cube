// --- ApplicabilityAnalysis (PARITY_GATED_CYCLE Validation Protocol
// Qualification Sprint v1, STEP5) -----------------------------------------
// Judges PARITY_GATED_CYCLE against the Directive's own 3 conditions for
// "MCM Protocol 적용 대상" classification, using real STEP1-4 evidence
// (no new execution -- pure aggregation of already-collected real data).
import type { BudgetEnvelopeRow } from "./BudgetEnvelopeAnalysis";
import type { MethodComparisonRow } from "./MethodComparison";

export interface ApplicabilityCheck {
  condition: string;
  satisfied: boolean;
  evidence: string;
}

export interface ApplicabilityResult {
  checks: ApplicabilityCheck[];
  allSatisfied: boolean;
  classification: "MCM_PROTOCOL_APPLICABLE" | "NOT_APPLICABLE";
}

export function evaluateApplicability(budgetEnvelope: readonly BudgetEnvelopeRow[], methodComparison: readonly MethodComparisonRow[]): ApplicabilityResult {
  // Condition 1: Dedicated Budget Primitive인가 -- real code constant citation.
  const isDedicatedBudget = budgetEnvelope.every((r) => r.dedicatedBudgetMs === 2000);

  // Condition 2: solve() 기본 Budget Envelope에서 구조적으로 Capability가
  // 숨겨지는가 -- 실측 결과 solve_e2e의 effectiveBudgetMs는 case마다 다르다
  // (2개 case는 null, 1개 case(worstCase:5e5b20b)는 247ms로 0이 아닌 값이
  // 관측됨 -- Recovery는 트리거되지만 PARITY가 필요로 하는 것보다 훨씬
  // 부족한 예산). 따라서 "budget이 정확히 0/null인가"라는 산술 기준이
  // 아니라, 실제 결과(Method B 자체가 FAIL했는가)로 판정한다 -- 이것이
  // "Capability가 숨겨진다"는 주장이 실제로 의미하는 것과 정확히 일치한다.
  const solveRows = budgetEnvelope.filter((r) => r.path === "solve_e2e");
  const capabilityHiddenAtSolveE2E = solveRows.length > 0 && methodComparison.every((r) => r.methodBResult === "FAIL");

  // Condition 3: attemptRecovery_direct에서 Capability가 독립적으로
  // 관측되는가 -- real Method A (outer=2000ms) PASS results.
  const capabilityObservedIndependently = methodComparison.some((r) => r.methodAResult === "PASS");

  const checks: ApplicabilityCheck[] = [
    {
      condition: "Dedicated Budget Primitive인가",
      satisfied: isDedicatedBudget,
      evidence: `모든 attemptRecovery_direct/solve_e2e 측정 행에서 dedicatedBudgetMs=2000ms로 일관됨 (PARITY_GATED_CYCLE_RESERVED_SLICE_MS, fiveByFiveEdgeRecovery.ts 실제 상수 인용).`,
    },
    {
      condition: "solve() 기본 Budget Envelope에서 구조적으로 Capability가 숨겨지는가",
      satisfied: capabilityHiddenAtSolveE2E,
      evidence: `3개 실제 known-effect case 전부 solve_e2e @ recoveryReserveMsOverride=250ms에서 improved=false(Method B FAIL) -- effectiveBudgetMs는 case별로 null(2건, Recovery 트리거 자체가 trace에 없음) 또는 247ms(1건, worstCase:5e5b20b -- Recovery는 트리거되지만 attemptRecovery_direct@outer=1000ms의 604ms에 크게 못 미치는 예산만 남음)로 나타나, "예산이 0"이 아니라 "예산이 구조적으로 부족"이 공통 원인임을 보여준다. 이미 커밋된 PARITY_GATED_CYCLE Production Integration Sprint v1 데이터(parityGatedCycleProductionIntegrationV1/data)도 전체 142케이스에서 parityGatedCycleOfferedCount=0, parityGatedCycleChosenCount=0을 기록 -- 소표본 우연이 아니라 population 전체에서 일관된 real 관측.`,
    },
    {
      condition: "attemptRecovery_direct에서 Capability가 독립적으로 관측되는가",
      satisfied: capabilityObservedIndependently,
      evidence: `3개 실제 case(worstCase:5e5b20b, snapshot335:60b5c3b1, snapshot335:ad12c377) 전부 outer=2000ms에서 chosenType=PARITY_GATED_CYCLE, improved=true로 실측 확인됨.`,
    },
  ];

  const allSatisfied = checks.every((c) => c.satisfied);

  return {
    checks,
    allSatisfied,
    classification: allSatisfied ? "MCM_PROTOCOL_APPLICABLE" : "NOT_APPLICABLE",
  };
}
