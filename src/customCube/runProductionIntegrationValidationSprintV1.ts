// Production Integration Validation Sprint v1 -- driver (differential-only,
// per explicit user direction: Level1/2/3 results from Production
// Integration Finalization Sprint v1 are cited, not re-computed; only the
// new deliverables this Directive adds -- Primitive Interaction Matrix,
// True/False Regression classification, System Stability -- are freshly
// measured here).
//
//   npx tsx src/customCube/runProductionIntegrationValidationSprintV1.ts [dbPath] [subsampleSize] [stabilitySampleSize]
import * as fs from "fs";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import type { FailureSnapshot } from "./failureAnalysis/failureTypes";
import { deserializeCube } from "./failureAnalysis/cubeSerialization";
import { endToEndSolveProbe, PRE_FINALIZATION_RECOVERY_RESERVE_MS, type EndToEndSolveResult } from "./productionIntegrationFinalization/EndToEndSolveProbe";
import { buildPrimitiveInteractionMatrix, ALL_PRIMITIVES } from "./productionIntegrationValidation/PrimitiveInteractionMatrix";
import { classifyAllFlipCases } from "./productionIntegrationValidation/RegressionClassifier";
import { measureSystemStability } from "./productionIntegrationValidation/SystemStability";
import { assembleReleaseReadinessMatrix, PRIOR_FINALIZATION_CITATION } from "./productionIntegrationValidation/ReleaseReadinessMatrix";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const SUBSAMPLE_SIZE = Number(process.argv[3] ?? 75);
const STABILITY_SAMPLE_SIZE = Number(process.argv[4] ?? 20);

const DATA_DIR = "src/customCube/productionIntegrationValidation/data";
const REPORT_PATH = `${DATA_DIR}/production-integration-validation-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/production-integration-validation-v1-result.json`;

function strideSample(items: readonly FailureSnapshot[], size: number): FailureSnapshot[] {
  if (items.length <= size) return [...items];
  const stride = items.length / size;
  const picked: FailureSnapshot[] = [];
  for (let i = 0; i < size; i++) picked.push(items[Math.floor(i * stride)]);
  return picked;
}

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

