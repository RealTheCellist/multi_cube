// ENDGAME Optimization Prototype Refinement Sprint v2 -- driver.
//   npx tsx src/customCube/runEndgameOptimizationPrototypeRefinementSprintV2.ts [dbPath] [nTrials] [subsampleSize]
//
// STEP1-5 per the Work Order. Zero new Production changes -- this Sprint
// only varies recoveryReserveMsOverride, the existing optional parameter on
// executeTask() (fiveByFiveEdgeExecutor.ts), added by the original ENDGAME
// Optimization Prototype Sprint v1 and left UNMODIFIED since. Reuses
// SolveProbe.ts (unmodified) and Refinement Sprint v1's own
// RegressionAnalysis.ts (unmodified) directly.
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import type { FailureSnapshot } from "./failureAnalysis/failureTypes";
import { BASELINE_BUDGET_MS, V1_SELECTED_BUDGET_MS, NEW_BUDGET_VALUES_MS, BUDGET_VALUES_MS, runOneTrialAllBudgets, summarizeBudgetTrial, type BudgetTrialAggregate } from "./solverPrimitiveEndgameOptimizationPrototypeRefinementV2/BudgetSweep";
import { classifyAgainstBaseline } from "./solverPrimitiveEndgameOptimizationPrototypeRefinement/RegressionAnalysis";
import { analyzeAdjacentPairs } from "./solverPrimitiveEndgameOptimizationPrototypeRefinementV2/AdjacentPairAnalysis";
import { analyzeTurningPoint } from "./solverPrimitiveEndgameOptimizationPrototypeRefinementV2/TurningPointAnalysis";
import { computeParetoFrontier, paretoEfficientSet, type BudgetPoint } from "./solverPrimitiveEndgameOptimizationPrototypeRefinementV2/ParetoFrontierRevision";
import { V1_CITED_POINTS } from "./solverPrimitiveEndgameOptimizationPrototypeRefinementV2/V1CitedData";
import { selectFinalBudgetV2, evaluateLevel1To3V2 } from "./solverPrimitiveEndgameOptimizationPrototypeRefinementV2/FinalOperatingContract";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const N_TRIALS = Number(process.argv[3] ?? 30);
const SUBSAMPLE_SIZE = Number(process.argv[4] ?? 75);

const reportPath = "src/customCube/solverPrimitiveEndgameOptimizationPrototypeRefinementV2/data/endgame-optimization-prototype-refinement-v2-report.txt";
const checkpointPath = "src/customCube/solverPrimitiveEndgameOptimizationPrototypeRefinementV2/data/checkpoint-v2.json";

// Checkpoint/resume: this environment's background processes have been
// observed to die silently during long idle gaps between conversation
// turns (twice during this Sprint's own full run). Since a full N=30/75/
// 10-budget sweep takes hours, losing ALL progress on every death is too
// costly -- so the accumulated per-trial results are saved to disk after
// EVERY trial, and reloaded on startup if a matching checkpoint exists (same
// dbPath/nTrials/subsampleSize), resuming from the next incomplete trial
// instead of restarting from trial 0.
interface CheckpointDataV2 {
  dbPath: string;
  nTrials: number;
  subsampleSize: number;
  completedTrials: number;
  trialsByBudget: Record<string, BudgetTrialAggregate[]>;
  regressionRatesVs450ByBudget: Record<string, number[]>;
}

function loadCheckpoint(): CheckpointDataV2 | null {
  if (!existsSync(checkpointPath)) return null;
  try {
    return JSON.parse(readFileSync(checkpointPath, "utf-8")) as CheckpointDataV2;
  } catch {
    return null;
  }
}

function saveCheckpoint(data: CheckpointDataV2): void {
  mkdirSync(dirname(checkpointPath), { recursive: true });
  writeFileSync(checkpointPath, JSON.stringify(data), "utf-8");
}

function strideSample(items: readonly FailureSnapshot[], size: number): FailureSnapshot[] {
  if (items.length <= size) return [...items];
  const stride = items.length / size;
  const picked: FailureSnapshot[] = [];
  for (let i = 0; i < size; i++) picked.push(items[Math.floor(i * stride)]);
  return picked;
}

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("ENDGAME Optimization Prototype Refinement Sprint v2 -- Report");
push(`Generated: ${new Date().toISOString()}`);
push("");

