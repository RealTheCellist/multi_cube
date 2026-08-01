// Multi-Component Merge Production Integration Refinement Sprint v2 --
// driver.
//   npx tsx src/customCube/runMultiComponentMergeIntegrationRefinementV2.ts
//
// Real production replay over the full 142-case Hole Dataset, varying
// ONLY the outer `deadline` argument attemptRecovery() already accepts
// (1000/1500/2000ms) -- no production code change needed at all this
// Sprint (fiveByFiveEdgeRecovery.ts is untouched). Scheduler order
// (AFTER_CCR), Gate, Budget Contract, and the Primitive itself are all
// held fixed at their real production values. See
// docs/MULTI_COMPONENT_MERGE_PRODUCTION_INTEGRATION_REFINEMENT_V2.md for
// the full STEP1-6 narrative and Level1-3 + Decision A/B/C verdict.
import * as fs from "fs";
import { buildWingLibrary, buildFlipLibrary, buildCaseLibrary } from "./fiveByFiveEdges";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import { auditPopulation, summarizeOuterDeadlineAudit } from "./solverPrimitiveMultiComponentMergeIntegrationRefinementV2/OuterDeadlineAudit";
import { replayPopulation, summarizeDeadlineReplay, OUTER_DEADLINE_ARMS_MS } from "./solverPrimitiveMultiComponentMergeIntegrationRefinementV2/DeadlineReplay";
import { buildConsistencyRows, summarizeConsistency } from "./solverPrimitiveMultiComponentMergeIntegrationRefinementV2/ComparativeConsistency";
import { runStatisticalValidation } from "./solverPrimitiveMultiComponentMergeIntegrationRefinementV2/StatisticalValidation";
import { runValidationFramework } from "./solverPrimitiveMultiComponentMergeIntegrationRefinementV2/ValidationFramework";
import { decideRootCause } from "./solverPrimitiveMultiComponentMergeIntegrationRefinementV2/RootCauseDecision";

