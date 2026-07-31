// --- FinalDecision (Parity-Gated Cycle Production Integration Sprint v1,
// Level1-6 + Decision A/B/C) -------------------------------------------------
// Directive's own explicit Level1-6 criteria, applied mechanically to the
// real measured numbers -- no manual correction.
import type { PositionAuditResult, GateAuditResult, BudgetAuditResult } from "./ContractAudit";
import type { KpiSummary } from "./KPI";
import type { CompetitionSummary } from "./Competition";
import type { PairedComparison, FrameworkValidation } from "./Statistics";

export interface LevelVerdict {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  label: string;
  pass: boolean;
  detail: string;
}

export interface FinalDecisionResult {
  levels: LevelVerdict[];
  decision: "A" | "B" | "C";
  rationale: string;
}

export function decideFinal(
  position: PositionAuditResult,
  gate: GateAuditResult,
  budget: BudgetAuditResult,
  kpi: KpiSummary,
  competition: CompetitionSummary,
  comparison: PairedComparison,
  framework: FrameworkValidation
): FinalDecisionResult {
  const level1Pass = position.pass && gate.pass && budget.pass;
  const level1: LevelVerdict = {
    level: 1,
    label: "Production Contract 정확히 구현",
    pass: level1Pass,
    detail: `Position=${position.pass}, Gate=${gate.pass}, Budget=${budget.pass}`,
  };

  const level2Pass = kpi.integratedRegressionCount <= kpi.baselineRegressionCount;
  const level2: LevelVerdict = {
    level: 2,
    label: "Regression 증가 없음",
    pass: level2Pass,
    detail: `baselineRegression=${kpi.baselineRegressionCount}, integratedRegression=${kpi.integratedRegressionCount} (n=${kpi.n})`,
  };

  const ciLower = comparison.improvedCountDiffEvaluation.stats.ciLower;
  const level3Pass = ciLower > 0;
  const level3: LevelVerdict = {
    level: 3,
    label: "Capability 통계적으로 유의한 개선",
    pass: level3Pass,
    detail: `improvedCount paired-diff 95% CI=[${ciLower.toFixed(4)}, ${comparison.improvedCountDiffEvaluation.stats.ciUpper.toFixed(4)}], netNewRescueCount=${kpi.netNewRescueCount}/${kpi.n}`,
  };

  const gateBResult = framework.gateResults.find((g) => g.gate === "B");
  const level4Pass = gateBResult?.status !== "FAIL";
  const level4: LevelVerdict = {
    level: 4,
    label: "Runtime 허용 범위",
    pass: level4Pass,
    detail: `runtimeMeanMs baseline=${kpi.runtimeMeanMsBaseline.toFixed(0)} -> integrated=${kpi.runtimeMeanMsIntegrated.toFixed(0)}, p95 baseline=${kpi.runtimeP95MsBaseline.toFixed(0)} -> integrated=${kpi.runtimeP95MsIntegrated.toFixed(0)}, Gate B=${gateBResult?.status}`,
  };

  const level5Pass = kpi.duplicateCount === 0 && !kpi.starved;
  const level5: LevelVerdict = {
    level: 5,
    label: "Primitive Interaction 문제 없음",
    pass: level5Pass,
    detail: `duplicateCount=${kpi.duplicateCount}, starved=${kpi.starved}, winRate=${(kpi.parityGatedCycleWinRate * 100).toFixed(1)}%, avgScoreGapWhenChosen=${competition.avgScoreGapWhenParityGatedCycleChosen.toFixed(1)}, avgScoreGapWhenLost=${competition.avgScoreGapWhenParityGatedCycleLost.toFixed(1)}`,
  };

  const level6Pass = framework.pipelineResult.decision === "A";
  const level6: LevelVerdict = {
    level: 6,
    label: "Validation Framework Decision A",
    pass: level6Pass,
    detail: `pipeline decision=${framework.pipelineResult.decision}, rationale=${framework.pipelineResult.decisionRationale}`,
  };

  const levels = [level1, level2, level3, level4, level5, level6];

  let decision: "A" | "B" | "C";
  let rationale: string;
  if (!level1Pass) {
    decision = "C";
    rationale = "Level1 FAIL: Production Contract(Position/Gate/Budget)가 정확히 구현되지 않음 -- 통합 시 구조적 문제. Architecture Revision 필요.";
  } else if (level2Pass && level3Pass && level4Pass && level5Pass && level6Pass) {
    decision = "A";
    rationale = "Level1-6 전부 PASS -- Production Integration 승인. 다음 Sprint는 Parity-Gated Cycle을 포함한 전체 Solver의 Post-Release(통합 Release) Validation.";
  } else {
    decision = "B";
    const reasons: string[] = [];
    if (!level2Pass) reasons.push("Regression 증가");
    if (!level3Pass) reasons.push("Capability 통계적으로 유의하지 않음(CI가 0 포함)");
    if (!level4Pass) reasons.push("Runtime 허용 범위 초과");
    if (!level5Pass) reasons.push("Primitive Interaction 문제(Duplicate/Starvation)");
    if (!level6Pass) reasons.push("Validation Framework Decision이 A가 아님");
    rationale = `Contract는 유효하나 (${reasons.join(", ")}) -- Production Integration Refinement 필요.`;
  }

  return { levels, decision, rationale };
}
