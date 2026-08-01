// Multi-Component Merge Production Integration Refinement Sprint v3 --
// driver (Residual Competition Structural Analysis).
//   npx tsx src/customCube/runMultiComponentMergeIntegrationRefinementV3.ts
//
// Focuses ONLY on the 3 successMismatch cases Refinement Sprint v2's own
// ComparativeConsistency.ts identified (scrambleDepth30:2, scrambleDepth40:7,
// scrambleDepth100:5 -- all componentCountBefore=3, all succeeded in
// Comparative Prototype Sprint v1's isolated 2000ms test but failed in
// production Arm C at outer=2000ms). Real production functions only
// (generateRecoveryStrategies/attemptRecovery, read-only usage) --
// fiveByFiveEdgeRecovery.ts/Planner/Executor/SolverEngine/Primitive
// algorithms are all untouched this Sprint (analysis-only, per Directive).
import * as fs from "fs";
import { buildWingLibrary, buildFlipLibrary, buildCaseLibrary } from "./fiveByFiveEdges";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import type { HoleCase } from "./coverageAtlas/HoleDatasetBuilder";
import { collectTimelines, ALL_RECOVERY_TYPES } from "./solverPrimitiveMultiComponentMergeIntegrationRefinementV3/CompetitionTimeline";
import { buildAttributions } from "./solverPrimitiveMultiComponentMergeIntegrationRefinementV3/CompetitionAttribution";
import { runRemovalPopulation } from "./solverPrimitiveMultiComponentMergeIntegrationRefinementV3/PrimitiveRemoval";
import { buildBudgetDependencyPopulation } from "./solverPrimitiveMultiComponentMergeIntegrationRefinementV3/BudgetDependency";
import { runUnlimitedReplay, UNLIMITED_OUTER_DEADLINE_MS } from "./solverPrimitiveMultiComponentMergeIntegrationRefinementV3/UnlimitedReplay";
import { buildRootCauseMatrix, evaluateLevels, type ComparativeReference } from "./solverPrimitiveMultiComponentMergeIntegrationRefinementV3/RootCauseMatrix";

const TARGET_LABELS = ["scrambleDepth30:2", "scrambleDepth40:7", "scrambleDepth100:5"];
const OUTER_DEADLINE_MS = 2000; // Arm C conditions -- where the successMismatch was observed (Refinement Sprint v2)
const COMPARATIVE_RESULT_PATH = "src/customCube/solverPrimitiveParityComparativePrototype/data/parity-gated-cycle-comparative-prototype-v1-result.json";
const DATA_DIR = "src/customCube/solverPrimitiveMultiComponentMergeIntegrationRefinementV3/data";
const REPORT_PATH = `${DATA_DIR}/multi-component-merge-integration-refinement-v3-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/multi-component-merge-integration-refinement-v3-result.json`;

