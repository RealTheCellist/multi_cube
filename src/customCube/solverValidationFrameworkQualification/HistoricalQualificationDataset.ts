// --- HistoricalQualificationDataset (Solver Validation Framework
// Qualification Sprint v1, STEP1) ------------------------------------------
// Five representative historical Sprints, one per Change Category where a
// clean example exists, reconstructed from each Sprint's own ALREADY-
// PUBLISHED stats (mean/95% CI/Cohen's d) -- not re-measured. Framework
// code (solverPostReleaseValidationFramework/) is imported read-only and
// never modified, per this Sprint's own Directive.
//
// Reconstruction method: SampleStats requires n/mean/stddev/ci95Half; the
// historical docs publish mean and the CI bounds directly, so stddev is
// back-derived (ci95Half=(ciUpper-ciLower)/2; stddev=ci95Half*sqrt(n)/1.96
// -- the exact inverse of computeStats()'s own formula, so feeding this
// back through the Framework's Gate functions reproduces precisely what
// those Sprints' own CI already said). majorityVoteRate is NOT reconstructed
// for historical cases -- most predate this Framework's own Majority Vote
// requirement and did not record per-repeat sign data -- marked NaN and
// disclosed; none of Gate A-E's own logic consumes majorityVoteRate, so
// this has no effect on Gate/Decision replay (STEP3/4).
import type { ChangeCategory } from "../solverPostReleaseValidationFramework/ChangeClassification";
import type { MetricEvaluation } from "../solverPostReleaseValidationFramework/KpiDefinitions";
import type { SampleStats } from "../solverPrimitiveEvaluationStabilization/StatsUtil";
import type { EffectSizeResult, EffectMagnitude } from "../solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";

function reconstructStats(n: number, mean: number, ciLower: number, ciUpper: number): SampleStats {
  const ci95Half = (ciUpper - ciLower) / 2;
  const stddev = n > 0 ? (ci95Half * Math.sqrt(n)) / 1.96 : 0;
  const coefficientOfVariation = mean !== 0 ? stddev / mean : 0;
  return { n, mean, stddev, coefficientOfVariation, ci95Half, ciLower, ciUpper };
}

function reconstructEffectSize(meanDiff: number, cohensD: number, magnitude: EffectMagnitude): EffectSizeResult {
  // standardError/variance aren't independently published for every
  // historical case -- back-derived only where cohensD!=0 (variance =
  // (meanDiff/cohensD)^2); left at 0 otherwise (never consumed by Gate
  // logic, which only reads cohensD/magnitude).
  const stddevDiff = cohensD !== 0 ? meanDiff / cohensD : 0;
  return { meanDiff, variance: stddevDiff ** 2, standardError: 0, cohensD, magnitude };
}

function metric(n: number, mean: number, ciLower: number, ciUpper: number, cohensD: number, magnitude: EffectMagnitude): MetricEvaluation {
  return { stats: reconstructStats(n, mean, ciLower, ciUpper), effectSize: reconstructEffectSize(mean, cohensD, magnitude), majorityVoteRate: NaN };
}

export interface HistoricalCase {
  sprintName: string;
  doc: string;
  assignedCategory: ChangeCategory;
  nUsed: number;
  actualDecision: "A" | "B" | "C";
  actualDecisionQuote: string;
  improvedCountDiff: MetricEvaluation;
  trueRegressionDiff: MetricEvaluation; // 0-valued when the Sprint reported a flat True Regression count/rate diff
  runtimeDiffMs: MetricEvaluation;
  trueRegressionCount: number; // absolute count/rate at time of measurement, for Gate A context
  contractsHeld: boolean; // did this Sprint's own Contract Audit (or equivalent) hold Operating Contracts unchanged
  note: string;
}

