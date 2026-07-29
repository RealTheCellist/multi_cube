// CONFLICT_DEEP_DEPENDENCY Scheduler Prototype Sprint v1 -- driver.
//   npx tsx src/customCube/runSchedulerPrototypeSprintV1.ts
//
// Production change this Sprint made (the ONLY edit, inside the Directive's
// allowed "Scheduler Ordering / Candidate Selection / Recovery Scheduling
// Policy" scope): fiveByFiveEdgeRecovery.ts's generateRecoveryStrategies()
// now moves genSetup() to the LAST position in its `order` array when
// schedulingStrategy==="reservedBudget" && useSetupReservedSlice===true (today's
// real production), and genSetup() itself skips entirely if candidates.length>0
// at that point ("SETUP Last-Resort", Architecture Revision Sprint v1's Option
// A). chooseBestRecovery() itself, every Primitive's own internal search logic
// (DISRUPT/REPAIR/CCR/MIXED_COMMUTATOR), Planner, Executor, SolverEngine, BFS,
// Deferred Validator are all completely untouched.
import * as fs from "fs";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs } from "./coverageAtlas/HoleDatasetBuilder";
import { collectRun, type RunRecord } from "./schedulerPrototypeSprintV1/ProductionReplayCollector";
import { summarizeRegression } from "./reservedSliceProductionIntegration/RegressionSummary";
import { attributeRootCause, summarizeRootCause } from "./schedulerPrototypeSprintV1/RootCauseAttribution";
import { runInvocationRound, summarizeInvocation, type InvocationRound } from "./schedulerPrototypeSprintV1/InvocationSummary";
import { runCompetitionRound, summarizeCompetitionMatrix, type CompetitionRound } from "./solverPrimitiveConflictDependencyArchitectureRevision/CompetitionMatrix";
import { runCounterfactualRound, summarizeCounterfactualReplay, TRUE_REGRESSION_LABELS, type CounterfactualRound } from "./solverPrimitiveConflictDependencyArchitectureRevision/CounterfactualReplay";
import { runStatisticalValidation } from "./schedulerPrototypeSprintV1/StatisticalValidation";
import { runEndToEndCapability } from "./reservedSliceProductionIntegration/EndToEndCapability";
import { assembleSchedulerDecisionMatrix } from "./schedulerPrototypeSprintV1/SchedulerDecisionMatrix";

const DATA_DIR = "src/customCube/schedulerPrototypeSprintV1/data";
const REPORT_PATH = `${DATA_DIR}/scheduler-prototype-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/scheduler-prototype-v1-result.json`;

const CP_REPLAY = `${DATA_DIR}/checkpoint-replay.json`;
const CP_INVOCATION = `${DATA_DIR}/checkpoint-invocation.json`;
const CP_COMPETITION = `${DATA_DIR}/checkpoint-competition.json`;
const CP_COUNTERFACTUAL = `${DATA_DIR}/checkpoint-counterfactual.json`;
const CP_E2E = `${DATA_DIR}/checkpoint-e2e.json`;

const REPLAY_REPEATS = 15; // Directive STEP2: N>=15
const INVOCATION_REPEATS = 10;
const COMPETITION_REPEATS = 10;
const COUNTERFACTUAL_REPEATS = 10;
const E2E_REPEATS = 5;

function log(s: string) {
  console.log(`[${new Date().toISOString()}] ${s}`);
}

