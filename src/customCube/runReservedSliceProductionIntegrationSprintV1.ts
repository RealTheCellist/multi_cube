// CONFLICT_DEEP_DEPENDENCY Reserved Slice Production Integration Sprint v1
// -- driver.
//   npx tsx src/customCube/runReservedSliceProductionIntegrationSprintV1.ts
//
// Production changes this Sprint made (the ONLY 2 edits, both inside the
// Directive's allowed scope): fiveByFiveEdgeRecovery.ts gained
// SETUP_RESERVED_SLICE_MS=500 + a new useSetupReservedSlice parameter
// (default true) on generateRecoveryStrategies()/attemptRecovery(), and
// genSetup() now uses a reserved-slice window off the OUTER deadline
// (mirroring genRepair()'s own reservedBudget branch) instead of sharing
// genDeadline with DISRUPT. fiveByFiveEdgeExecutor.ts (Executor),
// fiveByFiveEdgePlanner.ts (Planner), and every Primitive's own internal
// search logic (DISRUPT/SETUP/REPAIR/CCR/Mixed Commutator) are completely
// untouched -- Executor never passes the new parameter, so real production
// callers get the SETUP Reserved Slice automatically with zero Executor
// changes, the same mechanism every earlier Production Integration Sprint
// in this arc has relied on (includeRepair/includeCCR/includeMixedCommutator).
import * as fs from "fs";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs } from "./coverageAtlas/HoleDatasetBuilder";
import { collectRun, type RunRecord } from "./reservedSliceProductionIntegration/RecoveryLevelCollector";
import { summarizeRegression } from "./reservedSliceProductionIntegration/RegressionSummary";
import { computeBudgetUtilization } from "./reservedSliceProductionIntegration/BudgetUtilization";
import { buildInteractionMatrix } from "./reservedSliceProductionIntegration/InteractionMatrix";
import { runEndToEndCapability } from "./reservedSliceProductionIntegration/EndToEndCapability";
import { assembleReleaseReadiness } from "./reservedSliceProductionIntegration/ReleaseReadiness";

const DATA_DIR = "src/customCube/reservedSliceProductionIntegration/data";
const REPORT_PATH = `${DATA_DIR}/reserved-slice-production-integration-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/reserved-slice-production-integration-v1-result.json`;
const RECOVERY_CHECKPOINT_PATH = `${DATA_DIR}/checkpoint-recovery-runs.json`;
const E2E_CHECKPOINT_PATH = `${DATA_DIR}/checkpoint-e2e.json`;

const RECOVERY_REPEATS = 15; // this arc's own "Standard Evaluation N=15" convention
const E2E_REPEATS = 5; // real solve() is far more expensive per call; kept smaller, still gives repeat-stability