function loadComparativeReferences(): Map<string, ComparativeReference> {
  const data = JSON.parse(fs.readFileSync(COMPARATIVE_RESULT_PATH, "utf-8"));
  const map = new Map<string, ComparativeReference>();
  for (const c of data.perCase) {
    if (!TARGET_LABELS.includes(c.label)) continue;
    map.set(c.label, {
      runtimeMs: c.multi.runtimeMs,
      mergeStepsSucceeded: c.multi.mergeStepsSucceeded,
      componentCountBefore: c.multi.componentCountBefore,
      componentCountAfter: c.multi.componentCountAfter,
    });
  }
  return map;
}

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

  console.log("Loading Hole Dataset, filtering to the 3 successMismatch cases...");
  const allHoles = loadRawHoleDataset();
  const holes: HoleCase[] = TARGET_LABELS.map((label) => {
    const h = allHoles.find((x) => x.label === label);
    if (!h) throw new Error(`case not found: ${label}`);
    return h;
  });
  console.log(`  targets: ${holes.map((h) => h.label).join(", ")}`);

  console.log(`STEP1: Residual Competition Census (real generateRecoveryStrategies(), outer=${OUTER_DEADLINE_MS}ms, all ${ALL_RECOVERY_TYPES.length} RecoveryTypes tracked)...`);
  const timelines = collectTimelines(holes, libs, OUTER_DEADLINE_MS);
  for (const t of timelines) console.log(`  ${t.label}: mcmOffered=${t.mcmOffered}, mcmChosen=${t.mcmChosen}, chosenType=${t.chosenType}, segments=${t.segments.map((s) => s.type).join(">")}`);

  console.log("STEP2: Primitive Competition Attribution...");
  const attributions = buildAttributions(timelines);
  for (const a of attributions) console.log(`  ${a.label}: totalTimeConsumedBeforeMcmMs=${a.totalTimeConsumedBeforeMcmMs}, candidateProducingCount=${a.candidateProducingCount}, mcmOwnBudgetMs=${a.mcmOwnBudgetMs}`);

  console.log("STEP3: Counterfactual Primitive Removal (real attemptRecovery(), toggling includeCCR/includeRepair/includeParityGatedCycle/includeMixedCommutator one at a time)...");
  const removals = runRemovalPopulation(holes, libs);
  for (const r of removals) console.log(`  ${r.label}: anyRemovalRescues=${r.anyRemovalRescues}, rescuingConfigs=${r.rescuingConfigs.join(",") || "none"}`);

  console.log("STEP4: Shared Budget Dependency Analysis (derived from STEP1 timeline)...");
  const budgetDeps = buildBudgetDependencyPopulation(timelines);
  for (const b of budgetDeps) console.log(`  ${b.label}: consumedBeforeMcmMs=${b.consumedBeforeMcmMs}, mcmAvailableMs=${b.mcmAvailableMs}, mcmOwnRuntimeMs=${b.mcmOwnRuntimeMs}`);

  console.log(`STEP5: Counterfactual Unlimited Production Replay (outer=${UNLIMITED_OUTER_DEADLINE_MS}ms, Primitive/Scheduler unchanged)...`);
  const unlimited = runUnlimitedReplay(holes, libs);
  for (const u of unlimited) console.log(`  ${u.label}: improved=${u.improved}, chosenType=${u.chosenType}, wallMs=${u.wallMs}`);

  console.log("STEP4(cont). Comparative Prototype reference (own isolated runtimeMs/mergeStepsSucceeded)...");
  const comparativeRefs = loadComparativeReferences();
  for (const [label, ref] of comparativeRefs) console.log(`  ${label}: runtimeMs=${ref.runtimeMs}, mergeStepsSucceeded=${ref.mergeStepsSucceeded}`);

  console.log("STEP6: Root Cause Matrix + Level1-3 + Decision...");
  const rootCauseRows = buildRootCauseMatrix(attributions, removals, unlimited, comparativeRefs);
  for (const r of rootCauseRows) console.log(`  ${r.label}: bucket=${r.bucket}`);
  const levels = evaluateLevels(rootCauseRows);
  console.log(`  level1Pass=${levels.level1Pass}, level2Pass=${levels.level2Pass}, decision=${levels.level3Decision}`);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Multi-Component Merge Production Integration Refinement Sprint v3 -- Report ===");
  push("(Residual Competition Structural Analysis -- 3 successMismatch cases only)");
  push();
  push(`Target cases: ${TARGET_LABELS.join(", ")} (all componentCountBefore=3, all comparativeIsolatedSuccess=true, all productionArmCSuccess=false per Refinement Sprint v2)`);
  push();
  push("STEP1. Competition Timeline (real generateRecoveryStrategies(), outer=2000ms)");
  for (const t of timelines) {
    push(`  ${t.label}: totalCallRuntimeMs=${t.totalCallRuntimeMs}, chosenType=${t.chosenType}`);
    for (const s of t.segments) push(`    [seq${s.seq}] ${s.type}: startMs=${s.startMs}, finishMs=${s.finishMs}, ownRuntimeMs=${s.ownRuntimeMs}, remainingTimeAtStartMs=${s.remainingTimeAtStartMs}, finalPhase=${s.finalPhase}`);
  }
  push();
  push("STEP2. Primitive Competition Attribution Matrix");
  for (const a of attributions) {
    push(`  ${a.label}: mcmOffered=${a.mcmOffered}, mcmChosen=${a.mcmChosen}, chosenType=${a.chosenType}, mcmOwnBudgetMs=${a.mcmOwnBudgetMs}`);
    for (const p of a.primitivesBeforeMcm) push(`    ${p.type}(seq${p.seq}): timeConsumedMs=${p.timeConsumedMs}, producedCandidate=${p.producedCandidate}, wonSelection=${p.wonSelection}`);
  }
  push();
  push("STEP3. Primitive Responsibility Matrix (Counterfactual Removal, outer=2000ms)");
  for (const r of removals) {
    push(`  ${r.label}: anyRemovalRescues=${r.anyRemovalRescues}, rescuingConfigs=${r.rescuingConfigs.join(", ") || "none"}`);
    for (const o of r.outcomes) push(`    ${o.config}: improved=${o.improved}, chosenType=${o.chosenType}, wrongWing ${o.wrongWingBefore}->${o.wrongWingAfter}`);
  }
  push(`  disclosed scope limitation: DISRUPT/SETUP have no existing include-toggle parameter (removing them would require a fiveByFiveEdgeRecovery.ts change, forbidden this Sprint) -- their contribution is inferred from STEP1/2's own timeline evidence only.`);
  push();
  push("STEP4. Budget Dependency Graph (derived from STEP1 timeline)");
  for (const b of budgetDeps) {
    push(`  ${b.label}: outerDeadlineMs=${b.outerDeadlineMs}, consumedBeforeMcmMs=${b.consumedBeforeMcmMs}, mcmAvailableMs=${b.mcmAvailableMs}, mcmOwnRuntimeMs=${b.mcmOwnRuntimeMs}, unusedAfterMcmMs=${b.unusedAfterMcmMs}`);
    for (const [type, ms] of Object.entries(b.consumedByType)) push(`    consumed by ${type}: ${ms}ms`);
  }
  push();
  push(`STEP5. Counterfactual Unlimited Production Replay (outer=${UNLIMITED_OUTER_DEADLINE_MS}ms)`);
  for (const u of unlimited) push(`  ${u.label}: improved=${u.improved}, chosenType=${u.chosenType}, wallMs=${u.wallMs}, wrongWing ${u.wrongWingBefore}->${u.wrongWingAfter}`);
  push(`  Comparative Prototype Sprint v1's own isolated result (reference, unmodified):`);
  for (const [label, ref] of comparativeRefs) push(`    ${label}: runtimeMs=${ref.runtimeMs}, mergeStepsSucceeded=${ref.mergeStepsSucceeded}, componentCountBefore=${ref.componentCountBefore}->${ref.componentCountAfter}`);
  push();
  push("STEP6. Root Cause Matrix + Decision");
  for (const r of rootCauseRows) {
    push(`  ${r.label}: bucket=${r.bucket}`);
    push(`    evidence: ${r.evidence}`);
  }
  push(`  Level1(구조 정량화)=${levels.level1Pass ? "PASS" : "FAIL"}, Level2(Unknown<=1)=${levels.level2Pass ? "PASS" : "FAIL"}`);
  push(`  Decision = ${levels.level3Decision}`);
  push(`  rationale: ${levels.level3Rationale}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        targetLabels: TARGET_LABELS,
        outerDeadlineMs: OUTER_DEADLINE_MS,
        timelines,
        attributions,
        removals,
        budgetDeps,
        unlimited,
        comparativeRefs: Object.fromEntries(comparativeRefs),
        rootCauseRows,
        levels,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`report written: ${REPORT_PATH}`);
  console.log(lines.join("\n"));
}

main();
