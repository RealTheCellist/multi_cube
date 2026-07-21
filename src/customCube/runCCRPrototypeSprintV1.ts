// CCR Prototype Sprint v1 -- driver.
//   npx tsx src/customCube/runCCRPrototypeSprintV1.ts [dbPath]
//
// STEP1-6 per the Work Order: implement runCCRPrototype() reusing the
// bounded DFS + Deferred Validation search core AS-IS (new Gate/Budget/
// Scheduling only, no new search algorithm); apply CCR's own strict Gate
// (cycleLength 5~6, conflictEdgeCount=0 -- no relaxation, no coarsening
// this Sprint); compare 4 candidate budgets (150/250/500/1000ms) instead
// of reusing REPAIR's own 75ms reservedBudget as-is; compare single-cycle
// vs multi-cycle traversal strategies; run the Standard Evaluation
// Protocol (Majority Vote Gap + paired-diff 95% CI, N>=15) comparing
// Baseline (REPAIR only) vs Candidate (REPAIR + CCR); and verify CCR adds
// a genuinely new, non-duplicate capability. No production file is
// modified -- fiveByFiveEdgeSolverEngine.ts/Planner/Executor/Recovery/
// SuccessOptimizationV2/DeferredValidator/MultiCycleAnalyzer are all
// read-only (called exactly as-is via their existing exports).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import { deserializeCube } from "./failureAnalysis/cubeSerialization";
import { buildLibs } from "./solverPrimitiveIntegrationPrototype/RecoveryBenchmark";
import { analyzeCcrGate } from "./solverPrimitiveCCRPrototype/CCRGate";
import { CANDIDATE_BUDGETS_MS, runBudgetProbe, summarizeBudgetProbe, type BudgetSummary, type InstrumentedResult } from "./solverPrimitiveCCRPrototype/CCRBudgetComparison";
import { compareMultiCycleStrategies } from "./solverPrimitiveCCRPrototype/CCRMultiCycleStrategy";
import { collectRun, type RunRecord } from "./solverPrimitiveCCRPrototype/RawDataCollector";
import { evaluateAdaptive } from "./solverPrimitiveCCRPrototype/Evaluation";
import { verifyCcrTargetSubset } from "./solverPrimitiveCCRPrototype/CCRTargetSubsetVerification";
import { analyzeInteraction } from "./solverPrimitiveCCRPrototype/PrimitiveInteractionAnalysis";
import type { CCRStrategy } from "./solverPrimitiveCCRPrototype/CCRPrototype";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveCCRPrototype/data/ccr-prototype-v1-report.txt";
const INITIAL_N = 15;
const EXTENSION_STEP = 15;
const MAX_N = 30;

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("CCR Prototype Sprint v1 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("Primitive Discovery Sprint #3의 Blueprint(docs/BLUEPRINT_PRIMITIVE_2_CCR.md)를 기반으로 Primitive #2(CCR)의 첫 Prototype을 구현했다. 새 탐색 알고리즘은 만들지 않는다 -- bounded DFS + Deferred Validation을 그대로 재사용하고(enumerateWingCandidates/applySeq/wrongWingCount5/pairCountOf/validateDeferred 전부 기존 export 그대로), Gate(cycleLength 5~6, conflictEdgeCount=0, 완화 없음)/Budget Contract/Scheduling만 새로 설계했다. solverPrimitiveCCRPrototype/ 디렉토리만 추가했고, Production 코드는 전혀 수정하지 않았다.");
push();

const t0 = Date.now();
const db = loadDatabase(dbPath);
const snapshots = allSnapshots(db);
const { lib, libs } = buildLibs();
push(`데이터셋: ${snapshots.length}개 snapshot (지금까지의 연구와 동일)`);

const ccrTargetSnapshots = snapshots.filter((s) => analyzeCcrGate(deserializeCube(s.cubeState)).eligible);
push(`CCR 대상(cycleLength 5~6, conflictEdgeCount=0): ${ccrTargetSnapshots.length}건`);
push();

// --- STEP3: Budget Contract ---
log(`STEP3: Budget Contract 비교 중 (후보: ${CANDIDATE_BUDGETS_MS.join(", ")}ms, singleCycle 전략, ${ccrTargetSnapshots.length}건)...`);
const budgetSummaries: BudgetSummary[] = [];
for (const budgetMs of CANDIDATE_BUDGETS_MS) {
  log(`  budget=${budgetMs}ms 실행 중...`);
  const results: InstrumentedResult[] = [];
  for (const s of ccrTargetSnapshots) {
    const cubies = deserializeCube(s.cubeState);
    const r = runBudgetProbe(cubies, lib, budgetMs, "singleCycle");
    if (r) results.push(r);
  }
  budgetSummaries.push(summarizeBudgetProbe(budgetMs, results));
}
push("--- STEP3: Budget Contract 비교 (singleCycle 전략) ---");
push("budget(ms) | matchRate | leaves | nodes | leafCap | deadlineHit | avgTime(ms)");
for (const b of budgetSummaries) {
  push(`  ${b.budgetMs}ms: match=${(b.matchRate * 100).toFixed(1)}%(${b.successCount}/${b.n}) leaves=${b.avgLeavesExplored.toFixed(1)} nodes=${b.avgNodesVisited.toFixed(1)} leafCap=${(b.leafCapHitRate * 100).toFixed(1)}% deadline=${(b.deadlineHitRate * 100).toFixed(1)}% avgTime=${b.avgTimeMs.toFixed(1)}ms`);
}

// Data-driven budget choice: smallest budget reaching >=90% of the best
// observed matchRate (diminishing-returns cutoff, disclosed) -- avoids
// blindly picking the largest budget when a smaller one already captures
// nearly all the achievable benefit.
const bestMatchRate = Math.max(...budgetSummaries.map((b) => b.matchRate));
const chosenBudgetSummary = budgetSummaries.find((b) => b.matchRate >= bestMatchRate * 0.9) ?? budgetSummaries[budgetSummaries.length - 1];
const chosenBudgetMs = chosenBudgetSummary.budgetMs;
push(`선택된 Budget: ${chosenBudgetMs}ms (최고 match율 ${(bestMatchRate * 100).toFixed(1)}%의 90% 이상을 달성하는 가장 작은 예산 -- diminishing returns 기준)`);
push();

// --- STEP4: Multi-cycle Strategy ---
log(`STEP4: Multi-cycle 전략 비교 중 (budget=${chosenBudgetMs}ms, ${ccrTargetSnapshots.length}건)...`);
const ccrTargetCubies = ccrTargetSnapshots.map((s) => deserializeCube(s.cubeState));
const strategyComparison = compareMultiCycleStrategies(ccrTargetCubies, lib, chosenBudgetMs);
push(`--- STEP4: Multi-cycle Strategy 비교 (budget=${chosenBudgetMs}ms) ---`);
push(`전략 A(singleCycle, 현재 방식): match=${(strategyComparison.strategyA.matchRate * 100).toFixed(1)}%(${strategyComparison.strategyA.successCount}/${strategyComparison.strategyA.n}) leaves=${strategyComparison.strategyA.avgLeavesExplored.toFixed(1)} avgTime=${strategyComparison.strategyA.avgTimeMs.toFixed(1)}ms`);
push(`전략 B(multiCycle, 다중 cycle 동시 고려): match=${(strategyComparison.strategyB.matchRate * 100).toFixed(1)}%(${strategyComparison.strategyB.successCount}/${strategyComparison.strategyB.n}) leaves=${strategyComparison.strategyB.avgLeavesExplored.toFixed(1)} avgTime=${strategyComparison.strategyB.avgTimeMs.toFixed(1)}ms`);

const chosenStrategy: CCRStrategy = strategyComparison.strategyB.matchRate > strategyComparison.strategyA.matchRate ? "multiCycle" : "singleCycle";
push(`선택된 전략: ${chosenStrategy} (match율이 더 높은 쪽 -- A=${(strategyComparison.strategyA.matchRate * 100).toFixed(1)}% vs B=${(strategyComparison.strategyB.matchRate * 100).toFixed(1)}%)`);
push();

// --- STEP5: Capability Benchmark ---
log(`STEP5: Capability Benchmark 실행 중 (budget=${chosenBudgetMs}ms, strategy=${chosenStrategy}, N=${INITIAL_N} 시작, 최대 N=${MAX_N})...`);
const collectBatch = (times: number): RunRecord[] => {
  const batch: RunRecord[] = [];
  for (let i = 0; i < times; i++) {
    log(`  진행: run ${i + 1}/${times}`);
    batch.push(collectRun(snapshots, lib, libs, chosenBudgetMs, chosenStrategy));
  }
  return batch;
};
const adaptive = evaluateAdaptive(collectBatch, INITIAL_N, EXTENSION_STEP, MAX_N);
const { runs, metrics, runsUsed, reachedDecisive } = adaptive;
const { baseline, candidate } = metrics;

push(`--- STEP5: Capability Benchmark (Standard Evaluation Protocol, N=${runsUsed}, ${reachedDecisive ? "초기 N에서 결정적" : "확장 시도"}) ---`);
push(`[Baseline -- REPAIR only] Coverage: ${(baseline.coverage * 100).toFixed(1)}%, Precision: ${(baseline.precision * 100).toFixed(1)}%, GapRescue 평균 ${baseline.gapRescueStats.mean.toFixed(2)}/run, Regression ${baseline.regressionCount}건`);
push(`[Candidate -- REPAIR + CCR Prototype] Coverage: ${(candidate.coverage * 100).toFixed(1)}%, Precision: ${(candidate.precision * 100).toFixed(1)}%, GapRescue 평균 ${candidate.gapRescueStats.mean.toFixed(2)}/run, Regression ${candidate.regressionCount}건`);
push(`paired-diff(Candidate - Baseline) GapRescue: 평균 ${candidate.pairedDiffVsBaselineStats.mean.toFixed(3)}, 95% CI [${candidate.pairedDiffVsBaselineStats.ciLower.toFixed(3)}, ${candidate.pairedDiffVsBaselineStats.ciUpper.toFixed(3)}]`);
push();

const target = verifyCcrTargetSubset(runs);
push(`--- STEP5 (계속): CCR 대상 173(실측 ${target.totalInTarget})건 subset 검증 ---`);
push(`Baseline이 이 subset에서 성공한 건수(구조상 0이어야 함): ${target.baselineSucceededCount}`);
push(`Candidate가 최소 1회라도 성공한 hash 수: ${target.candidateSucceededAtLeastOnce}/${target.totalInTarget}`);
push(`Candidate가 과반수 run에서 안정적으로 성공한 hash 수: ${target.candidateSucceededMajority}/${target.totalInTarget}`);
push(`Candidate의 run당 평균 성공률(target subset 대비): ${(target.avgCandidateSuccessRate * 100).toFixed(1)}%`);
push();

// --- STEP6: Primitive Interaction ---
log("STEP6: Primitive Interaction 분석 중...");
const interaction = analyzeInteraction(runs);
push("--- STEP6: Primitive Interaction ---");
push(`REPAIR 과반수 성공 hash 수: ${interaction.repairMajoritySuccessCount}/${interaction.totalHashes}`);
push(`CCR 과반수 성공 hash 수: ${interaction.ccrMajoritySuccessCount}/${interaction.totalHashes}`);
push(`Duplicate Success(둘 다 과반수 성공, 기대값 0 -- Gate가 서로소이므로): ${interaction.duplicateSuccessCount}`);
push(`REPAIR 전용(Exclusive) 성공: ${interaction.repairExclusiveCount}`);
push(`CCR 전용(Exclusive) 성공(REPAIR가 닿지 못하는 새 Capability): ${interaction.ccrExclusiveCount}`);
push();

// --- Success criteria + Decision ---
log("성공 기준 판정 + 최종 결정");
const level1Pass = target.candidateSucceededMajority > 0 && target.avgCandidateSuccessRate > 0;
const level2Pass = candidate.pairedDiffVsBaselineStats.ciLower > 0;
const level3Pass = interaction.duplicateSuccessCount === 0 && interaction.ccrExclusiveCount > 0 && candidate.regressionCount <= baseline.regressionCount;

push("--- 성공 기준 판정 ---");
push(`Level 1 (CCR가 안정적으로 동작): ${level1Pass ? "PASS" : "FAIL"} (과반수 안정 성공 ${target.candidateSucceededMajority}/${target.totalInTarget}, 평균 성공률 ${(target.avgCandidateSuccessRate * 100).toFixed(1)}%)`);
push(`Level 2 (paired-diff CI가 0을 배제): ${level2Pass ? "PASS" : "FAIL"} (95% CI [${candidate.pairedDiffVsBaselineStats.ciLower.toFixed(3)}, ${candidate.pairedDiffVsBaselineStats.ciUpper.toFixed(3)}])`);
push(`Level 3 (REPAIR와 중복되지 않는 새로운 Capability 확보): ${level3Pass ? "PASS" : "FAIL"} (Duplicate ${interaction.duplicateSuccessCount}건, CCR 전용 ${interaction.ccrExclusiveCount}건, Regression 기존 ${baseline.regressionCount}건 vs 새 ${candidate.regressionCount}건)`);
push();

const decision: "A" | "B" = level1Pass && level2Pass && level3Pass ? "A" : "B";
push(`--- 최종 결정: ${decision} ---`);
if (decision === "A") {
  push(`CCR Prototype이 안정적으로 동작하고, REPAIR와 중복되지 않는 새로운 Capability(${interaction.ccrExclusiveCount}건 전용 성공)를 확보했으며, paired-diff CI가 0을 배제한다. 선택된 설정: budget=${chosenBudgetMs}ms, strategy=${chosenStrategy}. 다음 단계: CCR Integration Blueprint Sprint v1 (Production Integration Point/Budget Contract/Scheduling/Risk 분석).`);
} else {
  push("일부 기준이 충족되지 않았다 -- CCR Prototype Refinement Sprint v1(Budget 최적화/Multi-cycle 개선/Search Pruning)이 필요하다.");
}
push();

const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
push(`--- 총 소요 시간: ${totalSec}초 ---`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
log(`리포트 저장: ${reportPath}`);
log(`선택된 설정: budget=${chosenBudgetMs}ms, strategy=${chosenStrategy}`);
log(`사용한 N: ${runsUsed}, 최종 결정: ${decision}`);
