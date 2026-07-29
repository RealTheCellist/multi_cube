// CONFLICT_DEEP_DEPENDENCY Scheduler Production Integration Sprint v1 --
// driver.
//   npx tsx src/customCube/runSchedulerProductionIntegrationSprintV1.ts
//
// STEP1 finding (no code change made or needed this Sprint): the real
// Executor (fiveByFiveEdgeExecutor.ts's executeTask()) already calls
// attemptRecovery() with schedulingStrategy defaulted to "reservedBudget"
// and never overrides includeCCR/includeMixedCommutator/
// useSetupReservedSlice (all default true) -- i.e. Scheduler Prototype
// Sprint v1's SETUP Last-Resort branch (reservedBudget &&
// useSetupReservedSlice===true) is already the sole real production path.
// There is no separate "Prototype" scheduler left to merge in. This
// driver's job is therefore purely STEP2-6: re-validate at N>=30 (vs the
// Prototype Sprint's N=15) directly against the real, unmodified
// generateRecoveryStrategies()/attemptRecovery()/solve().
import * as fs from "fs";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs } from "./coverageAtlas/HoleDatasetBuilder";
import { collectRun, type RunRecord } from "./schedulerPrototypeSprintV1/ProductionReplayCollector";
import { summarizeRegression } from "./reservedSliceProductionIntegration/RegressionSummary";
import { runStatisticalValidation } from "./schedulerPrototypeSprintV1/StatisticalValidation";
import { runEndToEndCapability } from "./reservedSliceProductionIntegration/EndToEndCapability";
import { buildPrimitiveInteractionMatrix } from "./schedulerProductionIntegration/PrimitiveInteractionMatrix";
import { assembleProductionDecisionMatrix } from "./schedulerProductionIntegration/ProductionDecisionMatrix";

const DATA_DIR = "src/customCube/schedulerProductionIntegration/data";
const REPORT_PATH = `${DATA_DIR}/scheduler-production-integration-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/scheduler-production-integration-v1-result.json`;

const CP_REPLAY = `${DATA_DIR}/checkpoint-replay.json`;
const CP_E2E = `${DATA_DIR}/checkpoint-e2e.json`;

const REPLAY_REPEATS = 30; // Directive STEP4: N>=30
const E2E_REPEATS = 10; // Directive STEP3: 실제 Solver 전체 기준 Runtime

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
  log(`init: ${dataset.length} Hole Dataset cases loaded`);
  const libs = buildLibs();

  // --- STEP2/STEP4: Production Replay (N=30, Baseline vs Candidate=real
  // production scheduler) -- gives both Regression Analysis (STEP2) and
  // the paired-diff Scheduler Stability data (STEP4) from a single pass. ---
  const replayRepeats = runPhase<RunRecord[number]>(CP_REPLAY, REPLAY_REPEATS, "replay", () => collectRun(dataset, libs));
  const replayRuns = replayRepeats as unknown as RunRecord[];

  // --- STEP2: Regression Analysis ---
  const { summary: regressionSummary } = summarizeRegression(replayRuns);

  // --- STEP4: Statistical Validation (paired-diff, N=30, 95% CI, Cohen's d) ---
  const statisticalValidation = runStatisticalValidation(replayRuns);

  // --- STEP5: Primitive Interaction Matrix (derived from the same replay data) ---
  const interactionMatrix = buildPrimitiveInteractionMatrix(replayRuns);

  // --- STEP3: Runtime Validation (real solve(), full population) ---
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

  // --- STEP6: Production Decision Matrix ---
  const decisionMatrix = assembleProductionDecisionMatrix(regressionSummary, statisticalValidation, e2eSummary, interactionMatrix);

  // --- Report ---
  const lines: string[] = [];
  const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));

  push("CONFLICT_DEEP_DEPENDENCY Scheduler Production Integration Sprint v1 -- Report");
  push(`Generated: ${new Date().toISOString()}`);
  push(`Population: Production Replay n=${dataset.length}x${REPLAY_REPEATS}; E2E n=${dataset.length}x${E2E_REPEATS}`);
  push();

  push("1. Integration 방법 (STEP1, Deliverable)");
  push('  코드 변경 없음. fiveByFiveEdgeExecutor.ts의 executeTask()는 schedulingStrategy 기본값 "reservedBudget"을 attemptRecovery()에 그대로 전달하고,');
  push("  includeCCR/includeMixedCommutator/useSetupReservedSlice는 override하지 않는다(각각 기본값 true).");
  push("  즉 Scheduler Prototype Sprint v1이 수정한 SETUP Last-Resort 분기(reservedBudget && useSetupReservedSlice===true)는 이미 실제 Production의 유일한 실행 경로다.");
  push();

  push("2. Runtime 분석 (STEP3, Deliverable)");
  push(`  E2E 실 solve(): avg=${e2eSummary.runtime.avgMs.toFixed(1)}ms, p95=${e2eSummary.runtime.p95Ms}ms, max=${e2eSummary.runtime.maxMs}ms`);
  push(`  Deadline Miss=${e2eSummary.deadlineMissedCount}/${e2eSummary.n} (${e2eSummary.n ? ((e2eSummary.deadlineMissedCount / e2eSummary.n) * 100).toFixed(1) : "0.0"}%)`);
  push();

  push("3. Regression 분석 (STEP2, Deliverable)");
  push(`  n=${regressionSummary.n}, casesWithSinglePassFlip=${regressionSummary.casesWithSinglePassFlip}, trueRegressionCount=${regressionSummary.trueRegressionCount}, falseRegressionCount=${regressionSummary.falseRegressionCount}`);
  push();

  push("4. Primitive Interaction (STEP5, Deliverable)");
  for (const row of interactionMatrix) {
    push(
      `  ${row.type}: Invocation ${(row.baselineInvocationRate * 100).toFixed(1)}%->${(row.candidateInvocationRate * 100).toFixed(1)}%, Selected ${(row.baselineSelectedRate * 100).toFixed(
        1
      )}%->${(row.candidateSelectedRate * 100).toFixed(1)}%, Success(선택시) ${(row.baselineSuccessRate * 100).toFixed(1)}%->${(row.candidateSuccessRate * 100).toFixed(1)}%`
    );
  }
  push();

  push("5. Statistical Validation (STEP4, Deliverable)");
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
    )}, ${statisticalValidation.regressedCountDiff.stats.ciUpper.toFixed(2)}]`
  );
  push(
    `  Runtime diff ms (Candidate-Baseline, per repeat avg): mean=${statisticalValidation.runtimeDiffMs.stats.mean.toFixed(1)}, 95% CI=[${statisticalValidation.runtimeDiffMs.stats.ciLower.toFixed(
      1
    )}, ${statisticalValidation.runtimeDiffMs.stats.ciUpper.toFixed(1)}]`
  );
  push();

  push("6. Decision Matrix (STEP6, Deliverable)");
  for (const row of decisionMatrix.rows) {
    push(`  [Level ${row.level}][${row.status}] ${row.criterion}`);
    push(`    ${row.evidence}`);
  }
  push();
  push(`Final Decision: ${decisionMatrix.decision} -- ${decisionMatrix.decisionRationale}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"));
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        regressionSummary,
        statisticalValidation,
        e2eSummary,
        interactionMatrix,
        decisionMatrix,
      },
      null,
      2
    )
  );
  log(`report written: ${REPORT_PATH}`);

  for (const cp of [CP_REPLAY, CP_E2E]) {
    if (fs.existsSync(cp)) fs.unlinkSync(cp);
  }
  log("done, checkpoints cleaned up");
}

main();
