// Solver Primitive Integration Refinement Sprint v1 -- driver.
//   npx tsx src/customCube/runIntegrationRefinement.ts [failuresDbPath]
// Compares 3 Recovery candidate-generation scheduling strategies
// (baseline/priorityGate/reservedBudget) on the real 150-replay Dataset,
// using the REAL production generateRecoveryStrategies/executeTask (this
// Sprint's own disclosed additions to fiveByFiveEdgeRecovery.ts/
// fiveByFiveEdgeExecutor.ts). Solver/Planner/Primitive Registry/
// MultiHopBridgePrototypeV3/W2 Primitive/DeferredValidator untouched.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildLibs, loadDataset } from "./solverPrimitiveIntegrationPrototype/RecoveryBenchmark";
import { analyzeTimeBudget } from "./solverPrimitiveIntegrationPrototype/TimeBudgetAnalysis";
import { SCHEDULING_VARIANTS, type SchedulingStrategy } from "./solverPrimitiveIntegrationRefinement/SchedulingVariants";
import { collectMultipleGenerationRuns, collectMultipleGapRuns, type VariantGenerationRun, type GapRunRecord } from "./solverPrimitiveIntegrationRefinement/RefinementRawDataCollector";
import { summarizeSchedulingVerification, type SchedulingVerificationSummary } from "./solverPrimitiveIntegrationRefinement/SchedulingVerificationReport";
import { summarizeBudgetProfile, type BudgetProfileSummary } from "./solverPrimitiveIntegrationRefinement/BudgetProfileReport";
import { evaluateSchedulingCapability, type VariantCapabilityMetrics } from "./solverPrimitiveIntegrationRefinement/IntegrationBenchmarkRefinement";
import { analyzeRecoveryInteraction, summarizeInteraction, summarizeCost } from "./solverPrimitiveIntegrationRefinement/RecoveryInteractionAnalysis";
import { decideRefinementOutcome } from "./solverPrimitiveIntegrationRefinement/RefinementDecision";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveIntegrationRefinement/data/integration-refinement-v1-report.txt";
const N_RUNS = 15; // Standard Evaluation Protocol's own minimum (STEP3), reused for STEP1/2 too so all three STEPs share the SAME raw runs (no redundant re-collection)

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Solver Primitive Integration Refinement Sprint v1 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("Integration Prototype Sprint v1이 확인한 병목(Recovery candidate generation의 budget starvation -- DISRUPT/SETUP이 공유 genDeadline을 먼저 소진해 REPAIR의 차례가 사실상 배제됨)을 해결할 수 있는 Recovery Scheduling 전략 2가지(Strategy A: priorityGate, Strategy B: reservedBudget)를 baseline과 비교한다. 새 Primitive를 만들지 않고, 기존 W2 구현(runSuccessV2)을 그대로 재사용한다. Solver/Planner/Primitive Registry/MultiHopBridgePrototypeV3/W2 Primitive/DeferredValidator는 전혀 수정하지 않았다.");
push();

const t0 = Date.now();
log("데이터셋 로드 중...");
const snapshots = loadDataset(failuresDbPath);
const { lib, libs } = buildLibs();
push(`데이터셋: ${snapshots.length}개 replay, N=${N_RUNS}회 반복`);
push();

log("Gate matched 격리 측정 (scheduling 무관, 기준값)");
const timeBudget = analyzeTimeBudget(snapshots, lib);
push(`--- 참고: Gate matched (analyzeMultiCycle+conflictEdgeCount>0, scheduling과 무관한 격리 측정) ---`);
push(`Gate 통과: ${timeBudget.gateMatchedCount}/${timeBudget.n} (${((timeBudget.gateMatchedCount / timeBudget.n) * 100).toFixed(1)}%)`);
push();

log(`Gap 분류용 baseline 데이터 수집 (N=${N_RUNS}, scheduling과 무관, 1회만 수집)`);
const gapRuns: GapRunRecord[] = collectMultipleGapRuns(snapshots, libs, N_RUNS);

const strategies: SchedulingStrategy[] = ["baseline", "priorityGate", "reservedBudget"];
const runsByStrategy = {} as Record<SchedulingStrategy, VariantGenerationRun[]>;
const verificationByStrategy = {} as Record<SchedulingStrategy, SchedulingVerificationSummary>;
const budgetProfileByStrategy = {} as Record<SchedulingStrategy, BudgetProfileSummary>;

for (const strategy of strategies) {
  log(`STEP1/2 데이터 수집: ${strategy} (N=${N_RUNS} x ${snapshots.length}개 snapshot)`);
  const runs = collectMultipleGenerationRuns(snapshots, libs, strategy, N_RUNS);
  runsByStrategy[strategy] = runs;
  verificationByStrategy[strategy] = summarizeSchedulingVerification(strategy, runs);
  budgetProfileByStrategy[strategy] = summarizeBudgetProfile(strategy, runs);
}

push("--- 1. STEP1: Scheduling Verification ---");
for (const strategy of strategies) {
  const v = verificationByStrategy[strategy];
  const label = SCHEDULING_VARIANTS.find((s) => s.strategy === strategy)!.label;
  push(`[${label}]`);
  push(`  REPAIR 생성률: ${(v.repairGeneratedRate * 100).toFixed(1)}% (관측 ${v.observations}건)`);
  push(`  Generation Skipped(REPAIR 차례 자체가 시작 못 됨): ${(v.generationSkippedRate * 100).toFixed(1)}%`);
  push(`  Attempted-but-empty(시도했으나 후보 없음 -- Gate 불일치 또는 자체 슬라이스 소진, 구분 안 함): ${(v.attemptedButEmptyRate * 100).toFixed(1)}%`);
  push(`  전체 호출이 nominal budget(300ms) 초과: ${(v.wholeCallOverBudgetRate * 100).toFixed(1)}%`);
}
push();

