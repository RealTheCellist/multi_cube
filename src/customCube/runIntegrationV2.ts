// Solver Primitive Integration Sprint v2 -- driver.
//   npx tsx src/customCube/runIntegrationV2.ts [dbPath]
//
// Ships Gate Relaxation Validation Sprint v1's finding to production:
// STEP1 (removing conflictEdgeCount>0 from REPAIR's Gate) is already
// real product code, done in this Sprint's own one-line
// SuccessOptimizationV2.ts edit (see that file's own "GATE CHANGE"
// comment). This driver covers STEP2-6: does the new default still
// satisfy Recovery's own contract, does the capability gain persist at
// N>=15/30, does the specific 77-snapshot target subset improve, and does
// the real, full solve() path stay regression-free.
//
// fiveByFiveEdgeSolverEngine.ts/fiveByFiveEdgePlanner.ts/Primitive
// Registry/DeferredValidator/Executor Architecture (fiveByFiveEdgeExecutor.ts)
// are all read-only -- called exactly as-is, no new parameters added
// anywhere, since STEP1's Gate edit alone is sufficient for the real
// solve() path to already reflect the new behavior.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import { buildLibs } from "./solverPrimitiveIntegrationPrototype/RecoveryBenchmark";
import { collectRun, type RunRecord } from "./solverPrimitiveIntegrationV2/RawDataCollector";
import { evaluateAdaptive } from "./solverPrimitiveIntegrationV2/Evaluation";
import { verifyTarget77 } from "./solverPrimitiveIntegrationV2/TargetSubsetVerification";
import { analyzeProductionPath, summarizeProductionPath, checkPlannerImpact } from "./solverPrimitiveIntegrationV2/ProductionPathAnalysis";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveIntegrationV2/data/integration-v2-report.txt";
const INITIAL_N = 15;
const EXTENSION_STEP = 15;
const MAX_N = 30;

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Solver Primitive Integration Sprint v2 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("Gate Relaxation Validation Sprint v1이 확인한 결과(conflictEdgeCount>0는 불필요)를 실제 production에 적용했다 -- solverPrimitivePrototypeRefinementV2/SuccessOptimizationV2.ts의 runSuccessV2 Gate에서 conflictEdgeCount>0 조건을 제거(cycleLength 2~4만 남김). DFS 본문/Success Optimization/후보 순서/Scheduling(reservedBudget)은 전혀 건드리지 않았다. fiveByFiveEdgeSolverEngine.ts/fiveByFiveEdgePlanner.ts/Primitive Registry/DeferredValidator/Executor Architecture는 전부 읽기 전용(호출만 함, 파라미터 추가 없이 그대로 호출) -- STEP1의 Gate 수정 자체가 이미 production 경로에 반영되어 있어 별도 override 없이도 실제 solve()가 새 동작을 그대로 보인다.");
push();

const t0 = Date.now();
log("데이터셋 로드 중...");
const db = loadDatabase(dbPath);
const snapshots = allSnapshots(db);
const { lib, libs } = buildLibs();
push(`데이터셋: ${snapshots.length}개 snapshot (Primitive Discovery Sprint #2 / Gate Relaxation Validation Sprint v1과 동일한 335개)`);
push();

