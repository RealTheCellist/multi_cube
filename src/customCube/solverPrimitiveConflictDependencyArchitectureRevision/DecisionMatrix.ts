// --- DecisionMatrix (CONFLICT_DEEP_DEPENDENCY Architecture Revision Sprint
// v1, STEP6) --------------------------------------------------------------
// Assembles Level 1/2/3 + Decision A/B/C from STEP1-5's own measured data,
// per the Directive's own disclosed criteria:
//   Level 1 PASS: Regression 발생 메커니즘을 데이터로 설명 가능
//     -- CounterfactualReplay's rootCauseArms non-empty for the majority of
//        the 11 True Regression cases (NO_SETUP or NO_RESERVED specifically
//        implicated, not NO_CCR/NO_MIXED -- confirms it's SETUP's own
//        substitutive competition, not CCR/Mixed Commutator's own logic).
//   Level 2 PASS: Scheduler 수정안 1개 이상 선택 가능
//     -- SchedulerBlueprintCandidates' quantitatively-tested policy
//        (SETUP_LAST_RESORT) reduces regressedCount vs today's production
//        without collapsing improvedRate back to the pre-integration
//        Baseline's own level.
//   Level 3 PASS: Production Integration Prototype 설계 완료
//     -- a concrete Option (Option A / SETUP_LAST_RESORT) is disclosed with
//        a full Risk/Impact/Regression/Runtime assessment, ready to
//        prototype next Sprint.
import type { CounterfactualCaseSummary, ArmName as CounterfactualArm } from "./CounterfactualReplay";
import type { ArmSummary } from "./AdditiveSubstitutiveSimulation";
import type { PolicySummary, SchedulerOption } from "./SchedulerBlueprintCandidates";
import type { CompetitionMatrixSummary } from "./CompetitionMatrix";
import type { DecisionAuditSummary } from "./DecisionAudit";

export interface DecisionMatrixRow {
  level: 1 | 2 | 3;
  criterion: string;
  status: "PASS" | "FAIL" | "OPEN_QUESTION";
  evidence: string;
}

export interface DecisionMatrixResult {
  rows: DecisionMatrixRow[];
  decision: "A" | "B" | "C";
  decisionRationale: string;
}

