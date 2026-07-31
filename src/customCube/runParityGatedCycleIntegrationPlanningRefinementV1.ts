// Solver Primitive Discovery Sprint #6 -- Parity-Gated Cycle Integration
// Planning Refinement Sprint v1 -- driver.
//   npx tsx src/customCube/runParityGatedCycleIntegrationPlanningRefinementV1.ts
//
// Integration Planning Sprint v1 confirmed Position(after_CCR) and
// Gate(G3, componentCount>1) but left Budget unconfirmed within its own
// tested 40-200ms range (rescue=0 everywhere in that range). This Sprint
// holds Position/Gate/Prototype all FIXED and sweeps ONLY Budget, across
// 500/750/1000/1250/1500/1750/2000ms -- every point a real replay, no
// interpolation. Production Solver and Prototype algorithm both untouched.
import * as fs from "fs";
import { buildWingLibrary } from "./fiveByFiveEdges";
import { loadUnknownPopulation } from "./parityGatedCycleBlueprintV1/UnknownPopulationProfiling";
import { runBudgetSweep, evaluateNoOpBaseline, matchesFixedGate } from "./parityGatedCycleIntegrationPlanningRefinementV1/BudgetSweep";
import { summarizeDoseResponse } from "./parityGatedCycleIntegrationPlanningRefinementV1/DoseResponse";
import { computeParetoFrontier, selectTopParetoCandidates } from "./parityGatedCycleIntegrationPlanningRefinementV1/ParetoAnalysis";
import { buildPairedComparison, runValidationFramework } from "./parityGatedCycleIntegrationPlanningRefinementV1/Statistics";
import { decideOperatingContract } from "./parityGatedCycleIntegrationPlanningRefinementV1/OperatingContract";

