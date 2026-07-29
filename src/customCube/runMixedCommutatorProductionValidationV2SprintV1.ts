// Mixed Commutator Production Validation Sprint v2 -- driver.
//   npx tsx src/customCube/runMixedCommutatorProductionValidationV2SprintV1.ts
//
// Production Validation Sprint (NO code modification -- 실행/측정/통계분석만
// 허용): re-validates Release fitness against the CURRENT production Gate
// (Gate C, wired in by Gate Production Integration Sprint v1), comparing it
// against a shadow-reconstructed Gate A baseline (the pre-integration
// Gate), across all 142 real hole-dataset cases x N=10 repeats. Also runs
// a real end-to-end solve() pass (reusing EndToEndValidationProbe.ts
// UNMODIFIED from Validation v1 -- it automatically reflects Gate C now,
// since the Gate itself lives in production code, not a parameter).
import * as fs from "fs";
import { cloneCubies, type Cubie } from "./cubeState";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs } from "./coverageAtlas/HoleDatasetBuilder";
import { measureCase, type CaseMeasurement, type PopulationTag } from "./mixedCommutatorProductionValidationV2/CaseMeasurement";
import { endToEndValidationProbe, type ValidationSolveResult } from "./mixedCommutatorProductionValidation/EndToEndValidationProbe";
import { improvedRateEvaluation, wrongWingGapEvaluation } from "./mixedCommutatorProductionValidationV2/StatisticalSummary";
import { buildContributionMatrix } from "./mixedCommutatorProductionValidationV2/ContributionMatrix";
import { classifyCapabilityDelta, summarizeCapabilityDelta } from "./mixedCommutatorProductionValidationV2/CapabilityDeltaClassification";
import { classifyRegressions, summarizeRegressions } from "./mixedCommutatorProductionValidationV2/RegressionClassification";
import { summarizeSolveRuntime, summarizeMixedGenCost } from "./mixedCommutatorProductionValidationV2/RuntimeSummary";
import { assessRelease } from "./mixedCommutatorProductionValidationV2/ReleaseAssessment";

const DATA_DIR = "src/customCube/mixedCommutatorProductionValidationV2/data";
const REPORT_PATH = `${DATA_DIR}/mixed-commutator-production-validation-v2-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/mixed-commutator-production-validation-v2-result.json`;
const CKPT_CASE_PATH = `${DATA_DIR}/checkpoint-case.json`;
const CKPT_E2E_PATH = `${DATA_DIR}/checkpoint-e2e.json`;
const PRIMITIVE_SET_RESULT_PATH = "src/customCube/primitiveSetCompleteness/data/primitive-set-completeness-validation-v1-result.json";

const N_REPEATS = 10;

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

function loadPopulationTags(): (label: string) => PopulationTag {
  const priorResult = JSON.parse(fs.readFileSync(PRIMITIVE_SET_RESULT_PATH, "utf-8"));
  const residualClassified: { label: string; failureClass: string }[] = priorResult.residualClassified;
  const primaryLabels = new Set(residualClassified.filter((r) => r.failureClass === "PURE_CYCLE_ISOLATION").map((r) => r.label));
  const secondaryLabels = new Set(residualClassified.map((r) => r.label));
  return (label: string): PopulationTag => {
    if (primaryLabels.has(label)) return "PRIMARY";
    if (secondaryLabels.has(label)) return "SECONDARY_ONLY";
    return "REGRESSION";
  };
}

interface CaseCheckpoint {
  completedLabels: string[];
  cases: CaseMeasurement[];
}
function loadCaseCheckpoint(): CaseCheckpoint {
  if (!fs.existsSync(CKPT_CASE_PATH)) return { completedLabels: [], cases: [] };
  return JSON.parse(fs.readFileSync(CKPT_CASE_PATH, "utf-8"));
}
function saveCaseCheckpoint(c: CaseCheckpoint) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CKPT_CASE_PATH, JSON.stringify(c), "utf-8");
}