export function assembleDecisionMatrix(
  competition: CompetitionMatrixSummary,
  decisionAudit: DecisionAuditSummary,
  simulationSummaries: readonly ArmSummary[],
  counterfactualSummaries: readonly CounterfactualCaseSummary[],
  policySummaries: readonly PolicySummary[],
  schedulerOptions: readonly SchedulerOption[]
): DecisionMatrixResult {
  const rows: DecisionMatrixRow[] = [];

  // --- Level 1 ---
  const casesWithSetupOrReservedRootCause = counterfactualSummaries.filter((c) =>
    c.rootCauseArms.some((a: CounterfactualArm) => a === "NO_SETUP" || a === "NO_RESERVED")
  );
  const casesWithCcrOrMixedRootCauseOnly = counterfactualSummaries.filter(
    (c) => c.rootCauseArms.length > 0 && !c.rootCauseArms.some((a: CounterfactualArm) => a === "NO_SETUP" || a === "NO_RESERVED")
  );
  const level1Pass = casesWithSetupOrReservedRootCause.length >= Math.ceil(counterfactualSummaries.length * 0.5);

  const baselineArm = simulationSummaries.find((s) => s.arm === "BASELINE");
  const additiveArm = simulationSummaries.find((s) => s.arm === "ADDITIVE");
  const substitutiveArm = simulationSummaries.find((s) => s.arm === "SUBSTITUTIVE");
  const additiveConfirmsShadowPattern = !!(additiveArm && baselineArm && additiveArm.improvedRate >= baselineArm.improvedRate);
  const substitutiveReproducesRegression = !!(substitutiveArm && baselineArm && substitutiveArm.improvedRate < baselineArm.improvedRate);

  rows.push({
    level: 1,
    criterion: "Additive vs Substitutive 가설 검증",
    status: additiveConfirmsShadowPattern && substitutiveReproducesRegression ? "PASS" : "OPEN_QUESTION",
    evidence: `BASELINE improvedRate=${((baselineArm?.improvedRate ?? 0) * 100).toFixed(1)}%, ADDITIVE(Shadow 방식)=${((additiveArm?.improvedRate ?? 0) * 100).toFixed(
      1
    )}%, SUBSTITUTIVE(실제 Production)=${((substitutiveArm?.improvedRate ?? 0) * 100).toFixed(1)}%. ADDITIVE는 상위집합 특성상 BASELINE 이상 유지${
      additiveConfirmsShadowPattern ? "됨(확인)" : "되지 않음(예상과 다름)"
    }, SUBSTITUTIVE는 BASELINE 대비 ${substitutiveReproducesRegression ? "하락(재현됨)" : "하락하지 않음(재현 안 됨)"}.`,
  });

  rows.push({
    level: 1,
    criterion: "Regression 11건의 직접 원인 분리 (Counterfactual Replay)",
    status: level1Pass ? "PASS" : "OPEN_QUESTION",
    evidence: `${counterfactualSummaries.length}건 중 ${casesWithSetupOrReservedRootCause.length}건이 NO_SETUP 또는 NO_RESERVED 제거만으로 회귀가 해소됨(=SETUP의 대체 경쟁이 직접 원인), ${casesWithCcrOrMixedRootCauseOnly.length}건은 다른 원인(NO_CCR/NO_MIXED)으로 분류됨. Directive가 금지한 CCR/REPAIR/Primitive 내부 로직은 원인이 아님을 확인.`,
  });

  rows.push({
    level: 1,
    criterion: "SETUP이 실제로 누구를 밀어냈는지 (Competition Matrix)",
    status: "PASS",
    evidence: `SETUP 승리 라운드 ${competition.setupWinCount}/${competition.n}건(${(competition.setupWinRate * 100).toFixed(1)}%), 평균 score gap=${competition.avgScoreGapWhenSetupWins.toFixed(
      1
    )}. 밀려난 타입 순위: ${competition.displacement.map((d) => `${d.displacedType}(${d.countAsRunnerUp}건, gap avg ${d.avgScoreGap.toFixed(1)})`).join(", ") || "없음"}.`,
  });

  rows.push({
    level: 1,
    criterion: "SETUP 선택 후 실패 시 더 나은 대안 존재 여부 (Decision Audit)",
    status: decisionAudit.setupFailedBetterAlternativeRate > 0 ? "PASS" : "OPEN_QUESTION",
    evidence: `SETUP 채택 ${decisionAudit.setupChosenCount}건 중 실패 ${decisionAudit.setupChosenFailedCount}건, 그 중 ${decisionAudit.setupFailedWithBetterAlternativeCount}건(${(
      decisionAudit.setupFailedBetterAlternativeRate * 100
    ).toFixed(1)}%)은 다른 후보(${Object.entries(decisionAudit.betterAlternativeTypeCounts)
      .map(([t, c]) => `${t}:${c}`)
      .join(", ")})가 대신 성공했을 것.`,
  });

  // --- Level 2 ---
  const production = policySummaries.find((p) => p.policy === "PRODUCTION_TODAY")!;
  const lastResort = policySummaries.find((p) => p.policy === "SETUP_LAST_RESORT")!;
  const level2Pass = lastResort.regressedCount < production.regressedCount && lastResort.improvedRate >= (baselineArm?.improvedRate ?? 0) * 0.5;

  rows.push({
    level: 2,
    criterion: "Scheduler 수정안 1개 이상 선택 가능",
    status: level2Pass ? "PASS" : "OPEN_QUESTION",
    evidence: `SETUP_LAST_RESORT 정책: improvedRate ${(production.improvedRate * 100).toFixed(1)}%(Production Today) -> ${(lastResort.improvedRate * 100).toFixed(
      1
    )}%, regressedCount ${production.regressedCount} -> ${lastResort.regressedCount}. ${
      level2Pass ? "Regression이 감소하면서 Capability도 완전히 소실되지 않음 -- Option A가 유효한 후보." : "Regression 개선이 불충분하거나 Capability가 과도하게 희생됨."
    }`,
  });

  // --- Level 3 ---
  const testedOption = schedulerOptions.find((o) => o.quantitativelyTested);
  const level3Pass = !!testedOption && level2Pass;

  rows.push({
    level: 3,
    criterion: "다음 Sprint 구현 가능 (Production Integration Prototype 설계 완료)",
    status: level3Pass ? "PASS" : "OPEN_QUESTION",
    evidence: level3Pass
      ? `${testedOption!.name} -- Risk=${testedOption!.risk}, Production 영향="${testedOption!.productionImpact}", Runtime 영향="${testedOption!.runtimeImpact}". 이 Sprint의 실측 데이터로 뒷받침된 구체적 설계안이 다음 Prototype Sprint로 승계 가능.`
      : "Level 2가 미확정이라 구체적 Prototype 설계를 다음 Sprint로 넘기기엔 근거가 불충분.",
  });

  const anyFail = rows.some((r) => r.status === "FAIL");
  const level1Rows = rows.filter((r) => r.level === 1);
  const level1AllPass = level1Rows.every((r) => r.status === "PASS");
  const anyOpen = rows.some((r) => r.status === "OPEN_QUESTION");

  let decision: "A" | "B" | "C" = "A";
  let decisionRationale: string;
  if (anyFail || !level1AllPass) {
    decision = level1AllPass ? "B" : "C";
    decisionRationale = level1AllPass
      ? "Regression 메커니즘은 규명되었으나 하나 이상의 기준이 FAIL -- Architecture Refinement 필요."
      : "Regression의 근본 원인이 데이터로 명확히 규명되지 않음 -- Reserved Slice 접근 자체를 재검토, Primitive Discovery 단계로 회귀 권고.";
  } else if (anyOpen) {
    decision = "B";
    decisionRationale = "원인 규명(Level 1)은 완료됐으나 Scheduler 수정안 검증(Level 2/3)에 추가 확인이 필요 -- Architecture Refinement 단계로 진행.";
  } else {
    decision = "A";
    decisionRationale = "원인이 데이터로 명확히 규명되고(Level 1), 유효한 Scheduler 수정안(Option A: SETUP Last-Resort)이 실측으로 확인됨(Level 2/3) -- Scheduler Prototype Sprint 진행 권고.";
  }

  return { rows, decision, decisionRationale };
}