log("Loading snapshots...");
const db = loadDatabase(dbPath);
const allSnaps = allSnapshots(db);
const subsample = strideSample(allSnaps, SUBSAMPLE_SIZE);
push(`STEP0. Population: ${allSnaps.length} real snapshots total; ${subsample.length}-snapshot stride-sample used (same stride formula as v1, project-standard cost-driven subsample), N=${N_TRIALS} trials per budget.`);
push(`Budgets swept fresh this Sprint (recoveryReserveMsOverride): ${BUDGET_VALUES_MS.join(", ")}ms. 450ms (original Baseline) and 250ms (v1's own selected Operating Contract) are RE-MEASURED fresh, in the SAME trial loop as the 8 new budgets, so adjacent-pair paired-diff comparisons (STEP4) are valid. v1's own cited real data for 400/375/350/325/300/275ms is reused (not re-measured) for the combined Pareto Frontier (STEP3) only.`);
push("Zero new Production changes this Sprint -- only the budget VALUE passed to the existing executeTask() parameter varies. No interpolation, no estimation -- every number below is a real solve() measurement.");
push("");

const trialsByBudget = new Map<number, BudgetTrialAggregate[]>();
for (const b of BUDGET_VALUES_MS) trialsByBudget.set(b, []);
const regressionRatesVs450ByBudget = new Map<number, number[]>();
for (const b of BUDGET_VALUES_MS) if (b !== BASELINE_BUDGET_MS) regressionRatesVs450ByBudget.set(b, []);

let startTrial = 0;
const checkpoint = loadCheckpoint();
if (checkpoint && checkpoint.dbPath === dbPath && checkpoint.nTrials === N_TRIALS && checkpoint.subsampleSize === SUBSAMPLE_SIZE) {
  startTrial = checkpoint.completedTrials;
  for (const b of BUDGET_VALUES_MS) trialsByBudget.set(b, checkpoint.trialsByBudget[String(b)] ?? []);
  for (const b of BUDGET_VALUES_MS) if (b !== BASELINE_BUDGET_MS) regressionRatesVs450ByBudget.set(b, checkpoint.regressionRatesVs450ByBudget[String(b)] ?? []);
  log(`Resuming from checkpoint: ${startTrial}/${N_TRIALS} trials already completed.`);
  push(`(Resumed from checkpoint at trial ${startTrial}/${N_TRIALS} -- this run's process was restarted after an earlier interruption; no trials were re-run or lost.)`);
} else if (checkpoint) {
  log(`Found checkpoint but dbPath/nTrials/subsampleSize differ from this run's own args -- starting fresh.`);
}

log(`STEP1: sweeping ${BUDGET_VALUES_MS.length} budgets x N=${N_TRIALS} trials x ${subsample.length} snapshots...`);
for (let trial = startTrial; trial < N_TRIALS; trial++) {
  log(`  trial ${trial + 1}/${N_TRIALS}...`);
  const resultsByBudget = runOneTrialAllBudgets(subsample, BUDGET_VALUES_MS);
  const baselineResults = resultsByBudget.get(BASELINE_BUDGET_MS)!;
  for (const [budgetMs, results] of resultsByBudget) {
    trialsByBudget.get(budgetMs)!.push(summarizeBudgetTrial(results, budgetMs));
    if (budgetMs !== BASELINE_BUDGET_MS) {
      const classification = classifyAgainstBaseline(baselineResults, results);
      regressionRatesVs450ByBudget.get(budgetMs)!.push(classification.trueRegressionRate);
    }
  }

  const serializedTrials: Record<string, BudgetTrialAggregate[]> = {};
  for (const [b, arr] of trialsByBudget) serializedTrials[String(b)] = arr;
  const serializedRegRates: Record<string, number[]> = {};
  for (const [b, arr] of regressionRatesVs450ByBudget) serializedRegRates[String(b)] = arr;
  saveCheckpoint({
    dbPath,
    nTrials: N_TRIALS,
    subsampleSize: SUBSAMPLE_SIZE,
    completedTrials: trial + 1,
    trialsByBudget: serializedTrials,
    regressionRatesVs450ByBudget: serializedRegRates,
  });
}

