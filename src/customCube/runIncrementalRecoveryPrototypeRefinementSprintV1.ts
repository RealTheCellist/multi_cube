// Incremental Recovery Prototype Refinement Sprint v1 -- driver.
//   npx tsx src/customCube/runIncrementalRecoveryPrototypeRefinementSprintV1.ts [dbPath]
//
// STEP1-6 per the Work Order. Refines Prototype Sprint v1's three
// identified bottlenecks (Budget Overrun, whole-cube floor effect,
// Duplicate Invocation) to a resolvable degree. Zero Production Solver /
// Planner / Executor / Recovery / existing Primitive / existing Prototype
// changes -- new directory solverPrimitiveIncrementalRecoveryPrototypeRefinement/
// only.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import { buildWingLibrary, buildFlipLibrary, buildCaseLibrary } from "./fiveByFiveEdges";
import { warmupFiveByFiveEdgeLibraries } from "./fiveByFiveEdgeSolverEngine";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import { analyzePairFailures, type PairFailureRecord } from "./solverPrimitiveIncrementalRecoveryBlueprint/PairFailurePopulationAnalysis";
import { analyzeCcrGate } from "./solverPrimitiveCCRPrototype/CCRGate";
import { analyzeMultiCycle } from "./solverV2Prototype/MultiCycleAnalyzer";
import { evaluateBudgetPolicy, type BudgetPolicyId, type BudgetProbeRecord } from "./solverPrimitiveIncrementalRecoveryPrototypeRefinement/BudgetRefinement";
import { sampleGranularity, summarizeGranularity } from "./solverPrimitiveIncrementalRecoveryPrototypeRefinement/DeadlineGranularityAnalysis";
import { compareVisitedRegistry } from "./solverPrimitiveIncrementalRecoveryPrototypeRefinement/VisitedRegistry";
import { runThreeArms, summarizeThreeArms } from "./solverPrimitiveIncrementalRecoveryPrototypeRefinement/CapabilityBenchmark";
import { evaluateStatistics, decideRefinement } from "./solverPrimitiveIncrementalRecoveryPrototypeRefinement/RefinementReport";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveIncrementalRecoveryPrototypeRefinement/data/incremental-recovery-refinement-v1-report.txt";

const N_RUNS = 30;
const COMPARISON_SUBSAMPLE_SIZE = 75; // same cost-driven, project-standard population as Prototype Sprint v1
// STEP1/2 only need stable AVERAGES (budget/overrun/timeout/success rates,
// granularity timings), not exhaustive enumeration of the full Gate-eligible
// population -- a bounded stride-sample keeps STEP1/2 tractable given the
// N=30 x 3-arm cost STEP5/6 already requires, following the same
// disclosed-subsample-for-cost-reasons precedent as COMPARISON_SUBSAMPLE_SIZE.
const PROBE_POPULATION_CAP = 200;

function strideSample<T>(items: readonly T[], size: number): T[] {
  if (items.length <= size) return [...items];
  const stride = items.length / size;
  const picked: T[] = [];
  for (let i = 0; i < size; i++) picked.push(items[Math.floor(i * stride)]);
  return picked;
}

function nodesFor(record: PairFailureRecord): string[] | null {
  if (record.repairGateEligible) {
    const analysis = analyzeMultiCycle(record.cubies);
    if (analysis) return analysis.cycleNodes;
  }
  if (record.ccrGateEligible) {
    const gate = analyzeCcrGate(record.cubies);
    if (gate.eligible) return gate.primaryCycleNodes;
  }
  return null;
}

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Incremental Recovery Prototype Refinement Sprint v1 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push(
  "Incremental Recovery Prototype Sprint v1(Decision B)에서 확인된 3가지 병목(Budget Overrun 89.1%, whole-cube-solved floor effect, Duplicate Invocation 2315건)을 해결 가능한 수준까지 축소하는 Refinement Sprint다. " +
    "Production Solver/Planner/Executor/Recovery/기존 Primitive/기존 Prototype 코드는 전혀 수정하지 않았다 -- 새 디렉토리 solverPrimitiveIncrementalRecoveryPrototypeRefinement/만 추가했다. " +
    "STEP1/2의 계측 DFS(InstrumentedSearch.ts)는 runCCRPrototype()/runSuccessV2()의 실제 구조(같은 enumerateWingCandidates/applySeq/wrongWingCount5/pairCountOf/validateDeferred 호출)를 그대로 재구현한 것이며, 두 Prototype 파일 자체는 한 줄도 수정하지 않았다.",
);
push();

