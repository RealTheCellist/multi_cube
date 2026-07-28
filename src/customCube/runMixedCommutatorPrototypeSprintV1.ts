// Mixed Commutator Prototype Sprint v1 -- driver.
//   npx tsx src/customCube/runMixedCommutatorPrototypeSprintV1.ts
//
// Prototype Feasibility Validation (NOT integrated into production): tests
// whether Mixed Commutator Design Space Validation Sprint v1's validated
// mechanism (bracket commutator of two independently conjugated
// BASE_ALG/FLIP_ALG/PARITY_ALG copies, mixed patterns allowed) can be
// implemented as a real Primitive matching every existing Primitive's
// exact (Cubie[], WingLibrary, deadline) -> Move[] | null contract, and
// whether it reproduces that Sprint's own footprintRatio<=2.0 finding
// under REAL time budgets (not the unbounded offline research sweep).
import * as fs from "fs";
import { cloneCubies, type Cubie } from "./cubeState";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs } from "./coverageAtlas/HoleDatasetBuilder";
import { runMixedCommutatorPrototype } from "./mixedCommutatorPrototype/MixedCommutatorPrototype";
import { summarizeCapability, type CaseResult } from "./mixedCommutatorPrototype/CapabilityEvaluation";
import { summarizeRuntime } from "./mixedCommutatorPrototype/RuntimeAnalysis";
import { analyzeContractCompliance } from "./mixedCommutatorPrototype/PrimitiveContractAnalysis";
import { assessIntegrationReadiness } from "./mixedCommutatorPrototype/IntegrationReadinessReport";
import { analyzeRegression } from "./mixedCommutatorPrototype/RegressionAnalysis";

const DATA_DIR = "src/customCube/mixedCommutatorPrototype/data";
const REPORT_PATH = `${DATA_DIR}/mixed-commutator-prototype-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/mixed-commutator-prototype-v1-result.json`;
const CHECKPOINT_PATH = `${DATA_DIR}/checkpoint-prototype.json`;
const PRIMITIVE_SET_RESULT_PATH = "src/customCube/primitiveSetCompleteness/data/primitive-set-completeness-validation-v1-result.json";

// Two budgets, disclosed before running:
//   PRODUCTION_BUDGET_MS: matches fiveByFiveEdgeRecovery.ts's own
//   RECOVERY_GEN_BUDGET_MS=300 (read, not modified) -- the real budget any
//   new Recovery candidate would actually get.
//   EXTENDED_BUDGET_MS: this arc's own established "extended budget"
//   convention, to see whether more time closes any gap.
const PRODUCTION_BUDGET_MS = 300;
const EXTENDED_BUDGET_MS = 5000;
const BUDGETS = [PRODUCTION_BUDGET_MS, EXTENDED_BUDGET_MS];

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

interface CheckpointRow extends CaseResult {
  threw: boolean;
}

function loadCheckpoint(): { completedKeys: string[]; rows: CheckpointRow[] } {
  if (!fs.existsSync(CHECKPOINT_PATH)) return { completedKeys: [], rows: [] };
  return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, "utf-8"));
}
function saveCheckpoint(completedKeys: string[], rows: CheckpointRow[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify({ completedKeys, rows }), "utf-8");
}

