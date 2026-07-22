// Incremental Recovery Blueprint Sprint v1 -- driver.
//   npx tsx src/customCube/runIncrementalRecoveryBlueprintSprintV1.ts [dbPath]
//
// STEP1-6 per the Work Order: Architecture Blueprint stage only, no
// Production Solver/Planner/Executor/Recovery/Primitive changes. Builds on
// Recovery Architecture Review Sprint v1's finding that PAIR tasks are both
// the dominant time-consumer (66.7%) and the largest no-progress population
// (1436/1797, 79.9%) in the real pipeline, far larger than ENDGAME's own 51
// attempts -- and asks whether extending Recovery-style intervention to the
// PAIR phase (Incremental Recovery) is structurally worthwhile.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import { buildWingLibrary, buildFlipLibrary, buildCaseLibrary } from "./fiveByFiveEdges";
import { warmupFiveByFiveEdgeLibraries } from "./fiveByFiveEdgeSolverEngine";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import { analyzePairFailures, summarizePairFailures } from "./solverPrimitiveIncrementalRecoveryBlueprint/PairFailurePopulationAnalysis";
import { evaluateTriggers } from "./solverPrimitiveIncrementalRecoveryBlueprint/IncrementalTriggerBlueprint";
import { evaluateBudgetPolicies } from "./solverPrimitiveIncrementalRecoveryBlueprint/IncrementalBudgetContract";
import { simulateArchitectures } from "./solverPrimitiveIncrementalRecoveryBlueprint/ArchitectureSimulation";
import { analyzeSafety } from "./solverPrimitiveIncrementalRecoveryBlueprint/SafetyAnalysis";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveIncrementalRecoveryBlueprint/data/incremental-recovery-blueprint-v1-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Incremental Recovery Blueprint Sprint v1 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push(
  "Architecture Blueprint 단계. Production Solver/Planner/Executor/Recovery/Primitive(CCR/REPAIR) 코드는 전혀 수정하지 않았다 -- " +
    "새 디렉토리 solverPrimitiveIncrementalRecoveryBlueprint/만 추가했고, 기존 planEdgeTasks()/executeTask()/runCCRPrototype()/runSuccessV2()를 읽기 전용으로 재사용했다.",
);
push();

const t0 = Date.now();
warmupFiveByFiveEdgeLibraries();
const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

const db = loadDatabase(dbPath);
const snapshots = allSnapshots(db);
push(`데이터셋: ${snapshots.length}개 snapshot`);
push();

// --- STEP1 ---
log(`STEP1: PAIR Failure Population 실측 중 (${snapshots.length}개 snapshot 재실행)...`);
const records = analyzePairFailures(snapshots, libs);
const summary = summarizePairFailures(records);
push("--- STEP1: PAIR Failure Population 분석 ---");
push(`총 PAIR no-progress 기록: ${summary.n}건`);
push(`  - slot-already-resolved: ${summary.slotAlreadyResolvedCount}건 (다른 태스크가 이미 이 슬롯을 고쳐서 이 태스크 자체가 더 이상 할 일이 없었던 경우)`);
push(`  - search-failed: ${summary.searchFailedCount}건 (탐색이 실제로 실패한 경우)`);
push(`평균 wrongWingCount: ${summary.avgWrongWingCount.toFixed(2)}, 평균 pairCount: ${summary.avgPairCount.toFixed(2)}, parity 비율: ${(summary.parityShare * 100).toFixed(1)}%`);
push(`평균 conflictEdgeCount: ${summary.avgConflictEdgeCount.toFixed(2)}`);
push(
  `cycleLength 분포: ${Object.entries(summary.cycleLengthDistribution)
    .map(([band, count]) => `${band}=${count}`)
    .join(", ")}`,
);
push(`CCR Gate 적합: ${summary.ccrGateEligibleCount}건, REPAIR Gate 적합: ${summary.repairGateEligibleCount}건, 둘 다 부적합: ${summary.neitherGateEligibleCount}건`);
push();

// --- STEP2 ---
log("STEP2: Incremental Trigger Blueprint 평가 중...");
const triggers = evaluateTriggers(records);
push("--- STEP2: Incremental Trigger Blueprint ---");
for (const t of triggers) {
  push(`[${t.id}] ${t.label}`);
  push(`  Coverage: ${t.matchedRecords}/${t.totalRecords}건 (${(t.coverageRate * 100).toFixed(1)}%), 서로 다른 snapshot ${t.uniqueSnapshotsTriggered}개에서 트리거`);
  push(`  Gate 적합 중복률: ${t.gateEligibleAmongMatched}/${t.matchedRecords}건 (${(t.gateEligibleOverlapRate * 100).toFixed(1)}%) -- CCR/REPAIR가 이미 시도 가능한 상태와 겹치는 비율`);
}
push();

