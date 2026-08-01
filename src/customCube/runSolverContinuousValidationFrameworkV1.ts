// Continuous Validation Framework Sprint v1 -- final driver.
//
// Usage:
//   npx tsx .../runSolverContinuousValidationFrameworkV1.ts
//
// Assumes run3.json already exists (produced by
// runContinuousValidationNightlyCaptureV1.ts run3). Reuses run1.json/
// run2.json already committed by the Long-term Reliability Validation
// Sprint v1 as the first two real Dashboard entries -- 3 real runs total.
import * as fs from "fs";
import { VALIDATION_POLICY_V1 } from "./solverContinuousValidationFrameworkV1/ValidationPolicy";
import { buildDashboardHistory, type DashboardEntryInput } from "./solverContinuousValidationFrameworkV1/RegressionDashboard";
import { runContractDriftMonitor } from "./solverContinuousValidationFrameworkV1/ContractDriftMonitor";
import { runReleaseGateAutomation } from "./solverContinuousValidationFrameworkV1/ReleaseGateAutomation";
import { evaluateFrameworkDecision } from "./solverContinuousValidationFrameworkV1/FrameworkDecision";
import { summarizeRuntimeDistribution } from "./solverLongTermReliabilityValidationV1/RuntimeDistribution";

const RELIABILITY_DATA_DIR = "src/customCube/solverLongTermReliabilityValidationV1/data";
const DATA_DIR = "src/customCube/solverContinuousValidationFrameworkV1/data";
const REPORT_PATH = `${DATA_DIR}/solver-continuous-validation-framework-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/solver-continuous-validation-framework-v1-result.json`;

function main() {
  console.log("STEP1: Validation Policy (already documented)...");
  console.log(`  ${VALIDATION_POLICY_V1.length} checks defined.`);

  console.log("STEP2/3: loading 3 real runs (run1/run2 reused from Reliability Sprint, run3 fresh) + building Dashboard...");
  const run1Raw = JSON.parse(fs.readFileSync(`${RELIABILITY_DATA_DIR}/run1.json`, "utf-8"));
  const run2Raw = JSON.parse(fs.readFileSync(`${RELIABILITY_DATA_DIR}/run2.json`, "utf-8"));
  const run3Raw = JSON.parse(fs.readFileSync(`${DATA_DIR}/run3.json`, "utf-8"));

  const entries: DashboardEntryInput[] = [
    { runId: "run1", startedAt: run1Raw.startedAt, finishedAt: run1Raw.finishedAt, rows: run1Raw.rows },
    { runId: "run2", startedAt: run2Raw.startedAt, finishedAt: run2Raw.finishedAt, rows: run2Raw.rows },
    { runId: "run3", startedAt: run3Raw.startedAt, finishedAt: run3Raw.finishedAt, rows: run3Raw.rows },
  ];
  const dashboard = buildDashboardHistory(entries);
  for (const row of dashboard) {
    console.log(`  ${row.runId}: improved=${row.improvedCount}, p95=${row.runtimeP95Ms}ms, deadlineMiss=${row.deadlineMissCount}, regressionVsPrevious=${row.regressionCountVsPrevious}`);
  }

  console.log("STEP4: Contract Drift Monitor...");
  const contractDrift = runContractDriftMonitor();
  console.log(`  status=${contractDrift.status}`);

  console.log("STEP5: Release Gate Automation (run3 vs run2 as reference)...");
  const run2P95 = summarizeRuntimeDistribution(run2Raw.rows).p95Ms;
  const releaseGate = runReleaseGateAutomation(run2Raw.rows, run3Raw.rows, run2P95);
  console.log(`  gateA=${releaseGate.gateA.status}, gateB=${releaseGate.gateB.status}, gateC=${releaseGate.gateC.status}, contractDrift=${releaseGate.contractDrift.status}`);
  console.log(`  overallDecision=${releaseGate.overallDecision}`);

  console.log("STEP6: Framework Decision...");
  const decisionResult = evaluateFrameworkDecision(VALIDATION_POLICY_V1, dashboard, contractDrift, releaseGate);
  console.log(`  Level1=${decisionResult.level1NightlyValidationFrameworkBuilt}, Level2=${decisionResult.level2RegressionDashboardBuilt}, Level3=${decisionResult.level3ContractDriftMonitorBuilt}, Level4=${decisionResult.level4ReleaseGateAutomationApplied}`);
  console.log(`  Decision=${decisionResult.decision}`);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Solver Continuous Validation Framework Sprint v1 -- Report ===");
  push();
  push("STEP1. Validation Policy");
  for (const c of VALIDATION_POLICY_V1) {
    push(`  [${c.name}] (${c.frequency})`);
    push(`    reusedModule: ${c.reusedModule}`);
    push(`    passCriterion: ${c.passCriterion}`);
  }
  push();
  push("STEP2/3. Nightly Validation + Regression Dashboard (3 real runs)");
  push(`  | Run | Improved | Solved | Runtime p95 | Deadline Miss | RegressionVsPrevious |`);
  for (const row of dashboard) {
    push(`  | ${row.runId} | ${row.improvedCount} | ${row.solvedCount} | ${row.runtimeP95Ms}ms | ${row.deadlineMissCount} | ${row.regressionCountVsPrevious ?? "N/A"} |`);
  }
  push();
  push("STEP4. Contract Drift Monitor");
  for (const r of contractDrift.rows) push(`  ${r.constant}: closeout=${r.closeoutValue}, current=${r.currentValue}, drifted=${r.drifted}`);
  push(`  status=${contractDrift.status}`);
  push();
  push("STEP5. Release Gate Automation (run3 vs run2)");
  push(`  Gate A(Regression): ${releaseGate.gateA.status} -- ${releaseGate.gateA.evidence}`);
  push(`  Gate B(Runtime): ${releaseGate.gateB.status} -- ${releaseGate.gateB.evidence}`);
  push(`  Gate C(Capability): ${releaseGate.gateC.status} -- ${releaseGate.gateC.evidence}`);
  push(`  Contract Drift: ${releaseGate.contractDrift.status}`);
  push(`  overallDecision=${releaseGate.overallDecision}`);
  push();
  push("STEP6. Framework Decision");
  push(`  Level1(Nightly Validation Framework 구축)=${decisionResult.level1NightlyValidationFrameworkBuilt ? "PASS" : "FAIL"}`);
  push(`  Level2(Regression Dashboard 생성)=${decisionResult.level2RegressionDashboardBuilt ? "PASS" : "FAIL"}`);
  push(`  Level3(Contract Drift Monitor 구축)=${decisionResult.level3ContractDriftMonitorBuilt ? "PASS" : "FAIL"}`);
  push(`  Level4(Release Gate Automation 적용)=${decisionResult.level4ReleaseGateAutomationApplied ? "PASS" : "FAIL"}`);
  push(`  Decision=${decisionResult.decision}`);
  push(`  rationale: ${decisionResult.rationale}`);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        validationPolicy: VALIDATION_POLICY_V1,
        dashboard,
        contractDrift,
        releaseGate,
        decisionResult,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`report written: ${REPORT_PATH}`);
  console.log(lines.join("\n"));
}

main();
