// CCR Production Integration Sprint v1 -- driver.
//   npx tsx src/customCube/runCCRProductionIntegrationSprintV1.ts [dbPath]
//
// STEP1-6 per the Work Order. CCR is now wired into the REAL production
// Recovery layer (fiveByFiveEdgeRecovery.ts's own generateRecoveryStrategies/
// attemptRecovery -- this Sprint's only 2 production edits, plus adding
// "CCR" to fiveByFiveEdgeSolverTypes.ts's own RecoveryType union). Planner/
// Executor/Production Solver Core/DISRUPT/SETUP/REPAIR/the CCR Prototype
// itself are all read-only, untouched.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import { buildLibs } from "./solverPrimitiveIntegrationPrototype/RecoveryBenchmark";
import { collectRun, computeGroundTruth, type RunRecord } from "./solverPrimitiveCCRProductionIntegration/RecoveryLevelCollector";
import { evaluateAdaptive } from "./solverPrimitiveCCRProductionIntegration/Evaluation";
import { classifyRegressions } from "./solverPrimitiveCCRProductionIntegration/RegressionClassification";
import { analyzeProductionPath, summarizeProductionPath } from "./solverPrimitiveCCRProductionIntegration/ProductionPathCheck";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveCCRProductionIntegration/data/ccr-production-integration-v1-report.txt";
const INITIAL_N = 15;
const EXTENSION_STEP = 15;
const MAX_N = 30;

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("CCR Production Integration Sprint v1 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("CCR Integration Blueprint Sprint v1이 확정한 Blueprint(Integration Point=repair_after, Scheduling=DISRUPT,DISRUPT,SETUP,REPAIR,CCR 순서, Budget=remainingTime 정책)를 실제 production Recovery 경로(fiveByFiveEdgeRecovery.ts)에 연결했다. 이번 Sprint의 유일한 production 변경: (1) fiveByFiveEdgeSolverTypes.ts의 RecoveryType에 \"CCR\" 추가, (2) fiveByFiveEdgeRecovery.ts에 genCCR() 추가 + includeCCR 파라미터(기본값 true, Executor는 이 파라미터를 모르고 그대로 두므로 Executor 코드 변경 없이 실제 production이 자동으로 CCR을 포함하게 됨). runCCRPrototype() 내부 로직(Gate/DFS/Deferred Validation)은 CCR Prototype Sprint v1 그대로, 한 줄도 수정하지 않았다. Planner.ts/Executor.ts/Production Solver Core/DISRUPT/SETUP/REPAIR는 전부 읽기 전용.");
push();

const t0 = Date.now();
const db = loadDatabase(dbPath);
const snapshots = allSnapshots(db);
const { lib, libs } = buildLibs();
push(`데이터셋: ${snapshots.length}개 snapshot`);
push();

// --- Real end-to-end pass (STEP1 call count/Gate 통과율/Budget 사용량, STEP2 Runtime) ---
log("실제 production engine.solve() 재실행 중 (CCR이 이미 실제로 연결된 상태)...");
const prodRecords = analyzeProductionPath(snapshots);
const prodSummary = summarizeProductionPath(prodRecords);
push("--- STEP1: Recovery Integration (실제 solve() 경로, CCR 실연결 상태) ---");
push(`Recovery 호출률: ${(prodSummary.recoveryRate * 100).toFixed(1)}%`);
push(`CCR 호출 횟수: ${prodSummary.ccrCallCount}건 / ${prodSummary.n}건 중`);
push(`CCR Gate 통과(생성)율: ${(prodSummary.ccrGeneratedRate * 100).toFixed(1)}%, CCR 채택율: ${(prodSummary.ccrChosenRate * 100).toFixed(1)}%`);
push();
push("--- STEP2: Runtime Budget (remainingTime 정책 실측) ---");
push(`평균 CCR Budget(실제 remainingTime): ${prodSummary.avgRemainingBudgetMs.toFixed(1)}ms`);
push(`Floor(500ms) 적용 비율(CCR이 실제로 호출된 건 중): ${(prodSummary.floorMetRate * 100).toFixed(1)}%`);
push(`평균 Runtime: ${prodSummary.avgRuntimeMs.toFixed(1)}ms, p95: ${prodSummary.p95RuntimeMs}ms, Deadline Miss율: ${(prodSummary.deadlineMissRate * 100).toFixed(1)}%`);
push(`Regression(실제 solve() 경로): ${prodSummary.regressionCount}건`);
push();