async function main() {
  const db = loadDatabase(dbPath);
  const allSnaps = allSnapshots(db);
  const subsample = strideSample(allSnaps, SUBSAMPLE_SIZE);
  const stabilitySample = strideSample(allSnaps, STABILITY_SAMPLE_SIZE);

  log("step1", `Fresh baseline/integrated pass over ${subsample.length}-snapshot stride-sample...`);
  const baseline: EndToEndSolveResult[] = subsample.map((s) => endToEndSolveProbe(deserializeCube(s.cubeState), s.hash, PRE_FINALIZATION_RECOVERY_RESERVE_MS));
  const integrated: EndToEndSolveResult[] = subsample.map((s) => endToEndSolveProbe(deserializeCube(s.cubeState), s.hash, undefined));
  log("step1", "done");

  log("step2", "Primitive Interaction Matrix (Integrated arm)...");
  const interactionMatrix = buildPrimitiveInteractionMatrix(integrated);
  log("step2", `done (${interactionMatrix.n} cases)`);

  log("step3", "True vs False Regression classification on flip cases...");
  const regressionClassification = classifyAllFlipCases(subsample, baseline, integrated);
  log(
    "step3",
    `done: ${regressionClassification.singlePassFlipCount} single-pass flips -> True=${regressionClassification.trueRegressionCount}, False=${regressionClassification.falseRegressionCount}`
  );

  log("step4", `System Stability over ${stabilitySample.length}-snapshot sample...`);
  const stability = measureSystemStability(stabilitySample);
  log("step4", "done");

  log("step5", "Release Readiness Matrix...");
  const readiness = assembleReleaseReadinessMatrix(interactionMatrix, regressionClassification, stability);
  log("step5", `Decision: ${readiness.decision}`);

  const lines: string[] = [];
  lines.push("Production Integration Validation Sprint v1 -- Report (differential-only)");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`1. Cited prior result: ${PRIOR_FINALIZATION_CITATION.sprintName}`);
  lines.push(
    `  Level1=${PRIOR_FINALIZATION_CITATION.level1Pass ? "PASS" : "FAIL"}, Level2=${PRIOR_FINALIZATION_CITATION.level2Pass ? "PASS" : "FAIL"}, Level3=${
      PRIOR_FINALIZATION_CITATION.level3Pass ? "PASS" : "FAIL"
    }, Decision=${PRIOR_FINALIZATION_CITATION.decision}`
  );
  lines.push(
    `  Primary mean=${PRIOR_FINALIZATION_CITATION.primaryMean}, 95% CI=[${PRIOR_FINALIZATION_CITATION.primary95CI[0]}, ${PRIOR_FINALIZATION_CITATION.primary95CI[1]}], Cohen's d=${PRIOR_FINALIZATION_CITATION.cohensD}, N=30-trial True Regression rate=${(
      PRIOR_FINALIZATION_CITATION.trueRegressionRateNTrialAvg * 100
    ).toFixed(2)}%`
  );
  lines.push("");

  lines.push(`2. Primitive Interaction Matrix (STEP2, n=${interactionMatrix.n} Integrated-arm cases, 8x8 co-occurrence)`);
  for (const row of ALL_PRIMITIVES) {
    const cells = ALL_PRIMITIVES.map((col) => {
      const cell = interactionMatrix.coOccurrence.find((c) => c.row === row && c.col === col);
      return `${col}=${cell?.coOccurrenceCount ?? 0}`;
    });
    lines.push(`  ${row}: ${cells.join(", ")}`);
  }
  lines.push("  Recovery chosen-when-both-offered:");
  for (const c of interactionMatrix.recoveryChosenWhenBothOffered) {
    lines.push(`    ${c.a} vs ${c.b}: bothOffered=${c.bothOfferedCount}, ${c.a}Won=${c.aWon}, ${c.b}Won=${c.bWon}, neitherWon=${c.neitherWon}`);
  }
  lines.push("  Task skip rate (planned - completed, root cause not attributable without new instrumentation):");
  for (const t of interactionMatrix.taskSkipRate) {
    lines.push(`    ${t.taskType}: planned=${t.plannedCount}, completed=${t.completedCount}, skipRate=${(t.skipRate * 100).toFixed(1)}%`);
  }
  lines.push("");

  lines.push(`3. True vs False Regression (STEP3, N=${regressionClassification.classifications.length ? 10 : 0} repeat trials per flip case)`);
  lines.push(`  Single-pass flips: ${regressionClassification.singlePassFlipCount}`);
  lines.push(`  True Regression (stable across repeats): ${regressionClassification.trueRegressionCount}`);
  lines.push(`  False Regression (single-draw noise): ${regressionClassification.falseRegressionCount}`);
  for (const c of regressionClassification.classifications) {
    lines.push(
      `    ${c.hash}: singlePass(base=${c.singlePassBaselineWrongWingAfter},integ=${c.singlePassIntegratedWrongWingAfter}) repeatMean(base=${c.repeatBaselineMeanWrongWingAfter.toFixed(
        2
      )},integ=${c.repeatIntegratedMeanWrongWingAfter.toFixed(2)}) diff=${c.meanDiff.toFixed(2)} -> ${c.verdict}`
    );
  }
  lines.push("");

  lines.push(`4. System Stability (STEP4, n=${stability.retryStability.length} snapshots x ${stability.determinism.length ? 10 : 0} repeats)`);
  lines.push(`  Determinism (${stability.determinism.length} samples, 5 repeats each): solve() is a designed-stochastic function, NOT expected to be deterministic.`);
  for (const d of stability.determinism) {
    lines.push(`    ${d.hash}: wrongWingAfter across repeats=[${d.wrongWingAfterAcrossRepeats.join(",")}], identical=${d.identical}`);
  }
  lines.push(`  Avg Solve-rate Bernoulli variance (p(1-p)) across sample: ${(stability.avgSolvedRateVariance * 100).toFixed(2)}%`);
  lines.push("  Primitive Stability (trigger-rate mean/stddev across snapshots):");
  for (const p of stability.primitiveStability) {
    lines.push(`    ${p.primitive}: mean=${(p.triggerRateMean * 100).toFixed(1)}%, stddev=${(p.triggerRateStddev * 100).toFixed(1)}pp`);
  }
  lines.push("");

  lines.push("5. Release Readiness Matrix (STEP8)");
  for (const row of readiness.rows) {
    lines.push(`  [${row.status}] ${row.criterion}`);
    lines.push(`    ${row.evidence}`);
  }
  lines.push("");
  lines.push(`Final Decision: ${readiness.decision}`);
  lines.push(`Rationale: ${readiness.decisionRationale}`);

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify({ priorCitation: PRIOR_FINALIZATION_CITATION, interactionMatrix, regressionClassification, stability, readiness }, null, 2),
    "utf-8"
  );
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(report);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
