// Mixed Commutator Production Validation Sprint v1 -- driver.
//   npx tsx src/customCube/runMixedCommutatorProductionValidationSprintV1.ts
//
// Validation Sprint (NO Production code modification -- 실행/측정/통계분석/
// 로그분석만 허용): measures whether the Mixed Commutator Production
// Integration Sprint v1's changes make the real, current production Solver
// a statistically better Production Solver than the pre-integration
// Baseline, across all 142 real hole-dataset cases, N=10 repeats.
//
// Revision note: the first full run (see git history) used two flawed
// metrics -- (1) "Solve Rate" defined as a single Recovery candidate
// driving wrongWingCount to exactly 0 (near-impossible from these raw
// states, since a single Recovery step is one incremental fix, not a full
// re-solve -- see StatisticalSummary.ts's own improvedRateEvaluation
// comment for the corrected definition), and (2) MIXED_COMMUTATOR's "added
// cost" as a whole-call before/after diff (confounded by DISRUPT/SETUP's
// own independent stochastic search timing -- see
// RecoveryLayerCounterfactual.ts's mixedOwnMs comment for the corrected,
// isolated onEvent-based measurement). Both are fixed in this revision.
// The real end-to-end solve() Runtime summary (RQ-4's absolute numbers)
// from that first run remains valid (nothing about it was wrong) and is
// reused here from data/prior-e2e-runtime-summary.json rather than re-run.
import * as fs from "fs";
import { cloneCubies, type Cubie } from "./cubeState";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs } from "./coverageAtlas/HoleDatasetBuilder";
import { measureCounterfactual, type CounterfactualRow } from "./mixedCommutatorProductionValidation/RecoveryLayerCounterfactual";
import { buildContributionMatrix } from "./mixedCommutatorProductionValidation/ContributionMatrix";
import { classifyCapabilityDelta, summarizeCapabilityDelta } from "./mixedCommutatorProductionValidation/CapabilityDeltaClassification";
import { classifyRegressions, summarizeRegressions } from "./mixedCommutatorProductionValidation/RegressionClassification";
import { improvedRateEvaluation, fullySolvedRateEvaluation, wrongWingGapEvaluation, mixedOwnGenCostStats } from "./mixedCommutatorProductionValidation/StatisticalSummary";
import type { RuntimeSummary } from "./mixedCommutatorProductionValidation/RuntimeSummary";
import { assessRelease } from "./mixedCommutatorProductionValidation/ReleaseAssessment";

const DATA_DIR = "src/customCube/mixedCommutatorProductionValidation/data";
const REPORT_PATH = `${DATA_DIR}/mixed-commutator-production-validation-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/mixed-commutator-production-validation-v1-result.json`;
const PRIOR_E2E_PATH = `${DATA_DIR}/prior-e2e-runtime-summary.json`;
const CKPT_CF = `${DATA_DIR}/checkpoint-cf.json`;
const PRIMITIVE_SET_RESULT_PATH = "src/customCube/primitiveSetCompleteness/data/primitive-set-completeness-validation-v1-result.json";

const N_REPEATS = 10;
const CF_OUTER_DEADLINE_MS = 1000; // matches Blueprint/Integration Sprints' own convention

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

type PopTag = "PRIMARY" | "SECONDARY_ONLY" | "REGRESSION";

function loadPopulationTags(): (label: string) => PopTag {
  const priorResult = JSON.parse(fs.readFileSync(PRIMITIVE_SET_RESULT_PATH, "utf-8"));
  const residualClassified: { label: string; failureClass: string }[] = priorResult.residualClassified;
  const coverageRows: { label: string; unionCovered: boolean }[] = priorResult.coverageRows;
  const primaryLabels = new Set(residualClassified.filter((r) => r.failureClass === "PURE_CYCLE_ISOLATION").map((r) => r.label));
  const secondaryLabels = new Set(residualClassified.map((r) => r.label));
  return (label: string): PopTag => {
    if (primaryLabels.has(label)) return "PRIMARY";
    if (secondaryLabels.has(label)) return "SECONDARY_ONLY";
    return "REGRESSION";
  };
}

interface CFCheckpoint {
  completedKeys: string[];
  rows: CounterfactualRow[];
}

function loadCFCheckpoint(): CFCheckpoint {
  if (!fs.existsSync(CKPT_CF)) return { completedKeys: [], rows: [] };
  return JSON.parse(fs.readFileSync(CKPT_CF, "utf-8"));
}
function saveCFCheckpoint(c: CFCheckpoint) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CKPT_CF, JSON.stringify(c), "utf-8");
}

