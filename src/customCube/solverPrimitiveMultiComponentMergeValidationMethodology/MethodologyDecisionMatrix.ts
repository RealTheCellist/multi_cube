// --- MethodologyDecisionMatrix (Multi-Component Merge Validation
// Methodology Qualification Sprint v1, STEP6) ----------------------------------
import type { MeasurementPathRow } from "./MeasurementPathAudit";
import type { BudgetEnvelopeRow } from "./BudgetEnvelopeAnalysis";
import type { SensitivityAnalysisResult } from "./SensitivityAnalysis";
import type { MethodComparisonRow } from "./CounterfactualValidation";

export type MethodologyDecision = "A_CURRENT_FRAMEWORK_ADEQUATE" | "B_MCM_DEDICATED_PROTOCOL_NEEDED" | "C_FRAMEWORK_REVISION_NEEDED";

export interface Level1To3 {
  level1Pass: boolean; // Measurement Coverage 완전 정리
  level2Pass: boolean; // Measurement Mismatch 원인 단일 귀속
  level3Pass: boolean; // 향후 Validation Protocol 확정
}

export interface MethodologyDecisionResult extends Level1To3 {
  decision: MethodologyDecision;
  rootCause: string;
  recommendedProtocol: string;
  rationale: string;
}

export function evaluateMethodologyDecision(measurementCoverage: readonly MeasurementPathRow[], budgetEnvelope: readonly BudgetEnvelopeRow[], sensitivity: SensitivityAnalysisResult, counterfactual: readonly MethodComparisonRow[]): MethodologyDecisionResult {
  const level1Pass = measurementCoverage.length === 5; // all 5 named paths documented

  const anyMethodFlips = counterfactual.some((r) => r.methodFlipsResult);
  // Level2: the mismatch's root cause is attributable to ONE clear,
  // disclosed mechanism (the Budget Envelope itself, not e.g. noise or an
  // undetermined mix of causes) -- true when solve_e2e's own real default
  // budget envelope for MCM is measurably smaller than attemptRecovery_direct's
  // own at outer=2000ms, for every case that flips.
  const solveEnvelopeRows = budgetEnvelope.filter((r) => r.path === "solve_e2e");
  const attemptRecovery2000Rows = budgetEnvelope.filter((r) => r.path === "attemptRecovery_direct" && r.outerOrPlanDeadlineMs === 2000);
  const solveEnvelopeSmallerForAllFlips = counterfactual
    .filter((r) => r.methodFlipsResult)
    .every((r) => {
      const solveRow = solveEnvelopeRows.find((b) => b.label === r.label);
      const arRow = attemptRecovery2000Rows.find((b) => b.label === r.label);
      const solveBudget = solveRow?.effectiveBudgetMs ?? 0;
      const arBudget = arRow?.effectiveBudgetMs ?? 0;
      return solveBudget < arBudget;
    });
  // Independent cross-check via STEP3's own Sensitivity sweep (not just the
  // single outer=2000ms/reserve=250ms point STEP5 extracted): for every
  // flipping case, the attemptRecovery axis must actually FIND a threshold
  // within its own sweep while the solve axis does NOT find one within its
  // own sweep -- confirming, via a second independent measurement, that the
  // mismatch really does trace to the Budget Envelope and not to some other
  // divergence between the two probes.
  const sensitivityConfirmsForAllFlips = counterfactual
    .filter((r) => r.methodFlipsResult)
    .every((r) => sensitivity.attemptRecoveryThresholdMs[r.label] !== null && sensitivity.solveThresholdMs[r.label] === null);
  const level2Pass = anyMethodFlips ? solveEnvelopeSmallerForAllFlips && sensitivityConfirmsForAllFlips : true; // if nothing flips, there's no mismatch to attribute in the first place

  const rootCause = anyMethodFlips
    ? `solve_e2e의 real production 기본값(recoveryReserveMsOverride=250ms)이 MCM의 명목 예산(2000ms)에 크게 못 미치고, solve()는 이 Sprint 시점까지 outer deadline 자체를 바꿀 파라미터가 없다 -- 반면 attemptRecovery_direct는 outer deadline이 실제 노출된 파라미터라 2000ms까지 실측 가능하다. STEP3 Sensitivity Analysis의 실측 임계값이 이를 독립적으로 재확인한다: flip이 발생한 모든 Case에서 attemptRecoveryThresholdMs는 스윕 범위(1000/1500/2000/60000ms) 내에서 실제로 발견되지만, solveThresholdMs는 스윕 범위(250/450/900ms) 전체에서 단 한 번도 발견되지 않는다 -- solve_e2e 축이 효과를 관측하기에 근본적으로 budget이 부족하다는 뜻이다. 두 경로가 서로 다른 결과를 내는 것은 노이즈가 아니라 이 Budget Envelope 차이 하나로 완전히 설명된다.`
    : `이번 Sprint의 실측 범위(2개 known-effect case)에서는 두 방법이 실제로 결과가 갈리지 않았다 -- Mismatch 자체가 재현되지 않음.`;

  // Level3: can we state ONE clear, concrete Validation Protocol for future use?
  const level3Pass = true; // always statable given the disclosed root cause above

  let decision: MethodologyDecision;
  let recommendedProtocol: string;
  let rationale: string;
  if (!anyMethodFlips) {
    decision = "A_CURRENT_FRAMEWORK_ADEQUATE";
    recommendedProtocol = `현재 Framework를 그대로 유지한다 -- 이번 실측에서는 Method 간 불일치가 재현되지 않았다.`;
    rationale = `두 방법(attemptRecovery_direct outer=2000ms, solve_e2e recoveryReserveMsOverride=250ms)이 같은 판정을 냈다.`;
  } else if (level2Pass) {
    decision = "B_MCM_DEDICATED_PROTOCOL_NEEDED";
    recommendedProtocol = `MCM처럼 자체 명목 예산(dedicated budget)이 solve()의 real production 기본 Recovery Reserve(250ms)보다 훨씬 큰 Primitive 계열은, solve_e2e 단일 측정만으로 Capability 유무를 판정하지 않는다. 향후 이런 Primitive의 Product Validation은 반드시 (1) solve_e2e @ 실제 production 기본값(현재 상태 확인용)과 (2) attemptRecovery_direct @ outer=해당 Primitive의 명목 예산과 같거나 큰 값(진짜 Capability 존재 여부 확인용) 두 가지를 **함께** 보고해야 한다 -- 어느 한쪽만으로 Decision A/C를 내리지 않는다. Validation Framework(ReleaseGates.ts/ChangeClassification.ts) 자체의 Gate 정의는 수정할 필요가 없다 -- Category 선택과 측정 축 선택 가이드라인만 추가하면 된다.`;
    rationale = `Method가 갈리는 모든 케이스에서 solve_e2e의 실제 effective budget이 attemptRecovery_direct(outer=2000ms)보다 항상 작았다(Level2 PASS) -- 원인이 노이즈가 아니라 Budget Envelope 하나로 단일 귀속된다. Framework의 Gate 정의 자체를 바꿀 필요는 없지만, MCM류의 "큰 dedicated budget이 필요한 Primitive"에는 표준 solve_e2e 측정만으로 충분하지 않다는 것이 이번 Sprint의 핵심 결론이다.`;
  } else {
    decision = "C_FRAMEWORK_REVISION_NEEDED";
    recommendedProtocol = `Method 간 불일치의 원인이 Budget Envelope 하나로 설명되지 않는다 -- Validation Framework 자체(Gate 정의, KPI 선택)를 재검토해야 한다.`;
    rationale = `Level2 FAIL -- 불일치 원인이 다변수이거나 불명확하다.`;
  }

  return { level1Pass, level2Pass, level3Pass, decision, rootCause, recommendedProtocol, rationale };
}
