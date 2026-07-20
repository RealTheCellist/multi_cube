// Solver Primitive Integration Prototype Sprint v1 -- driver.
//   npx tsx src/customCube/runIntegrationPrototype.ts [failuresDbPath]
// STEP1 (REPAIR Strategy 실제 배선) is already real product code as of
// this Sprint's own fiveByFiveEdgeRecovery.ts/fiveByFiveEdgeExecutor.ts
// changes -- this driver runs STEP2~6's empirical verification against
// the real 150-replay Dataset using those REAL, unmodified-here
// production functions (only this Sprint's own disclosed additions),
// then applies Level 1~3 and the final A/B/C decision.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDataset, buildLibs } from "./solverPrimitiveIntegrationPrototype/RecoveryBenchmark";
import { verifyRecoveryContract } from "./solverPrimitiveIntegrationPrototype/RecoveryContractVerification";
import { compareShortCircuit } from "./solverPrimitiveIntegrationPrototype/ShortCircuitComparison";
import { analyzeTimeBudget } from "./solverPrimitiveIntegrationPrototype/TimeBudgetAnalysis";
import { runIntegrationBenchmark } from "./solverPrimitiveIntegrationPrototype/IntegrationBenchmarkComparison";
import { checkPlannerImpact } from "./solverPrimitiveIntegrationPrototype/PlannerImpactCheck";
import { decidePrototypeOutcome } from "./solverPrimitiveIntegrationPrototype/IntegrationPrototypeDecision";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveIntegrationPrototype/data/integration-prototype-v1-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Solver Primitive Integration Prototype Sprint v1 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("Integration Blueprint Sprint v1에서 확정한 Integration Contract를 실제 production Solver에 최초 적용했다. W2_widerHop을 Recovery의 REPAIR Strategy로 실제 연결(fiveByFiveEdgeRecovery.ts/fiveByFiveEdgeExecutor.ts, 이번 Sprint에서 처음으로 허용된 product code 수정)하고, Blueprint가 예측한 동작이 실제 Solver에서도 재현되는지 실측으로 검증한다. Solver/Planner/Primitive Registry는 전혀 수정하지 않았다.");
push();

const t0 = Date.now();
log("데이터셋 로드 중...");
const snapshots = loadDataset(failuresDbPath);
const { lib, libs } = buildLibs();
push(`데이터셋: ${snapshots.length}개 replay`);
push();

log(`STEP2: Recovery Contract 검증 (${snapshots.length}개 snapshot)`);
const contractSummary = verifyRecoveryContract(snapshots, libs);
push("--- 1. STEP2: Recovery Contract 검증 ---");
push(`REPAIR 생성됨: ${contractSummary.repairGeneratedCount}/${contractSummary.n} (${(contractSummary.repairGeneratedRate * 100).toFixed(1)}%)`);
push(`REPAIR 생성된 것 중 실제 채택됨(chooseBestRecovery 최고점): ${contractSummary.repairChosenCount}/${contractSummary.repairGeneratedCount} (${(contractSummary.repairChosenRateAmongGenerated * 100).toFixed(1)}%)`);
push(`REPAIR 미생성(Gate 불일치 또는 Deferred Reject, 둘을 구분하지 않은 합산치): ${contractSummary.deferredRejectCount}/${contractSummary.n}`);
push(`snapshot당 평균 후보 수: ${contractSummary.avgCandidateCount.toFixed(2)}`);
push();

log(`STEP3: Short-circuit A/B 비교 (${snapshots.length}개 snapshot x 2)`);
const shortCircuit = compareShortCircuit(snapshots, libs);
push("--- 2. STEP3: Short-circuit 여부 실험 (A/B) ---");
for (const arm of [shortCircuit.withShortCircuit, shortCircuit.withoutShortCircuit]) {
  push(`[${arm.label}] 성공률 ${(arm.successRate * 100).toFixed(1)}% (${arm.successCount}/${arm.n}), Regression ${arm.regressionCount}건, 평균 ${arm.avgTimeMs.toFixed(1)}ms, 최대 ${arm.maxTimeMs}ms, short-circuit 발동 ${arm.shortCircuitedCount}건`);
}
push(`delta: 성공률 ${(shortCircuit.successRateDelta * 100).toFixed(1)}%p, 평균시간 ${shortCircuit.avgTimeMsDelta.toFixed(1)}ms, Regression ${shortCircuit.regressionDelta}건`);
push();

log(`STEP4: Time Budget 검증 (${snapshots.length}개 snapshot)`);
const timeBudget = analyzeTimeBudget(snapshots, lib);
push("--- 3. STEP4: Time Budget 검증 ---");
push(`REPAIR 실제 slice 예산: ${timeBudget.sliceMs}ms (RECOVERY_GEN_BUDGET_MS/4)`);
push(`Gate 통과(analyzeMultiCycle+conflictEdgeCount>0): ${timeBudget.gateMatchedCount}/${timeBudget.n}`);
push(`Gate 통과분 평균 실행시간: ${timeBudget.avgTimeMsAmongMatched.toFixed(1)}ms, 최대 ${timeBudget.maxTimeMsAmongMatched}ms`);
push(`Gate 통과분 중 slice 예산 초과: ${timeBudget.budgetExceededCount}/${timeBudget.gateMatchedCount} (${(timeBudget.budgetExceededRateAmongMatched * 100).toFixed(1)}%)`);
push("(Blueprint의 Risk 완화책 (c): 시간 내 완료 못 하면 후보 미생성으로 두고 DISRUPT/SETUP만 진행 -- add()가 null/empty를 이미 그렇게 처리하므로 별도 코드 변경 없이 이미 이 완화책이 적용되어 있다.)");
push();