async function main() {
  const holes = loadRawHoleDataset();
  const libs = buildLibs();
  const tagOf = loadPopulationTags();

  const priorE2E = JSON.parse(fs.readFileSync(PRIOR_E2E_PATH, "utf-8"));
  const runtimeSummary: RuntimeSummary = priorE2E.runtimeSummary;
  log("e2e", `reusing already-valid real end-to-end Runtime summary from prior run (n=${runtimeSummary.n})`);

  // --- Recovery-layer counterfactual (Baseline vs Integrated), N repeats ---
  const cf = loadCFCheckpoint();
  const cfCompleted = new Set(cf.completedKeys);
  if (cf.completedKeys.length > 0) log("cf", `resuming: ${cf.completedKeys.length}/${holes.length * N_REPEATS} done`);
  let doneSinceSave = 0;
  for (const h of holes) {
    for (let r = 0; r < N_REPEATS; r++) {
      const key = `${h.label}#${r}`;
      if (cfCompleted.has(key)) continue;
      const clone = cloneCubies(h.cubies as Cubie[]);
      const row = measureCounterfactual(clone, h.label, tagOf(h.label), r, libs, CF_OUTER_DEADLINE_MS);
      cf.rows.push(row);
      cf.completedKeys.push(key);
      cfCompleted.add(key);
      doneSinceSave++;
      if (doneSinceSave >= 40) {
        saveCFCheckpoint(cf);
        doneSinceSave = 0;
        log("cf", `${cf.completedKeys.length}/${holes.length * N_REPEATS} done`);
      }
    }
  }
  saveCFCheckpoint(cf);
  log("cf", "done");

  // --- Analysis ---
  const rowsByLabel = new Map<string, CounterfactualRow[]>();
  for (const row of cf.rows) {
    const arr = rowsByLabel.get(row.label) ?? [];
    arr.push(row);
    rowsByLabel.set(row.label, arr);
  }

  const byPop = (tag: PopTag) => cf.rows.filter((r) => r.populationTag === tag);
  const primaryRows = byPop("PRIMARY");
  const allRows = cf.rows;

  const improvedRateAll = improvedRateEvaluation(allRows, N_REPEATS);
  const improvedRatePrimary = improvedRateEvaluation(primaryRows, N_REPEATS);
  const fullySolvedRateAll = fullySolvedRateEvaluation(allRows, N_REPEATS);
  const wrongWingGapAll = wrongWingGapEvaluation(allRows, N_REPEATS);

  const contributionMatrix = buildContributionMatrix(allRows);

  const capabilityDeltaRows = classifyCapabilityDelta(rowsByLabel);
  const capabilityDeltaSummary = summarizeCapabilityDelta(capabilityDeltaRows);

  const regressionRows = classifyRegressions(rowsByLabel);
  const regressionSummary = summarizeRegressions(regressionRows);

  const mixedGenCost = mixedOwnGenCostStats(allRows);

  const assessment = assessRelease(improvedRateAll, regressionSummary, runtimeSummary, mixedGenCost.mean);

  const lines: string[] = [];
  lines.push("Mixed Commutator Production Validation Sprint v1 -- Report (revised metrics)");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("1. Population");
  lines.push(`  n(all)=${holes.length}, n(PRIMARY)=${new Set(primaryRows.map((r) => r.label)).size}, repeats=${N_REPEATS}`);
  lines.push("");

  lines.push("2. RQ-1: Solve Rate == Recovery Improved Rate (paired-diff across N repeats, corrected metric)");
  lines.push(`  ALL population: meanDiff=${improvedRateAll.stats.mean.toFixed(3)}, stddev=${improvedRateAll.stats.stddev.toFixed(3)}, 95% CI=[${improvedRateAll.stats.ciLower.toFixed(3)}, ${improvedRateAll.stats.ciUpper.toFixed(3)}], cohensD=${improvedRateAll.effectSize.cohensD.toFixed(3)} (${improvedRateAll.effectSize.magnitude})`);
  lines.push(`  PRIMARY population: meanDiff=${improvedRatePrimary.stats.mean.toFixed(3)}, stddev=${improvedRatePrimary.stats.stddev.toFixed(3)}, 95% CI=[${improvedRatePrimary.stats.ciLower.toFixed(3)}, ${improvedRatePrimary.stats.ciUpper.toFixed(3)}], cohensD=${improvedRatePrimary.effectSize.cohensD.toFixed(3)} (${improvedRatePrimary.effectSize.magnitude})`);
  lines.push(`  wrongWingCount mean gap (Integrated-Baseline, ALL): ${wrongWingGapAll.stats.mean.toFixed(4)} (95% CI=[${wrongWingGapAll.stats.ciLower.toFixed(4)}, ${wrongWingGapAll.stats.ciUpper.toFixed(4)}])`);
  lines.push(`  [informational only, NOT used for Release Assessment] Fully-solved-to-zero rate diff: meanDiff=${fullySolvedRateAll.stats.mean.toFixed(3)} (95% CI=[${fullySolvedRateAll.stats.ciLower.toFixed(3)}, ${fullySolvedRateAll.stats.ciUpper.toFixed(3)}]) -- near-zero by construction, a single Recovery candidate essentially never fully solves a 9-10 wrongWing raw state`);
  lines.push("");

  lines.push("3. RQ-2: Primitive Contribution Matrix (Solved/Unique/Shared, case-repeats out of " + allRows.length + ")");
  for (const row of contributionMatrix) {
    lines.push(`  ${row.primitive}: solved=${row.solved}, unique=${row.unique}, shared=${row.shared}`);
  }
  lines.push("");

  lines.push("4. RQ-3: Regression (True vs False, per-case across N=" + N_REPEATS + " repeats)");
  lines.push(`  n(cases)=${regressionSummary.n}, casesWithSinglePassFlip=${regressionSummary.casesWithSinglePassFlip}, trueRegressionCount=${regressionSummary.trueRegressionCount}, falseRegressionCount=${regressionSummary.falseRegressionCount}`);
  lines.push("");

  lines.push("5. RQ-4: Runtime");
  lines.push(`  Real end-to-end solve() (Integrated arm, n=${runtimeSummary.n}, reused from prior run -- unaffected by the metric fix): meanMs=${runtimeSummary.meanMs.toFixed(1)}, p95Ms=${runtimeSummary.p95Ms.toFixed(1)}, maxMs=${runtimeSummary.maxMs.toFixed(1)}, timeoutRate=${(runtimeSummary.timeoutRate * 100).toFixed(1)}% (pre-existing "worstCase"-snapshot characteristic, not a Release gate)`);
  lines.push(`  MIXED_COMMUTATOR's own ISOLATED generation cost (onEvent start->end, corrected -- not a whole-call diff): mean=${mixedGenCost.mean.toFixed(1)}ms, stddev=${mixedGenCost.stddev.toFixed(1)}ms, n=${mixedGenCost.n} (budget=300ms)`);
  lines.push("");

  lines.push("6. RQ-5: Capability Delta Classification");
  lines.push(`  n=${capabilityDeltaSummary.n}, ONLY_EXISTING=${capabilityDeltaSummary.ONLY_EXISTING}, ONLY_MIXED=${capabilityDeltaSummary.ONLY_MIXED}, BOTH=${capabilityDeltaSummary.BOTH}, NONE=${capabilityDeltaSummary.NONE}`);
  lines.push("");

  lines.push("7. Release Assessment (Deliverable #6)");
  lines.push(`  decision=${assessment.decision}`);
  lines.push(`  decisionLabel=${assessment.decisionLabel}`);
  lines.push(`  solveRateIncreased=${assessment.solveRateIncreased}, noTrueRegression=${assessment.noTrueRegression}, runtimeAcceptable=${assessment.runtimeAcceptable}`);
  lines.push(`  statisticalNote: ${assessment.statisticalNote}`);
  lines.push(`  runtimeNote: ${assessment.runtimeNote}`);
  lines.push(`  rationale: ${assessment.rationale}`);
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        improvedRateAll,
        improvedRatePrimary,
        fullySolvedRateAll,
        wrongWingGapAll,
        contributionMatrix,
        regressionSummary,
        regressionRows,
        runtimeSummary,
        mixedGenCost,
        capabilityDeltaSummary,
        capabilityDeltaRows,
        assessment,
        rawCounterfactualRows: cf.rows,
      },
      null,
      2
    ),
    "utf-8"
  );
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(report);

  if (fs.existsSync(CKPT_CF)) fs.unlinkSync(CKPT_CF);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
