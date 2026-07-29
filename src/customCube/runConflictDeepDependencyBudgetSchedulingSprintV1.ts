// CONFLICT_DEEP_DEPENDENCY Budget & Scheduling Validation Sprint v1 --
// driver.
//   npx tsx src/customCube/runConflictDeepDependencyBudgetSchedulingSprintV1.ts
//
// Read-only Research Sprint: no Primitive/Planner/Executor/Recovery/Gate/
// Evaluator modification. Measures whether Reserved-Slice scheduling for
// DISRUPT/SETUP (mirroring REPAIR/CCR/Mixed Commutator's own established
// reserved-slice pattern) would improve Recovery on the 16
// CONFLICT_DEEP_DEPENDENCY residuals found by CONFLICT_DEEP_DEPENDENCY
// Structural Mechanism Analysis Sprint v1 -- and whether doing so would
// regress the broader 142-case population.
import * as fs from "fs";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs, type HoleCase } from "./coverageAtlas/HoleDatasetBuilder";
import { measureCaseAtReservation, RESERVATION_SIZES_MS, SHADOW_REPEATS, type RepeatOutcome } from "./conflictDeepDependencyBudgetScheduling/ShadowScheduler";
import { summarizeAllArmsAtSize, type ArmSummaryAtSize } from "./conflictDeepDependencyBudgetScheduling/DoseResponseAnalysis";
import { buildBudgetAllocationMatrix, findBestConfiguration } from "./conflictDeepDependencyBudgetScheduling/BudgetAllocationMatrix";
import { classifyCaseRegression, summarizeRegression, type CaseRegressionResult } from "./conflictDeepDependencyBudgetScheduling/RegressionCheck";
import { recommendProduction } from "./conflictDeepDependencyBudgetScheduling/ProductionRecommendation";

const DATA_DIR = "src/customCube/conflictDeepDependencyBudgetScheduling/data";
const REPORT_PATH = `${DATA_DIR}/conflict-deep-dependency-budget-scheduling-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/conflict-deep-dependency-budget-scheduling-v1-result.json`;
const DOSE_CHECKPOINT_PATH = `${DATA_DIR}/checkpoint-dose.json`;
const REGRESSION_CHECKPOINT_PATH = `${DATA_DIR}/checkpoint-regression.json`;
const CONFLICT_V1_RESULT_PATH = "src/customCube/conflictDeepDependencyMechanismAnalysis/data/conflict-deep-dependency-mechanism-analysis-v1-result.json";

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

interface DoseCheckpointEntry {
  label: string;
  reservationMs: number;
  repeats: RepeatOutcome[];
}
function loadDoseCheckpoint(): { completedKeys: string[]; entries: DoseCheckpointEntry[] } {
  if (!fs.existsSync(DOSE_CHECKPOINT_PATH)) return { completedKeys: [], entries: [] };
  return JSON.parse(fs.readFileSync(DOSE_CHECKPOINT_PATH, "utf-8"));
}
function saveDoseCheckpoint(completedKeys: string[], entries: DoseCheckpointEntry[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DOSE_CHECKPOINT_PATH, JSON.stringify({ completedKeys, entries }), "utf-8");
}

interface RegressionCheckpointEntry {
  label: string;
  repeats: RepeatOutcome[];
}
function loadRegressionCheckpoint(): { completedLabels: string[]; entries: RegressionCheckpointEntry[] } {
  if (!fs.existsSync(REGRESSION_CHECKPOINT_PATH)) return { completedLabels: [], entries: [] };
  return JSON.parse(fs.readFileSync(REGRESSION_CHECKPOINT_PATH, "utf-8"));
}
function saveRegressionCheckpoint(completedLabels: string[], entries: RegressionCheckpointEntry[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REGRESSION_CHECKPOINT_PATH, JSON.stringify({ completedLabels, entries }), "utf-8");
}

