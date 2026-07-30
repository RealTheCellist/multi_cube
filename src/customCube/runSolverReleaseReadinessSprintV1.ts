// Solver Release Readiness Validation Sprint v1 -- driver.
//   npx tsx src/customCube/runSolverReleaseReadinessSprintV1.ts
//
// Read-only Release Validation. No production code is touched by this
// Sprint (see solverReleaseReadiness/ContractAudit.ts -- every Operating
// Contract confirmed unchanged from its own dedicated integration Sprint).
// The ENDGAME Budget axis (250ms current vs 450ms pre-Finalization
// reconstruction) is measured fresh at N=30 trials over the full 142-case
// Hole Dataset via recoveryReserveMsOverride, an existing optional
// parameter on FiveByFiveEdgeSolverEngine.solve() (threaded through
// unchanged since Production Integration Finalization Sprint v1) -- not a
// new parameter, not a production code change. The "integrated" arm of
// every trial IS today's real production (all four Operating Contracts
// simultaneously active, since none of the other three expose an
// Executor-level override toggle anymore and none were touched), so this
// single N=30 run doubles as the fresh "whole product, right now"
// Capability/Runtime/Primitive-Interaction snapshot (STEP2/3/4) the
// Directive's own background section says has never been measured before.
import * as fs from "fs";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { auditContracts } from "./solverReleaseReadiness/ContractAudit";
import { runOneEndgameTrial, summarizeEndgameTrial, evaluateEndgameAxis, type EndgameTrialAggregate } from "./solverReleaseReadiness/EndgameAxisValidation";
import { summarizePrimitiveInteraction } from "./solverReleaseReadiness/PrimitiveInteractionMatrix";
import { assembleReleaseDecisionMatrix } from "./solverReleaseReadiness/ReleaseDecisionMatrix";
import type { EndToEndSolveResult } from "./solverReleaseReadiness/EndToEndSolveProbe";

const DATA_DIR = "src/customCube/solverReleaseReadiness/data";
const REPORT_PATH = `${DATA_DIR}/solver-release-readiness-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/solver-release-readiness-v1-result.json`;
const CP_TRIALS = `${DATA_DIR}/checkpoint-trials.json`;
const CP_INTEGRATED = `${DATA_DIR}/checkpoint-integrated.json`;

const N_TRIALS = 30; // Directive STEP5: N>=30

