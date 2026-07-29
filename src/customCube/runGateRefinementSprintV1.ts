// Gate Refinement Sprint v1 -- driver.
//   npx tsx src/customCube/runGateRefinementSprintV1.ts
//
// Production-safe Parameter Validation (NO Recovery/Prototype/Planner/
// Executor/Evaluator modification -- only the Gate CONDITION is varied, via
// shadow evaluation): compares 5 candidate Gates (A=current production,
// B=cycle relaxed, C=conflict relaxed, D=cycle+conflict relaxed, E=maximum
// relaxation) across all 142 real hole-dataset cases, using the REAL,
// unmodified chooseBestRecovery() to simulate what Recovery would actually
// pick under each Gate.
import * as fs from "fs";
import { cloneCubies, type Cubie } from "./cubeState";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs } from "./coverageAtlas/HoleDatasetBuilder";
import { measureCase, type CaseMeasurement, type PopulationTag } from "./gateRefinement/GateCaseMeasurement";
import { GATE_DEFINITIONS } from "./gateRefinement/GateDefinitions";
import { summarizeGate } from "./gateRefinement/GateComparisonSummary";
import { computeRecoveryRatio } from "./gateRefinement/RecoveryRatio";
import { decideGate, pickFinalRecommendedGate } from "./gateRefinement/GateDecision";
import { measureShadowEvaluation, summarizeShadowEvaluation } from "./mixedCommutatorOpportunityAnalysis/ShadowEvaluation";

const DATA_DIR = "src/customCube/gateRefinement/data";
const REPORT_PATH = `${DATA_DIR}/gate-refinement-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/gate-refinement-v1-result.json`;
const CKPT_PATH = `${DATA_DIR}/checkpoint.json`;
const PRIMITIVE_SET_RESULT_PATH = "src/customCube/primitiveSetCompleteness/data/primitive-set-completeness-validation-v1-result.json";

const N_REPEATS = 10;

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

function loadPopulationTags(): (label: string) => PopulationTag {
  const priorResult = JSON.parse(fs.readFileSync(PRIMITIVE_SET_RESULT_PATH, "utf-8"));
  const residualClassified: { label: string; failureClass: string }[] = priorResult.residualClassified;
  const coverageRows: { label: string; unionCovered: boolean }[] = priorResult.coverageRows;
  const primaryLabels = new Set(residualClassified.filter((r) => r.failureClass === "PURE_CYCLE_ISOLATION").map((r) => r.label));
  const secondaryLabels = new Set(residualClassified.map((r) => r.label));
  return (label: string): PopulationTag => {
    if (primaryLabels.has(label)) return "PRIMARY";
    if (secondaryLabels.has(label)) return "SECONDARY_ONLY";
    return "REGRESSION";
  };
}

interface Checkpoint {
  completedLabels: string[];
  cases: CaseMeasurement[];
}
function loadCheckpoint(): Checkpoint {
  if (!fs.existsSync(CKPT_PATH)) return { completedLabels: [], cases: [] };
  return JSON.parse(fs.readFileSync(CKPT_PATH, "utf-8"));
}
function saveCheckpoint(c: Checkpoint) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CKPT_PATH, JSON.stringify(c), "utf-8");
}