async function main() {
  const conflictV1Result = JSON.parse(fs.readFileSync(CONFLICT_V1_RESULT_PATH, "utf-8"));
  const conflictLabels: string[] = conflictV1Result.conflictLabels;
  log("init", `${conflictLabels.length} CONFLICT_DEEP_DEPENDENCY labels loaded`);

  const holes: HoleCase[] = loadRawHoleDataset();
  const holeByLabel = new Map(holes.map((h) => [h.label, h]));
  const libs = buildLibs();

  // --- Phase 1: Dose-Response on the 16 CONFLICT_DEEP_DEPENDENCY cases ------
  log("dose", `measuring ${conflictLabels.length} cases x ${RESERVATION_SIZES_MS.length} sizes x N=${SHADOW_REPEATS} repeats...`);
  let { completedKeys, entries: doseEntries } = loadDoseCheckpoint();
  const completedKeySet = new Set(completedKeys);
  if (completedKeys.length > 0) log("dose", `resuming: ${completedKeys.length}/${conflictLabels.length * RESERVATION_SIZES_MS.length} done`);

  for (const label of conflictLabels) {
    const h = holeByLabel.get(label);
    if (!h) throw new Error(`label not found: ${label}`);
    for (const reservationMs of RESERVATION_SIZES_MS) {
      const key = `${label}@${reservationMs}`;
      if (completedKeySet.has(key)) continue;
      log("dose", `case ${label} @ ${reservationMs}ms...`);
      const repeats = measureCaseAtReservation(h.cubies, libs, reservationMs);
      doseEntries.push({ label, reservationMs, repeats });
      completedKeys.push(key);
      completedKeySet.add(key);
      saveDoseCheckpoint(completedKeys, doseEntries);
    }
  }
  log("dose", "done");

  const allSummaries: ArmSummaryAtSize[] = [];
  for (const reservationMs of RESERVATION_SIZES_MS) {
    const allRepeatsAtSize = doseEntries.filter((e) => e.reservationMs === reservationMs).flatMap((e) => e.repeats);
    allSummaries.push(...summarizeAllArmsAtSize(reservationMs, allRepeatsAtSize));
  }
  const budgetMatrix = buildBudgetAllocationMatrix(allSummaries, RESERVATION_SIZES_MS);
  const best = findBestConfiguration(allSummaries);
  if (!best) throw new Error("no best configuration found");
  const bestArmSummary = allSummaries.find((s) => s.arm === best.arm && s.reservationMs === best.reservationMs)!;
  const baselineSummaryAtBestSize = allSummaries.find((s) => s.arm === "BASELINE" && s.reservationMs === best.reservationMs)!;
  log("dose", `best configuration: ${best.arm} @ ${best.reservationMs}ms (improvedRate=${(best.improvedRate * 100).toFixed(1)}%)`);

  // --- Phase 2: Regression Check of the best configuration on all 142 cases -
  log("regression", `checking best config (${best.arm} @ ${best.reservationMs}ms) against all ${holes.length} cases...`);
  let { completedLabels: regDone, entries: regEntries } = loadRegressionCheckpoint();
  const regDoneSet = new Set(regDone);
  if (regDone.length > 0) log("regression", `resuming: ${regDone.length}/${holes.length} done`);
  for (const h of holes) {
    if (regDoneSet.has(h.label)) continue;
    const repeats = measureCaseAtReservation(h.cubies, libs, best.reservationMs);
    regEntries.push({ label: h.label, repeats });
    regDone.push(h.label);
    regDoneSet.add(h.label);
    saveRegressionCheckpoint(regDone, regEntries);
  }
  log("regression", "done");

  const caseRegressions: CaseRegressionResult[] = regEntries.map((e) => classifyCaseRegression(e.label, best.arm, e.repeats));
  const regressionSummary = summarizeRegression(caseRegressions);

  const recommendation = recommendProduction(baselineSummaryAtBestSize, best, bestArmSummary, regressionSummary);

  // --- Report -----------------------------------------------------------------
  const lines: string[] = [];
  lines.push("CONFLICT_DEEP_DEPENDENCY Budget & Scheduling Validation Sprint v1 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Population: n=${conflictLabels.length} (dose-response), n=${holes.length} (regression check)`);
  lines.push("");

  lines.push("1. Budget Allocation Matrix (Deliverable #1)");
  for (const row of budgetMatrix) {
    lines.push(`  reservationMs=${row.reservationMs}:`);
    for (const arm of Object.keys(row.byArm) as (keyof typeof row.byArm)[]) {
      const s = row.byArm[arm];
      lines.push(
        `    ${arm}: improvedRate=${(s.improvedRate * 100).toFixed(1)}% (${s.improvedCount}/${s.n}), onlyExisting=${s.onlyExisting}, onlyReserved=${s.onlyReserved}, both=${s.both}, none=${
          s.none
        }, avgElapsedMs=${s.avgElapsedMs.toFixed(1)}, budgetUtilization=${(s.avgBudgetUtilization * 100).toFixed(1)}%, timeoutRate=${(s.timeoutRate * 100).toFixed(1)}%`
      );
    }
  }
  lines.push("");

  lines.push("2. Reserved Slice Dose-Response (RQ-4, Deliverable #2)");
  lines.push(`  Best configuration: ${best.arm} @ ${best.reservationMs}ms (improvedRate=${(best.improvedRate * 100).toFixed(1)}%, timeoutRate=${(best.timeoutRate * 100).toFixed(1)}%)`);
  lines.push(`  Baseline @ same size: improvedRate=${(baselineSummaryAtBestSize.improvedRate * 100).toFixed(1)}%`);
  lines.push("");

  lines.push("3. Runtime Report (RQ-1/RQ-2/RQ-3)");
  for (const s of allSummaries) {
    lines.push(`  ${s.arm}@${s.reservationMs}ms: avgElapsedMs=${s.avgElapsedMs.toFixed(1)}, budgetUtilization=${(s.avgBudgetUtilization * 100).toFixed(1)}%, timeoutRate=${(s.timeoutRate * 100).toFixed(1)}%`);
  }
  lines.push("");

  lines.push("4. Regression Report (RQ-5, Deliverable #4)");
  lines.push(`  bestConfig=${best.arm}@${best.reservationMs}ms tested against n=${regressionSummary.n} cases`);
  lines.push(`  casesWithSinglePassFlip=${regressionSummary.casesWithSinglePassFlip}, trueRegressionCount=${regressionSummary.trueRegressionCount}, falseRegressionCount=${regressionSummary.falseRegressionCount}`);
  const trueRegressions = caseRegressions.filter((r) => r.classification === "TRUE_REGRESSION");
  if (trueRegressions.length > 0) {
    lines.push("  True Regressions:");
    for (const r of trueRegressions) lines.push(`    ${r.label}: meanGap=${r.meanGap.toFixed(2)} (baseline=${r.meanWrongWingAfterBaseline.toFixed(2)}, arm=${r.meanWrongWingAfterArm.toFixed(2)})`);
  }
  lines.push("");

  lines.push("5. Production Recommendation (Deliverable #5)");
  lines.push(`  conclusion=${recommendation.conclusion}`);
  lines.push(`  conclusionLabel=${recommendation.conclusionLabel}`);
  lines.push(`  rationale: ${recommendation.rationale}`);
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        conflictLabels,
        doseEntries,
        allSummaries,
        budgetMatrix,
        best,
        bestArmSummary,
        baselineSummaryAtBestSize,
        caseRegressions,
        regressionSummary,
        recommendation,
      },
      null,
      2
    ),
    "utf-8"
  );
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(report);

  if (fs.existsSync(DOSE_CHECKPOINT_PATH)) fs.unlinkSync(DOSE_CHECKPOINT_PATH);
  if (fs.existsSync(REGRESSION_CHECKPOINT_PATH)) fs.unlinkSync(REGRESSION_CHECKPOINT_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
