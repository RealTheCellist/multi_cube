// Production Integration Blueprint Sprint v1 -- driver.
//   npx tsx src/customCube/runProductionIntegrationBlueprintSprintV1.ts
//
// Blueprint Sprint (NO implementation, NO Production Solver/Recovery/
// Planner/Executor modification -- fiveByFiveEdgeRecovery.ts/Planner.ts/
// Executor.ts are read-only this Sprint, only ever imported/called, never
// edited): designs how Mixed Commutator Prototype Sprint v1's validated
// Prototype would integrate into the REAL Recovery Layer, using REAL
// measurements (calling the actual generateRecoveryStrategies()/
// chooseBestRecovery()) rather than speculation.
import * as fs from "fs";
import { cloneCubies, type Cubie } from "./cubeState";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import { buildLibs } from "./coverageAtlas/HoleDatasetBuilder";
import { describeCurrentSequence, describeProposedSequence } from "./productionIntegrationBlueprint/IntegrationSequenceReport";
import { measureInteraction, type InteractionRow } from "./productionIntegrationBlueprint/RecoveryInteractionMeasurement";
import { buildInteractionMatrix } from "./productionIntegrationBlueprint/RecoveryInteractionMatrix";
import { sweepBudget, SWEEP_BUDGETS_MS, type BudgetSweepPoint } from "./productionIntegrationBlueprint/BudgetAllocationSweep";
import { deriveGateSpecification, type CaseProfile } from "./productionIntegrationBlueprint/GateSpecification";
import { estimateProductionDiff } from "./productionIntegrationBlueprint/ProductionDiffEstimate";
import { buildImplementationChecklist } from "./productionIntegrationBlueprint/ImplementationChecklist";
import { assessReleaseReadiness } from "./productionIntegrationBlueprint/ReleaseReadinessAssessment";

const DATA_DIR = "src/customCube/productionIntegrationBlueprint/data";
const REPORT_PATH = `${DATA_DIR}/production-integration-blueprint-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/production-integration-blueprint-v1-result.json`;
const CHECKPOINT_PATH = `${DATA_DIR}/checkpoint-interaction.json`;
const PRIMITIVE_SET_RESULT_PATH = "src/customCube/primitiveSetCompleteness/data/primitive-set-completeness-validation-v1-result.json";

// Realistic OUTER deadline for the Interaction Measurement -- matches the
// file's own documented "solver-wide 1000ms cap" (comment on
// RECOVERY_GEN_BUDGET_MS): genDeadline(300) + REPAIR reserved(75) leaves
// CCR ~625ms remainingTime in the common case, consistent with real
// production conditions rather than an arbitrarily small or large window.
const OUTER_DEADLINE_MS = 1000;
// Mixed Commutator's own deadline in the interaction test -- 300ms,
// matching Mixed Commutator Prototype Sprint v1's own already-validated
// production-realistic budget (avg runtime 229ms at this size).
const MIXED_DEADLINE_MS = 300;

function log(step: string, msg: string) {
  console.log(`[${new Date().toISOString()}] ${step}: ${msg}`);
}

function loadCheckpoint(): { completedLabels: string[]; rows: InteractionRow[] } {
  if (!fs.existsSync(CHECKPOINT_PATH)) return { completedLabels: [], rows: [] };
  return JSON.parse(fs.readFileSync(CHECKPOINT_PATH, "utf-8"));
}
function saveCheckpoint(completedLabels: string[], rows: InteractionRow[]) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify({ completedLabels, rows }), "utf-8");
}

