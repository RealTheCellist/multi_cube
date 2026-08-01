// Solver Long-term Reliability Validation Sprint v1 -- final driver.
//
// Usage:
//   npx tsx .../runSolverLongTermReliabilityValidationV1.ts
//
// Assumes run1.json and run2.json already exist (produced by
// runLongTermReliabilityCaptureV1.ts). Assembles Regression Trend,
// Runtime Distribution, Contract Stability, Determinism Analysis (fresh
// real execution, small N) into the final Reliability Decision.
import * as fs from "fs";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { TEST_DESIGN_V1 } from "./solverLongTermReliabilityValidationV1/TestDesign";
import type { ReplayRow } from "./solverLongTermReliabilityValidationV1/PopulationReplay";
import { buildRegressionTrend } from "./solverLongTermReliabilityValidationV1/RegressionTrend";
import { summarizeRuntimeDistribution, checkRuntimeToleranceAgainstBaseline } from "./solverLongTermReliabilityValidationV1/RuntimeDistribution";
import { auditContractStability } from "./solverLongTermReliabilityValidationV1/ContractStability";
import { runDeterminismAnalysis } from "./solverLongTermReliabilityValidationV1/DeterminismAnalysis";
import { evaluateReliabilityDecision } from "./solverLongTermReliabilityValidationV1/ReliabilityDecision";

const DATA_DIR = "src/customCube/solverLongTermReliabilityValidationV1/data";
const REPORT_PATH = `${DATA_DIR}/solver-long-term-reliability-validation-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/solver-long-term-reliability-validation-v1-result.json`;

const DETERMINISM_TARGET_LABELS = ["worstCase:5e5b20b", "snapshot335:60b5c3b1", "snapshot335:ad12c377", "scrambleDepth30:2", "scrambleDepth100:5"];
const DETERMINISM_REPEAT_COUNT = 5;