export const HISTORICAL_QUALIFICATION_DATASET: HistoricalCase[] = [
  {
    sprintName: "CONFLICT_DEEP_DEPENDENCY Scheduler Prototype Sprint v1",
    doc: "CONFLICT_DEEP_DEPENDENCY_SCHEDULER_PROTOTYPE.md",
    assignedCategory: "D", // Architecture Change: Scheduler Ordering
    nUsed: 15,
    actualDecision: "A",
    actualDecisionQuote: "True Regression 감소, Architecture Sprint와 동일한 방향 재현... Option A를 Scheduler Contract로 채택.",
    improvedCountDiff: metric(15, 1.93, 1.16, 2.71, 1.26, "large"),
    trueRegressionDiff: metric(15, 0, 0, 0, 0, "negligible"),
    runtimeDiffMs: metric(15, 281.3, 271.4, 291.2, 0, "negligible"),
    trueRegressionCount: 0,
    contractsHeld: true,
    note: "N=15 -- 이 Sprint 자신의 표본은 Framework의 MIN_N_FOR_RELEASE_CONFIDENCE=30에 미달한다(의도적 재현성 테스트 케이스).",
  },
  {
    sprintName: "CONFLICT_DEEP_DEPENDENCY Scheduler Production Integration Sprint v1",
    doc: "CONFLICT_DEEP_DEPENDENCY_SCHEDULER_PRODUCTION_INTEGRATION.md",
    assignedCategory: "D",
    nUsed: 30,
    actualDecision: "A",
    actualDecisionQuote: "Regression 증가 없음... Production Contract 확정, Scheduler Ordering Release-ready.",
    improvedCountDiff: metric(30, 1.13, 0.6, 1.66, 0.77, "medium"),
    trueRegressionDiff: metric(30, 0, 0, 0, 0, "negligible"),
    runtimeDiffMs: metric(30, 0, 0, 0, 0, "negligible"), // 원 보고서는 p95 절대값(1313ms)만 제공, diff 자체는 미보고 -- 0으로 두고 disclose
    trueRegressionCount: 0,
    contractsHeld: true,
    note: "runtimeDiffMs는 원 보고서가 diff를 별도 보고하지 않아 0으로 placeholder -- Gate B는 이 케이스에서 정보 부족으로 판정하지 않음(아래 GateReplay 참고).",
  },
  {
    sprintName: "Incremental Recovery Production Integration Sprint v1",
    doc: "INCREMENTAL_RECOVERY_PRODUCTION_INTEGRATION.md",
    assignedCategory: "B", // Performance Optimization: Budget tuning
    nUsed: 30,
    actualDecision: "B",
    actualDecisionQuote: "Level3(FAIL) -- CI straddles zero. 실질적 whole-solve 효과 없음. Decision: B.",
    improvedCountDiff: metric(30, -0.233, -0.691, 0.224, 0, "negligible"),
    trueRegressionDiff: metric(30, 0, 0, 0, 0, "negligible"), // 4.22%는 절대 rate, diff 자체(vs 이전 baseline)는 별도 미보고
    runtimeDiffMs: metric(30, 1.02, -6.47, 8.5, 0, "negligible"),
    trueRegressionCount: 0.0422, // rate, not count -- disclosed
    contractsHeld: true,
    note: "실제 Decision B의 핵심 근거는 Capability diff CI가 0을 포함한다는 것 -- Gate C(약한 기준, '감소 없음'만 확인)는 이 케이스에서 PASS로 나올 가능성이 높다(mean=-0.233이지만 ciUpper=0.224>=0). 이는 STEP5 Robustness에서 다루는 핵심 불일치 후보다.",
  },
  {
    sprintName: "Mixed Commutator Production Validation Sprint v1",
    doc: "MIXED_COMMUTATOR_PRODUCTION_VALIDATION.md",
    assignedCategory: "C", // New Primitive
    nUsed: 10,
    actualDecision: "B",
    actualDecisionQuote: "Conclusion B -- Additional Refinement 권장. 두 CI 모두 0 포함, 통계적으로 구별되는 Solve Rate 증가 없음.",
    improvedCountDiff: metric(10, -0.1, -1.421, 1.221, -0.047, "negligible"),
    trueRegressionDiff: metric(10, 0, 0, 0, 0, "negligible"),
    runtimeDiffMs: metric(10, 29.9, 29.9 - 1.96 * (87.9 / Math.sqrt(1420)), 29.9 + 1.96 * (87.9 / Math.sqrt(1420)), 0, "negligible"),
    trueRegressionCount: 0,
    contractsHeld: true,
    note: "ALL(142) population 기준. PRIMARY(28) subset은 mean=+0.500, CI=[-0.230,1.230], d=0.424(small)로 별도 보고되었으나 이 Qualification에서는 ALL 기준만 재현.",
  },
  {
    sprintName: "Mixed Commutator Production Validation Sprint v2",
    doc: "MIXED_COMMUTATOR_PRODUCTION_VALIDATION_V2.md",
    assignedCategory: "C",
    nUsed: 10,
    actualDecision: "A",
    actualDecisionQuote: "Conclusion A -- Mixed Commutator Gate C를 포함한 현재 Production을 Release 승인.",
    improvedCountDiff: metric(10, 6.0, 6.0, 6.0, 0, "negligible"), // stddev=0 -- 원 보고서 그대로 재현 (모든 repeat에서 동일한 diff)
    trueRegressionDiff: metric(10, 0, 0, 0, 0, "negligible"),
    runtimeDiffMs: metric(10, 229.1, 229.1 - 1.96 * (128.8 / Math.sqrt(10)), 229.1 + 1.96 * (128.8 / Math.sqrt(10)), 0, "negligible"),
    trueRegressionCount: 0,
    contractsHeld: true,
    note: "improvedCountDiff의 CI=[6.000,6.000]은 원 보고서 자체가 그렇게 보고함(분산 0, 모든 repeat에서 동일 diff) -- 재구성 오류 아님.",
  },
];

// Directive STEP1 요구: Bug Fix Category(A) 대표 사례. 이 연구 전체를
//검토한 결과, 독립적인 전용 Bug-Fix급 Sprint는 존재하지 않는다 -- 가장
//가까운 사례는 ENDGAME Optimization Prototype Sprint v1 내부에서
// 스모크 테스트가 발견/즉시 수정한 Reserved Slice 루프 버그
// (fiveByFiveEdgeSolverEngine.ts의 "reserved-slice-skip" 분기 관련
// 코멘트에 기록됨)이지만, 이는 더 큰 Sprint에 내장된 인라인 수정이었고
// 별도의 Before/After KPI가 독립적으로 측정되지 않았다. 따라서 이
// Qualification Dataset은 Category A 사례를 포함하지 않으며, 이는
// Framework 자체의 결함이 아니라 "이 연구 이력에 아직 순수 Bug Fix급
// Solver 변경이 없었다"는 사실을 정직하게 반영한 것이다 -- STEP6에서
// Framework Revision 항목이 아닌 "다음 실제 Bug Fix에서 확보할 것"으로
//기록한다.
export const CATEGORY_A_GAP_NOTE =
  "독립적인 Bug Fix Category 역사적 사례 없음 -- 이 연구 이력 전체에 순수 Bug-Fix급(신규 Primitive/Architecture 변경 없는) Solver 변경이 존재하지 않았기 때문. Framework의 결함이 아니라 데이터 공백으로 기록.";