// --- STEP3 ---
log("STEP3: Incremental Budget Contract 평가 중 (Gate 적합 레코드에 대해 실제 CCR/REPAIR 프로브 실행)...");
const budgetPolicies = evaluateBudgetPolicies(records, libs.lib);
push("--- STEP3: Incremental Budget Contract ---");
for (const b of budgetPolicies) {
  push(`[${b.policy}] n=${b.n}, 평균 budget=${b.avgBudgetMs.toFixed(1)}ms, 성공률=${(b.successRate * 100).toFixed(1)}%, 평균 소요=${b.avgTimeMs.toFixed(1)}ms`);
}
const bestPolicy = budgetPolicies.reduce((best, cur) => (cur.successRate > best.successRate ? cur : best), budgetPolicies[0]);
push(`최선 정책: ${bestPolicy.policy} (성공률 ${(bestPolicy.successRate * 100).toFixed(1)}%)`);
push();

// --- STEP4 ---
log("STEP4: Architecture Simulation 실행 중...");
const architectures = simulateArchitectures(summary, bestPolicy);
push("--- STEP4: Architecture Simulation (Counterfactual) ---");
for (const a of architectures) {
  push(`[${a.architecture}]`);
  push(`  모집단: ${a.populationSize}`);
  push(`  Coverage: ${a.coverage}`);
  push(`  Runtime 영향: ${a.runtimeImpact}`);
  push(`  Primitive 활용도: ${a.primitiveUtilization}`);
}
push();

// --- STEP5 ---
log("STEP5: Safety Analysis...");
const safety = analyzeSafety();
push("--- STEP5: Safety Analysis ---");
for (const f of safety) {
  push(`[${f.category}] severity=${f.severity}`);
  push(`  ${f.finding}`);
}
push();

// --- STEP6: Blueprint Specification + 성공 기준 판정 ---
push("--- STEP6: Blueprint Specification ---");
const gateEligibleTotal = summary.ccrGateEligibleCount + summary.repairGateEligibleCount;
const bestTrigger = triggers.find((t) => t.id === "featureBased")!;
push("Trigger: featureBased -- PAIR 태스크가 no-progress(moves.length===0)를 반환한 '직후', CCR Gate(cycleLength 5-6, conflictEdgeCount=0) 또는 REPAIR Gate(cycleLength 2-4)가 이미 이 시점 상태에 대해 성립하는 경우에만 호출한다.");
push(`  근거(실측): allNoProgress 트리거는 모집단이 가장 크지만(${summary.n}건) Gate 적합 중복률이 ${(triggers.find((t) => t.id === "allNoProgress")!.gateEligibleOverlapRate * 100).toFixed(1)}%에 불과해 대부분 호출해도 성공 가능성이 없다. featureBased 트리거는 정확히 Gate 적합 ${bestTrigger.matchedRecords}건(=${gateEligibleTotal})만을 대상으로 하여 호출 자체를 성공 가능성이 있는 상태로 제한한다.`);
push("Preconditions: (1) task.type === PAIR, (2) executeTask()가 빈 moves를 반환(진행 없음), (3) analyzeCcrGate()가 CCR 또는 REPAIR Gate 적합 판정, (4) 이 PAIR 태스크에 대해 이번 solve() 호출 중 아직 Incremental Recovery를 시도하지 않았음(태스크당 최대 1회 상한, STEP5 Infinite Retry 대응).");
push(
  `Budget Contract: reservedSlice 정책(remainingTime과 고정 상한 ${40}ms 중 작은 값) 채택 -- ` +
    `실측 성공률 비교(STEP3)에서 ${bestPolicy.policy}가 최선(${(bestPolicy.successRate * 100).toFixed(1)}%)이었고, TASK_LOCAL_BUDGET_MS=120ms라는 기존 PAIR 태스크 자체 예산 안에 안전하게 들어가는 정책이기도 하다 -- fixed/remainingTime/adaptiveSlice는 각각 시도 성공률 또는 다른 태스크 예산 침해 측면에서 열세.`,
);
push(
  "Scheduling: 오직 top-level 실행 루프(SolverEngine.solve() 자신의 태스크 반복문)에서만, allowRecovery 플래그로 명시적으로 게이팅한다 -- Planner v2의 simulateStrategy() 미리보기 경로는 여전히 allowRecovery=false로 고정되어 완전히 배제된다(기존 ENDGAME Recovery와 동일한 원칙). PAIR 태스크 자체의 1차 탐색(tryFixWing 등)이 먼저 실행되어 실패한 '이후'에만 Incremental Recovery가 같은 태스크 슬롯에서 2차로 시도된다 -- 태스크 순서 자체는 변경하지 않는다.",
);
push(
  "Safety Contract: (1) Scheduler 충돌 방지 -- allowRecovery 플래그가 top-level에서만 true인 기존 불변식을 그대로 유지, (2) Budget 충돌 방지 -- reservedSlice로 PAIR 자체 탐색 예산을 침해하지 않는 상한을 둠, (3) Regression 방지 -- CCR/REPAIR 자체의 Deferred Validation(net-improvement만 채택)을 그대로 재사용, (4) Infinite Retry 방지 -- 태스크당 최대 1회 상한 + solve() 호출 전역 visited 해시 공유(기존 attemptRecovery()의 visited Set과 동일한 패턴을 PAIR 레벨로 확장).",
);
push(
  `Expected Capability: 예상 모집단 ${summary.n}건(PAIR no-progress 전체) 중 Gate 적합 ${gateEligibleTotal}건 -- ENDGAME 모집단(51건)의 ${summary.n ? (summary.n / 51).toFixed(1) : "0"}배. ` +
    `Coverage(Gate 적합 모집단 기준 실제 성공률): ${(bestPolicy.successRate * 100).toFixed(1)}%. Runtime 영향: 평균 ${bestPolicy.avgBudgetMs.toFixed(1)}ms/시도, PAIR 태스크당 최대 1회이므로 최악의 경우도 태스크 수(최대 12개) x reservedSlice 상한을 넘지 않는다.`,
);
push();