async function main() {
  const holes = loadRawHoleDataset();
  const holesByLabel = new Map(holes.map((h) => [h.label, h]));
  const libs = buildLibs();

  const priorResult = JSON.parse(fs.readFileSync(PRIMITIVE_SET_RESULT_PATH, "utf-8"));
  const residualClassified: { label: string; failureClass: string; profile: { cycleLength: number; conflictEdgeCount: number; componentCount: number; hasParity: boolean } }[] =
    priorResult.residualClassified;
  const coverageRows: { label: string; unionCovered: boolean }[] = priorResult.coverageRows;

  const primaryLabels = new Set(residualClassified.filter((r) => r.failureClass === "PURE_CYCLE_ISOLATION").map((r) => r.label));
  const secondaryLabels = new Set(residualClassified.map((r) => r.label));
  const regressionLabels = new Set(coverageRows.filter((r) => r.unionCovered).map((r) => r.label));

  function tagOf(label: string): InteractionRow["populationTag"] {
    if (primaryLabels.has(label)) return "PRIMARY";
    if (secondaryLabels.has(label)) return "SECONDARY_ONLY";
    return "REGRESSION";
  }

  // ---- Section 1: Integration Sequence (Required Analysis #1, Deliverable #2) ----
  const currentSequence = describeCurrentSequence();
  const proposedSequence = describeProposedSequence();

  // ---- Section 2: Recovery Interaction Measurement (RQ-4, Required Analysis #3) ----
  let { completedLabels, rows } = loadCheckpoint();
  const completedSet = new Set(completedLabels);
  if (completedLabels.length > 0) log("interaction", `resuming: ${completedLabels.length}/${holes.length} done`);
  for (const h of holes) {
    if (completedSet.has(h.label)) continue;
    const clone = cloneCubies(h.cubies as Cubie[]);
    const row = measureInteraction(clone, h.label, tagOf(h.label), libs, Date.now() + OUTER_DEADLINE_MS, MIXED_DEADLINE_MS);
    rows.push(row);
    completedLabels.push(h.label);
    completedSet.add(h.label);
    if (completedLabels.length % 20 === 0) saveCheckpoint(completedLabels, rows);
  }
  saveCheckpoint(completedLabels, rows);
  log("interaction", "done");

  const matrix = buildInteractionMatrix(rows);

  // Key finding surfaced during smoke-testing, now measured across the
  // full population: Mixed Commutator's own candidates, scored via the
  // IDENTICAL scoreWholeState/MOVE_COST_WEIGHT formula every existing
  // Recovery candidate uses, often carry a STRONGLY NEGATIVE score even
  // when they genuinely improve wrongWingCount -- because a bracket
  // commutator's affectedWingCount (footprint) disturbs many previously
  // -paired ("protected") slots, and DEFAULT_EVALUATOR_WEIGHTS.protectedEdges
  // = -60 penalizes each one heavily. This directly parallels REPAIR's own
  // documented mechanism (`shortCircuitRepair`): "A REPAIR candidate's
  // moves are already validated as net-improving by W2_widerHop's own
  // Deferred Validation... accepted immediately, skipping retryTask" --
  // Mixed Commutator's own validateDeferred gate provides the IDENTICAL
  // guarantee, so the same short-circuit pattern (bypass raw
  // scoreWholeState competition, accept directly on its own Deferred
  // Validation) is this Sprint's own measured, disclosed recommendation.
  const foundRows = rows.filter((r) => r.mixedFound && r.mixedScore !== null);
  const negativeScoreCount = foundRows.filter((r) => (r.mixedScore as number) < 0).length;
  const avgMixedScore = foundRows.length ? foundRows.reduce((a, r) => a + (r.mixedScore as number), 0) / foundRows.length : 0;
  log("score-compat", `foundRows=${foundRows.length}, negativeScoreCount=${negativeScoreCount} (${foundRows.length ? ((negativeScoreCount / foundRows.length) * 100).toFixed(1) : "0"}%), avgMixedScore=${avgMixedScore.toFixed(1)}`);

  // ---- Section 3: Budget Allocation Sweep (RQ-2, Required Analysis #2) ----
  log("sweep", `running Budget Allocation Sweep on ${primaryLabels.size} PRIMARY cases...`);
  const primaryCases = Array.from(primaryLabels)
    .map((label) => holesByLabel.get(label))
    .filter((h): h is NonNullable<typeof h> => !!h)
    .map((h) => ({ label: h.label, cubies: h.cubies as Cubie[] }));
  const sweepPoints: BudgetSweepPoint[] = [];
  for (const budgetMs of SWEEP_BUDGETS_MS) {
    const point = sweepBudget(primaryCases, libs.lib, budgetMs);
    sweepPoints.push(point);
    log("sweep", `budget=${budgetMs}ms: solved=${point.solvedCount}/${point.n}, lowFootprint=${point.lowFootprintCount}, avgRuntime=${point.avgRuntimeMs.toFixed(0)}ms`);
  }

  // ---- Section 4: Gate Specification (RQ-3) ----
  const profiles: CaseProfile[] = residualClassified
    .filter((r) => r.failureClass === "PURE_CYCLE_ISOLATION")
    .map((r) => ({ label: r.label, cycleLength: r.profile.cycleLength, conflictEdgeCount: r.profile.conflictEdgeCount, componentCount: r.profile.componentCount, hasParity: r.profile.hasParity }));
  const solvedLabels = new Set(rows.filter((r) => r.populationTag === "PRIMARY" && r.mixedFound).map((r) => r.label));
  const gate = deriveGateSpecification(profiles, solvedLabels);

  // ---- Section 5: Production Diff Estimate (Required Analysis #4) ----
  const diffEstimates = estimateProductionDiff();

  // ---- Section 6: Implementation Checklist (Deliverable #5) ----
  const checklist = buildImplementationChecklist();

  // ---- Section 7: Release Readiness Assessment (Deliverable #6) ----
  // Primary Regression gate reuses Mixed Commutator Prototype Sprint v1's
  // own already-measured, decisive result (0/89 Union Covered cases,
  // checked via validateDeferred's wrongWingCount guarantee -- the SAME
  // guarantee attemptRecovery()'s own retry loop enforces against
  // originalBaseline). A narrower SUPPLEMENTARY check is reported below
  // (not gating Success Criteria, since it is a proxy on chooseBestRecovery's
  // own score-max rule alone, not a full end-to-end retry-loop simulation):
  // among REGRESSION cases where Mixed Commutator's candidate would WIN
  // selection, how many have a negative whole-state score (would need
  // attemptRecovery's own originalBaseline guard to catch, same as every
  // existing DISRUPT/SETUP candidate already relies on).
  const negativeScoreWinCount = rows.filter((r) => r.populationTag === "REGRESSION" && r.outcome === "MIXED_WINS" && r.mixedScore !== null && r.mixedScore < 0).length;
  const knownRegressionCount = 0; // Mixed Commutator Prototype Sprint v1's own measured result, reused
  const readiness = assessReleaseReadiness(matrix, diffEstimates, gate, knownRegressionCount);

  // ---- Report ----
  const lines: string[] = [];
  lines.push("Production Integration Blueprint Sprint v1 -- Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("1. Integration Sequence (current Recovery Flow, read directly from fiveByFiveEdgeRecovery.ts)");
  for (const s of currentSequence) lines.push(`  step${s.step} ${s.candidateType}: budget=${s.budgetSource}, gatedByGenDeadline=${s.gatedByGenDeadline} -- ${s.notes}`);
  lines.push("  Proposed (+ step6 Mixed Commutator):");
  lines.push(`  step6 ${proposedSequence[5].candidateType}: budget=${proposedSequence[5].budgetSource} -- ${proposedSequence[5].notes}`);
  lines.push("");

  lines.push("2a. Score Compatibility Finding (key discovery, drives Gate Specification)");
  lines.push(`  foundRows=${foundRows.length}, negativeScoreCount=${negativeScoreCount} (${foundRows.length ? ((negativeScoreCount / foundRows.length) * 100).toFixed(1) : "0"}%), avgMixedScore=${avgMixedScore.toFixed(1)}`);
  lines.push("  Mixed Commutator's raw scoreWholeState score is frequently strongly negative (protectedEdges=-60 penalizes the footprint's disturbed slots) even when wrongWingCount genuinely improves --");
  lines.push("  recommendation: use REPAIR's own shortCircuitRepair pattern (accept directly on Mixed Commutator's own validateDeferred gate, bypass raw score competition via chooseBestRecovery) rather than competing on scoreWholeState as-is.");
  lines.push("");

  lines.push("2. Recovery Interaction Matrix (Required Analysis #3)");
  lines.push(`  n=${matrix.n}`);
  for (const t of matrix.outcomeTally) lines.push(`    ${t.outcome}: ${t.count}`);
  lines.push(`  netNewCount (ONLY_MIXED -- existing solves nothing, Mixed would): ${matrix.netNewCount}`);
  lines.push(`  redundantWinCount (MIXED_WINS -- both have candidates, Mixed scores higher): ${matrix.redundantWinCount}`);
  lines.push(`  neverDisplacesCount (EXISTING_WINS + ONLY_EXISTING): ${matrix.neverDisplacesCount}`);
  lines.push("  By existing best type:");
  for (const b of matrix.byExistingType) lines.push(`    existingBestType=${b.existingBestType}: n=${b.count}, mixedWouldWinCount=${b.mixedWouldWinCount}`);
  lines.push("");

  lines.push("3. Budget Allocation Sweep (RQ-2, 28 PRIMARY cases)");
  for (const p of sweepPoints) lines.push(`  budget=${p.budgetMs}ms: solved=${p.solvedCount}/${p.n} (${(p.successRate * 100).toFixed(1)}%), lowFootprint=${p.lowFootprintCount}, avgRuntime=${p.avgRuntimeMs.toFixed(0)}ms`);
  lines.push("");

  lines.push("4. Gate Specification (RQ-3)");
  lines.push(`  solvedCount=${gate.solvedCount}, unsolvedCount=${gate.unsolvedCount}`);
  for (const f of gate.featureComparisons) lines.push(`    ${f.feature}: avgAmongSolved=${f.avgAmongSolved.toFixed(2)}, avgAmongUnsolved=${f.avgAmongUnsolved.toFixed(2)}`);
  lines.push(`  proposedGate: ${gate.proposedGate}`);
  lines.push(`  rationale: ${gate.rationale}`);
  lines.push("");

  lines.push("5. Production Diff Estimate (Required Analysis #4)");
  for (const d of diffEstimates) {
    lines.push(`  ${d.file}: estimatedLOC=${d.estimatedLOC}, risk=${d.riskLevel}`);
    if (d.functionsToAdd.length) lines.push(`    add: ${d.functionsToAdd.join("; ")}`);
    if (d.functionsToModify.length) lines.push(`    modify: ${d.functionsToModify.join("; ")}`);
    lines.push(`    rationale: ${d.rationale}`);
  }
  lines.push("");

  lines.push("6. Implementation Checklist (Deliverable #5)");
  for (const c of checklist) lines.push(`  [${c.item}] ${c.detail}`);
  lines.push("");

  lines.push("7. Release Readiness Assessment (Deliverable #6)");
  lines.push(`  decision: ${readiness.decision}`);
  lines.push(`  decisionLabel: ${readiness.decisionLabel}`);
  lines.push(`  netNewCount=${readiness.netNewCount}, allDiffLowRisk=${readiness.allDiffLowRisk}, gateResolved=${readiness.gateResolved}`);
  lines.push(`  rationale: ${readiness.rationale}`);
  lines.push(
    `  supplementary check (proxy, not gating): negativeScoreWinCount among REGRESSION MIXED_WINS cases = ${negativeScoreWinCount} -- these would rely on attemptRecovery()'s own originalBaseline guard (same guard every existing DISRUPT/SETUP candidate already depends on) to prevent real regression; primary Regression gate reuses Mixed Commutator Prototype Sprint v1's own measured 0/89.`
  );
  lines.push("");

  const report = lines.join("\n");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        currentSequence,
        proposedSequence,
        matrix,
        sweepPoints,
        gate,
        diffEstimates,
        checklist,
        readiness,
        negativeScoreWinCount,
        scoreCompatibility: { foundRows: foundRows.length, negativeScoreCount, avgMixedScore },
        sampleInteractionRows: rows.slice(0, 30),
      },
      null,
      2
    ),
    "utf-8"
  );
  log("done", `Report written to ${REPORT_PATH}`);
  console.log(report);

  if (fs.existsSync(CHECKPOINT_PATH)) fs.unlinkSync(CHECKPOINT_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
