// Production Integration Finalization Sprint v1 -- driver.
//   npx tsx src/customCube/runProductionIntegrationFinalizationSprintV1.ts [dbPath] [nTrials] [subsampleSize]
//
// STEP1-6 per the Work Order. STEP1 (the only Production change) already
// applied to fiveByFiveEdgeExecutor.ts: recoveryReserveMsOverride's default
// flipped from RECOVERY_RESERVE_MS (450ms) to
// PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS (250ms) -- the confirmed ENDGAME
// Operating Contract. pairBudgetMs (140ms, Incremental Recovery Contract)
// and CCR's remainingTime/singleCycle Budget Contract were ALREADY the real
// production defaults from prior Sprints -- verified by direct source
// inspection, not re-wired here.
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import type { FailureSnapshot } from "./failureAnalysis/failureTypes";
import { deserializeCube } from "./failureAnalysis/cubeSerialization";
import { endToEndSolveProbe, PRE_FINALIZATION_RECOVERY_RESERVE_MS, type EndToEndSolveResult } from "./productionIntegrationFinalization/EndToEndSolveProbe";
import { summarizePrimitiveAttribution } from "./productionIntegrationFinalization/PrimitiveAttribution";
import {
  analyzeCCRRepairInteraction,
  analyzeEndgameRecoveryInteraction,
  analyzeIncrementalRecoveryEndgameInteraction,
  analyzeBudgetConflict,
} from "./productionIntegrationFinalization/PrimitiveInteractionAnalysis";
import { auditRegressions } from "./productionIntegrationFinalization/RegressionAudit";
import { runOneTrial, summarizeTrial, runStandardEvaluation, type TrialAggregate } from "./productionIntegrationFinalization/StatisticalValidation";
import { evaluateFinalAssessment } from "./productionIntegrationFinalization/FinalAssessment";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const N_TRIALS = Number(process.argv[3] ?? 30);
const SUBSAMPLE_SIZE = Number(process.argv[4] ?? 75);

const reportPath = "src/customCube/productionIntegrationFinalization/data/production-integration-finalization-v1-report.txt";
const checkpointPath = "src/customCube/productionIntegrationFinalization/data/checkpoint-v1.json";

function strideSample(items: readonly FailureSnapshot[], size: number): FailureSnapshot[] {
  if (items.length <= size) return [...items];
  const stride = items.length / size;
  const picked: FailureSnapshot[] = [];
  for (let i = 0; i < size; i++) picked.push(items[Math.floor(i * stride)]);
  return picked;
}

interface CheckpointData {
  dbPath: string;
  nTrials: number;
  subsampleSize: number;
  completedTrials: number;
  trials: TrialAggregate[];
}

function loadCheckpoint(): CheckpointData | null {
  if (!existsSync(checkpointPath)) return null;
  try {
    return JSON.parse(readFileSync(checkpointPath, "utf-8")) as CheckpointData;
  } catch {
    return null;
  }
}

function saveCheckpoint(data: CheckpointData): void {
  mkdirSync(dirname(checkpointPath), { recursive: true });
  writeFileSync(checkpointPath, JSON.stringify(data), "utf-8");
}

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("Production Integration Finalization Sprint v1 -- Report");
push(`Generated: ${new Date().toISOString()}`);
push("");
push("1. Integration Structure:");
push(`  ENDGAME: recoveryReserveMsOverride default ${PRE_FINALIZATION_RECOVERY_RESERVE_MS}ms -> 250ms (PRODUCTION_ENDGAME_RECOVERY_RESERVE_MS, fiveByFiveEdgeExecutor.ts). The ONLY Production diff this Sprint.`);
push(`  Incremental Recovery: pairBudgetMs default = 140ms (FIXED_BUDGET_MS) -- already the real production default since Incremental Recovery Production Integration Sprint v1, verified unchanged.`);
push(`  CCR: runCCRPrototype(cubies, lib, deadline, "singleCycle") -- remainingTime Budget Contract (full outer deadline, no separate reserved slice) and singleCycle strategy already hardcoded as real production behavior since CCR Production Integration Sprint v1, verified unchanged.`);
push("  Baseline (this Sprint's own reconstruction): recoveryReserveMsOverride=450ms explicit, reconstructing pre-Finalization production behavior for an honest before/after comparison.");
push("");

log("Loading snapshots...");
const db = loadDatabase(dbPath);
const allSnaps = allSnapshots(db);
const subsample = strideSample(allSnaps, SUBSAMPLE_SIZE);
push(`STEP0. Population: ${allSnaps.length} real snapshots total (full census used for STEP2-5); ${subsample.length}-snapshot stride-sample used for STEP6's N=${N_TRIALS}-trial statistical validation.`);
push("");