const t0 = Date.now();
warmupFiveByFiveEdgeLibraries();
const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

const db = loadDatabase(dbPath);
const snapshots = allSnapshots(db);
push(`데이터셋: ${snapshots.length}개 snapshot`);
push();

// --- Build the Gate-eligible probe population (full 335, reusing Blueprint's own analyzePairFailures read-only) ---
log(`Gate 적합 모집단 구축 중 (Blueprint의 analyzePairFailures() 재사용, ${snapshots.length}개 snapshot 전체)...`);
const pairFailures = analyzePairFailures(snapshots, libs);
const gateEligibleRecords = pairFailures.filter((r) => r.ccrGateEligible || r.repairGateEligible);
const sampledGateEligibleRecords = strideSample(gateEligibleRecords, PROBE_POPULATION_CAP);
const probeRecords: BudgetProbeRecord[] = [];
for (const r of sampledGateEligibleRecords) {
  const nodes = nodesFor(r);
  if (nodes) probeRecords.push({ cubies: r.cubies, nodes, remainingTimeMs: r.remainingTimeAtCaptureMs });
}
push(`Gate 적합 기록: ${gateEligibleRecords.length}건 (STEP1/2 비용 이유로 stride-sample ${sampledGateEligibleRecords.length}건 사용, probe 가능: ${probeRecords.length}건)`);
push();

// --- STEP2 (measured BEFORE STEP1's derived policies, since strictDeadline/budgetAwareTraversal need its output) ---
log(`STEP2: Deadline Granularity 분석 중 (${probeRecords.length}건, 관대한 deadline로 자연 종료까지 측정)...`);
const granularitySamples = sampleGranularity(probeRecords, libs.lib);
const granularitySummary = summarizeGranularity(granularitySamples, 40);
push("--- STEP2: Deadline Granularity 분석 ---");
push(`평균 deadline 체크 간 시간(단일 enumerateWingCandidates 호출): ${granularitySummary.avgTimeBetweenDeadlineChecks.toFixed(1)}ms`);
push(`최대 단일 hop 초과 시간: ${granularitySummary.maxSingleHopGenMs.toFixed(1)}ms`);
push(`평균 leaf당 평가 시간: ${granularitySummary.avgLeafEvalMs.toFixed(2)}ms`);
push(`평균 hop당 전체 소요(branch당 시간): ${granularitySummary.avgWallPerHop.toFixed(1)}ms (평균 ${granularitySummary.avgHopsAttempted.toFixed(1)}hop, 평균 ${granularitySummary.avgLeavesExplored.toFixed(1)}leaf)`);
push(`원인 분류: ${granularitySummary.designVsGranularity} -- ${granularitySummary.explanation}`);
push();