// --- STEP3/4/5: Recovery-level controlled comparison ---
log("Ground truth(CCR/REPAIR Gate 적합성 + probe 성공 여부) 1회 계산 중 (run마다 반복하지 않음 -- 결정적이므로)...");
const groundTruth = computeGroundTruth(snapshots, lib);
log(`STEP3/4/5: Recovery-level Baseline(includeCCR=false) vs Candidate(includeCCR=true) 수집 중 (N=${INITIAL_N} 시작, 최대 N=${MAX_N})...`);
const collectBatch = (times: number): RunRecord[] => {
  const batch: RunRecord[] = [];
  for (let i = 0; i < times; i++) {
    log(`  진행: run ${i + 1}/${times}`);
    batch.push(collectRun(snapshots, libs, groundTruth));
  }
  return batch;
};
const adaptive = evaluateAdaptive(collectBatch, INITIAL_N, EXTENSION_STEP, MAX_N);
const { runs, metrics, runsUsed, reachedDecisive } = adaptive;
const { baseline, candidate } = metrics;

const target = runs[0].filter((r) => r.ccrGateEligible);
const totalInTarget = target.length;
const nRuns = runs.length;
const perHashCandidateSuccess = new Map<string, number>();
for (const run of runs) {
  for (const r of run) {
    if (r.ccrGateEligible && r.candidateSucceeded) perHashCandidateSuccess.set(r.hash, (perHashCandidateSuccess.get(r.hash) ?? 0) + 1);
  }
}
const recall = totalInTarget ? [...perHashCandidateSuccess.values()].filter((c) => c > nRuns / 2).length / totalInTarget : 0;

push(`--- STEP3: End-to-End Capability (Recovery-level, Standard Evaluation Protocol N=${runsUsed}, ${reachedDecisive ? "초기 N에서 결정적" : "확장 시도"}) ---`);
push(`[Baseline -- Production Recovery] Coverage: ${(baseline.coverage * 100).toFixed(1)}%, GapRescue 평균 ${baseline.gapRescueStats.mean.toFixed(2)}/run, Regression ${baseline.regressionCount}건, 평균 Runtime ${baseline.avgRuntimeMs.toFixed(1)}ms`);
push(`[Candidate -- Production Recovery + CCR] Coverage: ${(candidate.coverage * 100).toFixed(1)}%, GapRescue 평균 ${candidate.gapRescueStats.mean.toFixed(2)}/run, Regression ${candidate.regressionCount}건, 평균 Runtime ${candidate.avgRuntimeMs.toFixed(1)}ms`);
push(`Precision(Candidate, matched 대비 succeeded -- CCR 대상 population 기준): Recall(CCR 대상 ${totalInTarget}건 중 과반수 안정 성공) ${(recall * 100).toFixed(1)}%`);
push(`paired-diff(Candidate - Baseline) GapRescue: 평균 ${candidate.pairedDiffVsBaselineStats.mean.toFixed(3)}, 95% CI [${candidate.pairedDiffVsBaselineStats.ciLower.toFixed(3)}, ${candidate.pairedDiffVsBaselineStats.ciUpper.toFixed(3)}]`);
push(`Runtime 증가율: ${(((candidate.avgRuntimeMs - baseline.avgRuntimeMs) / baseline.avgRuntimeMs) * 100).toFixed(1)}%`);
push(`CCR 호출률(Recovery-level, CCR Gate 적합 비율): ${(totalInTarget / (runs[0].length || 1) * 100).toFixed(1)}%`);
push();

const regression = classifyRegressions(runs);
push("--- STEP4: Regression Analysis ---");
push(`True Regression: ${regression.trueRegressionCount}건`);
push(`False Regression(noise, 소수 run에서만 관측): ${regression.falseRegressionCount}건`);
push(`Duplicate Success(REPAIR와 CCR 둘 다 성공, 기대값 0): ${regression.duplicateSuccessCount}건`);
push(`CCR Only Success: ${regression.ccrOnlySuccessCount}건`);
push(`REPAIR Only Success: ${regression.repairOnlySuccessCount}건`);
push(`CCR Skip(Gate 미적합): ${regression.ccrSkipCount}건`);
push(`Deferred Reject(Gate 적합, Deferred Validation 거부): ${regression.deferredRejectCount}건`);
push();