interface E2ECheckpoint {
  completedLabels: string[];
  results: ValidationSolveResult[];
}
function loadE2ECheckpoint(): E2ECheckpoint {
  if (!fs.existsSync(CKPT_E2E_PATH)) return { completedLabels: [], results: [] };
  return JSON.parse(fs.readFileSync(CKPT_E2E_PATH, "utf-8"));
}
function saveE2ECheckpoint(c: E2ECheckpoint) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CKPT_E2E_PATH, JSON.stringify(c), "utf-8");
}

async function main() {
  const holes = loadRawHoleDataset();
  const libs = buildLibs();
  const tagOf = loadPopulationTags();

  // --- Phase 1: real end-to-end solve() (current production == Gate C) ---
  const e2e = loadE2ECheckpoint();
  const e2eCompleted = new Set(e2e.completedLabels);
  if (e2eCompleted.size > 0) log("e2e", `resuming: ${e2eCompleted.size}/${holes.length}`);
  for (const h of holes) {
    if (e2eCompleted.has(h.label)) continue;
    const result = endToEndValidationProbe(cloneCubies(h.cubies as Cubie[]), h.label);
    e2e.results.push(result);
    e2e.completedLabels.push(h.label);
    e2eCompleted.add(h.label);
    if (e2eCompleted.size % 40 === 0) {
      saveE2ECheckpoint(e2e);
      log("e2e", `${e2eCompleted.size}/${holes.length} done`);
    }
  }
  saveE2ECheckpoint(e2e);
  log("e2e", "done");

  // --- Phase 2: Gate A (shadow) vs Gate C (real) counterfactual, N repeats ---
  const ckpt = loadCaseCheckpoint();
  const completed = new Set(ckpt.completedLabels);
  if (completed.size > 0) log("case", `resuming: ${completed.size}/${holes.length}`);
  for (const h of holes) {
    if (completed.has(h.label)) continue;
    const measurement = measureCase(cloneCubies(h.cubies as Cubie[]), h.label, tagOf(h.label), libs, libs.lib, N_REPEATS);
    ckpt.cases.push(measurement);
    ckpt.completedLabels.push(h.label);
    completed.add(h.label);
    if (completed.size % 10 === 0) {
      saveCaseCheckpoint(ckpt);
      log("case", `${completed.size}/${holes.length} done`);
    }
  }
  saveCaseCheckpoint(ckpt);
  log("case", "done, computing summaries");

  const byPop = (tag: PopulationTag) => ckpt.cases.filter((c) => c.populationTag === tag);
  const primaryCases = byPop("PRIMARY");

  const improvedRateAll = improvedRateEvaluation(ckpt.cases, N_REPEATS);
  const improvedRatePrimary = improvedRateEvaluation(primaryCases, N_REPEATS);
  const wrongWingGapAll = wrongWingGapEvaluation(ckpt.cases, N_REPEATS);

  const contributionMatrix = buildContributionMatrix(ckpt.cases);

  const capabilityDeltaRows = classifyCapabilityDelta(ckpt.cases);
  const capabilityDeltaSummary = summarizeCapabilityDelta(capabilityDeltaRows);

  const regressionRows = classifyRegressions(ckpt.cases);
  const regressionSummary = summarizeRegressions(regressionRows);

  const solveRuntime = summarizeSolveRuntime(e2e.results);
  const mixedGenCost = summarizeMixedGenCost(ckpt.cases);

  const assessment = assessRelease(improvedRateAll, regressionSummary, mixedGenCost, solveRuntime);

  const lines: string[] = [];
  lines.push("Mixed Commutator Production Validation Sprint v2 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`Population: n=${holes.length}, n(PRIMARY)=${primaryCases.length}, repeats=${N_REPEATS}`);
  lines.push(`Baseline = Gate A (shadow-reconstructed, pre-integration); Integrated = Gate C (REAL current production)`);
  lines.push("");

  lines.push("1. RQ-1: Improved Rate (paired-diff across N repeats, Integrated(GateC) - Baseline(GateA))");
  lines.push(`  ALL population: meanDiff=${improvedRateAll.stats.mean.toFixed(3)}, stddev=${improvedRateAll.stats.stddev.toFixed(3)}, 95% CI=[${improvedRateAll.stats.ciLower.toFixed(3)}, ${improvedRateAll.stats.ciUpper.toFixed(3)}], cohensD=${improvedRateAll.effectSize.cohensD.toFixed(3)} (${improvedRateAll.effectSize.magnitude})`);
  lines.push(`  PRIMARY population: meanDiff=${improvedRatePrimary.stats.mean.toFixed(3)}, stddev=${improvedRatePrimary.stats.stddev.toFixed(3)}, 95% CI=[${improvedRatePrimary.stats.ciLower.toFixed(3)}, ${improvedRatePrimary.stats.ciUpper.toFixed(3)}], cohensD=${improvedRatePrimary.effectSize.cohensD.toFixed(3)} (${improvedRatePrimary.effectSize.magnitude})`);
  lines.push(`  wrongWingCount mean gap (Integrated-Baseline, ALL): ${wrongWingGapAll.stats.mean.toFixed(4)} (95% CI=[${wrongWingGapAll.stats.ciLower.toFixed(4)}, ${wrongWingGapAll.stats.ciUpper.toFixed(4)}])`);
  lines.push("");

  lines.push("2. RQ-2/Primitive Contribution (case-repeats out of " + ckpt.cases.length * N_REPEATS + ", Gate C / Integrated arm)");
  for (const row of contributionMatrix) {
    lines.push(`  ${row.primitive}: solved=${row.solved}, unique=${row.unique}, shared=${row.shared}`);
  }
  lines.push(`  Capability Delta: n=${capabilityDeltaSummary.n}, ONLY_EXISTING=${capabilityDeltaSummary.ONLY_EXISTING}, ONLY_MIXED=${capabilityDeltaSummary.ONLY_MIXED}, BOTH=${capabilityDeltaSummary.BOTH}, NONE=${capabilityDeltaSummary.NONE}`);
  lines.push("");

  lines.push("3. RQ-3: Regression (True vs False, N=" + N_REPEATS + " repeats per case)");
  lines.push(`  n(cases)=${regressionSummary.n}, casesWithSinglePassFlip=${regressionSummary.casesWithSinglePassFlip}, trueRegressionCount=${regressionSummary.trueRegressionCount}, falseRegressionCount=${regressionSummary.falseRegressionCount}`);
  lines.push("");

  lines.push("4. RQ-4: Runtime");
  lines.push(`  Real end-to-end solve() (current production == Gate C, n=${solveRuntime.n}): meanMs=${solveRuntime.meanMs.toFixed(1)}, p95Ms=${solveRuntime.p95Ms.toFixed(1)}, maxMs=${solveRuntime.maxMs.toFixed(1)}, timeoutRate=${(solveRuntime.timeoutRate * 100).toFixed(1)}% (pre-existing "worstCase"-snapshot characteristic, informational)`);
  lines.push(`  MIXED_COMMUTATOR's own isolated generation cost: mean=${mixedGenCost.mean.toFixed(1)}ms, stddev=${mixedGenCost.stddev.toFixed(1)}ms (budget=300ms)`);
  lines.push("");

  lines.push("5. RQ-5 / Release Assessment (Deliverable)");
  lines.push(`  decision=${assessment.decision}`);
  lines.push(`  decisionLabel=${assessment.decisionLabel}`);
  lines.push(`  improvedRateIncreased=${assessment.improvedRateIncreased}, ciSupportsImprovement=${assessment.ciSupportsImprovement}, noTrueRegression=${assessment.noTrueRegression}, runtimeAcceptable=${assessment.runtimeAcceptable}`);
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
        wrongWingGapAll,
        contributionMatrix,
        capabilityDeltaSummary,
        capabilityDeltaRows,
        regressionSummary,
        regressionRows,
        solveRuntime,
        mixedGenCost,
        assessment,
      },
      null,
      2
    ),
    "utf-8"
  );
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(report);

  if (fs.existsSync(CKPT_CASE_PATH)) fs.unlinkSync(CKPT_CASE_PATH);
  if (fs.existsSync(CKPT_E2E_PATH)) fs.unlinkSync(CKPT_E2E_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