push("--- 2. STEP2: Budget Profile ---");
for (const strategy of strategies) {
  const b = budgetProfileByStrategy[strategy];
  const label = SCHEDULING_VARIANTS.find((s) => s.strategy === strategy)!.label;
  push(`[${label}]`);
  push(`  평균 generation 시간: ${b.avgGenerationTimeMs.toFixed(1)}ms`);
  push(`  REPAIR 시도된 경우 평균 시작 offset: ${b.avgRepairStartOffsetMsAmongAttempted.toFixed(1)}ms`);
  push(`  REPAIR 시작 시점 평균 잔여 예산: ${b.avgRemainingBudgetAtRepairStartMs.toFixed(1)}ms (음수 = 이미 nominal 300ms를 넘긴 뒤 시작)`);
  push(`  timeout ratio: ${(b.timeoutRatio * 100).toFixed(1)}%`);
}
push();

log("STEP3: Integration Benchmark (Standard Evaluation Protocol)");
const capabilityMetrics = evaluateSchedulingCapability(runsByStrategy, gapRuns);
const capabilityByStrategy = {} as Record<SchedulingStrategy, VariantCapabilityMetrics>;
for (const m of capabilityMetrics) capabilityByStrategy[m.strategy] = m;

push("--- 3. STEP3: Integration Benchmark (Majority Vote Gap + paired-diff 95% CI, N=" + N_RUNS + ") ---");
for (const m of capabilityMetrics) {
  const label = SCHEDULING_VARIANTS.find((s) => s.strategy === m.strategy)!.label;
  push(`[${label}]`);
  push(`  Coverage: ${(m.coverage * 100).toFixed(1)}%, Precision: ${(m.precision * 100).toFixed(1)}%`);
  push(`  GapRescue: 평균 ${m.gapRescueStats.mean.toFixed(2)}/run (stddev ${m.gapRescueStats.stddev.toFixed(2)})`);
  push(`  paired-diff vs baseline: 평균 ${m.pairedDiffVsBaselineStats.mean.toFixed(3)}, 95% CI [${m.pairedDiffVsBaselineStats.ciLower.toFixed(3)}, ${m.pairedDiffVsBaselineStats.ciUpper.toFixed(3)}]`);
  push(`  Regression(전체 run 합산): ${m.regressionCount}건`);
}
push();

const interactionSummaries: Record<string, ReturnType<typeof summarizeInteraction>> = {};
const costSummaries: Record<string, ReturnType<typeof summarizeCost>> = {};
push("--- 4. STEP4: Recovery Interaction + 5. STEP5: Cost (단일 pass, executeTask 전체 경로) ---");
for (const strategy of strategies) {
  log(`STEP4/5: ${strategy} (${snapshots.length}개 snapshot, 단일 pass)`);
  const records = analyzeRecoveryInteraction(snapshots, libs, strategy);
  const interaction = summarizeInteraction(strategy, records);
  const cost = summarizeCost(strategy, records);
  interactionSummaries[strategy] = interaction;
  costSummaries[strategy] = cost;
  const label = SCHEDULING_VARIANTS.find((s) => s.strategy === strategy)!.label;
  push(`[${label}]`);
  push(`  DISRUPT 사용률: ${(interaction.disruptUsageRate * 100).toFixed(1)}%, SETUP 사용률: ${(interaction.setupUsageRate * 100).toFixed(1)}%, REPAIR 사용률: ${(interaction.repairUsageRate * 100).toFixed(1)}%`);
  push(`  평균 retry 횟수: ${interaction.avgRetryCount.toFixed(2)}, short-circuit 비율: ${(interaction.shortCircuitRate * 100).toFixed(1)}%`);
  push(`  평균 runtime: ${cost.avgRuntimeMs.toFixed(1)}ms, p99: ${cost.p99RuntimeMs}ms, 평균 heap delta: ${(cost.avgHeapDeltaBytes / 1024).toFixed(1)}KB(근사치, GC 타이밍에 민감), deadline miss율: ${(cost.deadlineMissRate * 100).toFixed(1)}%`);
}
push();

log("Level 1~3 판정 + 최종 결정");
const outcome = decideRefinementOutcome(verificationByStrategy, capabilityByStrategy);
push("--- 6. 성공 기준 판정 (Strategy별) ---");
for (const o of outcome.strategyOutcomes) {
  const label = SCHEDULING_VARIANTS.find((s) => s.strategy === o.strategy)!.label;
  push(`[${label}]`);
  push(`  Level 1 (REPAIR 생성률 명확히 증가): ${o.level1Pass ? "PASS" : "FAIL"}`);
  push(`  Level 2 (paired-diff CI가 0을 배제): ${o.level2Pass ? "PASS" : "FAIL"}`);
  push(`  Level 3 (Regression 증가 없이 Starvation 제거): ${o.level3Pass ? "PASS" : "FAIL"}`);
  push(`  Scheduling 개선 여부(STEP1/2만): ${o.schedulingImproved ? "예" : "아니오"} / Capability 개선 여부(STEP3만): ${o.capabilityImproved ? "예" : "아니오"}`);
  push(`  ${o.rationale}`);
}
push();
push(`--- 7. 최종 결정: ${outcome.decision} ---`);
push(outcome.rationale);
if (outcome.bestStrategy) push(`권장 Strategy: ${outcome.bestStrategy}`);
push();

const totalMs = Date.now() - t0;
push(`--- 총 소요 시간: ${(totalMs / 1000).toFixed(1)}초 ---`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
log(`리포트 저장: ${reportPath}`);
log(`총 소요 시간: ${(totalMs / 1000).toFixed(1)}초`);
log(`최종 결정: ${outcome.decision}`);
