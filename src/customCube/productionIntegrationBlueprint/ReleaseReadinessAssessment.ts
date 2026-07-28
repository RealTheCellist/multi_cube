// --- ReleaseReadinessAssessment (Production Integration Blueprint Sprint
// v1, Deliverable #6, Success Criteria) -----------------------------------
// Disclosed thresholds, fixed before evaluating any result:
//   - netNewCount >= 1: Mixed Commutator must contribute at least one
//     case (PRIMARY or SECONDARY) where the EXISTING Recovery Layer
//     produces NOTHING today but Mixed Commutator would -- otherwise
//     integrating it adds no real capability to defend the LOC/risk cost.
//   - All ProductionDiffEstimate rows must be LOW risk.
//   - Regression (from Mixed Commutator Prototype Sprint v1's own
//     already-measured 0/89) must remain 0.
import type { InteractionMatrixSummary } from "./RecoveryInteractionMatrix";
import type { FileDiffEstimate } from "./ProductionDiffEstimate";
import type { GateSpecificationResult } from "./GateSpecification";

export type ReadinessDecision = "A_PROCEED_TO_INTEGRATION" | "B_BLUEPRINT_NEEDS_WORK" | "C_PROTOTYPE_NEEDS_REVALIDATION";

export interface ReleaseReadinessResult {
  decision: ReadinessDecision;
  decisionLabel: string;
  netNewCount: number;
  allDiffLowRisk: boolean;
  gateResolved: boolean;
  rationale: string;
}

export function assessReleaseReadiness(matrix: InteractionMatrixSummary, diffEstimates: FileDiffEstimate[], gate: GateSpecificationResult, regressionCount: number): ReleaseReadinessResult {
  const netNewCount = matrix.netNewCount;
  const allDiffLowRisk = diffEstimates.every((d) => d.riskLevel === "LOW");
  const gateResolved = gate.solvedCount > 0; // a gate proposal was groundable in at least some real data

  let decision: ReadinessDecision;
  let decisionLabel: string;
  let rationale: string;

  if (regressionCount > 0) {
    decision = "C_PROTOTYPE_NEEDS_REVALIDATION";
    decisionLabel = "Conclusion C -- Recovery Layer 구조상 재설계가 필요하다.";
    rationale = `Regression ${regressionCount}건 확인 -- Mixed Commutator Prototype Sprint v1의 0건 실측과 모순되므로 재검증이 필요하다.`;
  } else if (netNewCount === 0) {
    decision = "C_PROTOTYPE_NEEDS_REVALIDATION";
    decisionLabel = "Conclusion C -- Recovery Layer 구조상 재설계가 필요하다.";
    rationale = `Recovery Interaction Matrix에서 netNewCount=0 -- Mixed Commutator가 기존 Recovery Layer(DISRUPT/SETUP/REPAIR/CCR)가 이미 커버하지 못하는 케이스를 단 1건도 해결하지 못한다면, 통합할 실질적 근거가 없다.`;
  } else if (!allDiffLowRisk) {
    decision = "B_BLUEPRINT_NEEDS_WORK";
    decisionLabel = "Conclusion B -- 통합 방식은 가능하지만 Budget 또는 Gate 보완이 필요하다.";
    rationale = `netNewCount=${netNewCount}로 실질적 가치는 확인되나, Production Diff Estimate 중 일부가 LOW risk가 아니다 -- 해당 파일의 변경 범위를 재설계해야 한다.`;
  } else if (!gateResolved) {
    decision = "B_BLUEPRINT_NEEDS_WORK";
    decisionLabel = "Conclusion B -- 통합 방식은 가능하지만 Budget 또는 Gate 보완이 필요하다.";
    rationale = `netNewCount=${netNewCount}, Diff Risk 모두 LOW이나, Gate Specification을 뒷받침할 실측 해결 케이스가 부족하다 -- Gate 조건을 더 큰 표본으로 재검증해야 한다.`;
  } else {
    decision = "A_PROCEED_TO_INTEGRATION";
    decisionLabel = "Conclusion A -- Production Integration 설계가 완성되었다. 다음 Sprint에서 코드 통합 가능.";
    rationale = `netNewCount=${netNewCount}건의 실질적 신규 capability, 모든 파일 Diff Risk=LOW, Gate 실측 근거 확보, Regression 0건 -- Integration Sequence/Budget Allocation/Gate/Diff Estimate/Checklist 5개 산출물이 모두 실측 데이터로 뒷받침된다.`;
  }

  return { decision, decisionLabel, netNewCount, allDiffLowRisk, gateResolved, rationale };
}