async function main() {
  const holes = loadRawHoleDataset();
  const libs = buildLibs();
  const tagOf = loadPopulationTags();

  const ckpt = loadCheckpoint();
  const completed = new Set(ckpt.completedLabels);
  if (completed.size > 0) log("main", `resuming: ${completed.size}/${holes.length} done`);

  for (const h of holes) {
    if (completed.has(h.label)) continue;
    const cubies = h.cubies as Cubie[];
    const measurement = measureCase(cloneCubies(cubies), h.label, tagOf(h.label), libs, libs.lib, N_REPEATS);
    ckpt.cases.push(measurement);
    ckpt.completedLabels.push(h.label);
    completed.add(h.label);
    if (completed.size % 10 === 0) {
      saveCheckpoint(ckpt);
      log("main", `${completed.size}/${holes.length} done`);
    }
  }
  saveCheckpoint(ckpt);
  log("main", "done, computing summaries");

  // Potentially Solvable, reused from Opportunity Analysis Sprint's own
  // established, deterministic Shadow Evaluation (Gate entirely bypassed).
  let potentiallySolvableCases = 0;
  for (const h of holes) {
    const row = measureShadowEvaluation(cloneCubies(h.cubies as Cubie[]), h.label, tagOf(h.label), libs.lib);
    if (row.shadowSolvable) potentiallySolvableCases++;
  }

  const summaries = GATE_DEFINITIONS.map((g) => summarizeGate(g.id, ckpt.cases));
  const baseline = summaries.find((s) => s.gateId === "A")!;
  const ratios = summaries.map((s) => computeRecoveryRatio(s, potentiallySolvableCases));
  const baselineRatio = ratios.find((r) => r.gateId === "A")!;
  const decisions = summaries.map((s) => decideGate(s, baseline, ratios.find((r) => r.gateId === s.gateId)!, baselineRatio));
  const finalRecommended = pickFinalRecommendedGate(decisions, summaries);

  const lines: string[] = [];
  lines.push("Gate Refinement Sprint v1 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`Population: n=${holes.length}, repeats=${N_REPEATS}, PotentiallySolvable (Shadow, Gate-bypassed)=${potentiallySolvableCases}`);
  lines.push("");

  lines.push("1. Gate Funnel Comparison (RQ-1, Eligible/Generated -- repeat-independent, Mixed Commutator itself deterministic)");
  for (const g of GATE_DEFINITIONS) {
    const s = summaries.find((x) => x.gateId === g.id)!;
    lines.push(`  Gate ${g.id} (${g.name}): ${g.description}`);
    lines.push(`    eligibleCases=${s.eligibleCases}, generatedCases=${s.generatedCases}`);
  }
  lines.push("");

  lines.push("2. Capability Comparison (RQ-2, aggregated across " + N_REPEATS + " repeats x cases -- real chooseBestRecovery() winner)");
  for (const s of summaries) {
    lines.push(`  Gate ${s.gateId}: mixedChosenCount=${s.mixedChosenCount}, improvedByMixedCount=${s.improvedByMixedCount}, uniqueCapabilityCases=${s.uniqueCapabilityCases}`);
  }
  lines.push("");

  lines.push("3. Runtime Comparison (RQ-4, Mixed's own generation wall-ms, only counted when eligible)");
  for (const s of summaries) {
    lines.push(`  Gate ${s.gateId}: n=${s.runtimeStats.n}, mean=${s.runtimeStats.mean.toFixed(1)}ms, stddev=${s.runtimeStats.stddev.toFixed(1)}ms, timeoutCount=${s.timeoutCount}`);
  }
  lines.push("");

  lines.push("4. Regression Report (RQ-3, True Regression -- mean wrongWingAfter >0.5 worse than Gate A, per case across repeats)");
  for (const s of summaries) {
    lines.push(`  Gate ${s.gateId}: trueRegressionCount=${s.trueRegressionCount}`);
  }
  lines.push("");

  lines.push("5. Recovery Ratio Report (Improved / PotentiallySolvable=" + potentiallySolvableCases + ")");
  for (const r of ratios) {
    lines.push(`  Gate ${r.gateId}: improvedCaseRepeats=${r.improvedCaseRepeats}, recoveryRatio=${r.recoveryRatio.toFixed(4)}`);
  }
  lines.push("");

  lines.push("6. Gate Decision (Success Criteria, Section 7)");
  for (const d of decisions) {
    lines.push(`  Gate ${d.gateId}: conclusion=${d.conclusion}`);
    lines.push(`    improvedDelta=${d.improvedDelta >= 0 ? "+" : ""}${d.improvedDelta}, regressionZero=${d.regressionZero}, runtimeAcceptable=${d.runtimeAcceptable}, recoveryRatioMeaningfullyIncreased=${d.recoveryRatioMeaningfullyIncreased}`);
    lines.push(`    rationale: ${d.rationale}`);
  }
  lines.push("");

  lines.push("7. Final Recommended Gate (Section 10)");
  if (finalRecommended) {
    const g = GATE_DEFINITIONS.find((x) => x.id === finalRecommended.gateId)!;
    lines.push(`  Gate ${finalRecommended.gateId} (${g.name}): ${g.description}`);
    lines.push(`  ${finalRecommended.rationale}`);
  } else {
    lines.push("  No candidate Gate satisfies Conclusion A's full criteria set -- current Gate A retained (or B if any candidate shows Improved increase with unresolved Regression/Runtime issues).");
  }
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        potentiallySolvableCases,
        summaries,
        ratios,
        decisions,
        finalRecommended,
        cases: ckpt.cases,
      },
      null,
      2
    ),
    "utf-8"
  );
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(report);

  if (fs.existsSync(CKPT_PATH)) fs.unlinkSync(CKPT_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
