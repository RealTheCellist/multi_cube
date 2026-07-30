// Solver Validation Framework Qualification Refinement Sprint v2 -- driver.
//   npx tsx src/customCube/solverValidationFrameworkQualificationRefinementV2/QualificationDriver.ts
//
// Pure data analysis over already-published historical numbers (Refinement
// Sprint v1's own HISTORICAL_QUALIFICATION_DATASET, unmodified) -- no
// solve() calls, no re-measurement. Only Gate B's treatment inside
// decideFromGates() changed this Sprint (ValidationPipeline.ts); Gate B's
// own PASS/OPEN_QUESTION computation (ReleaseGates.ts) is unchanged.
import * as fs from "fs";
import { HISTORICAL_QUALIFICATION_DATASET } from "../solverValidationFrameworkQualification/HistoricalQualificationDataset";
import { replayRuntimeGate } from "./RuntimeGateReplay";
import { compareAllPolicies } from "./DecisionRuleComparison";
import { GATE_B_REGRESSION_AUDIT } from "./RuleRegressionAudit";

const DATA_DIR = "src/customCube/solverValidationFrameworkQualificationRefinementV2/data";
const REPORT_PATH = `${DATA_DIR}/solver-validation-framework-qualification-refinement-v2-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/solver-validation-framework-qualification-refinement-v2-result.json`;