function main() {
  console.log("STEP1: Test Design (already documented, TestDesign.ts)...");
  console.log(`  realRunCount=${TEST_DESIGN_V1.realRunCount}`);

  console.log("STEP2: loading run1/run2 real population replay captures...");
  const run1Raw = JSON.parse(fs.readFileSync(`${DATA_DIR}/run1.json`, "utf-8"));
  const run2Raw = JSON.parse(fs.readFileSync(`${DATA_DIR}/run2.json`, "utf-8"));
  const run1: ReplayRow[] = run1Raw.rows;
  const run2: ReplayRow[] = run2Raw.rows;
  console.log(`  run1 n=${run1.length} (${run1Raw.startedAt} ~ ${run1Raw.finishedAt}), run2 n=${run2.length} (${run2Raw.startedAt} ~ ${run2Raw.finishedAt})`);

  console.log("STEP3: Regression Trend + Runtime Distribution...");
  const regressionTrend = buildRegressionTrend(run1, run2);
  const runtimeRun1 = summarizeRuntimeDistribution(run1);
  const runtimeRun2 = summarizeRuntimeDistribution(run2);
  const runtimeTolerance = checkRuntimeToleranceAgainstBaseline(runtimeRun1.p95Ms, runtimeRun2.p95Ms);
  console.log(`  flipCount=${regressionTrend.flipCount}, flipRate=${(regressionTrend.flipRate * 100).toFixed(1)}%`);
  console.log(`  run1 p95=${runtimeRun1.p95Ms}ms, run2 p95=${runtimeRun2.p95Ms}ms, withinTolerance=${runtimeTolerance.withinTolerance}`);

  console.log("STEP4: Contract Stability Audit (real code re-read vs Closeout capture)...");
  const contractStability = auditContractStability();
  console.log(`  anyDrift=${contractStability.anyDrift}`);

  console.log("STEP5: Determinism Analysis (real repeated solve(), N=5 per case)...");
  const allHoles = loadRawHoleDataset();
  const determinismCases = allHoles.filter((h) => DETERMINISM_TARGET_LABELS.includes(h.label));
  const determinism = runDeterminismAnalysis(determinismCases, DETERMINISM_REPEAT_COUNT);
  for (const d of determinism) {
    console.log(`  ${d.label}: chosenTypesIdentical=${d.allChosenTypesIdentical}(${d.distinctChosenTypes.join("/")}), wrongWingAfterIdentical=${d.allWrongWingAfterIdentical}(${d.distinctWrongWingAfter.join("/")})`);
  }

  console.log("STEP6: Reliability Decision...");
  const decisionResult = evaluateReliabilityDecision(regressionTrend, runtimeRun1, runtimeRun2, contractStability, determinism);
  console.log(`  Level1=${decisionResult.level1RegressionStable}, Level2=${decisionResult.level2RuntimeStable}, Level3=${decisionResult.level3ContractStable}, Level4=${decisionResult.level4DeterminismCharacterized}`);
  console.log(`  Decision=${decisionResult.decision}`);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Solver Long-term Reliability Validation Sprint v1 -- Report ===");
  push();
  push("STEP1. Test Design");
  push(`  methodology: ${TEST_DESIGN_V1.methodology}`);
  push(`  proxyJustification: ${TEST_DESIGN_V1.proxyJustification}`);
  push(`  frozenCodeBaseline: ${TEST_DESIGN_V1.frozenCodeBaseline}`);
  push();
  push("STEP2. Population Replay (2 independent real runs)");
  push(`  run1: n=${run1.length}, improvedCount=${run1.filter((r) => r.result.improved).length}, solvedCount=${run1.filter((r) => r.result.solved).length}`);
  push(`  run2: n=${run2.length}, improvedCount=${run2.filter((r) => r.result.improved).length}, solvedCount=${run2.filter((r) => r.result.solved).length}`);
  push();
  push("STEP3. Regression Trend");
  push(`  run1ImprovedCount=${regressionTrend.run1ImprovedCount}, run2ImprovedCount=${regressionTrend.run2ImprovedCount}`);
  push(`  run1SolvedCount=${regressionTrend.run1SolvedCount}, run2SolvedCount=${regressionTrend.run2SolvedCount}`);
  push(`  flipCount=${regressionTrend.flipCount}/${regressionTrend.rows.length}, flipRate=${(regressionTrend.flipRate * 100).toFixed(2)}%`);
  const flipped = regressionTrend.rows.filter((r) => r.flips);
  if (flipped.length > 0) {
    push(`  flipped cases:`);
    for (const f of flipped) push(`    ${f.label}: run1(improved=${f.run1Improved},solved=${f.run1Solved}) -> run2(improved=${f.run2Improved},solved=${f.run2Solved})`);
  }
  push();
  push("Runtime Distribution");
  push(`  run1: mean=${runtimeRun1.meanMs.toFixed(1)}ms, p50=${runtimeRun1.p50Ms}ms, p95=${runtimeRun1.p95Ms}ms, p99=${runtimeRun1.p99Ms}ms, max=${runtimeRun1.maxMs}ms, deadlineMissCount=${runtimeRun1.deadlineMissCount}`);
  push(`  run2: mean=${runtimeRun2.meanMs.toFixed(1)}ms, p50=${runtimeRun2.p50Ms}ms, p95=${runtimeRun2.p95Ms}ms, p99=${runtimeRun2.p99Ms}ms, max=${runtimeRun2.maxMs}ms, deadlineMissCount=${runtimeRun2.deadlineMissCount}`);
  push(`  run2 p95 vs run1 p95 tolerance(+15%): threshold=${runtimeTolerance.thresholdMs.toFixed(1)}ms, withinTolerance=${runtimeTolerance.withinTolerance}`);
  push();
  push("STEP4. Contract Stability Report");
  for (const r of contractStability.rows) push(`  ${r.constant}: closeout=${r.closeoutValue}, current=${r.currentValue}, drifted=${r.drifted}`);
  push(`  anyDrift=${contractStability.anyDrift}`);
  push();
  push("STEP5. Determinism Analysis (real repeated solve(), N=5 per case)");
  for (const d of determinism) {
    push(`  ${d.label}: chosenTypesIdentical=${d.allChosenTypesIdentical}, distinctChosenTypes=[${d.distinctChosenTypes.join(", ")}], improvedIdentical=${d.allImprovedIdentical}, wrongWingAfterIdentical=${d.allWrongWingAfterIdentical}, distinctWrongWingAfter=[${d.distinctWrongWingAfter.join(", ")}]`);
  }
  push();
  push("STEP6. Reliability Decision");
  push(`  Level1(Regression Stable)=${decisionResult.level1RegressionStable ? "PASS" : "FAIL"}`);
  push(`  Level2(Runtime Stable)=${decisionResult.level2RuntimeStable ? "PASS" : "FAIL"}`);
  push(`  Level3(Contract Stable)=${decisionResult.level3ContractStable ? "PASS" : "FAIL"}`);
  push(`  Level4(Determinism Characterized)=${decisionResult.level4DeterminismCharacterized ? "PASS" : "FAIL"}`);
  push(`  Decision=${decisionResult.decision}`);
  push(`  rationale: ${decisionResult.rationale}`);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        testDesign: TEST_DESIGN_V1,
        regressionTrend,
        runtimeRun1,
        runtimeRun2,
        runtimeTolerance,
        contractStability,
        determinism,
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
