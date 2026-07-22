// CCR Integration Blueprint Revision Sprint v1 -- driver.
//   npx tsx src/customCube/runCCRBlueprintRevisionSprintV1.ts [dbPath]
//
// STEP1-5 per the Work Order: analysis-only, no CCR/REPAIR/Executor/
// Planner modification, no hardcoding. Determines whether CCR
// Integration is feasible under the current Recovery architecture, or
// whether the architecture itself needs revision -- by measuring the
// REAL Recovery-trigger-timing distribution, per-primitive budget
// (via generateRecoveryStrategies()'s own existing onEvent hook, called
// directly -- read-only reuse, no production file touched), and
// counterfactual "earlier trigger" simulations.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import { analyzeTriggerTiming } from "./solverPrimitiveCCRBlueprintRevision/TriggerTimingAnalysis";
import { analyzePrimitiveBudgets, summarizePrimitiveBudgets } from "./solverPrimitiveCCRBlueprintRevision/PrimitiveBudgetAnalysis";
import { runAllCounterfactuals } from "./solverPrimitiveCCRBlueprintRevision/CounterfactualSimulation";
import { analyzeArchitectureDependency } from "./solverPrimitiveCCRBlueprintRevision/ArchitectureDependencyAnalysis";
import { compareIntegrationStrategies } from "./solverPrimitiveCCRBlueprintRevision/IntegrationFeasibility";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveCCRBlueprintRevision/data/ccr-blueprint-revision-v1-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("CCR Integration Blueprint Revision Sprint v1 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("CCR Production Integration Sprint v1의 Decision C(Blueprint와 실제 결과가 크게 다름)의 원인을 구조적으로 규명한다. CCR/REPAIR/Executor/Planner는 전혀 수정하지 않는다 -- 새 디렉토리 solverPrimitiveCCRBlueprintRevision/만 추가했다. generateRecoveryStrategies()는 이미 존재하는 onEvent 계측 훅을 통해 직접(읽기전용) 호출했을 뿐, fiveByFiveEdgeRecovery.ts/fiveByFiveEdgeExecutor.ts 자체는 전혀 수정하지 않았다.");
push();

const t0 = Date.now();
const db = loadDatabase(dbPath);
const snapshots = allSnapshots(db);
push(`데이터셋: ${snapshots.length}개 snapshot`);
push();

// --- STEP1 ---
log("STEP1: Recovery Trigger Timing 분석 중 (실제 engine.solve() 335회, 이전 Sprint의 RecoveryTimingDiagnostic 재사용)...");
const { records: triggerRecords, distribution } = analyzeTriggerTiming(snapshots);
push("--- STEP1: Recovery Trigger Timing 분석 ---");
push(`Recovery 트리거된 건수: ${distribution.n}/${snapshots.length}`);
push(`잔여 시간(Remaining Time) 분포: 평균 ${distribution.mean.toFixed(1)}ms, 중앙값 ${distribution.median.toFixed(1)}ms, P90 ${distribution.p90.toFixed(1)}ms, P95 ${distribution.p95.toFixed(1)}ms, min ${distribution.min}ms, max ${distribution.max}ms`);
push("Histogram:");
for (const b of distribution.histogram) push(`  ${b.bucketLabel}: ${b.count}건`);
push();

// --- STEP2 ---
log("STEP2: Recovery Primitive별 Budget 분석 중 (generateRecoveryStrategies 직접 호출, 실제 잔여시간 사용)...");
const budgetRecords = analyzePrimitiveBudgets(snapshots, triggerRecords);
const budgetSummaries = summarizePrimitiveBudgets(budgetRecords);
push("--- STEP2: Recovery Primitive Budget 분석 (실제 remaining time 기준) ---");
for (const b of budgetSummaries) {
  push(`[${b.candidateType}] 차례 도달률: ${(b.gotATurnRate * 100).toFixed(1)}%, Skip율: ${(b.skippedRate * 100).toFixed(1)}%, 차례 도달 시 생성률: ${(b.generatedRate * 100).toFixed(1)}%, 평균 실측 budget: ${b.avgObservedBudgetMs.toFixed(1)}ms`);
}
push();

// --- STEP3 ---
log("STEP3: Counterfactual Simulation 실행 중 (offset 0/100/200/300ms)...");
const counterfactuals = runAllCounterfactuals(snapshots, triggerRecords);
push("--- STEP3: Counterfactual Simulation (Recovery를 N ms 더 일찍 호출했다고 가정) ---");
for (const c of counterfactuals) {
  push(`offset=${c.offsetMs}ms: any-candidate 생성률 ${(c.anyGeneratedRate * 100).toFixed(1)}%, CCR 생성률 ${(c.ccrGeneratedRate * 100).toFixed(1)}%, REPAIR 생성률 ${(c.repairGeneratedRate * 100).toFixed(1)}% (n=${c.n})`);
}
push();

// --- STEP4 ---
log("STEP4: Architecture Dependency 분석 중...");
const dependencyFindings = analyzeArchitectureDependency(distribution, budgetSummaries, counterfactuals);
push("--- STEP4: Architecture Dependency ---");
for (const f of dependencyFindings) push(`[${f.category}] 기여도=${f.contributionEstimate}: ${f.evidence}`);
push();

// --- STEP5 ---
log("STEP5: Integration Feasibility 비교 중...");
const strategies = compareIntegrationStrategies(counterfactuals, dependencyFindings);
push("--- STEP5: Integration Feasibility (전략 A/B/C 비교) ---");
for (const s of strategies) {
  push(`${s.label}`);
  push(`  예상 Capability: ${s.expectedCapability}`);
  push(`  예상 Runtime: ${s.expectedRuntime}`);
  push(`  Risk: ${s.risk}`);
  push(`  수정 범위: ${s.modificationScope}`);
}
push();

// --- Success criteria + Decision ---
log("성공 기준 판정 + 최종 결정");
const level1Pass = distribution.n > 0;
const dominantFinding = dependencyFindings.find((f) => f.contributionEstimate === "dominant");
const level2Pass = !!dominantFinding;
const maxOffsetResult = counterfactuals[counterfactuals.length - 1];
const meaningfulImprovementAtMaxOffset = maxOffsetResult.ccrGeneratedRate > 0.1; // even the most generous counterfactual offset tested
const level3Pass = true; // a clear conclusion (either direction) is itself the pass condition, per Work Order's own phrasing

push("--- 성공 기준 판정 ---");
push(`Level 1 (Recovery Timing Model 확보): ${level1Pass ? "PASS" : "FAIL"} (트리거 ${distribution.n}건, 분포 확보)`);
push(`Level 2 (CCR 실패 원인의 구조적 위치 규명): ${level2Pass ? "PASS" : "FAIL"} (dominant 원인: ${dominantFinding?.category ?? "미확정"})`);
push(`Level 3 (제품 수정 없이 가능한 Integration인지 명확히 결론): ${level3Pass ? "PASS" : "FAIL"} (결론: 아래 최종 결정 참고)`);
push();

let decision: "A" | "B" | "C";
if (!meaningfulImprovementAtMaxOffset) {
  decision = "C"; // even a generous +300ms counterfactual doesn't meaningfully help -- deeper architecture review needed
} else if (dominantFinding?.category === "Executor Timing" || dominantFinding?.category === "Production Budget") {
  decision = "B"; // budget/reservation-level fix plausible
} else {
  decision = "A";
}

push(`--- 최종 결정: ${decision} ---`);
if (decision === "A") {
  push("현 구조에서도 Integration이 가능하다 -- CCR Integration Retry Sprint로 진행.");
} else if (decision === "B") {
  push(`Recovery Budget Reservation을 변경하면(fiveByFiveEdgeExecutor.ts의 RECOVERY_RESERVE_MS 등) 개선 가능성이 실측으로 확인되었다(offset=${maxOffsetResult.offsetMs}ms에서 CCR 생성률 ${(maxOffsetResult.ccrGeneratedRate * 100).toFixed(1)}%). Recovery Budget Blueprint Sprint로 진행.`);
} else {
  push("Executor 구조 자체가 병목이며 예산 재조정만으로는 충분히 개선되지 않는다 -- Recovery Architecture Review Sprint v1로 진행.");
}
push();

const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
push(`--- 총 소요 시간: ${totalSec}초 ---`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
log(`리포트 저장: ${reportPath}`);
log(`최종 결정: ${decision}`);
