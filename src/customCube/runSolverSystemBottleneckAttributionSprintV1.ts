// Solver System Bottleneck Attribution Sprint v1 -- driver.
//   npx tsx src/customCube/runSolverSystemBottleneckAttributionSprintV1.ts [dbPath] [budgetFlowSampleSize]
//
// STEP1-6 per the Work Order. READ-ONLY analysis Sprint -- zero Production
// code changes. Follows up on Production Integration Sprint v1's own
// finding (per-call Budget Compliance 44.88%->97.90%, but no measurable
// whole-solve capability gain) by instrumenting the REAL solve() execution
// path (via a byte-identical, read-only mirror) to find WHERE the time
// actually goes and WHY the savings don't compound into capability.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import { deserializeCube } from "./failureAnalysis/cubeSerialization";
import { buildWingLibrary, buildFlipLibrary, buildCaseLibrary } from "./fiveByFiveEdges";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import { mirrorSolveWithStages, type StageEvent } from "./solverPrimitiveSystemBottleneckAttribution/StageInstrumentedMirror";
import { attributeStageRuntime } from "./solverPrimitiveSystemBottleneckAttribution/StageRuntimeAttribution";
import { measureBudgetFlow, summarizeBudgetFlow, type BudgetFlowRecord } from "./solverPrimitiveSystemBottleneckAttribution/BudgetSavingsFlow";
import { analyzeInvocationChains } from "./solverPrimitiveSystemBottleneckAttribution/InvocationChainAnalysis";
import { classifyOpportunityLoss, summarizeOpportunityLoss, type OpportunityLossCase } from "./solverPrimitiveSystemBottleneckAttribution/OpportunityLossAnalysis";
import { simulateRedirection, summarizeCounterfactual, type CounterfactualResult } from "./solverPrimitiveSystemBottleneckAttribution/CounterfactualSimulation";
import { computeBottleneckMatrix } from "./solverPrimitiveSystemBottleneckAttribution/BottleneckAttributionMatrix";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const BUDGET_FLOW_SAMPLE_SIZE = Number(process.argv[3] ?? 75); // cost-driven subsample for the 2x-mirrored Budget Flow step, matching project convention
const reportPath = "src/customCube/solverPrimitiveSystemBottleneckAttribution/data/solver-system-bottleneck-attribution-v1-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("Solver System Bottleneck Attribution Sprint v1 -- Report");
push(`Generated: ${new Date().toISOString()}`);
push("READ-ONLY analysis Sprint -- zero Production code changes (fiveByFiveEdges.ts/Planner/Executor/Recovery/all Primitives/all Prototypes/Budget Contract all read-only this Sprint).");
push("");

log("Loading snapshots...");
const db = loadDatabase(dbPath);
const allSnaps = allSnapshots(db);
const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };
push(`STEP0. Population: ${allSnaps.length} real snapshots (full dataset).`);
push("");

// --- STEP1: Stage Runtime Attribution (full population, real production pairBudgetMs=140) ---
log("STEP1: Stage Runtime Attribution (full population)...");
const allEvents: StageEvent[] = [];
const wrongWingByHash = new Map<string, { before: number; after: number }>();
for (const s of allSnaps) {
  const cubies = deserializeCube(s.cubeState);
  const result = mirrorSolveWithStages(s.hash, cubies, libs);
  allEvents.push(...result.events);
  wrongWingByHash.set(s.hash, { before: result.wrongWingBefore, after: result.wrongWingAfter });
}
const stageRuntime = attributeStageRuntime(allEvents);
push("STEP1. Stage Runtime Attribution (real production pairBudgetMs=140, full 335-snapshot population):");
push("  Stage | CallCount | AvgRuntimeMs | MaxRuntimeMs | %ofTotalRuntime");
for (const row of stageRuntime) {
  push(`  ${row.stage} | ${row.callCount} | ${row.avgRuntimeMs.toFixed(2)} | ${row.maxRuntimeMs} | ${row.pctOfTotalRuntime.toFixed(2)}%`);
}
push("");

// --- STEP2: Budget Savings Flow (subsample, 2x-mirrored per snapshot) ---
log(`STEP2: Budget Savings Flow (${BUDGET_FLOW_SAMPLE_SIZE}-snapshot subsample, baseline vs candidate mirrored per snapshot)...`);
function strideSample<T>(items: readonly T[], size: number): T[] {
  if (items.length <= size) return [...items];
  const stride = items.length / size;
  const picked: T[] = [];
  for (let i = 0; i < size; i++) picked.push(items[Math.floor(i * stride)]);
  return picked;
}
const budgetFlowSample = strideSample(allSnaps, BUDGET_FLOW_SAMPLE_SIZE);
const budgetFlowRecords: BudgetFlowRecord[] = budgetFlowSample.map((s) => measureBudgetFlow(s.hash, deserializeCube(s.cubeState), libs));
const budgetFlowSummary = summarizeBudgetFlow(budgetFlowRecords);
push("STEP2. Budget Savings Flow:");
push(`  avg PAIR savings (baseline - candidate): ${budgetFlowSummary.avgPairSavingsMs.toFixed(2)}ms`);
push(`  -> avg ENDGAME delta (candidate - baseline): ${budgetFlowSummary.avgEndgameDeltaMs.toFixed(2)}ms (${budgetFlowSummary.endgameAbsorptionPct.toFixed(1)}% of savings)`);
push(`  -> avg RECOVERY delta (candidate - baseline): ${budgetFlowSummary.avgRecoveryDeltaMs.toFixed(2)}ms (${budgetFlowSummary.recoveryAbsorptionPct.toFixed(1)}% of savings)`);
push(`  -> avg unaccounted (savings that went nowhere): ${budgetFlowSummary.avgUnaccountedMs.toFixed(2)}ms (${budgetFlowSummary.unaccountedPct.toFixed(1)}% of savings)`);
push("");

