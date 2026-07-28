// Mixed Commutator Opportunity Analysis Sprint v1 -- driver.
//   npx tsx src/customCube/runMixedCommutatorOpportunityAnalysisSprintV1.ts
//
// Research Sprint (read-only -- no Production/Gate/Prototype/Planner/
// Recovery/Evaluator modification): determines whether Mixed Commutator's
// low observed contribution (ONLY_MIXED=1/142, Production Validation
// Sprint v1) is a Gate-policy artifact or a genuine Primitive capability
// limit, via Gate Funnel + Shadow Evaluation + Gate Ablation + Priority
// Reorder + Opportunity Matrix, across all 142 real hole-dataset cases.
import * as fs from "fs";
import { cloneCubies, type Cubie } from "./cubeState";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs } from "./coverageAtlas/HoleDatasetBuilder";
import { measureGateFunnelRow, summarizeGateFunnel, type GateFunnelRow, type PopulationTag, PRODUCTION_REALISTIC_BUDGET_MS } from "./mixedCommutatorOpportunityAnalysis/GateFunnel";
import { measureShadowEvaluation, summarizeShadowEvaluation, type ShadowEvaluationRow, EXTENDED_SHADOW_BUDGET_MS } from "./mixedCommutatorOpportunityAnalysis/ShadowEvaluation";
import { runGateAblation } from "./mixedCommutatorOpportunityAnalysis/GateAblation";
import { runPriorityReorderTest, type ReorderTestRow } from "./mixedCommutatorOpportunityAnalysis/PriorityReorderShadow";
import { buildOpportunityMatrix, computeOpportunityLoss } from "./mixedCommutatorOpportunityAnalysis/OpportunityMatrix";
import { assessOpportunity } from "./mixedCommutatorOpportunityAnalysis/RecommendationAssessment";

const DATA_DIR = "src/customCube/mixedCommutatorOpportunityAnalysis/data";
const REPORT_PATH = `${DATA_DIR}/mixed-commutator-opportunity-analysis-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/mixed-commutator-opportunity-analysis-v1-result.json`;
const CKPT_PATH = `${DATA_DIR}/checkpoint.json`;
const PRIMITIVE_SET_RESULT_PATH = "src/customCube/primitiveSetCompleteness/data/primitive-set-completeness-validation-v1-result.json";

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
  gateFunnelRows: GateFunnelRow[];
  shadowRows: ShadowEvaluationRow[];
  reorderRows: ReorderTestRow[];
}