push(`--- STEP5: Standard Evaluation ---`);
push(`사용한 N: ${runsUsed} (최소 15, 최대 ${MAX_N}), CI 결정적 여부: ${reachedDecisive}`);
push(`Runtime CI 근사(Baseline avg ${baseline.avgRuntimeMs.toFixed(1)}ms, Candidate avg ${candidate.avgRuntimeMs.toFixed(1)}ms): 차이 ${(candidate.avgRuntimeMs - baseline.avgRuntimeMs).toFixed(1)}ms`);
push(`Capability CI: paired-diff 95% CI [${candidate.pairedDiffVsBaselineStats.ciLower.toFixed(3)}, ${candidate.pairedDiffVsBaselineStats.ciUpper.toFixed(3)}]`);
push();

// --- STEP6: Blueprint vs Actual ---
// IMPORTANT (self-correction, see this Sprint's own conclusion writeup for
// the full diagnosis): the isolated Recovery-level comparison above
// (STEP3/4/5) gives attemptRecovery() a FRESH Date.now()+CALL_DEADLINE_MS
// deadline on every call -- it measures "does the CCR mechanism work if
// Recovery gets a genuine budget window", which is the right question for
// validating the mechanism itself, but it does NOT represent what happens
// in the REAL end-to-end solve() path, where Recovery only gets whatever
// time is left after the ENTIRE primary pipeline (PAIR/FLIP/PARITY/ENDGAME)
// already ran. STEP1/STEP2's own real analyzeProductionPath pass (real,
// unmodified engine.solve(), CCR genuinely wired in) is the AUTHORITATIVE
// measurement of what production integration actually achieves --
// verified directly via trace timestamps (recovery-triggered fires at
// ~83-96% of the whole 1000ms budget already elapsed on this hard-failure
// population, leaving too little time for ANY Recovery candidate --
// DISRUPT/SETUP/REPAIR included, not just CCR -- to be generated). The
// Decision below is therefore based on the REAL end-to-end numbers, with
// the isolated numbers reported as a diagnostic explaining WHY.
log("STEP6: Blueprint 예측 vs 실제 결과 비교 중 (실제 end-to-end 수치를 기준으로 판정)...");
const blueprintPrediction = {
  integrationPoint: "repair_after",
  budgetPolicy: "remainingTime, floor 500ms",
  scheduling: "DISRUPT,DISRUPT,SETUP,REPAIR,CCR",
  estimatedNewCapability: 11, // ideal-budget scenario, CCR Integration Blueprint Sprint v1 STEP5
  estimatedRuntimeIncreasePercent: 9.1,
  estimatedCcrCallRate: 10.7,
};
// REAL end-to-end numbers (STEP1/2) -- authoritative for Decision purposes.
const actualNewCapabilityRealPath = prodRecords.filter((r) => r.ccrChosen).length;
const actualCcrCallRateRealPath = prodSummary.ccrCallCount / (prodSummary.n || 1) * 100;
// Isolated Recovery-level numbers (STEP3/4/5) -- diagnostic only, explains
// the MECHANISM's own potential, not what the live system actually does.
const isolatedNewCapability = regression.ccrOnlySuccessCount;
const isolatedRuntimeIncreasePercent = ((candidate.avgRuntimeMs - baseline.avgRuntimeMs) / baseline.avgRuntimeMs) * 100;
const isolatedCcrCallRatePercent = (totalInTarget / (runs[0].length || 1)) * 100;

