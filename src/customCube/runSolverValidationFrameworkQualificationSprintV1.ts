// Solver Validation Framework Qualification Sprint v1 -- driver.
//   npx tsx src/customCube/runSolverValidationFrameworkQualificationSprintV1.ts
//
// Pure data analysis over already-published historical Sprint numbers --
// no solve() calls, no long-running replay. Framework code
// (solverPostReleaseValidationFramework/) is imported read-only and never
// modified.
import * as fs from "fs";
import { HISTORICAL_QUALIFICATION_DATASET, CATEGORY_A_GAP_NOTE } from "./solverValidationFrameworkQualification/HistoricalQualificationDataset";
import { replayClassification } from "./solverValidationFrameworkQualification/ClassificationReplay";
import { replayAllGates } from "./solverValidationFrameworkQualification/GateReplay";
import { replayDecisions, summarizeDecisionReplay } from "./solverValidationFrameworkQualification/DecisionReplay";
import { analyzeRobustness, summarizeRobustness } from "./solverValidationFrameworkQualification/FrameworkRobustnessAnalysis";

const DATA_DIR = "src/customCube/solverValidationFrameworkQualification/data";
const REPORT_PATH = `${DATA_DIR}/solver-validation-framework-qualification-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/solver-validation-framework-qualification-v1-result.json`;

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const cases = HISTORICAL_QUALIFICATION_DATASET;
  const classificationRows = replayClassification(cases);
  const gateRows = replayAllGates(cases);
  const decisionRows = replayDecisions(cases, gateRows);
  const decisionSummary = summarizeDecisionReplay(decisionRows);
  const robustnessFindings = analyzeRobustness(cases, decisionRows);
  const robustnessSummary = summarizeRobustness(robustnessFindings);

  const lines: string[] = [];
  const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));

  push("Solver Validation Framework Qualification Sprint v1 -- Report");
  push(`Generated: ${new Date().toISOString()}`);
  push(`Population: ${cases.length} Historical Sprints (Bug Fix category: no historical example, see note)`);
  push();

  push("1. Historical Qualification Dataset (Deliverable #1)");
  for (const c of cases) {
    push(`  ${c.sprintName} (Category ${c.assignedCategory}, N=${c.nUsed}) -- 실제 Decision: ${c.actualDecision}`);
    push(`    ${c.actualDecisionQuote}`);
  }
  push(`  [Category A Gap] ${CATEGORY_A_GAP_NOTE}`);
  push();

  push("2. Classification Replay (Deliverable #2)");
  for (const row of classificationRows) {
    push(`  [${row.status}] ${row.sprintName}: ${row.assignedCategory}, N=${row.nUsed}(요구 N>=${row.minNRequired})`);
    push(`    ${row.note}`);
  }
  push();

  push("3. Release Gate Replay (Deliverable #3)");
  for (const row of gateRows) {
    push(`  ${row.sprintName}:`);
    for (const g of row.gates) {
      push(`    [Gate ${g.gate}][${g.status}] ${g.name}: ${g.evidence}`);
    }
  }
  push();

  push("4. Decision Replay (Deliverable #4)");
  for (const row of decisionRows) {
    push(`  ${row.sprintName}: 실제=${row.actualDecision}, Framework=${row.frameworkDecision} -- ${row.match ? "MATCH" : "MISMATCH"}`);
    push(`    ${row.pipelineResult.decisionRationale}`);
  }
  push(`  Decision Match Rate: ${decisionSummary.matchCount}/${decisionSummary.n} (${(decisionSummary.matchRate * 100).toFixed(1)}%)`);
  push();

  push("5. Qualification Matrix (Deliverable #5)");
  push(`  Historical Sprint 재현: ${cases.length}건 완료`);
  push(`  Classification 정합성: ${classificationRows.filter((r) => r.status === "PASS").length}/${classificationRows.length} PASS`);
  push(`  Decision 일치율: ${(decisionSummary.matchRate * 100).toFixed(1)}%`);
  push();

  push("6. Failure Analysis (Deliverable #6)");
  push(`  False PASS: ${robustnessSummary.falsePassCount}건, False FAIL: ${robustnessSummary.falseFailCount}건, Ambiguous: ${robustnessSummary.ambiguousCount}건`);
  for (const f of robustnessSummary.findings) {
    push(`    [${f.kind}] ${f.sprintName}: ${f.detail}`);
  }
  if (robustnessSummary.findings.length === 0) push("    (불일치 없음)");
  push();

  push("7. Final Qualification (Deliverable #7)");
  const decision = decisionSummary.matchRate === 1 ? "A" : decisionSummary.matchRate >= 0.6 ? "B" : "C";
  push(`  Decision Match Rate=${(decisionSummary.matchRate * 100).toFixed(1)}%, Classification 정합성=${classificationRows.filter((r) => r.status === "PASS").length}/${classificationRows.length}`);
  push(`  Final Decision: ${decision}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"));
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify({ classificationRows, gateRows, decisionRows, decisionSummary, robustnessSummary, finalDecision: decision }, null, 2)
  );
  console.log(`report written: ${REPORT_PATH}`);
}

main();