function loadCheckpoint(): Checkpoint {
  if (!fs.existsSync(CKPT_PATH)) return { completedLabels: [], gateFunnelRows: [], shadowRows: [], reorderRows: [] };
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
    const tag = tagOf(h.label);
    const cubies = h.cubies as Cubie[];

    const gateRow = measureGateFunnelRow(cloneCubies(cubies), h.label, tag, libs.lib);
    ckpt.gateFunnelRows.push(gateRow);

    const shadowRow = measureShadowEvaluation(cloneCubies(cubies), h.label, tag, libs.lib);
    ckpt.shadowRows.push(shadowRow);

    // Priority Reorder test only meaningful for cases that pass the real
    // Gate but fail to generate at the production-realistic budget while
    // being shadow-solvable at the extended budget (i.e. a near-miss the
    // real budget just barely misses) -- reordering elsewhere can't change
    // anything since exhaustedSearchSpace is already true or the case is
    // Gate-excluded entirely.
    if (gateRow.passesFinalGate && !gateRow.generated && shadowRow.shadowSolvable) {
      const reorderRows = runPriorityReorderTest(cloneCubies(cubies), h.label, PRODUCTION_REALISTIC_BUDGET_MS);
      ckpt.reorderRows.push(...reorderRows);
    }

    ckpt.completedLabels.push(h.label);
    completed.add(h.label);
    if (completed.size % 20 === 0) {
      saveCheckpoint(ckpt);
      log("main", `${completed.size}/${holes.length} done`);
    }
  }
  saveCheckpoint(ckpt);
  log("main", "done");

  const gateFunnelSummary = summarizeGateFunnel(ckpt.gateFunnelRows);
  const shadowSummary = summarizeShadowEvaluation(ckpt.shadowRows);
  const ablationResults = runGateAblation(ckpt.gateFunnelRows, ckpt.shadowRows);
  const opportunityMatrix = buildOpportunityMatrix(ckpt.gateFunnelRows, ckpt.shadowRows);
  const allRow = opportunityMatrix.find((r) => r.population === "ALL")!;
  const opportunityLoss = computeOpportunityLoss(allRow);
  const assessment = assessOpportunity(opportunityLoss, shadowSummary);

  const lines: string[] = [];
  lines.push("Mixed Commutator Opportunity Analysis Sprint v1 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("1. Gate Funnel (RQ-1, n=" + gateFunnelSummary.total + ")");
  lines.push(`  Total: ${gateFunnelSummary.total}`);
  lines.push(`  cycleCount===1 passes: ${gateFunnelSummary.passesCycleCount}`);
  lines.push(`  + componentCount===1: ${gateFunnelSummary.passesCycleAndComponentCount}`);
  lines.push(`  Final Gate (+ conflictCount===0): ${gateFunnelSummary.passesFinalGateCount}`);
  lines.push(`  Generated (at ${PRODUCTION_REALISTIC_BUDGET_MS}ms production-realistic budget): ${gateFunnelSummary.generatedCount}`);
  lines.push(`  Improved: ${gateFunnelSummary.improvedCount}`);
  lines.push("");

  lines.push("2. Shadow Evaluation (RQ-2, Gate entirely bypassed, extended budget=" + EXTENDED_SHADOW_BUDGET_MS + "ms)");
  lines.push(`  hasAnyCycle (Prototype's own looser precondition): ${shadowSummary.hasAnyCycleCount}/${shadowSummary.total}`);
  lines.push(`  shadowSolvable (Potentially Solvable): ${shadowSummary.shadowSolvableCount}/${shadowSummary.total}`);
  lines.push(`  anyDeadlineHit (extended budget still not enough somewhere): ${shadowSummary.anyDeadlineHit}`);
  lines.push("");

  lines.push("3. Gate Ablation (RQ-3, each condition independently)");
  for (const r of ablationResults) {
    lines.push(`  ${r.condition}: ${r.description}`);
    lines.push(`    relaxedGatePass=${r.relaxedGatePassCount}, newlyAdmitted=${r.newlyAdmittedCount}, newlyAdmittedShadowSolvable=${r.newlyAdmittedShadowSolvableCount}`);
  }
  lines.push("");

  lines.push("4. Priority Reorder Test (RQ-4, near-miss cases only, n=" + ckpt.reorderRows.length / 2 + " candidate cases x 2 variants)");
  if (ckpt.reorderRows.length === 0) {
    lines.push("  No near-miss cases found (Gate-passing + not generated at 300ms + shadow-solvable at 5000ms) -- Priority Reorder has nothing to test.");
  } else {
    const byVariant = new Map<string, number>();
    for (const r of ckpt.reorderRows) {
      if (r.solvableAtRealisticBudget) byVariant.set(r.variantName, (byVariant.get(r.variantName) ?? 0) + 1);
    }
    for (const [variant, count] of byVariant) lines.push(`  ${variant}: rescued ${count} near-miss case(s) within the real 300ms budget`);
    if (byVariant.size === 0) lines.push("  Neither reorder variant rescued any near-miss case within the real 300ms budget.");
  }
  lines.push("");

  lines.push("5. Opportunity Matrix (RQ-5, Required Measurement #4)");
  lines.push("  Population | Eligible | Improved | PotentiallySolvable | Lost");
  for (const r of opportunityMatrix) {
    lines.push(`  ${r.population} | ${r.eligible} | ${r.improved} | ${r.potentiallySolvable} | ${r.lost}`);
  }
  lines.push(`  Opportunity Loss (ALL, PotentiallySolvable-ActuallyAttempted): ${opportunityLoss.opportunityLoss}`);
  lines.push("");

  lines.push("6. Recommendation (Deliverable #5)");
  lines.push(`  decision=${assessment.decision}`);
  lines.push(`  decisionLabel=${assessment.decisionLabel}`);
  lines.push(`  rationale: ${assessment.rationale}`);
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        gateFunnelSummary,
        shadowSummary,
        ablationResults,
        opportunityMatrix,
        opportunityLoss,
        assessment,
        gateFunnelRows: ckpt.gateFunnelRows,
        shadowRows: ckpt.shadowRows,
        reorderRows: ckpt.reorderRows,
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