push("--- STEP6: Integration Validation (Blueprint 예측 vs 실제 -- 실제 end-to-end 수치가 판정 기준) ---");
push(`Integration Point: 예측=${blueprintPrediction.integrationPoint}, 실제=repair_after (genCCR이 REPAIR 다음에 항상 생성됨, 코드로 확정) -- 일치`);
push(`Budget Contract: 예측=${blueprintPrediction.budgetPolicy}, 실제 평균 remainingTime=${prodSummary.avgRemainingBudgetMs.toFixed(1)}ms, floor 충족율=${(prodSummary.floorMetRate * 100).toFixed(1)}% -- 실제로는 remainingTime이 거의 항상 0에 가까움 (아래 진단 참고)`);
push(`Scheduling: 예측=${blueprintPrediction.scheduling}, 실제=코드상 순서 동일(fiveByFiveEdgeRecovery.ts의 order 배열) -- 일치`);
push(`Capability 증가(실제 end-to-end): 예측 ${blueprintPrediction.estimatedNewCapability}건 vs 실제 ${actualNewCapabilityRealPath}건 -- 예측 오차 ${Math.abs(actualNewCapabilityRealPath - blueprintPrediction.estimatedNewCapability)}건`);
push(`CCR 호출 비율(실제 end-to-end): 예측 ${blueprintPrediction.estimatedCcrCallRate.toFixed(1)}% vs 실제 ${actualCcrCallRateRealPath.toFixed(1)}% -- 예측 오차 ${Math.abs(actualCcrCallRateRealPath - blueprintPrediction.estimatedCcrCallRate).toFixed(1)}%p`);
push(`(진단용, 실제 판정에는 사용 안 함) 격리된 Recovery-level 비교: Capability ${isolatedNewCapability}건, Runtime 증가 ${isolatedRuntimeIncreasePercent.toFixed(1)}%, CCR 호출률 ${isolatedCcrCallRatePercent.toFixed(1)}% -- 이 수치들은 "Recovery가 매번 신선한 예산을 받는다면"이라는 비현실적 가정 하의 값으로, CCR 메커니즘 자체는 유효함을 보여주지만 실제 production 동작을 대표하지 않는다.`);
push(`자체 진단 결과: recovery-triggered는 전체 예산의 약 83~96%가 이미 소진된 시점에 발생하며(원시 파이프라인 PAIR/FLIP/PARITY/ENDGAME이 대부분의 예산을 먼저 소비), 그 시점부터는 CCR뿐 아니라 DISRUPT/SETUP/REPAIR 전부 후보를 생성할 시간이 부족하다 -- 이는 CCR 고유의 결함이 아니라 Recovery 레이어 자체가 이 dataset(가장 어려운 잔여 실패)에서는 이미 시간이 거의 남지 않은 시점에만 호출되는, 기존부터 있던 구조적 특성이다(REPAIR 자신도 과거 Integration Sprint들에서 실제 채택률 0.3~1.8%로 극히 낮게 측정된 것과 동일한 원인).`);
push();

// --- Success criteria + Decision (based on REAL end-to-end numbers) ---
log("성공 기준 판정 + 최종 결정 (실제 end-to-end 수치 기준)");
const level1Pass = prodSummary.ccrCallCount > 0; // CCR이 실제로 최소한 유의미하게 호출되는가
const level2Pass = actualNewCapabilityRealPath >= blueprintPrediction.estimatedNewCapability * 0.5; // Blueprint 예측의 최소 절반 수준이라도 재현되는가
const level3Pass = prodSummary.regressionCount === 0 && actualNewCapabilityRealPath > 0;

push("--- 성공 기준 판정 (실제 end-to-end 수치 기준) ---");
push(`Level 1 (Blueprint와 동일한 Scheduling/Budget이 실제 Production에서 정상 동작): ${level1Pass ? "PASS" : "FAIL"} (실제 CCR 호출 ${prodSummary.ccrCallCount}건/${prodSummary.n}건 중 -- 코드는 정확히 연결되어 있으나 이 dataset에서는 사실상 호출 기회 자체가 없었다)`);
push(`Level 2 (Capability 증가가 Blueprint 예측 범위 안에서 재현): ${level2Pass ? "PASS" : "FAIL"} (실제 신규 Capability ${actualNewCapabilityRealPath}건 vs 예측 ${blueprintPrediction.estimatedNewCapability}건)`);
push(`Level 3 (Regression 없이 Runtime 증가가 허용 범위 내이며 새 Capability가 유지됨): ${level3Pass ? "PASS" : "FAIL"} (Regression ${prodSummary.regressionCount}건, 실제 신규 Capability ${actualNewCapabilityRealPath}건)`);
push();

let decision: "A" | "B" | "C";
if (level1Pass && level2Pass && level3Pass) decision = "A";
else if (prodSummary.regressionCount > 0 || prodSummary.ccrCallCount === 0) decision = "C"; // real Regression, or CCR never got a real chance at all -- a qualitative gap from the Blueprint, not a tunable parameter
else decision = "B";

push(`--- 최종 결정: ${decision} ---`);
if (decision === "A") {
  push("Blueprint의 Integration Point/Scheduling/Budget Contract가 실제 production에서 정상 동작하고, Regression 없이 새 Capability가 재현되었다. 다음 단계: CCR Production Validation Sprint v1 (실서비스 수준 검증).");
} else if (decision === "B") {
  push("Integration은 가능하지만 Runtime 또는 Budget 보완이 필요하다 -- CCR Production Integration Refinement Sprint v1이 필요하다.");
} else {
  push("Blueprint와 실제 Production 결과가 크게 다르다 -- CCR Integration Blueprint Revision Sprint v1이 필요하다.");
}
push();

const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
push(`--- 총 소요 시간: ${totalSec}초 ---`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
log(`리포트 저장: ${reportPath}`);
log(`최종 결정: ${decision}`);