function log(s: string) {
  console.log(`[${new Date().toISOString()}] ${s}`);
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dataset = loadRawHoleDataset();
  log(`init: ${dataset.length} Hole Dataset cases loaded`);

  // --- STEP1: Production Contract Audit (read-only, no runtime cost) ---
  const contractAudit = auditContracts();
  log(`STEP1 contract audit: ${contractAudit.filter((r) => r.status === "PASS").length}/${contractAudit.length} PASS`);

  // --- STEP2/3/4/5: ENDGAME axis N=30 trials, checkpointed per trial.
  // Each trial's own "integrated" array is also accumulated separately
  // (flattened across all trials) to serve as the fresh whole-population
  // Capability/Runtime/Primitive-Interaction snapshot. ---
  let trialAggregates: EndgameTrialAggregate[] = [];
  let allIntegrated: EndToEndSolveResult[] = [];
  if (fs.existsSync(CP_TRIALS)) {
    trialAggregates = JSON.parse(fs.readFileSync(CP_TRIALS, "utf-8"));
    log(`trials: resumed checkpoint, ${trialAggregates.length}/${N_TRIALS} done`);
  }
  if (fs.existsSync(CP_INTEGRATED)) {
    allIntegrated = JSON.parse(fs.readFileSync(CP_INTEGRATED, "utf-8"));
  }
  for (let t = trialAggregates.length; t < N_TRIALS; t++) {
    log(`trial ${t + 1}/${N_TRIALS}...`);
    const { baseline, integrated } = runOneEndgameTrial(dataset);
    trialAggregates.push(summarizeEndgameTrial(baseline, integrated));
    allIntegrated.push(...integrated);
    fs.writeFileSync(CP_TRIALS, JSON.stringify(trialAggregates));
    fs.writeFileSync(CP_INTEGRATED, JSON.stringify(allIntegrated));
  }
  log("trials: done");

  const endgameAxis = evaluateEndgameAxis(trialAggregates);
  const primitiveInteraction = summarizePrimitiveInteraction(allIntegrated);

  // --- STEP6: Release Decision Matrix ---
  const decisionMatrix = assembleReleaseDecisionMatrix(contractAudit, endgameAxis, primitiveInteraction, allIntegrated, dataset.length);

  // --- Report ---
  const lines: string[] = [];
  const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));

  push("Solver Release Readiness Validation Sprint v1 -- Report");
  push(`Generated: ${new Date().toISOString()}`);
  push(`Population: ENDGAME axis trials n=${dataset.length}x${N_TRIALS} (both arms); combined "integrated" snapshot n=${allIntegrated.length}`);
  push();

  push("1. Production Contract Audit (Deliverable #1)");
  for (const row of contractAudit) {
    push(`  [${row.status}] ${row.contract}`);
    push(`    expected=${row.expected}`);
    push(`    actual=${row.actual}`);
  }
  push();

  push("2. Capability Validation (Deliverable #2)");
  const improvedCount = allIntegrated.filter((r) => r.improved).length;
  const solvedCount = allIntegrated.filter((r) => r.solved).length;
  push(`  n=${allIntegrated.length}: Improved=${improvedCount} (${((improvedCount / allIntegrated.length) * 100).toFixed(1)}%), Solved=${solvedCount} (${((solvedCount / allIntegrated.length) * 100).toFixed(1)}%)`);
  push(
    `  ENDGAME axis paired-diff (Integrated-Baseline, per trial, N=${endgameAxis.nTrials}): improvedCountDiff mean=${endgameAxis.improvedCountDiff.stats.mean.toFixed(
      2
    )}, 95% CI=[${endgameAxis.improvedCountDiff.stats.ciLower.toFixed(2)}, ${endgameAxis.improvedCountDiff.stats.ciUpper.toFixed(2)}], Cohen's d_z=${endgameAxis.improvedCountDiff.effectSize.cohensD.toFixed(
      2
    )}(${endgameAxis.improvedCountDiff.effectSize.magnitude}), Majority Vote=${(endgameAxis.improvedCountDiff.majorityVoteRate * 100).toFixed(1)}%`
  );
  push(
    `  solvedCountDiff mean=${endgameAxis.solvedCountDiff.stats.mean.toFixed(2)}, 95% CI=[${endgameAxis.solvedCountDiff.stats.ciLower.toFixed(2)}, ${endgameAxis.solvedCountDiff.stats.ciUpper.toFixed(2)}]`
  );
  push(`  True Regression per trial: ${endgameAxis.trueRegressionCounts.join(", ")}`);
  push();

  push("3. Runtime Validation (Deliverable #3)");
  const wallMsSorted = [...allIntegrated.map((r) => r.wallMs)].sort((a, b) => a - b);
  const avgMs = wallMsSorted.reduce((a, b) => a + b, 0) / wallMsSorted.length;
  const medianMs = wallMsSorted[Math.floor(wallMsSorted.length / 2)];
  const p95Ms = wallMsSorted[Math.min(wallMsSorted.length - 1, Math.floor(wallMsSorted.length * 0.95))];
  const maxMs = wallMsSorted[wallMsSorted.length - 1];
  const deadlineMissCount = allIntegrated.filter((r) => r.deadlineMissed).length;
  push(`  avg=${avgMs.toFixed(1)}ms, median=${medianMs}ms, p95=${p95Ms}ms, max=${maxMs}ms`);
  push(`  Deadline Miss=${deadlineMissCount}/${allIntegrated.length} (${((deadlineMissCount / allIntegrated.length) * 100).toFixed(1)}%)`);
  push(
    `  ENDGAME axis Runtime diff (Integrated-Baseline, per trial avg): mean=${endgameAxis.runtimeDiffMs.stats.mean.toFixed(1)}ms, 95% CI=[${endgameAxis.runtimeDiffMs.stats.ciLower.toFixed(
      1
    )}, ${endgameAxis.runtimeDiffMs.stats.ciUpper.toFixed(1)}]`
  );
  push(
    `  Deadline Miss diff (pp): mean=${endgameAxis.deadlineMissDiffPp.stats.mean.toFixed(2)}, 95% CI=[${endgameAxis.deadlineMissDiffPp.stats.ciLower.toFixed(2)}, ${endgameAxis.deadlineMissDiffPp.stats.ciUpper.toFixed(2)}]`
  );
  push();

  push("4. Primitive Interaction Matrix (Deliverable #4)");
  push("  Task-layer (real production SolveTaskType -- PAIR/FLIP/PARITY/ENDGAME):");
  for (const t of primitiveInteraction.taskStats) {
    push(`    ${t.taskType}: planned=${t.plannedCount}, completed=${t.completedCount}, successRate=${(t.successRate * 100).toFixed(1)}%`);
  }
  push("  Recovery-layer (real production RecoveryType -- DISRUPT/SETUP/REPAIR/CCR/MIXED_COMMUTATOR):");
  for (const r of primitiveInteraction.recoveryStats) {
    push(
      `    ${r.recoveryType}: offered=${r.offeredCount}, chosen=${r.chosenCount}, chosenRate=${(r.chosenRate * 100).toFixed(1)}%, successRateWhenChosen=${(r.successRateWhenChosen * 100).toFixed(
        1
      )}%, duplicate=${r.duplicateCount}, starved=${r.starved}`
    );
  }
  push(
    `  recoveryTriggered=${primitiveInteraction.recoveryTriggeredCount}, noCandidates=${primitiveInteraction.recoveryNoCandidatesCount}, loopDetected=${primitiveInteraction.recoveryLoopDetectedCount}`
  );
  push();

  push("5. Statistical Validation (Deliverable #5)");
  push(`  N=${endgameAxis.nTrials} trials (ENDGAME axis, this Sprint's own fresh measurement)`);
  push(`  Scheduler axis: N=30 (Scheduler Production Integration Sprint v1, cited -- production code confirmed unchanged since)`);
  push(`  Production Integration Finalization Sprint v1 (combined ENDGAME+Incremental Recovery+CCR): N=30, cited`);
  push();

  push("6. Release Decision Matrix (Deliverable #6)");
  for (const row of decisionMatrix.rows) {
    push(`  [Level ${row.level}][${row.status}] ${row.criterion}`);
    push(`    ${row.evidence}`);
  }
  push();
  push(`Final Decision (Deliverable #8): ${decisionMatrix.decision} -- ${decisionMatrix.decisionRationale}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"));
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        contractAudit,
        endgameAxis,
        primitiveInteraction,
        capability: { n: allIntegrated.length, improvedCount, solvedCount },
        runtime: { avgMs, medianMs, p95Ms, maxMs, deadlineMissCount, n: allIntegrated.length },
        decisionMatrix,
      },
      null,
      2
    )
  );
  log(`report written: ${REPORT_PATH}`);

  for (const cp of [CP_TRIALS, CP_INTEGRATED]) {
    if (fs.existsSync(cp)) fs.unlinkSync(cp);
  }
  log("done, checkpoints cleaned up");
}

main();
