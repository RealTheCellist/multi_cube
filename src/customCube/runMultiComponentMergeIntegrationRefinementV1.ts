// Multi-Component Merge Production Integration Refinement Sprint v1 --
// driver.
//   npx tsx src/customCube/runMultiComponentMergeIntegrationRefinementV1.ts
//
// Real production replay over the full 142-case Hole Dataset, using the
// multiComponentMergeOrder parameter (AFTER_CCR/BEFORE_CCR) added to
// fiveByFiveEdgeRecovery.ts's generateRecoveryStrategies()/attemptRecovery()
// this Sprint. Arm C ("Unlimited Budget") is cited directly from the
// Comparative Prototype Sprint v1's own real result JSON rather than
// re-replayed (see CapabilityReplay.ts's own header comment). See
// docs/MULTI_COMPONENT_MERGE_PRODUCTION_INTEGRATION_REFINEMENT_V1.md for
// the full STEP1-6 narrative and Level1-3 + Decision A/B/C verdict.
import * as fs from "fs";
import { buildWingLibrary, buildFlipLibrary, buildCaseLibrary } from "./fiveByFiveEdges";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import { auditPopulation, summarizeBudgetAudit } from "./solverPrimitiveMultiComponentMergeIntegrationRefinement/BudgetAudit";
import { replayPopulation, summarizeCapabilityReplay } from "./solverPrimitiveMultiComponentMergeIntegrationRefinement/CapabilityReplay";
import { analyzeInteraction } from "./solverPrimitiveMultiComponentMergeIntegrationRefinement/PrimitiveInteractionAudit";
import { runStatisticalValidation } from "./solverPrimitiveMultiComponentMergeIntegrationRefinement/StatisticalValidation";
import { runValidationFramework } from "./solverPrimitiveMultiComponentMergeIntegrationRefinement/ValidationFramework";
import { buildCandidateScores, selectOperatingContract } from "./solverPrimitiveMultiComponentMergeIntegrationRefinement/OperatingContractSelection";