log(`STEP5: Integration Benchmark (${snapshots.length}개 snapshot x 2, 시간이 걸릴 수 있음)`);
const benchmark = runIntegrationBenchmark(snapshots, libs);
push("--- 4. STEP5: Integration Benchmark (기존 vs REPAIR 포함) ---");
for (const arm of [benchmark.before, benchmark.after]) {
  push(`[${arm.label}]`);
  push(`  Solve Rate: ${(arm.solveRate * 100).toFixed(1)}% (${Math.round(arm.solveRate * arm.n)}/${arm.n})`);
  push(`  평균 Move: ${arm.avgMoveCount.toFixed(2)}, 평균 Time: ${arm.avgTimeMs.toFixed(1)}ms, 최대 Time: ${arm.maxTimeMs}ms`);
  push(`  Plan 예산(${1000}ms) 초과: ${arm.timeoutOverPlanBudgetCount}건`);
  push(`  Recovery 호출 수: ${arm.recoveryTriggeredCount}, REPAIR 생성 수: ${arm.repairGeneratedCount}, REPAIR short-circuit 수: ${arm.repairShortCircuitCount}`);
  push(`  Regression: ${arm.regressionCount}건`);
}
push(`delta: Solve Rate ${(benchmark.solveRateDelta * 100).toFixed(1)}%p (참고용 -- 이 Dataset은 전부 과거 solver 실패 사례라 fully-solved 기준은 구조적으로 0%에 가깝다), 평균 Move ${benchmark.avgMoveCountDelta.toFixed(2)}, 평균 Time ${benchmark.avgTimeMsDelta.toFixed(1)}ms, Regression ${benchmark.regressionDelta}건`);
push(`Rescued(after만 완전히 풀림): ${benchmark.rescuedHashes.length}건, Lost(before만 완전히 풀림): ${benchmark.lostHashes.length}건`);
const s = benchmark.pairedImprovementDiffStats;
push(`[Standard Evaluation Protocol] paired-diff(REPAIR 포함 - 미포함, snapshot당 wrongWing 개선량) 평균 ${s.mean.toFixed(3)}, stddev ${s.stddev.toFixed(3)}, 95% CI [${s.ciLower.toFixed(3)}, ${s.ciUpper.toFixed(3)}] (n=${s.n})`);
push();

log(`STEP6: Planner 영향 확인 (${snapshots.length}개 snapshot)`);
const plannerImpact = checkPlannerImpact(snapshots, libs);
push("--- 5. STEP6: Planner 영향 확인 ---");
push(`베이스라인 mismatch(probe 없이 sigA vs sigB -- 이 Sprint와 무관한 Planner 자체의 사전 존재 timing jitter): ${plannerImpact.baselineMismatchCount}/${plannerImpact.n}`);
push(`includeRepair=false probe 이후 mismatch: ${plannerImpact.mismatchWithoutRepairProbeCount}/${plannerImpact.n}`);
push(`includeRepair=true probe 이후 mismatch(이번 Sprint 실제 production 기본값): ${plannerImpact.mismatchWithRepairProbeCount}/${plannerImpact.n}`);
push(`REPAIR 고유의 증분(with-without): ${plannerImpact.repairAttributableIncrementCount}건 -- 베이스라인 jitter로 설명되지 않는 REPAIR 자체의 영향`);
push();

log("Level 1~3 판정 + 최종 결정");
const outcome = decidePrototypeOutcome(contractSummary, shortCircuit, timeBudget, benchmark, plannerImpact);
push("--- 6. 성공 기준 판정 ---");
push(`Level 1 (REPAIR가 정상적으로 Recovery에 연결된다): ${outcome.level1Pass ? "PASS" : "FAIL"}`);
push(`Level 2 (Blueprint 예측 동작이 실제로 확인된다): ${outcome.level2Pass ? "PASS" : "FAIL"}`);
push(`Level 3 (통계적으로 유의한 개선 또는 Integration 가능성 확인): ${outcome.level3Pass ? "PASS" : "FAIL"}`);
push();
push(`--- 7. 최종 결정: ${outcome.decision} ---`);
push(outcome.rationale);
push();

const totalMs = Date.now() - t0;
push(`--- 총 소요 시간: ${(totalMs / 1000).toFixed(1)}초 ---`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
log(`리포트 저장: ${reportPath}`);
log(`총 소요 시간: ${(totalMs / 1000).toFixed(1)}초`);
log(`최종 결정: ${outcome.decision}`);