// Before (Refinement Sprint v1's own already-published result), cited not
// re-derived.
const BEFORE = { matchRate: 0.6, matchCount: 3, falsePassCount: 0, falseFailCount: 2, decision: "B" };

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const cases = HISTORICAL_QUALIFICATION_DATASET;
  const runtimeGateRows = replayRuntimeGate(cases);
  const policyEvaluations = compareAllPolicies();

  const lines: string[] = [];
  const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));

  push("Solver Validation Framework Qualification Refinement Sprint v2 -- Report");
  push(`Generated: ${new Date().toISOString()}`);
  push(`Population: ${cases.length} Historical Sprints (Refinement Sprint v1과 SAME 데이터셋/수치, 재측정 없음)`);
  push();

  push("STEP1. Gate B Runtime Replay -- 현재(strict) Decision vs Gate B=PASS 반사실 Decision");
  for (const row of runtimeGateRows) {
    push(`  ${row.sprintName}`);
    push(`    Gate B 상태=${row.gateBStatus}, 실제 Decision=${row.actualDecision}, 현재 Framework Decision=${row.currentFrameworkDecision}, Gate B=PASS였다면=${row.counterfactualDecisionIfGateBWerePass}`);
    push(`    Gate B가 원인인가=${row.gateBIsTheCause ? "YES" : "no"}, 전환=${row.transition}`);
  }
  push();

  push("STEP2/3. Rule Candidate 비교 (동일 5개 Historical Case)");
  for (const ev of policyEvaluations) {
    push(`  [${ev.policy}] ${ev.label}`);
    push(`    Decision Match Rate: ${ev.matchCount}/${cases.length} (${(ev.matchRate * 100).toFixed(1)}%)`);
    push(`    False PASS=${ev.robustness.falsePassCount}, False FAIL=${ev.robustness.falseFailCount}, Ambiguous=${ev.robustness.ambiguousCount}`);
    for (const row of ev.rows) {
      push(`      ${row.sprintName}: 실제=${row.actualDecision}, Framework=${row.frameworkDecision} -- ${row.match ? "MATCH" : "MISMATCH"}`);
    }
  }
  push();

  const strictEval = policyEvaluations.find((e) => e.policy === "strict")!;
  const optionAEval = policyEvaluations.find((e) => e.policy === "treatAllOpenQuestionAsPass")!;
  const optionBEval = policyEvaluations.find((e) => e.policy === "gateBExemptIfOthersPass")!;

  push("4. Before/After (Refinement Sprint v1 인용 vs 이번 Sprint)");
  push(`  Before(Refinement v1, 인용): Match=${BEFORE.matchCount}/5(${(BEFORE.matchRate * 100).toFixed(1)}%), False PASS=${BEFORE.falsePassCount}, False FAIL=${BEFORE.falseFailCount}, Decision=${BEFORE.decision}`);
  push(`  After(Option C, 재확인): Match=${strictEval.matchCount}/5(${(strictEval.matchRate * 100).toFixed(1)}%) -- Before와 동일해야 정상(변경 없음 확인)`);
  push(`  After(Option A): Match=${optionAEval.matchCount}/5(${(optionAEval.matchRate * 100).toFixed(1)}%), False PASS=${optionAEval.robustness.falsePassCount}, False FAIL=${optionAEval.robustness.falseFailCount}`);
  push(`  After(Option B, 채택 후보): Match=${optionBEval.matchCount}/5(${(optionBEval.matchRate * 100).toFixed(1)}%), False PASS=${optionBEval.robustness.falsePassCount}, False FAIL=${optionBEval.robustness.falseFailCount}`);
  push();

  push("STEP4. Rule Regression Audit -- 기존 발표된 3개 Release Sprint의 Gate B 상태");
  for (const r of GATE_B_REGRESSION_AUDIT) {
    push(`  ${r.sprintName}: Gate B=${r.gateBStatus}, 정책 변경 영향권=${r.policyChangeAffectsThisCase ? "있음" : "없음"}`);
    push(`    ${r.citedRuntimeDiff}`);
    push(`    ${r.note}`);
  }
  const anyExternalRegression = GATE_B_REGRESSION_AUDIT.some((r) => r.policyChangeAffectsThisCase);
  push(`  Regression 발생 여부: ${anyExternalRegression ? "있음(재검토 필요)" : "없음 -- 3개 Sprint 모두 Gate B가 이미 PASS라 정책 변경과 무관"}`);
  push();

  // STEP5 Decision Matrix, evaluated against the adopted candidate (Option
  // B -- see ValidationPipeline.ts's RECOMMENDED_GATE_B_POLICY and the
  // doc's own rationale for choosing B over A despite the tie on this
  // population).
  const level1 = optionBEval.matchRate > strictEval.matchRate;
  const level2 = optionBEval.robustness.falsePassCount <= strictEval.robustness.falsePassCount;
  const level3 = !anyExternalRegression;
  const decisionMatchOk = optionBEval.matchRate >= 0.8;
  const allLevelsPass = level1 && level2 && level3;
  const decision = allLevelsPass && decisionMatchOk ? "A" : level1 && optionBEval.matchRate > strictEval.matchRate ? "B" : "C";

  push("STEP5. Decision Matrix");
  push(`  Level1(Gate B Rule 변경이 Decision Match를 개선): ${level1 ? "PASS" : "FAIL"} (${(strictEval.matchRate * 100).toFixed(1)}% -> ${(optionBEval.matchRate * 100).toFixed(1)}%)`);
  push(`  Level2(False PASS 증가 없음): ${level2 ? "PASS" : "FAIL"} (${strictEval.robustness.falsePassCount} -> ${optionBEval.robustness.falsePassCount})`);
  push(`  Level3(기존 Release Decision Regression 없음): ${level3 ? "PASS" : "FAIL"}`);
  push(`  Decision Match Rate(Option B, 채택안): ${(optionBEval.matchRate * 100).toFixed(1)}% (기준 >=80%: ${decisionMatchOk ? "충족" : "미충족"})`);
  push(`  Final Decision: ${decision}`);
  push();

  push("종료 조건 판정");
  const q1 = runtimeGateRows.every((r) => !r.gateBIsTheCause) ? "N/A(잔여 원인 없음)" : "YES -- Gate B의 OPEN_QUESTION 처리 방식이 남은 불일치의 원인이었음(반사실 검증으로 확인)";
  push(`  1) Gate B의 OPEN_QUESTION 처리 방식이 Qualification 불일치의 마지막 원인이었는가: ${q1}`);
  push(`  2) Framework는 Historical Sprint에 대해 재현 가능한 Release Decision을 일관되게 산출하는가: ${decisionMatchOk && level3 ? "YES(Option B 적용 시)" : "NO"}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"));
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        runtimeGateRows,
        policyEvaluations,
        gateBRegressionAudit: GATE_B_REGRESSION_AUDIT,
        before: BEFORE,
        levels: { level1, level2, level3 },
        decisionMatchOk,
        finalDecision: decision,
      },
      null,
      2
    )
  );
  console.log(`report written: ${REPORT_PATH}`);
  console.log(lines.join("\n"));
}

main();