log("STEP2/3: full-population End-to-End measurement (335 snapshots, single real solve() pass per arm)...");
const fullBaseline: EndToEndSolveResult[] = allSnaps.map((s) => endToEndSolveProbe(deserializeCube(s.cubeState), s.hash, PRE_FINALIZATION_RECOVERY_RESERVE_MS));
const fullIntegrated: EndToEndSolveResult[] = allSnaps.map((s) => endToEndSolveProbe(deserializeCube(s.cubeState), s.hash, undefined));

const baselineImproved = fullBaseline.filter((r) => r.improved).length;
const integratedImproved = fullIntegrated.filter((r) => r.improved).length;
const baselineSolved = fullBaseline.filter((r) => r.solved).length;
const integratedSolved = fullIntegrated.filter((r) => r.solved).length;
const baselineAvgWallMs = fullBaseline.reduce((a, r) => a + r.wallMs, 0) / fullBaseline.length;
const integratedAvgWallMs = fullIntegrated.reduce((a, r) => a + r.wallMs, 0) / fullIntegrated.length;
const baselineDeadlineMiss = fullBaseline.filter((r) => r.deadlineMissed).length / fullBaseline.length;
const integratedDeadlineMiss = fullIntegrated.filter((r) => r.deadlineMissed).length / fullIntegrated.length;
const baselineRecoveryTrigger = fullBaseline.filter((r) => r.recoveryTriggered).length / fullBaseline.length;
const integratedRecoveryTrigger = fullIntegrated.filter((r) => r.recoveryTriggered).length / fullIntegrated.length;
const totalWrongWingCases = fullBaseline.reduce((a, r) => a + r.wrongWingBefore, 0);

push(`STEP2/3. End-to-End full-population results (n=${allSnaps.length} real snapshots, ${totalWrongWingCases} total wrong-wing pieces across the population):`);
push(`  Success Rate (solved): Baseline=${baselineSolved}/${allSnaps.length} (${((baselineSolved / allSnaps.length) * 100).toFixed(2)}%), Integrated=${integratedSolved}/${allSnaps.length} (${((integratedSolved / allSnaps.length) * 100).toFixed(2)}%)`);
push(`  Improved count: Baseline=${baselineImproved}/${allSnaps.length}, Integrated=${integratedImproved}/${allSnaps.length}`);
push(`  Runtime: Baseline avg=${baselineAvgWallMs.toFixed(1)}ms, Integrated avg=${integratedAvgWallMs.toFixed(1)}ms`);
push(`  Deadline Miss rate: Baseline=${(baselineDeadlineMiss * 100).toFixed(2)}%, Integrated=${(integratedDeadlineMiss * 100).toFixed(2)}%`);
push(`  Recovery Trigger rate: Baseline=${(baselineRecoveryTrigger * 100).toFixed(2)}%, Integrated=${(integratedRecoveryTrigger * 100).toFixed(2)}%`);
push("");

log("STEP3: Primitive Attribution...");
const baselineAttribution = summarizePrimitiveAttribution(fullBaseline);
const integratedAttribution = summarizePrimitiveAttribution(fullIntegrated);
push("STEP3. Primitive Invocation + Success Contribution:");
push("  Task-layer (Planner SolveTask types):");
for (const t of ["PAIR", "FLIP", "PARITY", "ENDGAME"] as const) {
  const b = baselineAttribution.taskStats.find((s) => s.taskType === t)!;
  const g = integratedAttribution.taskStats.find((s) => s.taskType === t)!;
  push(`    ${t}: Baseline planned=${b.plannedCount}, completed=${b.completedCount} (${(b.successRate * 100).toFixed(2)}%) | Integrated planned=${g.plannedCount}, completed=${g.completedCount} (${(g.successRate * 100).toFixed(2)}%)`);
}
push("  Recovery-layer (DISRUPT/SETUP/REPAIR/CCR):");
for (const t of ["DISRUPT", "SETUP", "REPAIR", "CCR"] as const) {
  const b = baselineAttribution.recoveryStats.find((s) => s.recoveryType === t)!;
  const g = integratedAttribution.recoveryStats.find((s) => s.recoveryType === t)!;
  push(
    `    ${t}: Baseline offered=${b.offeredCount}, chosen=${b.chosenCount} (chosenRate=${(b.chosenRate * 100).toFixed(1)}%), succeeded=${b.succeededCount} (${(b.successRateWhenChosen * 100).toFixed(1)}% of chosen) | Integrated offered=${g.offeredCount}, chosen=${g.chosenCount} (chosenRate=${(g.chosenRate * 100).toFixed(1)}%), succeeded=${g.succeededCount} (${(g.successRateWhenChosen * 100).toFixed(1)}% of chosen)`
  );
}
push(`  Recovery triggered: Baseline=${baselineAttribution.recoveryTriggeredCount}, Integrated=${integratedAttribution.recoveryTriggeredCount}`);
push(`  Recovery no-candidates: Baseline=${baselineAttribution.recoveryNoCandidatesCount}, Integrated=${integratedAttribution.recoveryNoCandidatesCount}`);
push(`  Recovery loop-detected (abort): Baseline=${baselineAttribution.recoveryLoopDetectedCount}, Integrated=${integratedAttribution.recoveryLoopDetectedCount}`);
push("");

