// Multi-Component Merge Short-Circuit Production Integration Sprint v1 --
// driver.
//
// Usage:
//   npx tsx .../runMultiComponentMergeShortCircuitProductionIntegrationV1.ts capture baseline
//   npx tsx .../runMultiComponentMergeShortCircuitProductionIntegrationV1.ts capture integrated
//   npx tsx .../runMultiComponentMergeShortCircuitProductionIntegrationV1.ts compare
//
// "capture <label>" runs the full 142-case + 3-case SuccessMismatch real
// attemptRecovery() replay at TODAY'S ON-DISK production defaults and
// writes data/{label}-raw.json. Since the Sprint's own fix (adding
// MULTI_COMPONENT_MERGE to attemptRecovery()'s shortCircuitRepair
// condition) is an UNCONDITIONAL one-line production change with no
// runtime flag, "baseline" is captured by running this same script while
// that one line is temporarily `git stash`-ed away, then "integrated" is
// captured after `git stash pop` restores it -- mirroring every prior
// Sprint's own flag-toggled Baseline/Integrated arms, the mechanical
// equivalent for a change with no flag. "compare" loads both raw captures
// and runs STEP5 (Regression Audit) + STEP6 (Statistical Validation +
// Validation Framework) + Decision, never re-running the replay itself.
import * as fs from "fs";
import { buildWingLibrary, buildFlipLibrary, buildCaseLibrary } from "./fiveByFiveEdges";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import { auditShortCircuitContract } from "./solverPrimitiveMultiComponentMergeShortCircuitProductionIntegration/ContractAudit";
import { runPopulation, type ReplayOutcome } from "./solverPrimitiveMultiComponentMergeShortCircuitProductionIntegration/ReplayRunner";
import { auditRegression } from "./solverPrimitiveMultiComponentMergeShortCircuitProductionIntegration/RegressionAudit";
import { compareBaselineVsIntegrated } from "./solverPrimitiveMultiComponentMergeShortCircuitProductionIntegration/StatisticalValidation";
import { runValidationFramework } from "./solverPrimitiveMultiComponentMergeShortCircuitProductionIntegration/ValidationFramework";

const TARGET_MISMATCH_LABELS = ["scrambleDepth30:2", "scrambleDepth40:7", "scrambleDepth100:5"];
const DATA_DIR = "src/customCube/solverPrimitiveMultiComponentMergeShortCircuitProductionIntegration/data";
const REPORT_PATH = `${DATA_DIR}/multi-component-merge-short-circuit-production-integration-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/multi-component-merge-short-circuit-production-integration-v1-result.json`;

function rawPath(label: string) {
  return `${DATA_DIR}/${label}-raw.json`;
}

function capture(label: string) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };
  console.log(`[${label}] Loading Hole Dataset (n=142)...`);
  const holes = loadRawHoleDataset();

  console.log(`[${label}] STEP1: Contract Audit (only meaningful for the integrated capture, run anyway for record)...`);
  const contractAudit = auditShortCircuitContract();
  console.log(`  allTypesPresent=${contractAudit.allTypesPresent}, presentTypes=${contractAudit.presentTypes.join(",")}`);

  console.log(`[${label}] STEP2: Production Replay (real attemptRecovery(), outer=1000ms, today's on-disk production defaults, full population)...`);
  const population = runPopulation(holes, libs);
  const improvedCount = population.filter((r) => r.improved).length;
  const regressionCount = population.filter((r) => r.trueRegression).length;
  console.log(`  improvedCount=${improvedCount}, regressionCount=${regressionCount}`);

  console.log(`[${label}] STEP3: SuccessMismatch Replay (${TARGET_MISMATCH_LABELS.join(", ")})...`);
  const mismatchRows = population.filter((r) => TARGET_MISMATCH_LABELS.includes(r.label));
  for (const r of mismatchRows) console.log(`  ${r.label}: wrongWing ${r.wrongWingBefore}->${r.wrongWingAfter}, chosenType=${r.chosenType}, mcmShortCircuited=${r.mcmShortCircuited}`);

  fs.writeFileSync(rawPath(label), JSON.stringify({ label, contractAudit, population }, null, 2), "utf-8");
  console.log(`[${label}] raw capture written: ${rawPath(label)}`);
}

// SuccessMismatch Replay/Short-Circuit Validation (STEP3/4) source: the 3
// target cases replayed at outer=2000ms -- the EXACT conditions Refinement
// Sprint v3 identified them under (successMismatch = comparativeIsolated
// Success at outer=2000ms vs production Arm C failure at outer=2000ms).
// Real production's own outer deadline is 1000ms (STEP2's own scope) --
// at 1000ms none of these 3 cases even give MULTI_COMPONENT_MERGE enough
// budget to be chosen at all (confirmed: chosenType=none for all 3 in both
// Baseline and Integrated 1000ms captures), so replaying STEP3/4 at 1000ms
// would trivially show "no change" regardless of whether the fix works --
// not a meaningful test of the fix. Captured separately via
// _mismatch_at_2000ms.ts (same runOneCase(), outer parametrized to 2000ms,
// git-checkout-toggled the same way as the population capture).
function loadMismatchAt2000ms(label: "baseline" | "integrated"): ReplayOutcome[] {
  return JSON.parse(fs.readFileSync(`${DATA_DIR}/mismatch-at-2000ms-${label}.json`, "utf-8"));
}

