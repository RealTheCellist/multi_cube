// Solver System Bottleneck Attribution Refinement Sprint v1 -- driver.
//   npx tsx src/customCube/runSolverSystemBottleneckAttributionRefinementSprintV1.ts [dbPath]
//
// STEP1-6 per the Work Order. READ-ONLY analysis Sprint -- zero Production
// code changes. Disambiguates the two candidates the prior Sprint
// (Solver System Bottleneck Attribution Sprint v1) narrowed the bottleneck
// to: ENDGAME (54.7%) vs Planner (45.3%), via direct instrumentation
// rather than further speculation.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import { buildWingLibrary, buildFlipLibrary, buildCaseLibrary } from "./fiveByFiveEdges";
import { analyzeAllReachability, summarizeReachability } from "./solverPrimitiveSystemBottleneckAttributionRefinement/PlannerReachabilityAnalysis";
import { probeAllEndgameCeilings } from "./solverPrimitiveSystemBottleneckAttributionRefinement/EndgameCapabilityCeiling";
import { simulateAllPlannerSkipped } from "./solverPrimitiveSystemBottleneckAttributionRefinement/CounterfactualPlannerSimulation";
import { computeSaturationCurve, computeEndgameHeadroom } from "./solverPrimitiveSystemBottleneckAttributionRefinement/OpportunitySaturationCurve";
import { summarizePlannerBenefit } from "./solverPrimitiveSystemBottleneckAttributionRefinement/PlannerBenefitCeiling";
import { computeFinalAttribution } from "./solverPrimitiveSystemBottleneckAttributionRefinement/FinalAttributionDecision";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveSystemBottleneckAttributionRefinement/data/solver-system-bottleneck-attribution-refinement-v1-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("Solver System Bottleneck Attribution Refinement Sprint v1 -- Report");
push(`Generated: ${new Date().toISOString()}`);
push("READ-ONLY analysis Sprint -- zero Production code changes (fiveByFiveEdges.ts/Planner/Executor/Recovery/all Primitives/all Prototypes/Budget Contract all read-only this Sprint).");
push("");

log("Loading snapshots...");
const db = loadDatabase(dbPath);
const allSnaps = allSnapshots(db);
const libs = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };
push(`STEP0. Population: ${allSnaps.length} real snapshots (full dataset).`);
push("");

log("STEP1: Planner Reachability Analysis...");
const reachabilityRecords = analyzeAllReachability(allSnaps, libs);
const reachabilitySummary = summarizeReachability(reachabilityRecords);
push("STEP1. Planner Reachability Analysis (full 335-snapshot population):");
push(`  Disclosed correction: ENDGAME is ALWAYS queued whenever wrongWingCount5>0 at plan time (planEdgeTasks' own stillNeedsParity branch) -- "PlannerSkipped" below means the real task loop's outer 1s deadline fired before reaching that queue position, not a Planner selection choice.`);
push(`  Reachable: ${reachabilitySummary.reachableCount} (${reachabilitySummary.reachablePct.toFixed(1)}%)`);
push(`  PlannerSkipped (deadline-starved before reaching ENDGAME): ${reachabilitySummary.plannerSkippedCount} (${reachabilitySummary.plannerSkippedPct.toFixed(1)}%)`);
push(`  AlreadySolvedBeforeEndgame (genuine success, ENDGAME not needed): ${reachabilitySummary.alreadySolvedCount} (${reachabilitySummary.alreadySolvedPct.toFixed(1)}%)`);
push(`  StructurallyImpossible (already solved at plan time): ${reachabilitySummary.structurallyImpossibleCount} (${reachabilitySummary.structurallyImpossiblePct.toFixed(1)}%)`);
push("");

log("STEP2: Endgame Capability Ceiling (this will take a while)...");
const ceilingRecords = probeAllEndgameCeilings(reachabilityRecords, libs);
push(`STEP2. Endgame Capability Ceiling (Reachable snapshots only, n=${reachabilitySummary.reachableCount}, 5 budgets each):`);
push(`  Total probes: ${ceilingRecords.length}`);
push("");

log("STEP3: Counterfactual Planner Simulation...");
const plannerCounterfactuals = simulateAllPlannerSkipped(reachabilityRecords, libs);
push(`STEP3. Counterfactual Planner Simulation (PlannerSkipped snapshots only, n=${plannerCounterfactuals.length}):`);
push("");

log("STEP4: Opportunity Saturation Curve...");
const saturationCurve = computeSaturationCurve(ceilingRecords);
const endgameHeadroom = computeEndgameHeadroom(saturationCurve);
push("STEP4. Opportunity Saturation Curve (ENDGAME's own improvement vs budget):");
push("  Budget(ms) | n | AvgImprovement | SolvedRate | AvgRuntimeMs");
for (const p of saturationCurve) {
  push(`  ${p.budgetMs} | ${p.n} | ${p.avgImprovement.toFixed(3)} | ${(p.solvedRate * 100).toFixed(1)}% | ${p.avgRuntimeMs.toFixed(1)}`);
}
push(`  ENDGAME headroom per Reachable case (largest - smallest budget): ${endgameHeadroom.headroomPerCase.toFixed(3)}`);
push("");

log("STEP5: Planner Benefit Ceiling...");
const plannerBenefit = summarizePlannerBenefit(plannerCounterfactuals);
push("STEP5. Planner Benefit Ceiling (Maximum Recoverable Capability from PlannerSkipped snapshots):");
push(`  n=${plannerBenefit.n}, avgImprovement=${plannerBenefit.avgImprovement.toFixed(3)}, totalImprovement=${plannerBenefit.totalImprovement.toFixed(2)}, solvedRate=${(plannerBenefit.solvedRate * 100).toFixed(1)}%, avgRuntimeMs=${plannerBenefit.avgRuntimeMs.toFixed(1)}`);
push("");

log("STEP6: Final Attribution Decision...");
const final = computeFinalAttribution(reachabilitySummary, endgameHeadroom, plannerBenefit);
push("STEP6. Final Attribution Decision:");
for (const row of final.rows) {
  push(`  ${row.candidate}: totalPotentialGain=${row.totalPotentialGain.toFixed(2)}, contributionPct=${row.contributionPct.toFixed(1)}%`);
}
push(`  Priority 1: ${final.priority1 ?? "(none -- not decisive)"}`);
push("");
push("Level 1-3 Judgment:");
push(`  Level1 (Planner Reachability 정량화): ${final.level1Pass ? "PASS" : "FAIL"} -- ${final.level1Detail}`);
push(`  Level2 (ENDGAME Capability Ceiling 계산): ${final.level2Pass ? "PASS" : "FAIL"} -- ${final.level2Detail}`);
push(`  Level3 (Priority 1 확정): ${final.level3Pass ? "PASS" : "FAIL"} -- ${final.level3Detail}`);
push("");
push(`DECISION: ${final.decision}`);
push(`  ${final.decisionRationale}`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
log(`Report written to ${reportPath}`);
log(`DECISION: ${final.decision}`);