log("STEP4: Primitive Interaction Analysis...");
const ccrRepairBaseline = analyzeCCRRepairInteraction(fullBaseline);
const ccrRepairIntegrated = analyzeCCRRepairInteraction(fullIntegrated);
const endgameRecoveryInteraction = analyzeEndgameRecoveryInteraction(fullBaseline, fullIntegrated);
const incrementalRecoveryEndgame = analyzeIncrementalRecoveryEndgameInteraction(fullIntegrated, integratedAttribution);
const budgetConflictBaseline = analyzeBudgetConflict(fullBaseline);
const budgetConflictIntegrated = analyzeBudgetConflict(fullIntegrated);
push("STEP4. Primitive Interaction Analysis:");
push(`  CCR<->REPAIR (Integrated arm): both offered in ${ccrRepairIntegrated.bothOfferedCount} events -- CCR won ${ccrRepairIntegrated.ccrWonWhenBothOffered}, REPAIR won ${ccrRepairIntegrated.repairWonWhenBothOffered}, neither (DISRUPT/SETUP) won ${ccrRepairIntegrated.neitherWonWhenBothOffered}. CCR chosenRate-when-offered=${(ccrRepairIntegrated.ccrChosenRateWhenOffered * 100).toFixed(1)}%, REPAIR chosenRate-when-offered=${(ccrRepairIntegrated.repairChosenRateWhenOffered * 100).toFixed(1)}%.`);
push(`  CCR<->REPAIR (Baseline arm, for comparison): both offered in ${ccrRepairBaseline.bothOfferedCount} events -- CCR won ${ccrRepairBaseline.ccrWonWhenBothOffered}, REPAIR won ${ccrRepairBaseline.repairWonWhenBothOffered}, neither won ${ccrRepairBaseline.neitherWonWhenBothOffered}.`);
push(`  ENDGAME<->Recovery: Recovery Trigger rate Baseline=${(endgameRecoveryInteraction.recoveryTriggerRateBaseline * 100).toFixed(2)}%, Integrated=${(endgameRecoveryInteraction.recoveryTriggerRateIntegrated * 100).toFixed(2)}% (delta=${(endgameRecoveryInteraction.recoveryTriggerRateDelta * 100).toFixed(2)}pp). Recovery success rate (of triggered) Baseline=${(endgameRecoveryInteraction.recoverySuccessRateBaseline * 100).toFixed(2)}%, Integrated=${(endgameRecoveryInteraction.recoverySuccessRateIntegrated * 100).toFixed(2)}%.`);
push(`  Incremental Recovery(PAIR 140ms, unchanged)<->ENDGAME: avg PAIR completion rate=${(incrementalRecoveryEndgame.avgPairCompletionRate * 100).toFixed(2)}%, ENDGAME planned rate=${(incrementalRecoveryEndgame.endgamePlannedRate * 100).toFixed(2)}%, ENDGAME completed-given-planned rate=${(incrementalRecoveryEndgame.endgameCompletedGivenPlannedRate * 100).toFixed(2)}% (Integrated arm).`);
push(`  Budget Conflict (recovery triggered AND whole solve still missed its 1s deadline): Baseline=${budgetConflictBaseline.recoveryTriggeredAndDeadlineMissedCount}/${budgetConflictBaseline.recoveryTriggeredCount} (${(budgetConflictBaseline.budgetConflictRate * 100).toFixed(2)}%), Integrated=${budgetConflictIntegrated.recoveryTriggeredAndDeadlineMissedCount}/${budgetConflictIntegrated.recoveryTriggeredCount} (${(budgetConflictIntegrated.budgetConflictRate * 100).toFixed(2)}%).`);
push("");