const DATA_DIR = "src/customCube/parityGatedCycleIntegrationPlanningRefinementV1/data";
const REPORT_PATH = `${DATA_DIR}/parity-gated-cycle-integration-planning-refinement-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/parity-gated-cycle-integration-planning-refinement-v1-result.json`;
const TOP_PARETO_CANDIDATES = 3;

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const lib = buildWingLibrary();

  console.log("Loading Unknown Population (loadUnknownPopulation(), unmodified -- no new dataset)...");
  const cases = loadUnknownPopulation();
  const g3Count = cases.filter((c) => matchesFixedGate(c.hole.cubies)).length;
  console.log(`  n=${cases.length}, Gate G3(componentCount>1) matched=${g3Count}`);

  console.log("STEP1/2: Budget Sweep (500/750/1000/1250/1500/1750/2000ms, real replay, no interpolation)...");
  const budgetResults = runBudgetSweep(cases, lib);
  for (const b of budgetResults) {
    console.log(`  [${b.budgetMs}ms] improved=${b.summary.improvedCount}/${b.summary.n}(${(b.summary.rescueRate * 100).toFixed(1)}%), trueRegression=${b.summary.trueRegressionCount}, deadlineMiss=${b.summary.deadlineMissCount}/${b.summary.gateMatchedCount}, avgRuntimeMsAmongMatched=${b.summary.avgRuntimeMsAmongMatched.toFixed(0)}`);
  }

  console.log("STEP3: Dose-Response analysis...");
  const doseResponse = summarizeDoseResponse(budgetResults);
  for (const d of doseResponse.deltas) {
    console.log(`  [${d.fromBudgetMs}ms -> ${d.toBudgetMs}ms] incrementalGain=${d.incrementalGain}, marginalImprovementPerMs=${d.marginalImprovementPerMs.toFixed(4)}, plateaued=${d.plateaued}`);
  }
  console.log(`  anyImprovementAcrossWholeRange=${doseResponse.anyImprovementAcrossWholeRange}, monotonicNonDecreasing=${doseResponse.monotonicNonDecreasing}, plateauStartsAtBudgetMs=${doseResponse.plateauStartsAtBudgetMs ?? "없음(끝까지 상승)"}`);

  console.log("STEP4: Pareto Frontier (Capability vs Runtime)...");
  const paretoFrontier = computeParetoFrontier(budgetResults);
  for (const p of paretoFrontier) {
    console.log(`  [${p.budgetMs}ms] improved=${p.improvedCount}, avgRuntimeMs=${p.avgRuntimeMsAmongMatched.toFixed(0)}, paretoEfficient=${p.paretoEfficient}`);
  }
  const topCandidates = selectTopParetoCandidates(paretoFrontier, TOP_PARETO_CANDIDATES);
  console.log(`  top ${TOP_PARETO_CANDIDATES} Pareto candidates: ${topCandidates.map((c) => `${c.budgetMs}ms`).join(", ")}`);

  console.log("STEP5: Statistical Validation (top Pareto candidates vs no-op Baseline)...");
  const noOpBaseline = cases.map((c) => evaluateNoOpBaseline(c));
  const candidateFrameworks = topCandidates.map((tc) => {
    const budgetResult = budgetResults.find((b) => b.budgetMs === tc.budgetMs)!;
    const comparison = buildPairedComparison(tc.budgetMs, noOpBaseline, budgetResult.outcomes);
    const framework = runValidationFramework(comparison);
    console.log(`  [${tc.budgetMs}ms] gates: ${framework.gateResults.map((g) => `${g.name}=${g.status}`).join(", ")}, pipeline decision=${framework.pipelineResult.decision}`);
    return { comparison, framework };
  });

  console.log("STEP6: Operating Contract + Level1-5 + Decision...");
  const finalContract = decideOperatingContract(
    budgetResults,
    doseResponse,
    paretoFrontier,
    candidateFrameworks.map((c) => c.framework)
  );
  console.log(`  Decision: ${finalContract.decision}`);
  console.log(`  Rationale: ${finalContract.rationale}`);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Parity-Gated Cycle Integration Planning Refinement Sprint v1 -- Report ===");
  push();
  push(`Unknown Population n=${cases.length}, Gate G3(componentCount>1) matched=${g3Count} (fixed from Integration Planning Sprint v1)`);
  push();
  push("STEP1/2. Budget Sweep (Capability Curve, 7 points, no interpolation)");
  for (const b of budgetResults) {
    push(`  [${b.budgetMs}ms] gateMatched=${b.summary.gateMatchedCount}, improved=${b.summary.improvedCount}/${b.summary.n}(${(b.summary.rescueRate * 100).toFixed(1)}%), trueRegression=${b.summary.trueRegressionCount}, deadlineMiss=${b.summary.deadlineMissCount}, avgRuntimeMsAmongMatched=${b.summary.avgRuntimeMsAmongMatched.toFixed(0)}`);
  }
  push();
  push("STEP3. Dose-Response Analysis");
  for (const d of doseResponse.deltas) {
    push(`  [${d.fromBudgetMs}ms -> ${d.toBudgetMs}ms] incrementalGain=${d.incrementalGain}, marginalImprovementPerMs=${d.marginalImprovementPerMs.toFixed(4)}, plateaued=${d.plateaued}`);
  }
  push(`  anyImprovementAcrossWholeRange=${doseResponse.anyImprovementAcrossWholeRange}, monotonicNonDecreasing=${doseResponse.monotonicNonDecreasing}, plateauStartsAtBudgetMs=${doseResponse.plateauStartsAtBudgetMs ?? "없음"}`);
  push();
  push("STEP4. Pareto Frontier");
  for (const p of paretoFrontier) {
    push(`  [${p.budgetMs}ms] improved=${p.improvedCount}, avgRuntimeMsAmongMatched=${p.avgRuntimeMsAmongMatched.toFixed(0)}, paretoEfficient=${p.paretoEfficient}`);
  }
  push(`  top ${TOP_PARETO_CANDIDATES} candidates: ${topCandidates.map((c) => `${c.budgetMs}ms`).join(", ")}`);
  push();
  push("STEP5. Statistical Validation (vs no-op Baseline)");
  for (const cf of candidateFrameworks) {
    push(`  [${cf.framework.budgetMs}ms] n=${cf.comparison.n}, improvedCount diff mean=${cf.comparison.improvedCountDiffEvaluation.stats.mean.toFixed(4)}, 95% CI=[${cf.comparison.improvedCountDiffEvaluation.stats.ciLower.toFixed(4)}, ${cf.comparison.improvedCountDiffEvaluation.stats.ciUpper.toFixed(4)}], Cohen's dz=${cf.comparison.improvedCountDiffEvaluation.effectSize.cohensD.toFixed(3)}`);
    push(`    gates: ${cf.framework.gateResults.map((g) => `${g.name}=${g.status}`).join(", ")}, pipeline decision=${cf.framework.pipelineResult.decision}`);
  }
  push();
  push("STEP6. Level1-5 + Final Decision");
  for (const l of finalContract.levels) {
    push(`  Level${l.level}(${l.label}): ${l.pass ? "PASS" : "FAIL"} -- ${l.detail}`);
  }
  push(`  Decision: ${finalContract.decision}`);
  push(`  Rationale: ${finalContract.rationale}`);
  if (finalContract.contract) {
    push();
    push("Operating Contract");
    push(`  position=${finalContract.contract.position}`);
    push(`  gate=${finalContract.contract.gate}`);
    push(`  budgetMs=${finalContract.contract.budgetMs}`);
    push(`  fallback=${finalContract.contract.fallback}`);
  }

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        populationN: cases.length,
        g3Count,
        budgetResults: budgetResults.map((b) => ({ budgetMs: b.budgetMs, summary: b.summary })),
        doseResponse,
        paretoFrontier,
        topCandidates,
        candidateFrameworks: candidateFrameworks.map((c) => ({ comparison: c.comparison, gateResults: c.framework.gateResults, pipelineResult: c.framework.pipelineResult })),
        finalContract,
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