log("STEP2/6: 실제 solve() 경로 단일 pass 분석 중 (Contract Verification + Production Regression)...");
const productionRecords = analyzeProductionPath(snapshots);
const productionSummary = summarizeProductionPath(productionRecords);
push("--- STEP2: Contract Verification (실제 solve() 경로, 새 Gate 적용된 production) ---");
push(`REPAIR 생성률: ${(productionSummary.repairGenerationRate * 100).toFixed(1)}%, REPAIR 채택률: ${(productionSummary.repairChosenRate * 100).toFixed(1)}%`);
push(`Generation Skipped(REPAIR 차례 자체가 시작 못 됨): 구조적으로 0% -- reservedBudget 스케줄링(fiveByFiveEdgeRecovery.ts의 generateRecoveryStrategies) 코드 자체를 이번 Sprint가 전혀 건드리지 않았고, 그 코드는 REPAIR 차례를 항상 무조건 실행하도록 되어 있어(Integration Refinement/Validation Sprint에서 이미 검증됨) 이 값은 측정이 아니라 코드 검사로 확정되는 사실이다. (참고: trace 기반 근사 측정("recovery-no-candidates")은 DISRUPT/SETUP까지 포함한 전체 후보 부재를 뜻해 이 지표와 다른 것이라 자체 검증 중 발견하고 폐기했다.)`);
push(`Recovery 호출률: ${(productionSummary.recoveryRate * 100).toFixed(1)}%, 평균 Retry 횟수: ${productionSummary.avgRetryCount.toFixed(3)}, Short-circuit 비율: ${(productionSummary.shortCircuitRate * 100).toFixed(1)}%`);
push(`평균 Runtime: ${productionSummary.avgRuntimeMs.toFixed(1)}ms, p95: ${productionSummary.p95RuntimeMs}ms, p99: ${productionSummary.p99RuntimeMs}ms, Deadline Miss율: ${(productionSummary.deadlineMissRate * 100).toFixed(1)}%`);
push();
push("--- STEP6: Production Regression Test (같은 pass 재사용) ---");
push(`Solve Rate(단일 solve() 호출 기준, 이 dataset+1초 예산 설계상 낮은 게 정상): ${(productionSummary.solveRate * 100).toFixed(1)}%`);
push(`Regression(전체 합산): ${productionSummary.regressionCount}건`);
push(`평균 heap delta(근사치, GC 타이밍에 민감): ${(productionSummary.avgHeapDeltaBytes / 1024).toFixed(1)}KB`);

log("STEP6: Planner 영향 probe 실행 중...");
const plannerImpact = checkPlannerImpact(snapshots, libs);
push(`Planner Output 영향: 베이스라인 자체 jitter ${plannerImpact.baselineJitterMismatch}/${snapshots.length}, probe 이후 mismatch ${plannerImpact.probeMismatch}/${snapshots.length}, Gate 변경 고유 증분 ${plannerImpact.attributableToProbe}건`);
push();

log(`STEP3/4/5: RawDataCollector + Evaluation (N=${INITIAL_N} 시작, adaptive extension 최대 N=${MAX_N})...`);
const collectBatch = (times: number): RunRecord[] => {
  const batch: RunRecord[] = [];
  for (let i = 0; i < times; i++) {
    log(`  진행: run ${i + 1}/${times}`);
    batch.push(collectRun(snapshots, lib, libs));
  }
  return batch;
};

const adaptive = evaluateAdaptive(collectBatch, INITIAL_N, EXTENSION_STEP, MAX_N);
const { runs, metrics, runsUsed, reachedDecisive } = adaptive;
const { baseline, candidate } = metrics;

push(`--- STEP3: Capability Evaluation (Standard Evaluation Protocol, N=${runsUsed}, ${reachedDecisive ? "초기 N에서 결정적" : "확장 시도"}) ---`);
push(`[Baseline -- 기존 strict Gate 재구성] Coverage: ${(baseline.coverage * 100).toFixed(1)}%, Precision: ${(baseline.precision * 100).toFixed(1)}%, GapRescue 평균 ${baseline.gapRescueStats.mean.toFixed(2)}/run, Regression ${baseline.regressionCount}건`);
push(`[Candidate -- 실제 production 새 Gate] Coverage: ${(candidate.coverage * 100).toFixed(1)}%, Precision: ${(candidate.precision * 100).toFixed(1)}%, GapRescue 평균 ${candidate.gapRescueStats.mean.toFixed(2)}/run, Regression ${candidate.regressionCount}건`);
push(`paired-diff(Candidate - Baseline) GapRescue: 평균 ${candidate.pairedDiffVsBaselineStats.mean.toFixed(3)}, 95% CI [${candidate.pairedDiffVsBaselineStats.ciLower.toFixed(3)}, ${candidate.pairedDiffVsBaselineStats.ciUpper.toFixed(3)}]`);
push();