push(`STEP1. Budget Sweep results (avg across ${N_TRIALS} trials, ${subsample.length} snapshots each) -- Capability / Runtime / Regression Curves:`);
push("  Budget | avgImproved | avgWallMs | DeadlineMissRate | EndgameInvoked | avgEndgameRuntimeMs | RecoveryTriggerRate | TrueRegressionRate(vs 450ms) | SuccessRate(solved)");
const avgRegressionRateVs450ByBudget = new Map<number, number>();
avgRegressionRateVs450ByBudget.set(BASELINE_BUDGET_MS, 0);
const orderedBudgets = [...BUDGET_VALUES_MS].sort((a, b) => b - a);
for (const budgetMs of orderedBudgets) {
  const trials = trialsByBudget.get(budgetMs)!;
  const n = trials.length;
  const avgImproved = trials.reduce((a, t) => a + t.improvedCount, 0) / n;
  const avgSolved = trials.reduce((a, t) => a + t.solvedCount, 0) / n;
  const avgWallMs = trials.reduce((a, t) => a + t.avgWallMs, 0) / n;
  const avgDeadlineMiss = trials.reduce((a, t) => a + t.deadlineMissRate, 0) / n;
  const avgEndgameInvoked = trials.reduce((a, t) => a + t.endgameInvokedCount, 0) / n;
  const avgEndgameRuntime = trials.reduce((a, t) => a + t.avgEndgameRuntimeMs, 0) / n;
  const avgRecoveryTrigger = trials.reduce((a, t) => a + t.recoveryTriggerRate, 0) / n;
  const regRates = regressionRatesVs450ByBudget.get(budgetMs);
  const avgRegRate = regRates && regRates.length ? regRates.reduce((a, r) => a + r, 0) / regRates.length : 0;
  if (budgetMs !== BASELINE_BUDGET_MS) avgRegressionRateVs450ByBudget.set(budgetMs, avgRegRate);
  push(
    `  ${budgetMs}ms | ${avgImproved.toFixed(2)}/${subsample.length} | ${avgWallMs.toFixed(1)} | ${(avgDeadlineMiss * 100).toFixed(2)}% | ${avgEndgameInvoked.toFixed(2)} | ${avgEndgameRuntime.toFixed(1)} | ${(avgRecoveryTrigger * 100).toFixed(2)}% | ${(avgRegRate * 100).toFixed(2)}% | ${avgSolved.toFixed(2)}/${subsample.length}`
  );
}
push("");

log("STEP4: Adjacent-Pair paired-diff Analysis...");
const pairOrder = [V1_SELECTED_BUDGET_MS, ...NEW_BUDGET_VALUES_MS]; // [250, 225, 200, ..., 50]
const pairs = analyzeAdjacentPairs(trialsByBudget, pairOrder);
push(`STEP4. Adjacent-Pair Sensitivity Analysis (paired-diff across N=${N_TRIALS} trials, NOT a simple average comparison):`);
push("  LargerBudget vs SmallerBudget | Primary(improved diff) mean [95% CI] d_z | Runtime diff mean [95% CI] | Distinguishable(95% CI excludes 0)");
for (const p of pairs) {
  push(
    `  ${p.largerBudgetMs}ms vs ${p.smallerBudgetMs}ms | ${p.primary.stats.mean.toFixed(3)} [${p.primary.stats.ciLower.toFixed(3)}, ${p.primary.stats.ciUpper.toFixed(3)}] d_z=${p.primary.effectSize.cohensD.toFixed(3)} (${p.primary.effectSize.magnitude}) | ${p.runtime.stats.mean.toFixed(2)} [${p.runtime.stats.ciLower.toFixed(2)}, ${p.runtime.stats.ciUpper.toFixed(2)}] | ${p.distinguishable}`
  );
}
push("");

log("STEP2: Turning Point Analysis (Dose-Response Curve)...");
const turningPoint = analyzeTurningPoint(pairs);
push("STEP2. Dose-Response Curve Verification (Turning Point):");
for (const seg of turningPoint.segments) {
  push(`  ${seg.largerBudgetMs}ms -> ${seg.smallerBudgetMs}ms: ${seg.classification}`);
}
push(`  Overall: ${turningPoint.overallVerdict}`);
push("");