// --- STEP1: Budget Contract Refinement (reservedSlice first, to derive the overrun factor STEP1's other policies need) ---
log(`STEP1: Budget Contract 정책 비교 중 (${probeRecords.length}건)...`);
const reservedSliceResult = evaluateBudgetPolicy("reservedSlice", probeRecords, libs.lib, { observedOverrunFactor: 1, avgHopCostMs: granularitySummary.avgWallPerHop });
const observedOverrunFactor = reservedSliceResult.avgTargetBudgetMs > 0 ? reservedSliceResult.avgActualUsedMs / reservedSliceResult.avgTargetBudgetMs : 1;
const strictDeadlineResult = evaluateBudgetPolicy("strictDeadline", probeRecords, libs.lib, { observedOverrunFactor, avgHopCostMs: granularitySummary.avgWallPerHop });
const softDeadlineResult = evaluateBudgetPolicy("softDeadline", probeRecords, libs.lib, { observedOverrunFactor, avgHopCostMs: granularitySummary.avgWallPerHop });
const budgetAwareResult = evaluateBudgetPolicy("budgetAwareTraversal", probeRecords, libs.lib, { observedOverrunFactor, avgHopCostMs: granularitySummary.avgWallPerHop });
const budgetResults = [reservedSliceResult, strictDeadlineResult, softDeadlineResult, budgetAwareResult];

push("--- STEP1: Budget Contract Refinement ---");
push(`실측 Overrun Factor(reservedSlice 기준, 이번 run): ${observedOverrunFactor.toFixed(2)}x`);
for (const r of budgetResults) {
  push(`[${r.policy}] n=${r.n}, 평균 목표 budget=${r.avgTargetBudgetMs.toFixed(1)}ms, 평균 실제 사용=${r.avgActualUsedMs.toFixed(1)}ms, overrun율=${(r.overrunRate * 100).toFixed(1)}%, timeout율=${(r.timeoutRate * 100).toFixed(1)}%, 성공률=${(r.successRate * 100).toFixed(1)}%`);
}
// Selection rule: minimize overrun WITHOUT gutting success rate -- a policy
// that truncates the traversal so aggressively it can never find a leaf
// (e.g. budgetAwareTraversal when avgHopCostMs is large relative to the
// budget) would "win" on overrun alone while being useless in practice.
// Only consider policies whose successRate holds up to at least half of
// reservedSlice's own (the untruncated baseline); if none qualify, fall
// back to reservedSlice itself rather than pick a hollow win.
const minAcceptableSuccessRate = reservedSliceResult.successRate * 0.5;
const viablePolicies = budgetResults.filter((r) => r.successRate >= minAcceptableSuccessRate);
const bestPolicy = (viablePolicies.length ? viablePolicies : [reservedSliceResult]).reduce((best, cur) => (cur.overrunRate < best.overrunRate ? cur : best));
push(
  `선정된 정책(overrun율 최소, 단 성공률이 reservedSlice의 절반 미만인 정책은 제외): ${bestPolicy.policy} (overrun율 ${(bestPolicy.overrunRate * 100).toFixed(1)}%, 성공률 ${(bestPolicy.successRate * 100).toFixed(1)}%, reservedSlice 대비 overrun ${(reservedSliceResult.overrunRate ? (1 - bestPolicy.overrunRate / reservedSliceResult.overrunRate) * 100 : 0).toFixed(1)}% 감소)`,
);
push();

const refinementPolicy: BudgetPolicyId = bestPolicy.policy;

// --- STEP4: Visited Registry (75-snapshot subsample, single pass -- deterministic effect, no run-to-run variance in the comparison itself) ---
const subsample = strideSample(snapshots, COMPARISON_SUBSAMPLE_SIZE);
const policyCtx = { observedOverrunFactor, avgHopCostMs: granularitySummary.avgWallPerHop };
log(`STEP4: Visited Registry 효과 측정 중 (${subsample.length}개 snapshot, refinement policy=${refinementPolicy} 기준)...`);
const registryComparison = compareVisitedRegistry(subsample, libs, libs.lib, refinementPolicy, policyCtx);
push("--- STEP4: Duplicate Invocation 제거 (Visited Registry) ---");
push(`Registry 없음 -- Duplicate Invocation 총 ${registryComparison.withoutRegistry.totalDuplicateInvocations}건, 평균 finalWrongWingCount ${registryComparison.withoutRegistry.avgFinalWrongWingCount.toFixed(2)}, 평균 Runtime ${registryComparison.withoutRegistry.avgTotalMs.toFixed(1)}ms`);
push(`Registry 있음 -- Duplicate Invocation 총 ${registryComparison.withRegistry.totalDuplicateInvocations}건, 평균 finalWrongWingCount ${registryComparison.withRegistry.avgFinalWrongWingCount.toFixed(2)}, 평균 Runtime ${registryComparison.withRegistry.avgTotalMs.toFixed(1)}ms`);
push(`Duplicate 감소율: ${(registryComparison.duplicateReductionRate * 100).toFixed(1)}%`);
push(`Capability 변화(양수=개선): ${registryComparison.capabilityDelta.toFixed(3)} wrongWingCount`);
push(`Regression(Registry 적용 후 오히려 나빠진 snapshot 수): ${registryComparison.regressionCount}건`);
push();

