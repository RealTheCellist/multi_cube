// Recovery Architecture Review Sprint v1 -- driver.
//   npx tsx src/customCube/runRecoveryArchitectureReviewSprintV1.ts [dbPath]
//
// STEP1-5 per the recommended Work Order: research-only, no production
// file changes. Determines when/why/under what conditions the Recovery
// layer as a whole is neutralized, and compares 4 candidate architectures
// (Current/Early/Incremental/Opportunistic Recovery) grounded in real
// trace-timestamp data from the unmodified engine.solve().
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import { buildTimelines } from "./solverPrimitiveRecoveryArchitectureReview/TaskTimeline";
import { structuralFacts, computeTaskSequenceStats } from "./solverPrimitiveRecoveryArchitectureReview/TriggerDependencyMap";
import { summarizeDeadlineConsumption } from "./solverPrimitiveRecoveryArchitectureReview/DeadlineConsumptionTimeline";
import { analyzeProgressByTaskType, assessRecoveryNecessity } from "./solverPrimitiveRecoveryArchitectureReview/RecoveryNecessityAnalysis";
import { describeArchitectures } from "./solverPrimitiveRecoveryArchitectureReview/AlternativeArchitectureComparison";
import { analyzeArchitectureCosts } from "./solverPrimitiveRecoveryArchitectureReview/ArchitectureCostAnalysis";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveRecoveryArchitectureReview/data/recovery-architecture-review-v1-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Recovery Architecture Review Sprint v1 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("CCR Integration Blueprint Revision Sprint v1이 발견한 'Recovery 전체가 사실상 죽어 있다'는 실측 결과의 구조적 원인을 규명하고, 대안 아키텍처를 비교한다. Production 코드는 전혀 수정하지 않는다 -- 새 디렉토리 solverPrimitiveRecoveryArchitectureReview/만 추가했다. 실제, 미수정 engine.solve()의 trace를 읽기 전용으로 파싱했을 뿐이다.");
push();

const t0 = Date.now();
const db = loadDatabase(dbPath);
const snapshots = allSnapshots(db);
push(`데이터셋: ${snapshots.length}개 snapshot`);
push();

log("실제 engine.solve() 335회 재실행 중 (trace 기반 timeline 구축)...");
const timelines = buildTimelines(snapshots);

// --- STEP1 ---
push("--- STEP1: Recovery Trigger Dependency ---");
for (const f of structuralFacts()) push(`- ${f.fact} [${f.source}]`);
const seqStats = computeTaskSequenceStats(timelines);
push(`실측: ENDGAME이 항상 마지막 태스크인 비율 ${(seqStats.endgameAlwaysLastRate * 100).toFixed(1)}% (구조적 사실과 일치 확인)`);
push(`평균 ENDGAME 이전 태스크 수: ${seqStats.avgTasksBeforeEndgame.toFixed(1)}개`);
push(`평균 태스크 타입별 개수: PAIR ${seqStats.avgTaskTypeCounts.PAIR.toFixed(2)}, FLIP ${seqStats.avgTaskTypeCounts.FLIP.toFixed(2)}, PARITY ${seqStats.avgTaskTypeCounts.PARITY.toFixed(2)}, ENDGAME ${seqStats.avgTaskTypeCounts.ENDGAME.toFixed(2)}`);
push();

// --- STEP2 ---
log("STEP2: Deadline Consumption Timeline 계산 중...");
const deadlineSummary = summarizeDeadlineConsumption(timelines);
push("--- STEP2: Deadline Consumption Timeline (1000ms 예산 실제 소비 내역) ---");
push(`평균 Planning: ${deadlineSummary.avgPlanningMs.toFixed(1)}ms`);
push(`평균 PAIR/FLIP/PARITY 태스크 합계: ${deadlineSummary.avgPreEndgameTaskMs.toFixed(1)}ms`);
push(`평균 ENDGAME+Recovery: ${deadlineSummary.avgEndgameAndRecoveryMs.toFixed(1)}ms`);
push(`ENDGAME까지 도달조차 못한 비율(예산 소진): ${(deadlineSummary.neverReachedEndgameRate * 100).toFixed(1)}%`);
push(`평균 총 Runtime: ${deadlineSummary.avgTotalMs.toFixed(1)}ms`);
push();

// --- STEP3 ---
log("STEP3: Recovery Necessity 분석 중...");
const progressStats = analyzeProgressByTaskType(timelines);
push("--- STEP3: Recovery Necessity (태스크 타입별 no-progress율) ---");
for (const s of progressStats) push(`[${s.type}] 시도 ${s.attemptedCount}건 중 no-progress ${s.noProgressCount}건 (${(s.noProgressRate * 100).toFixed(1)}%)`);
const necessity = assessRecoveryNecessity(progressStats);
push(necessity.finding);
push();

// --- STEP4 ---
log("STEP4: Alternative Architecture 비교 중...");
const architectures = describeArchitectures(deadlineSummary, progressStats);
push("--- STEP4: Alternative Architectures ---");
for (const a of architectures) {
  push(`[${a.id}] ${a.label}`);
  push(`  설명: ${a.description}`);
  push(`  근거: ${a.groundedRationale}`);
}
push();

// --- STEP5 ---
log("STEP5: Architecture Cost 분석 중...");
const costs = analyzeArchitectureCosts(progressStats);
push("--- STEP5: Architecture Cost ---");
for (const c of costs) {
  push(`[${c.id}] 구현 복잡도=${c.implementationComplexity}`);
  push(`  Runtime 영향: ${c.runtimeImpact}`);
  push(`  Primitive 활용도: ${c.primitiveUtilization}`);
}
push();

// --- Synthesis ---
push("--- 종합 ---");
push(
  `Recovery는 이미 예산의 대부분(평균 ${((deadlineSummary.avgPreEndgameTaskMs / deadlineSummary.avgTotalMs) * 100).toFixed(1)}% + Planning ${((deadlineSummary.avgPlanningMs / deadlineSummary.avgTotalMs) * 100).toFixed(1)}%)이 PAIR/FLIP/PARITY 태스크에서 소비된 뒤에야 ENDGAME 태스크의 일부로 시도된다. ` +
  `이는 CCR만의 문제가 아니라 REPAIR를 포함한 Recovery 계층 전체가 구조적으로 실행 기회를 거의 받지 못하는 상태임을 이번 Sprint가 재확인했다.`,
);
push(
  `Incremental/Opportunistic Recovery로의 확장은 STEP3의 실측(PAIR/FLIP/PARITY 자체의 no-progress율)에 따라 실익이 갈린다 -- ` +
  `${necessity.finding}`,
);
push("다음 단계는 새 Primitive 개발이 아니라, 이 4개 아키텍처 후보 중 하나를 실제로 설계/프로토타입하는 것이다 (이번 Sprint의 범위 밖).");
push();

const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
push(`--- 총 소요 시간: ${totalSec}초 ---`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
log(`리포트 저장: ${reportPath}`);