log("STEP3: Pareto Frontier Revision (16-point combined)...");
const freshPoints: BudgetPoint[] = orderedBudgets.map((budgetMs) => {
  const trials = trialsByBudget.get(budgetMs)!;
  const n = trials.length;
  return {
    budgetMs,
    avgImprovedCount: trials.reduce((a, t) => a + t.improvedCount, 0) / n,
    avgWallMs: trials.reduce((a, t) => a + t.avgWallMs, 0) / n,
    avgTrueRegressionRate: avgRegressionRateVs450ByBudget.get(budgetMs) ?? 0,
  };
});
const combinedPoints = [...freshPoints, ...V1_CITED_POINTS];
const paretoResults = computeParetoFrontier(combinedPoints);
const efficientSet = paretoEfficientSet(paretoResults);
push(`STEP3. Pareto Frontier Revision (${combinedPoints.length}-point combined: ${freshPoints.length} fresh this Sprint + ${V1_CITED_POINTS.length} cited from v1's own real data):`);
for (const r of paretoResults) {
  push(
    `  ${r.point.budgetMs}ms: avgImproved=${r.point.avgImprovedCount.toFixed(2)}, avgWallMs=${r.point.avgWallMs.toFixed(1)}, avgTrueRegressionRate=${(r.point.avgTrueRegressionRate * 100).toFixed(2)}% -- ${r.dominated ? `DOMINATED by [${r.dominatedBy.join(", ")}]ms` : "PARETO-EFFICIENT"}`
  );
}
push(`  Pareto-efficient set: [${efficientSet.map((p) => p.budgetMs).sort((a, b) => b - a).join(", ")}]ms`);
push("");

log("STEP5: Final Operating Contract...");
const contract = selectFinalBudgetV2(pairOrder, turningPoint.segments, trialsByBudget, avgRegressionRateVs450ByBudget);
const baselineRuntimeMs = trialsByBudget.get(BASELINE_BUDGET_MS)!.reduce((a, t) => a + t.avgWallMs, 0) / trialsByBudget.get(BASELINE_BUDGET_MS)!.length;
const judgment = evaluateLevel1To3V2(trialsByBudget, NEW_BUDGET_VALUES_MS, N_TRIALS, turningPoint, paretoResults, contract, baselineRuntimeMs);
push("STEP5. Final Operating Contract:");
push(`  Selected recoveryReserveMsOverride: ${contract.selectedBudgetMs}ms`);
push(`  Rationale: ${contract.selectionRationale}`);
push(`  Expected Runtime: ${contract.expectedRuntimeMs.toFixed(1)}ms`);
push(`  Expected Capability (improved-count diff vs 450ms Baseline): ${contract.expectedCapabilityDiffVs450.toFixed(3)}`);
push(`  Expected Regression (True Regression rate vs 450ms): ${(contract.expectedRegressionRateVs450 * 100).toFixed(2)}%`);
push(`  Budget Compliance (1 - Recovery Trigger rate): ${(contract.budgetComplianceRate * 100).toFixed(2)}%`);
push("");

push("Level 1-3 Judgment:");
push(`  Level1 (250ms 이하 Budget Sweep 완료): ${judgment.level1Pass ? "PASS" : "FAIL"} -- ${judgment.level1Detail}`);
push(`  Level2 (Capability Curve Turning Point 확인): ${judgment.level2Pass ? "PASS" : "FAIL"} -- ${judgment.level2Detail}`);
push(`  Level3 (ENDGAME 최종 Operating Contract 확정): ${judgment.level3Pass ? "PASS" : "FAIL"} -- ${judgment.level3Detail}`);
push("");
push(`DECISION: ${judgment.decision}`);
push(`  ${judgment.decisionRationale}`);
push("");
push("다음 Sprint 제안:");
push(
  turningPoint.turningPointAt === null
    ? `  Capability는 이번 Sprint가 스윕한 최저값(${orderedBudgets[orderedBudgets.length - 1]}ms)까지도 계속 개선되어 전역 최적점을 아직 찾지 못했다. ${orderedBudgets[orderedBudgets.length - 1]}ms보다 더 낮은 값을 스윕하는 Refinement Sprint v3를 제안한다.`
    : `  ${turningPoint.overallVerdict} 최종 Operating Contract(${contract.selectedBudgetMs}ms)가 확정되었으므로, Production Integration Finalization 단계로 진행할 것을 제안한다.`
);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
if (existsSync(checkpointPath)) unlinkSync(checkpointPath); // run completed successfully -- checkpoint no longer needed
log(`Report written to ${reportPath}`);
log(`DECISION: ${judgment.decision}`);