// --- STEP3/5/6: Task-Level Evaluation + 3-arm Capability Benchmark + Statistical Evaluation, N=30 over the same subsample ---
log(`STEP3/5/6: 3-arm Capability Benchmark 수집 중 (N=${N_RUNS}, ${subsample.length}개 snapshot씩, Refinement=${refinementPolicy}+Registry)...`);
const perRunPrototypeV1ImprovedCount: number[] = [];
const perRunRefinementImprovedCount: number[] = [];
let lastSummary: ReturnType<typeof summarizeThreeArms> | null = null;
let taskLevelMetricsAccum: ReturnType<typeof summarizeThreeArms>["taskLevelImprovement"] | null = null;

for (let i = 0; i < N_RUNS; i++) {
  log(`  run ${i + 1}/${N_RUNS}...`);
  const run = runThreeArms(subsample, libs, libs.lib, refinementPolicy, policyCtx);
  const summary = summarizeThreeArms(run);
  lastSummary = summary;
  taskLevelMetricsAccum = summary.taskLevelImprovement;
  const v1Improvement = summary.taskLevelImprovement.find((t) => t.arm === "prototypeV1Config")!.wholeCube;
  const refinementImprovement = summary.taskLevelImprovement.find((t) => t.arm === "refinement")!.wholeCube;
  perRunPrototypeV1ImprovedCount.push(v1Improvement.improvedCount);
  perRunRefinementImprovedCount.push(refinementImprovement.improvedCount);
}

push("--- STEP3: Task-Level Capability Evaluation (마지막 run 기준) ---");
if (lastSummary && taskLevelMetricsAccum) {
  push(`[Baseline] 평균 finalWrongWingCount=${lastSummary.baseline.avgFinalWrongWingCount.toFixed(2)}, 평균 Runtime=${lastSummary.baseline.avgRuntimeMs.toFixed(1)}ms, Deadline Miss=${(lastSummary.baseline.deadlineMissRate * 100).toFixed(1)}%`);
  push(`[Prototype v1 설정] Coverage=${(lastSummary.prototypeV1Config.coverage * 100).toFixed(1)}%, Precision=${(lastSummary.prototypeV1Config.precision * 100).toFixed(1)}%, Recall=${(lastSummary.prototypeV1Config.recall * 100).toFixed(1)}%, 평균 finalWrongWingCount=${lastSummary.prototypeV1Config.avgFinalWrongWingCount.toFixed(2)}`);
  push(`[Refinement] Coverage=${(lastSummary.refinement.coverage * 100).toFixed(1)}%, Precision=${(lastSummary.refinement.precision * 100).toFixed(1)}%, Recall=${(lastSummary.refinement.recall * 100).toFixed(1)}%, 평균 finalWrongWingCount=${lastSummary.refinement.avgFinalWrongWingCount.toFixed(2)}`);
  for (const t of taskLevelMetricsAccum) {
    push(
      `[${t.arm} vs Baseline, whole-cube] 개선 ${t.wholeCube.improvedCount}건, 악화 ${t.wholeCube.regressedCount}건, 불변 ${t.wholeCube.unchangedCount}건, 평균 wrongWing 차이 ${t.wholeCube.avgWrongWingDelta.toFixed(3)}, ` +
        `task-level 성공과의 상관계수: ${t.wholeCube.pointBiserialCorrelation === null ? "정의되지 않음(분산 없음)" : t.wholeCube.pointBiserialCorrelation.toFixed(3)}`,
    );
  }
}
push();