function log(s: string) {
  console.log(`[${new Date().toISOString()}] ${s}`);
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dataset = loadRawHoleDataset();
  log(`init: ${dataset.length} Hole Dataset cases loaded`);
  const libs = buildLibs();

  // --- Phase 1: Recovery-level Baseline vs Candidate (STEP3/4/5/6/7) ---
  let recoveryRuns: RunRecord[] = [];
  if (fs.existsSync(RECOVERY_CHECKPOINT_PATH)) {
    recoveryRuns = JSON.parse(fs.readFileSync(RECOVERY_CHECKPOINT_PATH, "utf-8"));
    log(`recovery: resumed checkpoint, ${recoveryRuns.length}/${RECOVERY_REPEATS} repeats already done`);
  }
  for (let rep = recoveryRuns.length; rep < RECOVERY_REPEATS; rep++) {
    log(`recovery: repeat ${rep + 1}/${RECOVERY_REPEATS}...`);
    recoveryRuns.push(collectRun(dataset, libs));
    fs.writeFileSync(RECOVERY_CHECKPOINT_PATH, JSON.stringify(recoveryRuns));
  }
  log("recovery: done");

  const { perCase: regressionPerCase, summary: regressionSummary } = summarizeRegression(recoveryRuns);
  const budget = computeBudgetUtilization(recoveryRuns);
  const interaction = buildInteractionMatrix(recoveryRuns);

  const allRows = recoveryRuns.flat();
  const recoveryImprovedRateBaseline = allRows.filter((r) => r.baselineSucceeded).length / allRows.length;
  const recoveryImprovedRateCandidate = allRows.filter((r) => r.candidateSucceeded).length / allRows.length;

  // --- Phase 2: End-to-End Capability via the REAL solve() (STEP3) ---
  let e2eSummary = fs.existsSync(E2E_CHECKPOINT_PATH) ? JSON.parse(fs.readFileSync(E2E_CHECKPOINT_PATH, "utf-8")).summary : null;
  if (!e2eSummary) {
    log(`e2e: running real solve() x${E2E_REPEATS} repeats over ${dataset.length} cases...`);
    const { summary } = runEndToEndCapability(dataset, E2E_REPEATS);
    e2eSummary = summary;
    fs.writeFileSync(E2E_CHECKPOINT_PATH, JSON.stringify({ summary }));
  } else {
    log("e2e: resumed from checkpoint");
  }
  log("e2e: done");

  const releaseReadiness = assembleReleaseReadiness(recoveryImprovedRateBaseline, recoveryImprovedRateCandidate, regressionSummary, budget, interaction, e2eSummary);

  // --- Report ---
  const lines: string[] = [];
  const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));

  push("CONFLICT_DEEP_DEPENDENCY Reserved Slice Production Integration Sprint v1 -- Report");
  push(`Generated: ${new Date().toISOString()}`);
  push(`Population: Recovery-level n=${dataset.length} x ${RECOVERY_REPEATS} repeats; End-to-End n=${dataset.length} x ${E2E_REPEATS} repeats`);
  push();

  push("1. Integration Diff Summary");
  push("  fiveByFiveEdgeRecovery.ts: +SETUP_RESERVED_SLICE_MS=500, +useSetupReservedSlice param (default true) on generateRecoveryStrategies()/attemptRecovery(), genSetup() reservedBudget branch now uses a reserved-slice window off the outer deadline.");
  push("  fiveByFiveEdgeExecutor.ts / fiveByFiveEdgePlanner.ts / DISRUPT/SETUP/REPAIR/CCR/Mixed Commutator internal search logic: UNTOUCHED.");
  push();

  push("2. Scheduler Diagram (reservedBudget order, unchanged): DISRUPT, DISRUPT, SETUP(reserved 500ms off outer deadline), REPAIR(reserved 75ms off outer deadline), CCR(remainingTime), MIXED_COMMUTATOR(reserved 300ms off outer deadline)");
  push();

  push("3. Reserved Slice Runtime (Deliverable #3)");
  push(`  Baseline arm (Recovery-level) runtime: avg=${budget.baselineRuntimeDistribution.avgMs.toFixed(1)}ms, median=${budget.baselineRuntimeDistribution.medianMs}ms, p95=${budget.baselineRuntimeDistribution.p95Ms}ms, max=${budget.baselineRuntimeDistribution.maxMs}ms`);
  push(`  Candidate arm (Recovery-level) runtime: avg=${budget.candidateRuntimeDistribution.avgMs.toFixed(1)}ms, median=${budget.candidateRuntimeDistribution.medianMs}ms, p95=${budget.candidateRuntimeDistribution.p95Ms}ms, max=${budget.candidateRuntimeDistribution.maxMs}ms`);
  push(`  SETUP-chosen candidateTimeMs distribution (n=${budget.setupChosenCandidateTimeMsDistribution.n}): avg=${budget.setupChosenCandidateTimeMsDistribution.avgMs.toFixed(1)}ms, p95=${budget.setupChosenCandidateTimeMsDistribution.p95Ms}ms, max=${budget.setupChosenCandidateTimeMsDistribution.maxMs}ms`);
  push(`  End-to-End solve() runtime: avg=${e2eSummary.runtime.avgMs.toFixed(1)}ms, median=${e2eSummary.runtime.medianMs}ms, p95=${e2eSummary.runtime.p95Ms}ms, max=${e2eSummary.runtime.maxMs}ms`);
  push();

  push("4. Capability Comparison (STEP3, Deliverable #4)");
  push(`  Recovery-level improvedRate: Baseline(useSetupReservedSlice=false)=${(recoveryImprovedRateBaseline * 100).toFixed(1)}% -> Candidate(=true)=${(recoveryImprovedRateCandidate * 100).toFixed(1)}% (delta=${((recoveryImprovedRateCandidate - recoveryImprovedRateBaseline) * 100).toFixed(1)}pp)`);
  push(`  End-to-End real solve(): Improved=${(e2eSummary.improvedRate * 100).toFixed(1)}%, Solved=${(e2eSummary.solveRate * 100).toFixed(1)}%, RecoveryTriggered=${e2eSummary.recoveryTriggeredCount}/${e2eSummary.n}, RecoverySucceeded=${e2eSummary.recoverySucceededCount}, SETUP chosen=${e2eSummary.setupChosenCount} (succeeded ${e2eSummary.setupSucceededCount}), DeadlineMissed=${e2eSummary.deadlineMissedCount}`);
  push();

  push("5. Regression Analysis (STEP4, Deliverable #5)");
  push(`  n=${regressionSummary.n}, casesWithSinglePassFlip=${regressionSummary.casesWithSinglePassFlip}, trueRegressionCount=${regressionSummary.trueRegressionCount}, falseRegressionCount=${regressionSummary.falseRegressionCount}`);
  for (const r of regressionPerCase.filter((r) => r.classification !== "NO_REGRESSION")) {
    push(`    ${r.label}: ${r.classification} (meanGap=${r.meanGap.toFixed(2)}, singlePassFlip=${r.singlePassFlipCount})`);
  }
  push();

  push("6. Primitive Interaction Matrix (STEP7, Deliverable #6)");
  for (const row of interaction.chosenTypeShares) {
    push(`  ${row.type}: Baseline ${row.baselineCount} (${(row.baselineShare * 100).toFixed(1)}%) -> Candidate ${row.candidateCount} (${(row.candidateShare * 100).toFixed(1)}%), delta=${row.shareDeltaPp.toFixed(1)}pp`);
  }
  push(`  Multi-offer rate (>=2 distinct types offered in same round): Baseline=${(interaction.baselineMultiOfferRate * 100).toFixed(1)}%, Candidate=${(interaction.candidateMultiOfferRate * 100).toFixed(1)}%`);
  push(`  Starvation flags: ${interaction.starvationFlags.length ? interaction.starvationFlags.join(" / ") : "none"}`);
  push();

  push("7. Budget Utilization (STEP6, Deliverable #7)");
  push(`  SETUP chosen count=${budget.setupChosenCount}, avg Reserved Budget Utilization=${(budget.avgReservedBudgetUtilization * 100).toFixed(1)}%, Timeout Rate(>=90% of 500ms)=${(budget.timeoutRate * 100).toFixed(1)}%`);
  push();

  push("8. Timeout Distribution (Deliverable #8)");
  push(`  See section 7 -- Timeout Rate ${(budget.timeoutRate * 100).toFixed(1)}% among SETUP-chosen rounds (n=${budget.setupChosenCount}).`);
  push();

  push("9. Runtime Distribution (Deliverable #9)");
  push("  See section 3.");
  push();

  push("10. Release Readiness Matrix (Deliverable #10)");
  for (const row of releaseReadiness.rows) {
    push(`  [${row.status}] ${row.criterion}`);
    push(`    ${row.evidence}`);
  }
  push();

  push("11. Final Decision (Deliverable #11)");
  push(`  Decision ${releaseReadiness.decision}: ${releaseReadiness.decisionRationale}`);
  push();

  push("12. Next Sprint Proposal (Deliverable #12)");
  if (releaseReadiness.decision === "A") {
    push("  SETUP Reserved Slice(500ms)를 Production Operating Contract로 확정. 다음 단계는 사용자가 제시한 로드맵대로 Production Validation(더 넓은 population/Standard Evaluation N>=30) -> Solver Completeness Validation v3.");
  } else if (releaseReadiness.decision === "B") {
    push("  Integration Refinement Sprint: OPEN_QUESTION으로 표시된 기준(Runtime/Scheduler 세부조정 또는 500ms 이상의 추가 Budget Sweep)을 좁혀서 재검증.");
  } else {
    push("  Architecture Revision Sprint: Shadow Scheduler와 실제 Production 간 재현 실패 또는 구조적 문제의 원인 규명.");
  }

  fs.writeFileSync(REPORT_PATH, lines.join("\n"));
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        recoveryImprovedRateBaseline,
        recoveryImprovedRateCandidate,
        regressionSummary,
        regressionPerCase,
        budget,
        interaction,
        e2eSummary,
        releaseReadiness,
      },
      null,
      2
    )
  );
  log(`report written: ${REPORT_PATH}`);

  if (fs.existsSync(RECOVERY_CHECKPOINT_PATH)) fs.unlinkSync(RECOVERY_CHECKPOINT_PATH);
  if (fs.existsSync(E2E_CHECKPOINT_PATH)) fs.unlinkSync(E2E_CHECKPOINT_PATH);
  log("done, checkpoints cleaned up");
}

main();