async function main() {
  const holes = loadRawHoleDataset();
  const holesByLabel = new Map(holes.map((h) => [h.label, h]));
  const libs = buildLibs();

  const priorResult = JSON.parse(fs.readFileSync(PRIMITIVE_SET_RESULT_PATH, "utf-8"));
  const residualClassified: { label: string; failureClass: string }[] = priorResult.residualClassified;
  const coverageRows: { label: string; unionCovered: boolean }[] = priorResult.coverageRows;

  const primaryLabels = new Set(residualClassified.filter((r) => r.failureClass === "PURE_CYCLE_ISOLATION").map((r) => r.label));
  const secondaryLabels = new Set(residualClassified.map((r) => r.label));
  const regressionLabels = new Set(coverageRows.filter((r) => r.unionCovered).map((r) => r.label));
  log("init", `Primary=${primaryLabels.size}, Secondary(all residual)=${secondaryLabels.size}, Regression(Union Covered)=${regressionLabels.size}`);

  function tagOf(label: string): CaseResult["populationTag"] {
    if (primaryLabels.has(label)) return "PRIMARY";
    if (secondaryLabels.has(label)) return "SECONDARY_ONLY";
    return "REGRESSION";
  }

  let { completedKeys, rows } = loadCheckpoint();
  const completedSet = new Set(completedKeys);
  if (completedKeys.length > 0) log("eval", `resuming: ${completedKeys.length} (label,budget) pairs done`);

  for (const budgetMs of BUDGETS) {
    log("eval", `running Mixed Commutator Prototype @ budgetMs=${budgetMs} on all ${holes.length} cases...`);
    for (const h of holes) {
      const key = `${h.label}|${budgetMs}`;
      if (completedSet.has(key)) continue;
      const clone = cloneCubies(h.cubies as Cubie[]);
      const t0 = Date.now();
      let threw = false;
      let result;
      try {
        result = runMixedCommutatorPrototype(clone, libs.lib, Date.now() + budgetMs);
      } catch (err) {
        threw = true;
        console.error(`EXCEPTION for ${h.label}@${budgetMs}ms:`, err);
        result = {
          moves: null,
          cycleLength: null,
          patternA: null,
          patternB: null,
          setupALabel: null,
          setupBLabel: null,
          attemptsEvaluated: 0,
          moveLength: null,
          wrongWingBefore: 0,
          wrongWingAfter: null,
          affectedWingCount: null,
          footprintRatio: null,
          exhaustedSearchSpace: true,
          validated: false,
          returnedNull: true,
        };
      }
      const runtimeMs = Date.now() - t0;
      rows.push({ label: h.label, populationTag: tagOf(h.label), budgetMs, result, runtimeMs, threw });
      completedKeys.push(key);
      completedSet.add(key);
      if (completedKeys.length % 20 === 0) saveCheckpoint(completedKeys, rows);
    }
    saveCheckpoint(completedKeys, rows);
    log("eval", `budgetMs=${budgetMs} done`);
  }

  const lines: string[] = [];
  lines.push("Mixed Commutator Prototype Sprint v1 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  const throwCountTotal = rows.filter((r) => r.threw).length;

  lines.push("1. Prototype Capability Report (per budget, per population)");
  const capabilitySummaries: ReturnType<typeof summarizeCapability>[] = [];
  for (const budgetMs of BUDGETS) {
    for (const tag of ["PRIMARY", "SECONDARY_ONLY", "REGRESSION"] as const) {
      const subset = rows.filter((r) => r.budgetMs === budgetMs && r.populationTag === tag);
      const summary = summarizeCapability(tag, budgetMs, subset);
      capabilitySummaries.push(summary);
      lines.push(`  budget=${budgetMs}ms ${tag}: n=${summary.n}, solved=${summary.solvedCount} (${(summary.successRate * 100).toFixed(1)}%), lowFootprint(<=2.0)=${summary.lowFootprintCount}/${summary.solvedCount} (${(summary.lowFootprintRate * 100).toFixed(1)}%)`);
    }
  }
  lines.push("");

  lines.push("2. Runtime Analysis (per budget, all 142 cases pooled)");
  const runtimeSummaries: ReturnType<typeof summarizeRuntime>[] = [];
  for (const budgetMs of BUDGETS) {
    const subset = rows.filter((r) => r.budgetMs === budgetMs);
    const summary = summarizeRuntime(budgetMs, subset);
    runtimeSummaries.push(summary);
    lines.push(`  budget=${budgetMs}ms: avg=${summary.avgRuntimeMs.toFixed(0)}ms, max=${summary.maxRuntimeMs}ms, p95=${summary.p95RuntimeMs}ms, timeoutRate=${(summary.timeoutRate * 100).toFixed(1)}% (${summary.timeoutCount}/${summary.n})`);
  }
  lines.push("");

  lines.push("3. Primitive Contract Analysis (all budgets pooled)");
  const contractResult = analyzeContractCompliance(rows, throwCountTotal);
  lines.push(`  fullyCompliant=${contractResult.fullyCompliant}, nullConsistent=${contractResult.nullConsistentCount}/${contractResult.n}, validatedConsistent=${contractResult.validatedConsistentCount}/${contractResult.n}, throwCount=${contractResult.throwCount}`);
  lines.push(`  ${contractResult.rationale}`);
  lines.push("");

  lines.push("4. Integration Readiness Report (structure-only, NOT connected)");
  const integrationResult = assessIntegrationReadiness();
  lines.push(`  interfaceMatchesExistingPattern=${integrationResult.interfaceMatchesExistingPattern}, sharesGenDeadlineConvention=${integrationResult.sharesGenDeadlineConvention}, requiresPlannerChange=${integrationResult.requiresPlannerChange}, requiresExecutorChange=${integrationResult.requiresExecutorChange}`);
  lines.push(`  analogousPrecedent: ${integrationResult.analogousIntegrationPrecedent}`);
  lines.push(`  rationale: ${integrationResult.rationale}`);
  lines.push("");

  lines.push("5. Regression Report (89 Union Covered cases, per budget)");
  const regressionSummaries: ReturnType<typeof analyzeRegression>[] = [];
  for (const budgetMs of BUDGETS) {
    const subset = rows.filter((r) => r.budgetMs === budgetMs && r.populationTag === "REGRESSION");
    const summary = analyzeRegression(subset);
    regressionSummaries.push(summary);
    lines.push(`  budget=${budgetMs}ms: n=${summary.n}, regressionCount=${summary.regressionCount}, incidentalSolveCount=${summary.incidentalSolveCount}, cleanCount=${summary.cleanCount}`);
  }
  lines.push("");

  // ---- Success Criteria (Deliverable, A/B/C decision) ----
  const primaryAtExtended = capabilitySummaries.find((s) => s.budgetMs === EXTENDED_BUDGET_MS && s.populationTag === "PRIMARY")!;
  const primaryAtProduction = capabilitySummaries.find((s) => s.budgetMs === PRODUCTION_BUDGET_MS && s.populationTag === "PRIMARY")!;
  const regressionAtProduction = regressionSummaries[0]; // BUDGETS[0] === PRODUCTION_BUDGET_MS
  const runtimeAtProduction = runtimeSummaries[0];

  const reproducesCapability = primaryAtExtended.lowFootprintCount >= 1; // at least 1 case reproduces footprintRatio<=2.0, matching Design Space Sprint's own existence bar
  const runtimeAcceptable = runtimeAtProduction.avgRuntimeMs <= PRODUCTION_BUDGET_MS * 1.1; // small slack for measurement overhead
  const contractSatisfied = contractResult.fullyCompliant;
  const noRegression = regressionAtProduction.regressionCount === 0;
  const lowFootprintUnderProductionBudget = primaryAtProduction.lowFootprintCount >= 1;

  let decision: string;
  let decisionLabel: string;
  let rationale: string;

  if (!reproducesCapability) {
    decision = "C_DOES_NOT_REPRODUCE";
    decisionLabel = "Conclusion C -- Validation Sprint 결과를 Prototype이 재현하지 못한다. Design Space 연구 결과 재검토.";
    rationale = `확장 예산(${EXTENDED_BUDGET_MS}ms)에서도 PRIMARY 중 footprintRatio<=2.0 달성 케이스가 0건 -- Design Space Sprint의 1.60 결과가 재현되지 않았다.`;
  } else if (!runtimeAcceptable || !contractSatisfied) {
    decision = "B_NEEDS_IMPROVEMENT";
    decisionLabel = "Conclusion B -- Capability는 유지되지만 Runtime 또는 Primitive 구조에 문제가 있다. Prototype 개선 후 재검증.";
    rationale = `Capability는 재현되었으나(확장 예산 lowFootprintCount=${primaryAtExtended.lowFootprintCount}), Runtime(avg=${runtimeAtProduction.avgRuntimeMs.toFixed(0)}ms vs budget=${PRODUCTION_BUDGET_MS}ms) 또는 Contract(fullyCompliant=${contractSatisfied}) 기준 미달.`;
  } else if (!noRegression) {
    decision = "B_NEEDS_IMPROVEMENT";
    decisionLabel = "Conclusion B -- Capability/Runtime/Contract는 통과했으나 Regression이 발생했다. Prototype 개선 후 재검증.";
    rationale = `Production 예산에서 회귀 ${regressionAtProduction.regressionCount}건 발생.`;
  } else {
    decision = "A_PROCEED_TO_INTEGRATION_BLUEPRINT";
    decisionLabel = "Conclusion A -- Production Integration Blueprint 착수 가능.";
    rationale = `Capability 재현(확장 예산 lowFootprintCount=${primaryAtExtended.lowFootprintCount}), Runtime 허용범위(avg=${runtimeAtProduction.avgRuntimeMs.toFixed(0)}ms <= ${PRODUCTION_BUDGET_MS}ms), Primitive 계약 만족(${contractSatisfied}), Regression 없음(${regressionAtProduction.regressionCount}건) -- 4개 기준 모두 통과. Production 예산(${PRODUCTION_BUDGET_MS}ms) 자체에서도 저-footprint 달성 케이스 ${lowFootprintUnderProductionBudget ? "확인됨" : "미확인 -- 확장 예산에서만 확인됨, 참고 필요"}.`;
  }

  lines.push("6. Success Criteria Decision");
  lines.push(`  decision: ${decision}`);
  lines.push(`  decisionLabel: ${decisionLabel}`);
  lines.push(`  rationale: ${rationale}`);
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        capabilitySummaries,
        runtimeSummaries,
        contractResult,
        integrationResult,
        regressionSummaries,
        decision,
        decisionLabel,
        rationale,
        sampleRows: rows.filter((r) => r.populationTag === "PRIMARY" && r.result.moves).slice(0, 20),
      },
      null,
      2
    ),
    "utf-8"
  );
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(report);

  if (fs.existsSync(CHECKPOINT_PATH)) fs.unlinkSync(CHECKPOINT_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