function compare() {
  const baselineRaw = JSON.parse(fs.readFileSync(rawPath("baseline"), "utf-8"));
  const integratedRaw = JSON.parse(fs.readFileSync(rawPath("integrated"), "utf-8"));
  const baseline: ReplayOutcome[] = baselineRaw.population;
  const integrated: ReplayOutcome[] = integratedRaw.population;
  const contractAudit = integratedRaw.contractAudit;

  console.log("STEP3/4: SuccessMismatch Replay + Short-Circuit Validation (outer=2000ms, matching Refinement Sprint v3's own reproduction conditions)...");
  const mismatchIntegrated = loadMismatchAt2000ms("integrated");
  const mismatchBaseline = new Map(loadMismatchAt2000ms("baseline").map((r) => [r.label, r]));
  for (const r of mismatchIntegrated) {
    const b = mismatchBaseline.get(r.label)!;
    console.log(`  ${r.label}: baseline(wrongWing ${b.wrongWingBefore}->${b.wrongWingAfter}, improved=${b.improved}) -> integrated(wrongWing ${r.wrongWingBefore}->${r.wrongWingAfter}, improved=${r.improved}, mcmShortCircuited=${r.mcmShortCircuited})`);
  }

  console.log("STEP5: Regression Audit (full population, Baseline vs Integrated)...");
  const regressionAudit = auditRegression(baseline, integrated);
  console.log(`  newRegressionCount=${regressionAudit.newRegressionCount}, newCapabilityCount=${regressionAudit.newCapabilityCount}, duplicateRescueCount=${regressionAudit.duplicateRescueCount}, starvedTypeCount=${regressionAudit.starvedTypeCount}`);

  console.log("STEP6: Statistical Validation + Validation Framework (Category C Gate list: A/B/C/E)...");
  const comparison = compareBaselineVsIntegrated(baseline, integrated);
  console.log(`  improvedCountDiff mean=${comparison.improvedCountDiff.stats.mean.toFixed(4)}, 95% CI=[${comparison.improvedCountDiff.stats.ciLower.toFixed(4)}, ${comparison.improvedCountDiff.stats.ciUpper.toFixed(4)}]`);
  const framework = runValidationFramework(comparison, regressionAudit.duplicateRescueCount, regressionAudit.starvedTypeCount);
  for (const g of framework.gateResults) console.log(`  Gate ${g.gate}(${g.name})=${g.status}`);
  console.log(`  pipelineDecision=${framework.pipelineResult.decision}`);

  // Level1/2/3 + Decision A/B/C per the Directive's own success criteria.
  const mismatchTargets = ["scrambleDepth30:2", "scrambleDepth100:5"]; // the 2 Short-Circuit-Gap cases from Refinement Sprint v3
  const level1Pass = mismatchTargets.every((label) => mismatchIntegrated.find((r) => r.label === label)?.mcmShortCircuited === true);
  const successMismatchRecoveredCount = mismatchTargets.filter((label) => mismatchIntegrated.find((r) => r.label === label)?.improved === true).length;
  const level2Pass = (successMismatchRecoveredCount === mismatchTargets.length || regressionAudit.newCapabilityCount > 0) && regressionAudit.newRegressionCount === 0;
  const level3Pass = framework.pipelineResult.decision === "A";

  let decision: "A_SHORT_CIRCUIT_CONTRACT_ADOPTED" | "B_PARTIAL_RECOVERY" | "C_RECOVERY_FAILED";
  let decisionRationale: string;
  if (level1Pass && level2Pass && level3Pass) {
    decision = "A_SHORT_CIRCUIT_CONTRACT_ADOPTED";
    decisionRationale = `Short-Circuit Contract가 정상 동작하고(Level1 PASS) successMismatch ${successMismatchRecoveredCount}/${mismatchTargets.length}건 회복 + Regression 0건(Level2 PASS) + Validation Framework Decision A(Level3 PASS) -- Short-Circuit Contract를 채택하고 MCM Integration을 종료한다.`;
  } else if (level1Pass && (successMismatchRecoveredCount > 0 || regressionAudit.newCapabilityCount > 0) && regressionAudit.newRegressionCount === 0) {
    decision = "B_PARTIAL_RECOVERY";
    decisionRationale = `Short-Circuit Contract는 정상 동작하나(Level1 PASS) successMismatch ${successMismatchRecoveredCount}/${mismatchTargets.length}건만 회복되었거나 Validation Framework가 완전 승인(A)이 아니다 -- 추가 Contract Refinement가 필요하다.`;
  } else {
    decision = "C_RECOVERY_FAILED";
    decisionRationale = `Short-Circuit Contract를 적용해도 successMismatch가 회복되지 않거나(${successMismatchRecoveredCount}/${mismatchTargets.length}) 새로운 Regression이 발생함(${regressionAudit.newRegressionCount}건) -- Primitive Blueprint 단계로 회귀한다.`;
  }

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Multi-Component Merge Short-Circuit Production Integration Sprint v1 -- Report ===");
  push();
  push("STEP1. Contract Integration Audit");
  push(`  matchedLine: ${contractAudit.matchedLine}`);
  push(`  allTypesPresent=${contractAudit.allTypesPresent}, presentTypes=${contractAudit.presentTypes.join(", ")}`);
  push();
  push("STEP2. Production Replay (full 142-case, real production defaults, outer=1000ms)");
  const baseImproved = baseline.filter((r: ReplayOutcome) => r.improved).length;
  const intImproved = integrated.filter((r: ReplayOutcome) => r.improved).length;
  const baseRegression = baseline.filter((r: ReplayOutcome) => r.trueRegression).length;
  const intRegression = integrated.filter((r: ReplayOutcome) => r.trueRegression).length;
  push(`  Baseline: improvedCount=${baseImproved}, regressionCount=${baseRegression}`);
  push(`  Integrated: improvedCount=${intImproved}, regressionCount=${intRegression}`);
  push();
  push("STEP3. SuccessMismatch Replay (outer=2000ms, Refinement Sprint v3's own reproduction conditions)");
  for (const r of mismatchIntegrated) {
    const b = mismatchBaseline.get(r.label)!;
    push(`  ${r.label}: Before(wrongWing ${b.wrongWingBefore}->${b.wrongWingAfter}, improved=${b.improved}) -> After(wrongWing ${r.wrongWingBefore}->${r.wrongWingAfter}, improved=${r.improved})`);
  }
  push();
  push("STEP4. Short-Circuit Validation (outer=2000ms)");
  for (const label of mismatchTargets) {
    const r = mismatchIntegrated.find((x) => x.label === label)!;
    push(`  ${label}: mcmShortCircuited=${r.mcmShortCircuited}, chosenType=${r.chosenType}, improved=${r.improved}`);
  }
  push();
  push("STEP5. Regression Audit");
  push(`  newRegressionCount=${regressionAudit.newRegressionCount}, newCapabilityCount=${regressionAudit.newCapabilityCount}, duplicateRescueCount=${regressionAudit.duplicateRescueCount}, starvedTypeCount=${regressionAudit.starvedTypeCount}`);
  push();
  push("STEP6. Statistical Validation + Validation Framework");
  push(`  improvedCountDiff mean=${comparison.improvedCountDiff.stats.mean.toFixed(4)}, 95% CI=[${comparison.improvedCountDiff.stats.ciLower.toFixed(4)}, ${comparison.improvedCountDiff.stats.ciUpper.toFixed(4)}], Cohen's dz=${comparison.improvedCountDiff.effectSize.cohensD.toFixed(3)}(${comparison.improvedCountDiff.effectSize.magnitude})`);
  push(`  runtimeDiffMs mean=${comparison.runtimeDiffMs.stats.mean.toFixed(1)}ms, 95% CI=[${comparison.runtimeDiffMs.stats.ciLower.toFixed(1)}, ${comparison.runtimeDiffMs.stats.ciUpper.toFixed(1)}]`);
  for (const g of framework.gateResults) push(`  Gate ${g.gate}(${g.name})=${g.status} -- ${g.evidence}`);
  push(`  pipelineDecision=${framework.pipelineResult.decision}: ${framework.pipelineResult.decisionRationale}`);
  push();
  push("Level1-3 판정 + Decision");
  push(`  Level1(Short-Circuit Contract 정상 동작)=${level1Pass ? "PASS" : "FAIL"}`);
  push(`  Level2(Capability 회복, Regression 없음)=${level2Pass ? "PASS" : "FAIL"}`);
  push(`  Level3(Validation Framework Decision A)=${level3Pass ? "PASS" : "FAIL"}`);
  push(`  Decision = ${decision}`);
  push(`  rationale: ${decisionRationale}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        contractAudit,
        baselineSummary: { improvedCount: baseImproved, regressionCount: baseRegression },
        integratedSummary: { improvedCount: intImproved, regressionCount: intRegression },
        mismatchRows: mismatchIntegrated.map((r) => ({ integrated: r, baseline: mismatchBaseline.get(r.label) })),
        regressionAudit,
        comparison,
        framework,
        level1Pass,
        level2Pass,
        level3Pass,
        decision,
        decisionRationale,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`report written: ${REPORT_PATH}`);
  console.log(lines.join("\n"));
}

const mode = process.argv[2];
if (mode === "capture") {
  const label = process.argv[3];
  if (label !== "baseline" && label !== "integrated") throw new Error("usage: capture <baseline|integrated>");
  capture(label);
} else if (mode === "compare") {
  compare();
} else {
  throw new Error("usage: capture <baseline|integrated> | compare");
}