// --- STEP3: Invocation Chain Analysis (full population, reusing STEP1's events) ---
log("STEP3: Invocation Chain Analysis...");
const eventsByHash = new Map<string, StageEvent[]>();
for (const e of allEvents) {
  if (!eventsByHash.has(e.hash)) eventsByHash.set(e.hash, []);
  eventsByHash.get(e.hash)!.push(e);
}
const chainInput = [...eventsByHash.entries()].map(([hash, events]) => ({ hash, events }));
const chainAnalysis = analyzeInvocationChains(chainInput);
push("STEP3. Invocation Chain Analysis (full 335-snapshot population):");
push(`  avg chain length: ${chainAnalysis.avgChainLength.toFixed(2)}, max chain depth: ${chainAnalysis.maxChainDepth}`);
push("  top repeated 2-gram patterns:");
for (const p of chainAnalysis.topPatterns) push(`    ${p.pattern}: ${p.count}`);
push("");

// --- STEP4: Opportunity Loss Analysis (full population, reusing STEP1's events) ---
log("STEP4: Opportunity Loss Analysis...");
const opportunityLossCases: OpportunityLossCase[] = [];
for (const [hash, events] of eventsByHash) {
  const wrong = wrongWingByHash.get(hash);
  if (!wrong) continue;
  const c = classifyOpportunityLoss(hash, wrong.before, wrong.after, events);
  if (c) opportunityLossCases.push(c);
}
const opportunityLossSummary = summarizeOpportunityLoss(opportunityLossCases);
push("STEP4. Opportunity Loss Analysis (cases with zero net improvement, full population):");
push(`  total no-improvement cases: ${opportunityLossSummary.totalCases}/${allSnaps.length}`);
for (const [cat, count] of Object.entries(opportunityLossSummary.byCategory)) {
  push(`  ${cat}: ${count} (${opportunityLossSummary.byCategoryPct[cat as keyof typeof opportunityLossSummary.byCategoryPct].toFixed(1)}%)`);
}
push("");

// --- STEP5: Counterfactual Simulation (subsample, extensionMs from STEP2's own avg savings) ---
log("STEP5: Counterfactual Simulation...");
const extensionMs = Math.max(10, Math.round(budgetFlowSummary.avgPairSavingsMs));
const counterfactualSample = strideSample(allSnaps, BUDGET_FLOW_SAMPLE_SIZE);
const counterfactualResults: CounterfactualResult[] = [];
for (const s of counterfactualSample) {
  const r = simulateRedirection(s.hash, deserializeCube(s.cubeState), libs, extensionMs);
  if (r) counterfactualResults.push(r);
}
const counterfactualSummary = summarizeCounterfactual(counterfactualResults);
push(`STEP5. Counterfactual Simulation (extensionMs=${extensionMs}, from STEP2's own avg PAIR savings, n=${counterfactualSummary.n} snapshots with a real ENDGAME task):`);
push(`  avg baseline improvement (no extension): ${counterfactualSummary.avgBaselineImprovement.toFixed(3)}`);
push(`  avg ENDGAME-extended improvement: ${counterfactualSummary.avgEndgameExtendedImprovement.toFixed(3)}`);
push(`  avg RECOVERY-extended improvement: ${counterfactualSummary.avgRecoveryExtendedImprovement.toFixed(3)}`);
push(`  avg CCR-extended improvement: ${counterfactualSummary.avgCcrExtendedImprovement.toFixed(3)}`);
push(`  best redirection: ${counterfactualSummary.bestRedirection}`);
push("");

// --- STEP6: Bottleneck Attribution Matrix + Level 1-3 + Decision ---
log("STEP6: Bottleneck Attribution Matrix...");
const matrix = computeBottleneckMatrix(opportunityLossSummary, counterfactualSummary, stageRuntime, budgetFlowRecords.length > 0);
push("STEP6. Bottleneck Attribution Matrix:");
for (const row of matrix.rows) {
  push(`  ${row.component}: ${row.contributionPct.toFixed(1)}%`);
  push(`    basis: ${row.basis}`);
}
push(`  Priority 1: ${matrix.priority1}`);
push("");
push("Level 1-3 Judgment:");
push(`  Level1 (병목 위치 정량화): ${matrix.level1Pass ? "PASS" : "FAIL"} -- ${matrix.level1Detail}`);
push(`  Level2 (Budget Flow 완성): ${matrix.level2Pass ? "PASS" : "FAIL"} -- ${matrix.level2Detail}`);
push(`  Level3 (Priority 1 확정): ${matrix.level3Pass ? "PASS" : "FAIL"} -- ${matrix.level3Detail}`);
push("");
push(`DECISION: ${matrix.decision}`);
push(`  ${matrix.decisionRationale}`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
log(`Report written to ${reportPath}`);
log(`DECISION: ${matrix.decision}`);