const COMPARATIVE_RESULT_PATH = "src/customCube/solverPrimitiveParityComparativePrototype/data/parity-gated-cycle-comparative-prototype-v1-result.json";
const DATA_DIR = "src/customCube/solverPrimitiveMultiComponentMergeIntegrationRefinementV2/data";
const REPORT_PATH = `${DATA_DIR}/multi-component-merge-integration-refinement-v2-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/multi-component-merge-integration-refinement-v2-result.json`;

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

  console.log("Loading Hole Dataset (loadRawHoleDataset(), unmodified -- full population, n=142)...");
  const holes = loadRawHoleDataset();

  console.log("STEP1: Outer Deadline Audit (real generateRecoveryStrategies(), outer=1000ms today's production)...");
  const auditRows = auditPopulation(holes, libs, OUTER_DEADLINE_ARMS_MS.A);
  const auditSummary = summarizeOuterDeadlineAudit(auditRows);
  console.log(`  gateMatchedCount=${auditSummary.gateMatchedCount}, avgActualBudgetAvailableMs=${auditSummary.avgActualBudgetAvailableMs.toFixed(1)}, fullBudgetRate=${(auditSummary.fullBudgetRate * 100).toFixed(1)}%, deadlineAbortCount=${auditSummary.deadlineAbortCount}`);

  console.log("STEP2/3: Counterfactual Deadline Replay + Capability Recovery -- real attemptRecovery(), 3 arms (1000/1500/2000ms), n=142...");
  const replayRows = replayPopulation(holes, libs);
  const replaySummary = summarizeDeadlineReplay(replayRows);
  console.log(`  armA(1000ms)Improved=${replaySummary.armAImprovedCount}, armB(1500ms)Improved=${replaySummary.armBImprovedCount}, armC(2000ms)Improved=${replaySummary.armCImprovedCount}`);
  console.log(`  armBNewCapabilityVsA=${replaySummary.armBNewCapabilityVsA}, armCNewCapabilityVsA=${replaySummary.armCNewCapabilityVsA}`);

  console.log("STEP4: Comparative Prototype Consistency...");
  const consistencyRows = buildConsistencyRows(COMPARATIVE_RESULT_PATH, (p) => fs.readFileSync(p, "utf-8"), replayRows);
  const consistency = summarizeConsistency(consistencyRows);
  console.log(`  matchRate=${(consistency.matchRate * 100).toFixed(1)}% (successMatch=${consistency.successMatchCount}, successMismatch=${consistency.successMismatchCount}, failureMatch=${consistency.failureMatchCount}, failureMismatch=${consistency.failureMismatchCount})`);

  console.log("STEP5: Statistical Validation + Validation Framework (Category B, Performance Optimization)...");
  const stats = runStatisticalValidation(replayRows);
  console.log(`  Arm C(2000ms) vs Arm A(1000ms): improvedCountDiff mean=${stats.armCVsArmA.improvedCountDiff.stats.mean.toFixed(4)}, 95% CI=[${stats.armCVsArmA.improvedCountDiff.stats.ciLower.toFixed(4)}, ${stats.armCVsArmA.improvedCountDiff.stats.ciUpper.toFixed(4)}]`);
  const framework = runValidationFramework(stats.armCVsArmA, 0, 0);
  for (const g of framework.gateResults) console.log(`  Gate ${g.gate}(${g.name})=${g.status}`);
  console.log(`  pipelineDecision=${framework.pipelineResult.decision}`);

  console.log("STEP6: Root Cause Decision...");
  const rootCause = decideRootCause(stats.armCVsArmA, framework, consistency, replaySummary);
  console.log(`  decision=${rootCause.decision}`);
  console.log(`  rationale: ${rootCause.rationale}`);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Multi-Component Merge Production Integration Refinement Sprint v2 -- Report ===");
  push();
  push(`Hole Dataset n=${holes.length} (real production functions -- outer deadline varied 1000/1500/2000ms, everything else fixed at real production defaults)`);
  push();
  push("STEP1. Outer Deadline Audit (independent reproduction at outer=1000ms)");
  push(`  gateMatchedCount=${auditSummary.gateMatchedCount}, avgRemainingTimeAtMcmStartMs=${auditSummary.avgRemainingTimeAtMcmStartMs.toFixed(1)}, avgActualBudgetAvailableMs=${auditSummary.avgActualBudgetAvailableMs.toFixed(1)}`);
  push(`  fullBudgetCount(전체 2000ms 확보)=${auditSummary.fullBudgetCount}/${auditSummary.gateMatchedCount} (${(auditSummary.fullBudgetRate * 100).toFixed(1)}%), deadlineAbortCount=${auditSummary.deadlineAbortCount}`);
  push();
  push("STEP2/3. Counterfactual Deadline Replay + Capability Recovery");
  push(`  Arm A(${OUTER_DEADLINE_ARMS_MS.A}ms, 현행): improvedCount=${replaySummary.armAImprovedCount}, regressionCount=${replaySummary.armARegressionCount}, mcmChosenCount=${replaySummary.armAMcmChosenCount}`);
  push(`  Arm B(${OUTER_DEADLINE_ARMS_MS.B}ms, 확장): improvedCount=${replaySummary.armBImprovedCount}, newCapabilityVsA=${replaySummary.armBNewCapabilityVsA}, regressionCount=${replaySummary.armBRegressionCount}, mcmChosenCount=${replaySummary.armBMcmChosenCount}`);
  push(`  Arm C(${OUTER_DEADLINE_ARMS_MS.C}ms, Counterfactual): improvedCount=${replaySummary.armCImprovedCount}, newCapabilityVsA=${replaySummary.armCNewCapabilityVsA}, regressionCount=${replaySummary.armCRegressionCount}, mcmChosenCount=${replaySummary.armCMcmChosenCount}`);
  push();
  push("STEP4. Comparative Prototype Consistency (Arm C vs Comparative Prototype Sprint v1's own isolated 2000ms test)");
  push(`  n=${consistency.n}, matchRate=${(consistency.matchRate * 100).toFixed(1)}%`);
  push(`  successMatch=${consistency.successMatchCount}, successMismatch(isolated succeeded, production Arm C did not)=${consistency.successMismatchCount}`);
  push(`  failureMatch=${consistency.failureMatchCount}, failureMismatch(isolated failed, production Arm C succeeded)=${consistency.failureMismatchCount}`);
  push();
  push("STEP5. Statistical Validation + Validation Framework (Category B, Performance Optimization)");
  push(`  Arm B vs Arm A: improvedCountDiff mean=${stats.armBVsArmA.improvedCountDiff.stats.mean.toFixed(4)}, 95% CI=[${stats.armBVsArmA.improvedCountDiff.stats.ciLower.toFixed(4)}, ${stats.armBVsArmA.improvedCountDiff.stats.ciUpper.toFixed(4)}], Cohen's dz=${stats.armBVsArmA.improvedCountDiff.effectSize.cohensD.toFixed(3)}(${stats.armBVsArmA.improvedCountDiff.effectSize.magnitude})`);
  push(`  Arm C vs Arm A: improvedCountDiff mean=${stats.armCVsArmA.improvedCountDiff.stats.mean.toFixed(4)}, 95% CI=[${stats.armCVsArmA.improvedCountDiff.stats.ciLower.toFixed(4)}, ${stats.armCVsArmA.improvedCountDiff.stats.ciUpper.toFixed(4)}], Cohen's dz=${stats.armCVsArmA.improvedCountDiff.effectSize.cohensD.toFixed(3)}(${stats.armCVsArmA.improvedCountDiff.effectSize.magnitude})`);
  push(`  Arm C vs Arm B: improvedCountDiff mean=${stats.armCVsArmB.improvedCountDiff.stats.mean.toFixed(4)}, 95% CI=[${stats.armCVsArmB.improvedCountDiff.stats.ciLower.toFixed(4)}, ${stats.armCVsArmB.improvedCountDiff.stats.ciUpper.toFixed(4)}]`);
  for (const g of framework.gateResults) push(`  Gate ${g.gate}(${g.name})=${g.status} -- ${g.evidence}`);
  push(`  pipelineDecision=${framework.pipelineResult.decision}: ${framework.pipelineResult.decisionRationale}`);
  push();
  push("STEP6. Root Cause Decision + Matrix");
  for (const m of rootCause.matrix) push(`  [${m.contribution}] ${m.factor}: ${m.evidence}`);
  push(`  decision=${rootCause.decision}`);
  push(`  rationale: ${rootCause.rationale}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        populationN: holes.length,
        auditSummary,
        replaySummary,
        consistencyRows,
        consistency,
        stats,
        framework,
        rootCause,
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