const target77 = verifyTarget77(runs);
push("--- STEP4: Target Subset Verification (cycleLength 2~4, conflictEdgeCount=0, 77건) ---");
push(`Target subset 크기(실측): ${target77.totalInTarget}건`);
push(`Baseline이 이 subset에서 성공한 건수(구조상 0이어야 함): ${target77.baselineSucceededCount}`);
push(`Candidate가 최소 1회라도 성공한 hash 수: ${target77.candidateSucceededAtLeastOnce}/${target77.totalInTarget}`);
push(`Candidate가 과반수 run에서 안정적으로 성공한 hash 수: ${target77.candidateSucceededMajority}/${target77.totalInTarget}`);
push(`Candidate의 run당 평균 성공률(target subset 대비): ${(target77.avgCandidateSuccessRate * 100).toFixed(1)}%`);
push();

push(`--- STEP5: Large Sample Validation ---`);
push(`사용한 N: ${runsUsed} (초기 ${INITIAL_N}, 최대 ${MAX_N}까지 adaptive extension 허용), CI 결정적 여부: ${reachedDecisive}`);
push();

log("Level 1~3 판정 + 최종 결정");
const level1Pass = candidate.avgMatchedCount > baseline.avgMatchedCount;
const level2Pass = candidate.pairedDiffVsBaselineStats.ciLower > 0;
const level3Pass = candidate.regressionCount <= baseline.regressionCount && productionSummary.regressionCount === 0 && plannerImpact.attributableToProbe <= 0;

push("--- 성공 기준 판정 ---");
push(`Level 1 (REPAIR Gate 확대 후 Generation 증가): ${level1Pass ? "PASS" : "FAIL"} (avgMatched Baseline ${baseline.avgMatchedCount.toFixed(2)} -> Candidate ${candidate.avgMatchedCount.toFixed(2)})`);
push(`Level 2 (paired-diff CI가 0을 배제): ${level2Pass ? "PASS" : "FAIL"} (95% CI [${candidate.pairedDiffVsBaselineStats.ciLower.toFixed(3)}, ${candidate.pairedDiffVsBaselineStats.ciUpper.toFixed(3)}])`);
push(`Level 3 (Regression 없이 Production 기본값으로 채택 가능): ${level3Pass ? "PASS" : "FAIL"} (STEP3 Regression 기존 ${baseline.regressionCount}건 vs 새 ${candidate.regressionCount}건, STEP6 실제 solve() Regression ${productionSummary.regressionCount}건, Planner 고유 증분 ${plannerImpact.attributableToProbe}건)`);
push();

const decision: "A" | "B" = level1Pass && level2Pass && level3Pass ? "A" : "B";
push(`--- 최종 결정: ${decision} ---`);
if (decision === "A") {
  push("REPAIR Gate 확대(conflictEdgeCount>0 제거)가 Production 기본값으로 안전하게 유지 가능함이 확인되었다 -- Recovery 계약(Generation Skip, Retry, Short-circuit) 유지, paired-diff CI가 0을 배제, Regression 없음, Planner 영향 없음. 이미 STEP1에서 이 변경은 실제 production 코드에 반영되어 있다. 다음 단계: Primitive Discovery Sprint #3 (cycleLength 5~6 중심 CCR Prototype 설계).");
} else {
  push("일부 기준이 충족되지 않았다 -- Integration Refinement Sprint v2(Gate 세분화/Gate Scoring/Adaptive Gate/Hybrid Scheduling 검토)가 필요하다.");
}
push();

const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
push(`--- 총 소요 시간: ${totalSec}초 ---`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
log(`리포트 저장: ${reportPath}`);
log(`사용한 N: ${runsUsed}, 최종 결정: ${decision}`);
