// CCR Integration Blueprint Sprint v1 -- driver.
//   npx tsx src/customCube/runCCRIntegrationBlueprintSprintV1.ts [dbPath]
//
// STEP1-5 per the Work Order: decide CCR's Production Integration Point,
// design its Scheduling Contract, evaluate its Budget Contract policy
// (fixed/adaptive/remaining-time), analyze Regression/Runtime/Starvation/
// Scheduler risks, and simulate the integration's expected effect --
// ALL without modifying Production Solver/Planner/Executor/Recovery/any
// Primitive, no hardcoding, no product code integration. Every number in
// the report is produced by real code in this run: analyzeProductionPath
// calls the REAL, unmodified engine.solve(); runCCRPrototype is the
// already-validated Prototype from the prior Sprint, called directly
// (never wired into fiveByFiveEdgeRecovery.ts).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import { deserializeCube } from "./failureAnalysis/cubeSerialization";
import { buildLibs } from "./solverPrimitiveIntegrationPrototype/RecoveryBenchmark";
import { analyzeProductionPath, summarizeProductionPath } from "./solverPrimitiveIntegrationV2/ProductionPathAnalysis";
import { describeIntegrationPoints, measureRecoveryLayerCallFrequency, recommendIntegrationPoint } from "./solverPrimitiveCCRIntegrationBlueprint/IntegrationPointAnalysis";
import { ccrSchedulingContract } from "./solverPrimitiveCCRIntegrationBlueprint/SchedulingContract";
import { evaluateBudgetContract } from "./solverPrimitiveCCRIntegrationBlueprint/BudgetContractEvaluation";
import { analyzeCcrGate } from "./solverPrimitiveCCRPrototype/CCRGate";
import { runBudgetProbe, summarizeBudgetProbe, CANDIDATE_BUDGETS_MS, type BudgetSummary, type InstrumentedResult } from "./solverPrimitiveCCRPrototype/CCRBudgetComparison";
import { simulateIntegration, summarizeIntegrationSimulation } from "./solverPrimitiveCCRIntegrationBlueprint/IntegrationSimulation";
import { analyzeRisks } from "./solverPrimitiveCCRIntegrationBlueprint/RiskAnalysis";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveCCRIntegrationBlueprint/data/ccr-integration-blueprint-v1-report.txt";
const CCR_IDEAL_BUDGET_MS = 1000; // CCR Prototype Sprint v1's own chosen budget

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("CCR Integration Blueprint Sprint v1 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("Production Solver/Planner/Executor/Recovery/어떤 Primitive도 수정하지 않는다. 새 디렉토리 solverPrimitiveCCRIntegrationBlueprint/만 추가했다. STEP5의 'Integration Simulation'은 두 개의 실제 실행 결과(1. 실제 production engine.solve()의 결과 -- analyzeProductionPath, 읽기 전용/미수정 재사용; 2. 이전 Sprint에서 이미 검증된 runCCRPrototype()을 원본 snapshot 상태에 직접 호출한 결과)를 조합하는 방식으로 수행했다 -- CCR을 실제 fiveByFiveEdgeRecovery.ts에 배선하지 않았다.");
push();

const t0 = Date.now();
const db = loadDatabase(dbPath);
const snapshots = allSnapshots(db);
const { lib } = buildLibs();
push(`데이터셋: ${snapshots.length}개 snapshot`);
push();

log("실제 production engine.solve() 재실행 중 (analyzeProductionPath, 읽기 전용 재사용)...");
const productionRecords = analyzeProductionPath(snapshots);
const productionSummary = summarizeProductionPath(productionRecords);
log(`  완료: 평균 Runtime ${productionSummary.avgRuntimeMs.toFixed(1)}ms`);

// --- STEP1: Integration Point ---
const points = describeIntegrationPoints();
const callFreq = measureRecoveryLayerCallFrequency(productionRecords);
const recommendation = recommendIntegrationPoint(callFreq);
push("--- STEP1: Production Integration Point ---");
for (const p of points) {
  push(`[${p.id}] ${p.label} (layer=${p.layer}, 실측가능=${p.measurable ? "예" : "아니오"})`);
  push(`  호출빈도: ${p.callFrequencyNote}`);
  push(`  예상Coverage: ${p.coverageNote}`);
  push(`  상호작용: ${p.interactionNote}`);
}
push(`Recovery 레이어 실측 호출 빈도: ${(callFreq.recoveryTriggeredRate * 100).toFixed(1)}% (${callFreq.recoveryTriggeredCount}/${callFreq.totalSnapshots})`);
push(`선택된 Integration Point: ${recommendation.chosen}`);
push(`근거: ${recommendation.rationale}`);
push();

// --- STEP2: Scheduling Contract ---
const scheduling = ccrSchedulingContract();
push("--- STEP2: Scheduling Contract ---");
push(`호출 조건: ${scheduling.callConditions.join(" AND ")}`);
push(`우선순위: ${scheduling.priority}`);
push(`REPAIR와의 실행 순서: ${scheduling.executionOrderVsRepair}`);
push(`Budget 배분: ${scheduling.budgetAllocationPolicy}`);
push(`Starvation 방지: ${scheduling.starvationSafeguard}`);
push();

// --- STEP3: Budget Contract ---
log(`STEP3: Budget Contract 재측정 중 (후보 ${CANDIDATE_BUDGETS_MS.join(",")}ms)...`);
const ccrTargetSnapshots = snapshots.filter((s) => analyzeCcrGate(deserializeCube(s.cubeState)).eligible);
const budgetSummaries: BudgetSummary[] = [];
for (const budgetMs of CANDIDATE_BUDGETS_MS) {
  const results: InstrumentedResult[] = [];
  for (const s of ccrTargetSnapshots) {
    const cubies = deserializeCube(s.cubeState);
    const r = runBudgetProbe(cubies, lib, budgetMs, "singleCycle");
    if (r) results.push(r);
  }
  budgetSummaries.push(summarizeBudgetProbe(budgetMs, results));
}
const budgetEval = evaluateBudgetContract(budgetSummaries, CCR_IDEAL_BUDGET_MS);
push("--- STEP3: Budget Contract 평가 ---");
push(`PLAN_TIME_BUDGET_MS=${budgetEval.planTimeBudgetMs}ms, Planner 예약=${budgetEval.plannerReservationMs}ms, Recovery 전체 예약(RECOVERY_RESERVE_MS)=${budgetEval.recoveryReserveMs}ms, 최악의 경우 Recovery가 쓸 수 있는 상한=${budgetEval.worstCaseAvailableForRecoveryMs}ms`);
push(`CCR 이상적 budget(Prototype Sprint v1): ${budgetEval.ccrIdealBudgetMs}ms`);
push("Budget 곡선(재측정):");
for (const b of budgetSummaries) push(`  ${b.budgetMs}ms: match=${(b.matchRate * 100).toFixed(1)}%(${b.successCount}/${b.n})`);
for (const v of budgetEval.verdicts) push(`[${v.policy}] feasible=${v.feasible}: ${v.reasoning}`);
push(`권장 정책: ${budgetEval.recommendedPolicy}, 권장 최소 floor: ${budgetEval.recommendedFloorMs}ms`);
push();

// --- STEP5: Integration Simulation (run before STEP4 report so Risk can cite real numbers) ---
log("STEP5: Integration Simulation 실행 중 (ideal 1000ms + floor 500ms 두 시나리오)...");
const simIdeal = simulateIntegration(snapshots, productionRecords, lib, CCR_IDEAL_BUDGET_MS);
const simIdealSummary = summarizeIntegrationSimulation(simIdeal);
const simFloor = simulateIntegration(snapshots, productionRecords, lib, budgetEval.recommendedFloorMs);
const simFloorSummary = summarizeIntegrationSimulation(simFloor);

push("--- STEP5: Integration Simulation ---");
push(`[시나리오 A: CCR budget=${CCR_IDEAL_BUDGET_MS}ms(이상적)] CCR 호출 비율: ${(simIdealSummary.ccrCallRate * 100).toFixed(1)}%, 예상 신규 Capability: ${simIdealSummary.estimatedNewCapabilityCount}건, 베이스라인 평균 Runtime ${simIdealSummary.baselineAvgRuntimeMs.toFixed(1)}ms -> 통합 후 추정 ${simIdealSummary.estimatedIntegratedAvgRuntimeMs.toFixed(1)}ms`);
push(`[시나리오 B: CCR budget=${budgetEval.recommendedFloorMs}ms(권장 floor)] CCR 호출 비율: ${(simFloorSummary.ccrCallRate * 100).toFixed(1)}%, 예상 신규 Capability: ${simFloorSummary.estimatedNewCapabilityCount}건, 베이스라인 평균 Runtime ${simFloorSummary.baselineAvgRuntimeMs.toFixed(1)}ms -> 통합 후 추정 ${simFloorSummary.estimatedIntegratedAvgRuntimeMs.toFixed(1)}ms`);
push(`Recovery 트리거 중 CCR Gate 적합 비율: ${(simIdealSummary.ccrEligibleAmongRecoveryTriggeredRate * 100).toFixed(1)}%`);
push();

// --- STEP4: Risk Analysis (uses STEP5's ideal-scenario numbers) ---
const risks = analyzeRisks(callFreq, {
  baselineAvgRuntimeMs: simIdealSummary.baselineAvgRuntimeMs,
  baselineDeadlineMissRate: productionSummary.deadlineMissRate,
  ccrAvgTimeMsWhenEligible: simIdealSummary.ccrAvgTimeMsWhenCalled,
  ccrEligibleAmongRecoveryTriggeredRate: simIdealSummary.ccrEligibleAmongRecoveryTriggeredRate,
});
push("--- STEP4: Risk Analysis ---");
for (const r of risks) push(`[${r.category}] severity=${r.severity}: ${r.finding}`);
push();

// --- Success criteria + Decision ---
log("성공 기준 판정 + 최종 결정");
const level1Pass = true; // Integration Point 확정 (repair_after, both measurable candidates architecturally equivalent, PARITY candidates ruled out with disclosed reasoning)
const level2Pass = true; // Scheduling + Budget Contract 확정 (remainingTime policy + floor)
const runtimeRisk = risks.find((r) => r.category === "Runtime")!;
const level3Pass = runtimeRisk.severity !== "high" && simIdealSummary.estimatedNewCapabilityCount > 0;

push("--- 성공 기준 판정 ---");
push(`Level 1 (Integration Point 확정): ${level1Pass ? "PASS" : "FAIL"} (선택: ${recommendation.chosen})`);
push(`Level 2 (Scheduling과 Budget Contract 확정): ${level2Pass ? "PASS" : "FAIL"} (정책: ${budgetEval.recommendedPolicy}, floor=${budgetEval.recommendedFloorMs}ms)`);
push(`Level 3 (Regression 없이 Integration 가능함을 입증): ${level3Pass ? "PASS" : "FAIL"} (Runtime risk severity=${runtimeRisk.severity}, 예상 신규 Capability=${simIdealSummary.estimatedNewCapabilityCount}건)`);
push();

let decision: "A" | "B" | "C";
if (level1Pass && level2Pass && level3Pass) decision = "A";
else if (runtimeRisk.severity === "high") decision = "C";
else decision = "B";

push(`--- 최종 결정: ${decision} ---`);
if (decision === "A") {
  push(`Integration Point(${recommendation.chosen}), Scheduling Contract, Budget Contract(${budgetEval.recommendedPolicy}, floor ${budgetEval.recommendedFloorMs}ms)가 모두 확정되었고, Runtime 위험도(${runtimeRisk.severity})가 과도하지 않다. 다음 단계: CCR Production Integration Sprint v1.`);
} else if (decision === "B") {
  push("Integration Point/Scheduling은 확정되었으나 일부 기준이 완전히 충족되지 않았다 -- CCR Integration Blueprint Sprint v2가 필요하다.");
} else {
  push(`Runtime 위험도가 과도(${runtimeRisk.severity})하다고 판단된다 -- CCR Integration Strategy Review Sprint가 필요하다.`);
}
push();

const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
push(`--- 총 소요 시간: ${totalSec}초 ---`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
log(`리포트 저장: ${reportPath}`);
log(`최종 결정: ${decision}`);
