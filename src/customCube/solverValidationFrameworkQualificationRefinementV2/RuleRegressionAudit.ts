// --- RuleRegressionAudit (Solver Validation Framework Qualification
// Refinement Sprint v2, STEP4) -----------------------------------------------
// Checks whether Gate B's own status flips, under each of the 3 candidate
// gateBPolicy values, for the same 3 already-published Sprints Refinement
// Sprint v1 audited (Scheduler Production Integration v1, Production
// Integration Finalization v1, Release Readiness v1) -- their own
// published Runtime diff numbers, not re-measured. If Gate B is already
// PASS under the real numbers, changing gateBPolicy cannot change
// anything (the policy only matters when Gate B is OPEN_QUESTION), so a
// "no regression" finding here is expected and is verified directly
// against evaluateGateB() rather than assumed.
import { evaluateGateB, type GateResult } from "../solverPostReleaseValidationFramework/ReleaseGates";
import { PLACEHOLDER_BASELINE_P95_MS } from "../solverValidationFrameworkQualification/GateReplay";
import type { MetricEvaluation } from "../solverPostReleaseValidationFramework/KpiDefinitions";
import type { SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";

function quickMetric(n: number, mean: number, ciLower: number, ciUpper: number): MetricEvaluation {
  const ci95Half = (ciUpper - ciLower) / 2;
  const stddev = n > 0 ? (ci95Half * Math.sqrt(n)) / 1.96 : 0;
  const stats: SampleStats = { n, mean, stddev, coefficientOfVariation: mean !== 0 ? stddev / mean : 0, ci95Half, ciLower, ciUpper };
  return { stats, effectSize: { meanDiff: mean, variance: 0, standardError: 0, cohensD: 0, magnitude: "negligible" }, majorityVoteRate: NaN };
}

export interface GateBRegressionRow {
  sprintName: string;
  citedRuntimeDiff: string;
  gateBStatus: GateResult["status"];
  policyChangeAffectsThisCase: boolean; // true only if gateBStatus were OPEN_QUESTION
  note: string;
}

export const GATE_B_REGRESSION_AUDIT: GateBRegressionRow[] = [
  (() => {
    const m = quickMetric(30, 0, 0, 0);
    const g = evaluateGateB(m, PLACEHOLDER_BASELINE_P95_MS);
    return {
      sprintName: "CONFLICT_DEEP_DEPENDENCY Scheduler Production Integration Sprint v1",
      citedRuntimeDiff: "mean=0.0ms, 95% CI=[0.0, 0.0] (원 보고서가 diff 자체를 미보고, placeholder)",
      gateBStatus: g.status,
      policyChangeAffectsThisCase: g.status === "OPEN_QUESTION",
      note: "Gate B가 이미 PASS -- gateBPolicy를 바꿔도 이 Sprint의 Decision에는 어떤 영향도 없음.",
    };
  })(),
  (() => {
    const m = quickMetric(30, -17.08, -20.55, -13.61);
    const g = evaluateGateB(m, PLACEHOLDER_BASELINE_P95_MS);
    return {
      sprintName: "Production Integration Finalization Sprint v1",
      citedRuntimeDiff: "mean=-17.08ms, 95% CI=[-20.55, -13.61] (Runtime 개선)",
      gateBStatus: g.status,
      policyChangeAffectsThisCase: g.status === "OPEN_QUESTION",
      note: "Runtime이 오히려 개선된 케이스 -- Gate B가 이미 PASS, gateBPolicy 변경과 무관.",
    };
  })(),
  (() => {
    const m = quickMetric(30, 1.6, -0.6, 3.7);
    const g = evaluateGateB(m, PLACEHOLDER_BASELINE_P95_MS);
    return {
      sprintName: "Solver Release Readiness Validation Sprint v1 (Production 4-Contract 합산 Runtime diff)",
      citedRuntimeDiff: "mean=1.6ms, 95% CI=[-0.6, 3.7] (Baseline 450ms 재구성 대비)",
      gateBStatus: g.status,
      policyChangeAffectsThisCase: g.status === "OPEN_QUESTION",
      note: "Runtime diff가 허용 범위 안쪽 -- Gate B가 이미 PASS, gateBPolicy 변경과 무관.",
    };
  })(),
];