push("--- STEP5: Capability Benchmark (3-arm, N=" + N_RUNS + " 평균) ---");
if (lastSummary) {
  push(`Coverage/Precision/Recall/Runtime/DeadlineMiss/Duplicate/Task-level/Whole-cube -- 위 STEP3/4 수치 참고 (동일 데이터, 마지막 run 스냅샷).`);
}
push();

// --- STEP6: Statistical Evaluation ---
log("STEP6: Statistical Evaluation (paired-diff, effect size)...");
const stats = evaluateStatistics(perRunRefinementImprovedCount, perRunPrototypeV1ImprovedCount);
push("--- STEP6: Statistical Evaluation ---");
push(`N=${stats.n}`);
push(`Paired-diff(Refinement 개선 건수 - Prototype v1 개선 건수) -- 평균 ${stats.pairedDiffStats.mean.toFixed(2)}, stddev ${stats.pairedDiffStats.stddev.toFixed(2)}, 95% CI [${stats.pairedDiffStats.ciLower.toFixed(2)}, ${stats.pairedDiffStats.ciUpper.toFixed(2)}]`);
push(`Effect Size(Cohen's d_z): ${stats.effectSize.cohensD.toFixed(3)} (${stats.effectSize.magnitude}), Variance: ${stats.effectSize.variance.toFixed(3)}`);
push(`CI 하한 > 0: ${stats.ciExcludesZero}`);
push();

// --- 성공 기준 판정 ---
push("--- 성공 기준 판정 ---");
const decisionResult = decideRefinement(reservedSliceResult.overrunRate, bestPolicy.overrunRate, registryComparison.withoutRegistry.totalDuplicateInvocations, registryComparison.withRegistry.totalDuplicateInvocations, registryComparison.regressionCount, stats);

push(
  `Level 1 (Budget Overrun 89.1% ↓ 유의미하게 감소): ${decisionResult.level1Pass ? "PASS" : "FAIL"} -- reservedSlice overrun율 ${(reservedSliceResult.overrunRate * 100).toFixed(1)}% -> ${bestPolicy.policy} overrun율 ${(bestPolicy.overrunRate * 100).toFixed(1)}% (기준: 50% 이상 감소).`,
);
push(
  `Level 2 (Duplicate Invocation 2315건 ↓ 감소, Regression 0 유지): ${decisionResult.level2Pass ? "PASS" : "FAIL"} -- ${registryComparison.withoutRegistry.totalDuplicateInvocations}건 -> ${registryComparison.withRegistry.totalDuplicateInvocations}건 (감소율 ${(registryComparison.duplicateReductionRate * 100).toFixed(1)}%), Regression ${registryComparison.regressionCount}건.`,
);
push(
  `Level 3 (Task-level Capability가 재현 가능한 평가 지표임을 입증): ${decisionResult.level3Pass ? "PASS" : "FAIL"} -- paired-diff CI [${stats.pairedDiffStats.ciLower.toFixed(2)}, ${stats.pairedDiffStats.ciUpper.toFixed(2)}](하한>0=${stats.ciExcludesZero}), Effect Size ${stats.effectSize.cohensD.toFixed(3)}(${stats.effectSize.magnitude}).`,
);
push();

push(`--- Decision: ${decisionResult.decision} ---`);
if (decisionResult.decision === "A") push("Prototype이 안정화되었으며 Integration Blueprint로 진행 가능.");
else if (decisionResult.decision === "B") push("메커니즘은 유지되나 추가 Refinement 필요.");
else push("Prototype 구조 자체를 재설계해야 함.");
push();

const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
push(`--- 총 소요 시간: ${totalSec}초 ---`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
log(`리포트 저장: ${reportPath}`);
log(`Decision: ${decisionResult.decision}`);