const COMPARATIVE_RESULT_PATH = "src/customCube/solverPrimitiveParityComparativePrototype/data/parity-gated-cycle-comparative-prototype-v1-result.json";
const DATA_DIR = "src/customCube/solverPrimitiveMultiComponentMergeIntegrationRefinement/data";
const REPORT_PATH = `${DATA_DIR}/multi-component-merge-integration-refinement-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/multi-component-merge-integration-refinement-v1-result.json`;

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

  console.log("Loading Hole Dataset (loadRawHoleDataset(), unmodified -- full population, n=142)...");
  const holes = loadRawHoleDataset();

  console.log("STEP1: Budget Audit -- independent reproduction (AFTER_CCR) + BEFORE_CCR comparison (real generateRecoveryStrategies())...");
  const auditAfter = auditPopulation(holes, libs, "AFTER_CCR");
  const auditBefore = auditPopulation(holes, libs, "BEFORE_CCR");
  const budgetAfter = summarizeBudgetAudit(auditAfter, "AFTER_CCR");
  const budgetBefore = summarizeBudgetAudit(auditBefore, "BEFORE_CCR");
  console.log(`  AFTER_CCR: avgActualBudgetAvailableMs=${budgetAfter.avgActualBudgetAvailableMs.toFixed(1)}, starvedRate=${(budgetAfter.starvedRate * 100).toFixed(1)}%`);
  console.log(`  BEFORE_CCR: avgActualBudgetAvailableMs=${budgetBefore.avgActualBudgetAvailableMs.toFixed(1)}, starvedRate=${(budgetBefore.starvedRate * 100).toFixed(1)}%`);

  console.log("STEP2/3: Capability Replay -- real attemptRecovery(), 3 arms (Baseline/AFTER_CCR/BEFORE_CCR), n=142...");
  const replayRows = replayPopulation(holes, libs);
  const replaySummary = summarizeCapabilityReplay(replayRows);
  console.log(`  baselineImproved=${replaySummary.baselineImprovedCount}, afterCcrImproved=${replaySummary.afterCcrImprovedCount}, beforeCcrImproved=${replaySummary.beforeCcrImprovedCount}`);
  console.log(`  afterCcrNewCapability=${replaySummary.afterCcrNewCapabilityCount}, beforeCcrNewCapability=${replaySummary.beforeCcrNewCapabilityCount}`);

  console.log("  Arm C (Unlimited Budget) -- cited from Comparative Prototype Sprint v1's own real result JSON (no new Replay)...");
  const comparative = JSON.parse(fs.readFileSync(COMPARATIVE_RESULT_PATH, "utf-8"));
  const componentCount3PlusCases = comparative.perCase.filter((c: any) => c.multi.componentCountBefore >= 3);
  const unlimitedBudgetSuccessCount = componentCount3PlusCases.filter((c: any) => c.multiImproved).length;
  console.log(`  unlimitedBudgetSuccessCount=${unlimitedBudgetSuccessCount}/${componentCount3PlusCases.length}`);

  console.log("STEP4: Primitive Interaction Audit...");
  const interactionAfter = analyzeInteraction("AFTER_CCR", auditAfter, replayRows);
  const interactionBefore = analyzeInteraction("BEFORE_CCR", auditBefore, replayRows);
  console.log(`  AFTER_CCR: overlapRate=${(interactionAfter.overlapRate * 100).toFixed(1)}%, budgetStarvedRate=${(interactionAfter.budgetStarvedRate * 100).toFixed(1)}%`);
  console.log(`  BEFORE_CCR: overlapRate=${(interactionBefore.overlapRate * 100).toFixed(1)}%, budgetStarvedRate=${(interactionBefore.budgetStarvedRate * 100).toFixed(1)}%`);

  console.log("STEP5: Statistical Validation + Validation Framework...");
  const stats = runStatisticalValidation(replayRows);
  console.log(`  BEFORE_CCR vs AFTER_CCR: improvedCountDiff mean=${stats.beforeCcrVsAfterCcr.improvedCountDiff.stats.mean.toFixed(4)}, 95% CI=[${stats.beforeCcrVsAfterCcr.improvedCountDiff.stats.ciLower.toFixed(4)}, ${stats.beforeCcrVsAfterCcr.improvedCountDiff.stats.ciUpper.toFixed(4)}]`);
  console.log(`  BEFORE_CCR vs Baseline: improvedCountDiff mean=${stats.beforeCcrVsBaseline.improvedCountDiff.stats.mean.toFixed(4)}, 95% CI=[${stats.beforeCcrVsBaseline.improvedCountDiff.stats.ciLower.toFixed(4)}, ${stats.beforeCcrVsBaseline.improvedCountDiff.stats.ciUpper.toFixed(4)}]`);
  const framework = runValidationFramework(stats.beforeCcrVsAfterCcr, interactionBefore, budgetBefore, budgetAfter);
  for (const g of framework.gateResults) console.log(`  Gate ${g.gate}(${g.name})=${g.status}`);
  console.log(`  pipelineDecision=${framework.pipelineResult.decision}`);

  console.log("STEP6: Operating Contract Selection...");
  const afterCcrAvgRuntimeMs = replayRows.reduce((s, r) => s + r.afterCcr.wallMs, 0) / replayRows.length;
  const beforeCcrAvgRuntimeMs = replayRows.reduce((s, r) => s + r.beforeCcr.wallMs, 0) / replayRows.length;
  const candidateScores = buildCandidateScores(
    budgetAfter,
    budgetBefore,
    stats.afterCcrVsBaseline,
    stats.beforeCcrVsBaseline,
    replaySummary.afterCcrRegressionCount,
    replaySummary.beforeCcrRegressionCount,
    afterCcrAvgRuntimeMs,
    beforeCcrAvgRuntimeMs
  );
  const selection = selectOperatingContract(stats.beforeCcrVsAfterCcr, stats.beforeCcrVsBaseline, framework, interactionBefore, candidateScores);
  console.log(`  decision=${selection.decision}, selectedContract=${selection.selectedContract}`);
  console.log(`  rationale: ${selection.rationale}`);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Multi-Component Merge Production Integration Refinement Sprint v1 -- Report ===");
  push();
  push(`Hole Dataset n=${holes.length} (real production functions -- generateRecoveryStrategies()/attemptRecovery(), read-only measurement)`);
  push();
  push("STEP1. Budget Audit (independent reproduction + BEFORE_CCR comparison)");
  push(`  AFTER_CCR:  gateMatchedCount=${budgetAfter.gateMatchedCount}, avgConsumedBudgetMs=${budgetAfter.avgConsumedBudgetMs.toFixed(1)}, avgActualBudgetAvailableMs=${budgetAfter.avgActualBudgetAvailableMs.toFixed(1)}, starvedRate=${(budgetAfter.starvedRate * 100).toFixed(1)}%`);
  push(`  BEFORE_CCR: gateMatchedCount=${budgetBefore.gateMatchedCount}, avgConsumedBudgetMs=${budgetBefore.avgConsumedBudgetMs.toFixed(1)}, avgActualBudgetAvailableMs=${budgetBefore.avgActualBudgetAvailableMs.toFixed(1)}, starvedRate=${(budgetBefore.starvedRate * 100).toFixed(1)}%`);
  push();
  push("STEP2/3. Capability Replay + Scheduler Ordering (3 arms: Baseline/AFTER_CCR(Option A)/BEFORE_CCR(Option B))");
  push(`  baselineImprovedCount=${replaySummary.baselineImprovedCount}/${replaySummary.n}`);
  push(`  afterCcrImprovedCount=${replaySummary.afterCcrImprovedCount}, afterCcrNewCapabilityCount=${replaySummary.afterCcrNewCapabilityCount}, afterCcrRegressionCount=${replaySummary.afterCcrRegressionCount}, afterCcrTrueRegressionCount=${replaySummary.afterCcrTrueRegressionCount}`);
  push(`  beforeCcrImprovedCount=${replaySummary.beforeCcrImprovedCount}, beforeCcrNewCapabilityCount=${replaySummary.beforeCcrNewCapabilityCount}, beforeCcrRegressionCount=${replaySummary.beforeCcrRegressionCount}, beforeCcrTrueRegressionCount=${replaySummary.beforeCcrTrueRegressionCount}`);
  push(`  Option C (Conditional Scheduler): 동일한 실측 데이터로 취급 -- genMultiComponentMerge()가 이미 componentCount>=3 Gate를 즉시 체크 후 no-op하므로, 무조건 재배치(BEFORE_CCR)와 Gate 통과 시에만 재배치(Conditional)는 실제로 동일한 결과를 낸다(disclosed).`);
  push(`  Arm C (Unlimited Budget, Comparative Prototype Sprint v1 실측 인용): ${unlimitedBudgetSuccessCount}/${componentCount3PlusCases.length} 성공 (전체 2000ms 예산, 경쟁 없음)`);
  push();
  push("STEP4. Primitive Interaction Audit");
  push(`  AFTER_CCR:  overlapCount=${interactionAfter.overlapCount}/${interactionAfter.gateMatchedCount}, duplicateRescueCount=${interactionAfter.duplicateRescueCount}, replacementCount=${interactionAfter.replacementCount}, avgActualBudgetAvailableMs=${interactionAfter.avgActualBudgetAvailableMs.toFixed(1)}, budgetStarvedRate=${(interactionAfter.budgetStarvedRate * 100).toFixed(1)}%`);
  push(`  BEFORE_CCR: overlapCount=${interactionBefore.overlapCount}/${interactionBefore.gateMatchedCount}, duplicateRescueCount=${interactionBefore.duplicateRescueCount}, replacementCount=${interactionBefore.replacementCount}, avgActualBudgetAvailableMs=${interactionBefore.avgActualBudgetAvailableMs.toFixed(1)}, budgetStarvedRate=${(interactionBefore.budgetStarvedRate * 100).toFixed(1)}%`);
  push();
  push("STEP5. Statistical Validation + Validation Framework (Category D, Architecture Change)");
  push(`  BEFORE_CCR vs AFTER_CCR: improvedCountDiff mean=${stats.beforeCcrVsAfterCcr.improvedCountDiff.stats.mean.toFixed(4)}, 95% CI=[${stats.beforeCcrVsAfterCcr.improvedCountDiff.stats.ciLower.toFixed(4)}, ${stats.beforeCcrVsAfterCcr.improvedCountDiff.stats.ciUpper.toFixed(4)}], Cohen's dz=${stats.beforeCcrVsAfterCcr.improvedCountDiff.effectSize.cohensD.toFixed(3)}(${stats.beforeCcrVsAfterCcr.improvedCountDiff.effectSize.magnitude})`);
  push(`  BEFORE_CCR vs Baseline:  improvedCountDiff mean=${stats.beforeCcrVsBaseline.improvedCountDiff.stats.mean.toFixed(4)}, 95% CI=[${stats.beforeCcrVsBaseline.improvedCountDiff.stats.ciLower.toFixed(4)}, ${stats.beforeCcrVsBaseline.improvedCountDiff.stats.ciUpper.toFixed(4)}], Cohen's dz=${stats.beforeCcrVsBaseline.improvedCountDiff.effectSize.cohensD.toFixed(3)}(${stats.beforeCcrVsBaseline.improvedCountDiff.effectSize.magnitude})`);
  push(`  AFTER_CCR vs Baseline:   improvedCountDiff mean=${stats.afterCcrVsBaseline.improvedCountDiff.stats.mean.toFixed(4)}, 95% CI=[${stats.afterCcrVsBaseline.improvedCountDiff.stats.ciLower.toFixed(4)}, ${stats.afterCcrVsBaseline.improvedCountDiff.stats.ciUpper.toFixed(4)}]`);
  for (const g of framework.gateResults) push(`  Gate ${g.gate}(${g.name})=${g.status} -- ${g.evidence}`);
  push(`  pipelineDecision=${framework.pipelineResult.decision}: ${framework.pipelineResult.decisionRationale}`);
  push();
  push("STEP6. Operating Contract Selection");
  for (const c of candidateScores) {
    push(`  [${c.id}] realMechanism=${c.realMechanism}, capabilityScore=${c.capabilityScore.toFixed(2)}, avgActualBudgetAvailableMs=${c.avgActualBudgetAvailableMs.toFixed(1)}, avgRuntimeMs=${c.avgRuntimeMs.toFixed(1)}, regressionCount=${c.regressionCount}, complexityScore=${c.complexityScore}`);
  }
  push(`  decision=${selection.decision}`);
  push(`  selectedContract=${selection.selectedContract}`);
  push(`  rationale: ${selection.rationale}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        populationN: holes.length,
        budgetAfter,
        budgetBefore,
        replaySummary,
        unlimitedBudgetSuccessCount,
        unlimitedBudgetPopulationN: componentCount3PlusCases.length,
        interactionAfter,
        interactionBefore,
        stats,
        framework,
        candidateScores,
        selection,
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