function runPhase<T>(checkpointPath: string, totalRepeats: number, label: string, runOneRepeat: () => T[]): T[][] {
  let repeats: T[][] = [];
  if (fs.existsSync(checkpointPath)) {
    repeats = JSON.parse(fs.readFileSync(checkpointPath, "utf-8"));
    log(`${label}: resumed checkpoint, ${repeats.length}/${totalRepeats} repeats already done`);
  }
  for (let rep = repeats.length; rep < totalRepeats; rep++) {
    log(`${label}: repeat ${rep + 1}/${totalRepeats}...`);
    repeats.push(runOneRepeat());
    fs.writeFileSync(checkpointPath, JSON.stringify(repeats));
  }
  log(`${label}: done`);
  return repeats;
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dataset = loadRawHoleDataset();
  const targetCases = dataset.filter((c) => TRUE_REGRESSION_LABELS.includes(c.label));
  log(`init: ${dataset.length} Hole Dataset cases loaded, ${targetCases.length}/${TRUE_REGRESSION_LABELS.length} True Regression target cases found`);
  const libs = buildLibs();

  // --- STEP2: Production Replay (N=15, Baseline vs Candidate=new scheduler) ---
  const replayRepeats = runPhase<RunRecord[number]>(CP_REPLAY, REPLAY_REPEATS, "replay", () => collectRun(dataset, libs));
  const replayRuns = replayRepeats as unknown as RunRecord[];

  // --- STEP3: Regression Analysis + Root Cause ---
  const { perCase: regressionPerCase, summary: regressionSummary } = summarizeRegression(replayRuns);
  const rootCauseAttributions = attributeRootCause(replayRuns);
  const rootCauseSummary = summarizeRootCause(rootCauseAttributions);

  // --- STEP4: Counterfactual re-verification (11 True Regression cases, NEW scheduler) ---
  const counterfactualRepeats = runPhase<CounterfactualRound>(CP_COUNTERFACTUAL, COUNTERFACTUAL_REPEATS, "counterfactual", () =>
    targetCases.map((c) => runCounterfactualRound(c.cubies, libs, c.label))
  );
  const counterfactualRounds = counterfactualRepeats.flat();
  const counterfactualSummaries = summarizeCounterfactualReplay(counterfactualRounds);

  // --- STEP5: Competition Matrix (after) + Invocation Summary ---
  const competitionRepeats = runPhase<CompetitionRound>(CP_COMPETITION, COMPETITION_REPEATS, "competition", () => dataset.map((c) => runCompetitionRound(c.cubies, libs, c.label)));
  const competitionAfter = summarizeCompetitionMatrix(competitionRepeats.flat());

  const invocationRepeats = runPhase<InvocationRound>(CP_INVOCATION, INVOCATION_REPEATS, "invocation", () => dataset.map((c) => runInvocationRound(c.cubies, libs, c.label)));
  const invocationSummary = summarizeInvocation(invocationRepeats.flat());

  // --- STEP6: Statistical Validation ---
  const statisticalValidation = runStatisticalValidation(replayRuns);

  // --- E2E real solve() (matching Directive STEP2's "동일 solve()") ---
  let e2eSummary = fs.existsSync(CP_E2E) ? JSON.parse(fs.readFileSync(CP_E2E, "utf-8")).summary : null;
  if (!e2eSummary) {
    log(`e2e: running real solve() x${E2E_REPEATS} repeats over ${dataset.length} cases...`);
    const { summary } = runEndToEndCapability(dataset, E2E_REPEATS);
    e2eSummary = summary;
    fs.writeFileSync(CP_E2E, JSON.stringify({ summary }));
  } else {
    log("e2e: resumed from checkpoint");
  }
  log("e2e: done");

  // --- Decision Matrix ---
  const decisionMatrix = assembleSchedulerDecisionMatrix(regressionSummary, statisticalValidation, counterfactualSummaries, rootCauseSummary, invocationSummary, competitionAfter);

  // --- Report ---
  const lines: string[] = [];
  const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));

  push("CONFLICT_DEEP_DEPENDENCY Scheduler Prototype Sprint v1 -- Report");
  push(`Generated: ${new Date().toISOString()}`);
  push(
    `Population: Production Replay n=${dataset.length}x${REPLAY_REPEATS}; Counterfactual n=${targetCases.length}x${COUNTERFACTUAL_REPEATS}; Competition n=${dataset.length}x${COMPETITION_REPEATS}; Invocation n=${dataset.length}x${INVOCATION_REPEATS}; E2E n=${dataset.length}x${E2E_REPEATS}`
  );
  push();

  push("1. Scheduler Ordering Diagram (Deliverable #1)");
  push("  Before (Reserved Slice Production Integration Sprint v1): DISRUPT, DISRUPT, SETUP(reserved 500ms, competes equally), REPAIR, CCR, MIXED_COMMUTATOR");
  push("  After (this Sprint, Option A): DISRUPT, DISRUPT, REPAIR, CCR, MIXED_COMMUTATOR, SETUP(reserved 500ms, LAST-RESORT -- only attempted if candidates.length===0)");
  push();

  push("2. Competition Matrix (Deliverable #2)");
  push(`  Before (Architecture Revision Sprint v1): SETUP win rate=12.5% (177/1420)`);
  push(
    `  After (this Sprint): SETUP win rate=${(competitionAfter.setupWinRate * 100).toFixed(1)}% (${competitionAfter.setupWinCount}/${competitionAfter.n}), avg score gap=${competitionAfter.avgScoreGapWhenSetupWins.toFixed(
      1
    )}`
  );
  for (const d of competitionAfter.displacement) {
    push(`    ${d.displacedType}: ${d.countAsRunnerUp} rounds, avg score gap=${d.avgScoreGap.toFixed(1)}`);
  }
  push();

  push("3. Invocation Summary (Deliverable #3)");
  push(
    `  SETUP skipped (last-resort, another candidate already existed)=${(invocationSummary.skippedRate * 100).toFixed(1)}% (${invocationSummary.skippedCount}/${invocationSummary.n})`
  );
  push(`  SETUP actually invoked (search ran)=${(invocationSummary.invokedRate * 100).toFixed(1)}% (generated=${invocationSummary.generatedCount}, empty=${invocationSummary.emptyCount})`);
  push();

  push("4. Regression Analysis (Deliverable #4)");
  push(`  n=${regressionSummary.n}, casesWithSinglePassFlip=${regressionSummary.casesWithSinglePassFlip}, trueRegressionCount=${regressionSummary.trueRegressionCount}, falseRegressionCount=${regressionSummary.falseRegressionCount}`);
  for (const r of regressionPerCase.filter((r) => r.classification !== "NO_REGRESSION")) {
    push(`    ${r.label}: ${r.classification} (meanGap=${r.meanGap.toFixed(2)}, singlePassFlip=${r.singlePassFlipCount})`);
  }
  push(`  Root cause of remaining flips: ${rootCauseSummary.totalFlippedCases} case(s), SETUP-involved=${rootCauseSummary.attributedToSetup}, other(CCR/MIXED/Scheduler timing)=${rootCauseSummary.attributedToOther}`);
  push();

  push("5. Counterfactual Replay -- 11 original True Regression cases, re-run under NEW scheduler (Deliverable #5)");
  for (const c of counterfactualSummaries) {
    push(`  ${c.label} (n=${c.n}): FULL(new scheduler) succeededRate=${(c.armSucceededRate.FULL * 100).toFixed(1)}%, regressedRate=${(c.armRegressedRate.FULL * 100).toFixed(1)}%`);
  }
  push();

  push("6. Statistical Validation (Deliverable #6)");
  push(
    `  Improved count diff (Candidate-Baseline, per repeat, n=${statisticalValidation.improvedCountDiff.stats.n}): mean=${statisticalValidation.improvedCountDiff.stats.mean.toFixed(
      2
    )}, 95% CI=[${statisticalValidation.improvedCountDiff.stats.ciLower.toFixed(2)}, ${statisticalValidation.improvedCountDiff.stats.ciUpper.toFixed(2)}], Cohen's d_z=${statisticalValidation.improvedCountDiff.effectSize.cohensD.toFixed(
      2
    )} (${statisticalValidation.improvedCountDiff.effectSize.magnitude})`
  );
  push(
    `  Regressed count diff (Candidate-Baseline, per repeat): mean=${statisticalValidation.regressedCountDiff.stats.mean.toFixed(2)}, 95% CI=[${statisticalValidation.regressedCountDiff.stats.ciLower.toFixed(
      2
    )}, ${statisticalValidation.regressedCountDiff.stats.ciUpper.toFixed(2)}], Cohen's d_z=${statisticalValidation.regressedCountDiff.effectSize.cohensD.toFixed(2)} (${
      statisticalValidation.regressedCountDiff.effectSize.magnitude
    })`
  );
  push(
    `  Runtime diff ms (Candidate-Baseline, per repeat avg): mean=${statisticalValidation.runtimeDiffMs.stats.mean.toFixed(1)}, 95% CI=[${statisticalValidation.runtimeDiffMs.stats.ciLower.toFixed(
      1
    )}, ${statisticalValidation.runtimeDiffMs.stats.ciUpper.toFixed(1)}]`
  );
  push();

  push("7. Runtime 영향 (Deliverable #7)");
  push(`  Recovery-level avg time diff: ${statisticalValidation.runtimeDiffMs.stats.mean.toFixed(1)}ms (Candidate - Baseline)`);
  push(`  E2E real solve() runtime: avg=${e2eSummary.runtime.avgMs.toFixed(1)}ms, p95=${e2eSummary.runtime.p95Ms}ms, max=${e2eSummary.runtime.maxMs}ms`);
  push(`  SETUP invocation savings: ${(invocationSummary.skippedRate * 100).toFixed(1)}% of rounds never pay SETUP's up-to-500ms search cost at all (see section 3).`);
  push();

  push("8. E2E Capability (real solve(), same methodology as Reserved Slice Production Integration Sprint v1)");
  push(`  Improved=${(e2eSummary.improvedRate * 100).toFixed(1)}%, Solved=${(e2eSummary.solveRate * 100).toFixed(1)}%, SETUP chosen=${e2eSummary.setupChosenCount} (succeeded ${e2eSummary.setupSucceededCount}), RecoveryTriggered=${e2eSummary.recoveryTriggeredCount}, RecoverySucceeded=${e2eSummary.recoverySucceededCount}`);
  push();

  push("9. Scheduler Decision Matrix (Deliverable #8)");
  for (const row of decisionMatrix.rows) {
    push(`  [Level ${row.level}][${row.status}] ${row.criterion}`);
    push(`    ${row.evidence}`);
  }
  push();
  push(`Final Decision (Deliverable #9): ${decisionMatrix.decision} -- ${decisionMatrix.decisionRationale}`);
  push();

  push("10. Next Sprint Proposal (Deliverable #10)");
  if (decisionMatrix.decision === "A") {
    push("  Option A(SETUP Last-Resort)를 Scheduler Contract로 확정. 다음은 더 넓은 population(N>=30) 또는 실사용 시나리오에서의 장기 모니터링을 제안.");
  } else if (decisionMatrix.decision === "B") {
    push("  Scheduler Refinement Sprint: OPEN_QUESTION으로 표시된 기준을 좁혀서 재검증 (예: 남은 Regression 케이스의 개별 원인 분석, Runtime 영향 세부 조정).");
  } else {
    push("  Architecture Revision Sprint v2: Option A의 효과가 재현되지 않은 원인 재규명.");
  }

  fs.writeFileSync(REPORT_PATH, lines.join("\n"));
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        regressionSummary,
        regressionPerCase,
        rootCauseAttributions,
        rootCauseSummary,
        counterfactualSummaries,
        competitionAfter,
        invocationSummary,
        statisticalValidation,
        e2eSummary,
        decisionMatrix,
      },
      null,
      2
    )
  );
  log(`report written: ${REPORT_PATH}`);

  for (const cp of [CP_REPLAY, CP_INVOCATION, CP_COMPETITION, CP_COUNTERFACTUAL, CP_E2E]) {
    if (fs.existsSync(cp)) fs.unlinkSync(cp);
  }
  log("done, checkpoints cleaned up");
}

main();