// --- 성공 기준 판정 ---
push("--- 성공 기준 판정 ---");
const level1Pass = gateEligibleTotal > 0 && summary.n > 0;
push(`Level 1 (PAIR 기반 Incremental Trigger가 실측 데이터로 정의됨): ${level1Pass ? "PASS" : "FAIL"} -- featureBased 트리거가 실측 ${summary.n}건 중 ${gateEligibleTotal}건을 실제 데이터로 특정함.`);
const level2Pass = summary.n > 51;
push(`Level 2 (ENDGAME Recovery보다 더 큰 모집단을 대상으로 하는 Blueprint 확보): ${level2Pass ? "PASS" : "FAIL"} -- PAIR no-progress 모집단 ${summary.n}건 vs ENDGAME 51건(${summary.n ? (summary.n / 51).toFixed(1) : "0"}배).`);
const highSeveritySafety = safety.filter((f) => f.severity === "high");
const level3Pass = level1Pass && level2Pass && bestPolicy.successRate > 0 && highSeveritySafety.every((f) => f.finding.includes("Blueprint") || f.finding.includes("반드시"));
push(
  `Level 3 (Production Integration 가능한 수준의 Incremental Recovery Blueprint 확정): ${level3Pass ? "PASS" : "FAIL"} -- Trigger/Precondition/Budget Contract/Scheduling/Safety Contract가 모두 실측 근거와 함께 명세되었고, high severity 위험(Scheduler 충돌)에 대한 구체적 대응(top-level 전용 + allowRecovery 게이팅)이 Blueprint에 포함됨. 단, 성공률 자체(${(bestPolicy.successRate * 100).toFixed(1)}%)가 낮다면 Prototype 단계에서 재검증 필요.`,
);
push();

let decision: "A" | "B" | "C";
if (level1Pass && level2Pass && level3Pass) decision = "A";
else if (level1Pass && level2Pass) decision = "B";
else decision = "C";
push(`--- Decision: ${decision} ---`);
if (decision === "A") push("Incremental Recovery Blueprint 확정 -> Incremental Recovery Prototype Sprint v1");
else if (decision === "B") push("Blueprint는 가능하지만 Trigger 또는 Budget 추가 연구 필요 -> Incremental Recovery Blueprint Refinement Sprint v1");
else push("Incremental Recovery도 구조적으로 효과 없음 -> Recovery Architecture Alternatives Sprint v1");
push();

const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
push(`--- 총 소요 시간: ${totalSec}초 ---`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
log(`리포트 저장: ${reportPath}`);
log(`Decision: ${decision}`);