log("STEP5: Regression Audit (full census)...");
const regressionAudit = auditRegressions(fullBaseline, fullIntegrated);
push(`STEP5. Regression Audit (full ${regressionAudit.n}-snapshot census):`);
push(`  True Regression: ${regressionAudit.trueRegressionCount}/${regressionAudit.n} (${(regressionAudit.trueRegressionRate * 100).toFixed(2)}%)`);
push(`  Gap Rescue: ${regressionAudit.gapRescueCount}/${regressionAudit.n} (${(regressionAudit.gapRescueRate * 100).toFixed(2)}%)`);
push(`  Runtime Spike (>100ms increase): ${regressionAudit.runtimeSpikeCount}/${regressionAudit.n} (${(regressionAudit.runtimeSpikeRate * 100).toFixed(2)}%)`);
push(`  New Deadline Miss: ${regressionAudit.newDeadlineMissCount}/${regressionAudit.n} (${(regressionAudit.newDeadlineMissRate * 100).toFixed(2)}%)`);
push(`  New Budget Violation: ${regressionAudit.newBudgetViolationCount}/${regressionAudit.n} (${(regressionAudit.newBudgetViolationRate * 100).toFixed(2)}%)`);
push("");

log(`STEP6: End-to-End Statistical Validation (N=${N_TRIALS} trials, ${subsample.length}-snapshot subsample)...`);
let startTrial = 0;
const trials: TrialAggregate[] = [];
const checkpoint = loadCheckpoint();
if (checkpoint && checkpoint.dbPath === dbPath && checkpoint.nTrials === N_TRIALS && checkpoint.subsampleSize === SUBSAMPLE_SIZE) {
  startTrial = checkpoint.completedTrials;
  trials.push(...checkpoint.trials);
  log(`Resuming from checkpoint: ${startTrial}/${N_TRIALS} trials already completed.`);
  push(`(Resumed from checkpoint at trial ${startTrial}/${N_TRIALS}.)`);
}
for (let trial = startTrial; trial < N_TRIALS; trial++) {
  log(`  trial ${trial + 1}/${N_TRIALS}...`);
  const { baseline, integrated } = runOneTrial(subsample);
  trials.push(summarizeTrial(baseline, integrated));
  saveCheckpoint({ dbPath, nTrials: N_TRIALS, subsampleSize: SUBSAMPLE_SIZE, completedTrials: trial + 1, trials });
}

const evaluation = runStandardEvaluation(trials);
push(`STEP6. End-to-End Statistical Validation (paired-diff across N=${N_TRIALS} trials, ${subsample.length} snapshots each):`);
push(`  Primary (improved count diff, Integrated-Baseline): mean=${evaluation.primary.stats.mean.toFixed(3)}, 95% CI=[${evaluation.primary.stats.ciLower.toFixed(3)}, ${evaluation.primary.stats.ciUpper.toFixed(3)}], Cohen's d_z=${evaluation.primary.effectSize.cohensD.toFixed(3)} (${evaluation.primary.effectSize.magnitude})`);
push(`  Secondary (solved count diff): mean=${evaluation.secondary.stats.mean.toFixed(3)}, 95% CI=[${evaluation.secondary.stats.ciLower.toFixed(3)}, ${evaluation.secondary.stats.ciUpper.toFixed(3)}]`);
push(`  Runtime diff (ms): mean=${evaluation.runtime.stats.mean.toFixed(2)}, 95% CI=[${evaluation.runtime.stats.ciLower.toFixed(2)}, ${evaluation.runtime.stats.ciUpper.toFixed(2)}]`);
push(`  Deadline Miss diff (pp): mean=${evaluation.deadlineMiss.stats.mean.toFixed(2)}, 95% CI=[${evaluation.deadlineMiss.stats.ciLower.toFixed(2)}, ${evaluation.deadlineMiss.stats.ciUpper.toFixed(2)}]`);
push(`  Recovery Trigger diff (pp): mean=${evaluation.recoveryTrigger.stats.mean.toFixed(2)}, 95% CI=[${evaluation.recoveryTrigger.stats.ciLower.toFixed(2)}, ${evaluation.recoveryTrigger.stats.ciUpper.toFixed(2)}]`);
push("");

log("Final Assessment...");
const assessment = evaluateFinalAssessment(evaluation, regressionAudit, endgameRecoveryInteraction);
push("Level 1-3 Judgment:");
push(`  Level1 (모든 Operating Contract 정상 적용): ${assessment.level1Pass ? "PASS" : "FAIL"} -- ${assessment.level1Detail}`);
push(`  Level2 (Regression 허용 범위 유지): ${assessment.level2Pass ? "PASS" : "FAIL"} -- ${assessment.level2Detail}`);
push(`  Level3 (Integrated Solver가 Baseline보다 통계적으로 유의미하게 우수함을 입증): ${assessment.level3Pass ? "PASS" : "FAIL"} -- ${assessment.level3Detail}`);
push("");
push(`9. Production Integration 적합성 판정: ${assessment.suitabilityVerdict}`);
push(`10. Release 권고: ${assessment.releaseRecommendation}`);
push(`  ${assessment.releaseRationale}`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
if (existsSync(checkpointPath)) unlinkSync(checkpointPath);
log(`Report written to ${reportPath}`);
log(`RELEASE RECOMMENDATION: ${assessment.releaseRecommendation}`);
