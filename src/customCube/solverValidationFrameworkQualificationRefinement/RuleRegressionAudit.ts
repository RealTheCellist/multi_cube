// --- RuleRegressionAudit (Solver Validation Framework Qualification
// Refinement Sprint v1, STEP5) ----------------------------------------------
// Checks whether the new strict Gate C, applied to already-published
// Capability numbers OUTSIDE the 5 mechanically-replayed Historical Cases,
// would retroactively flip an already-documented Decision. These three
// rows are NOT re-run through decideFromGates() -- none of them is one of
// the 5 Historical Qualification cases, so there is no code-level Decision
// being recomputed for them; only Gate C's own status is checked in
// isolation, as a disclosed audit of the new Rule's reach.
//
// quickMetric() reconstructs a MetricEvaluation from published mean/CI
// using the same inverse-of-computeStats() formula
// HistoricalQualificationDataset.ts uses (not exported there, so repeated
// here rather than modifying that file); effectSize/cohensD is not needed
// since isSignificantImprovement() (and therefore strict Gate C) only
// reads stats.ciLower.
import { evaluateGateC, type GateResult } from "../solverPostReleaseValidationFramework/ReleaseGates";
import type { MetricEvaluation } from "../solverPostReleaseValidationFramework/KpiDefinitions";
import type { SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";

function quickMetric(n: number, mean: number, ciLower: number, ciUpper: number, cohensD = 0): MetricEvaluation {
  const ci95Half = (ciUpper - ciLower) / 2;
  const stddev = n > 0 ? (ci95Half * Math.sqrt(n)) / 1.96 : 0;
  const stats: SampleStats = { n, mean, stddev, coefficientOfVariation: mean !== 0 ? stddev / mean : 0, ci95Half, ciLower, ciUpper };
  return { stats, effectSize: { meanDiff: mean, variance: 0, standardError: 0, cohensD, magnitude: "negligible" }, majorityVoteRate: NaN };
}

export interface RegressionAuditRow {
  sprintName: string;
  citedNumbers: string;
  strictGateC: GateResult;
  originalDecisionUnaffected: boolean;
  note: string;
}

export const RULE_REGRESSION_AUDIT: RegressionAuditRow[] = [
  (() => {
    const m = quickMetric(30, 1.13, 0.6, 1.66, 0.77);
    const g = evaluateGateC(m, true);
    return {
      sprintName: "CONFLICT_DEEP_DEPENDENCY Scheduler Production Integration Sprint v1",
      citedNumbers: "improvedCountDiff mean=1.13, 95% CI=[0.60, 1.66], d=0.77(medium)",
      strictGateC: g,
      originalDecisionUnaffected: g.status === "PASS",
      note: "ciLower=0.60>0 -- isSignificantImprovement=true -- strict Gate C에서도 PASS. 원래 Decision A(Scheduler Ordering Release-ready) 불변.",
    };
  })(),
  (() => {
    const m = quickMetric(30, 1.167, 0.634, 1.699, 0.784);
    const g = evaluateGateC(m, true);
    return {
      sprintName: "Production Integration Finalization Sprint v1",
      citedNumbers: "Primary improved count diff mean=1.167, 95% CI=[0.634, 1.699], d=0.784(medium)",
      strictGateC: g,
      originalDecisionUnaffected: g.status === "PASS",
      note: "ciLower=0.634>0 -- isSignificantImprovement=true -- strict Gate C에서도 PASS. 원래 RELEASE 결론(및 이를 인용한 Production Integration Validation Sprint v1) 불변.",
    };
  })(),
  (() => {
    const m = quickMetric(30, 0.1, -0.04, 0.24, 0.25);
    const g = evaluateGateC(m, true);
    return {
      sprintName: "Solver Release Readiness Validation Sprint v1 (ENDGAME axis 단독)",
      citedNumbers: "ENDGAME axis 단독 성공 케이스 diff mean=0.10, 95% CI=[-0.04, 0.24], d=0.25(small)",
      strictGateC: g,
      originalDecisionUnaffected: true,
      note:
        "ciLower=-0.04<=0 -- isSignificantImprovement=false -- 이 축 단독으로는 strict Gate C가 PASS에서 OPEN_QUESTION으로 낮아진다(notWorse는 유지되므로 FAIL은 아님). " +
        "그러나 이 Sprint의 실제 Decision A는 애초에 이 축 단독이 아니라 Scheduler axis(CI=[0.60,1.66])와 Finalization axis(CI=[0.634,1.699])의 보강 증거에 근거했으므로 Decision 자체는 영향받지 않는다. " +
        "또한 이 Sprint는 5개 Historical Qualification 대상에 포함되지 않아 decideFromGates()로 재계산되는 Decision이 애초에 없다 -- 이는 새 Rule의 도달 범위에 대한 사전 공개 한계로만 기록한다.",
    };
  })(),
];
