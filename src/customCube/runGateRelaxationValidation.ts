// Gate Relaxation Validation Sprint v1 -- driver.
//   npx tsx src/customCube/runGateRelaxationValidation.ts [dbPath]
//
// Tests whether removing REPAIR's conflictEdgeCount>0 requirement (G1,
// keeping cycleLength 2~4) closes the 77-snapshot gap Primitive Discovery
// Sprint #2 found, BEFORE committing to a new Primitive (CCR). No new
// search algorithm -- G0 calls the real, unmodified runSuccessV2
// directly; G1 is a disclosed hop-for-hop reimplementation with exactly
// one line removed (see GateRelaxationVariants.ts's own header comment).
// Solver/Planner/Executor/Recovery/MultiHopBridgePrototypeV3/runSuccessV2/
// DeferredValidator/SuccessOptimizationV2/Evaluation Stabilization are all
// read-only in this Sprint -- called, never modified.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import { buildLibs } from "./solverPrimitiveIntegrationPrototype/RecoveryBenchmark";
import { collectRun, type RunRecord } from "./solverPrimitiveGateRelaxation/RawDataCollector";
import { evaluateAdaptive } from "./solverPrimitiveGateRelaxation/Evaluation";
import { classifyTarget77 } from "./solverPrimitiveGateRelaxation/FailureClassification";
import { checkCoarsening } from "./solverPrimitiveGateRelaxation/CoarseningCheck";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveGateRelaxation/data/gate-relaxation-v1-report.txt";
const INITIAL_N = 15; // Standard Evaluation Protocol's own required minimum
const EXTENSION_STEP = 15;
const MAX_N = 30; // hard cap on adaptive extension -- disclosed time-budget tradeoff, matches this whole series' own established practice of capping around N=30 when N=15 alone isn't decisive

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Gate Relaxation Validation Sprint v1 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("Primitive Discovery Sprint #2가 발견한 최대 Gap(cycleLength 2~4, conflictEdgeCount=0, 77건)에 대해, 새 Primitive(CCR)를 만들기 전에 REPAIR(W2_widerHop)의 Gate에서 conflictEdgeCount>0 조건만 제거(G1)했을 때 Capability가 실제로 늘어나는지 검증한다. runSuccessV2/DeferredValidator/SuccessOptimizationV2/MultiHopBridgePrototypeV3/Evaluation Stabilization/Solver/Planner/Executor/Recovery는 전부 읽기 전용(호출만 함). G0는 runSuccessV2를 그대로 호출, G1만 disclosed hop-for-hop 재구현(conflict-edge 검사 한 줄만 제거).");
push();

const t0 = Date.now();
log("데이터셋 로드 중...");
const db = loadDatabase(dbPath);
const snapshots = allSnapshots(db);
const { lib, libs } = buildLibs();
push(`데이터셋: ${snapshots.length}개 snapshot (Primitive Discovery Sprint #2가 수집한 335개 전부)`);
push();

log(`STEP2: RawDataCollector 실행 중 (N=${INITIAL_N} 시작, adaptive extension 최대 N=${MAX_N})...`);
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
const { g0, g1 } = metrics;

push(`--- STEP2/3: Standard Evaluation Protocol (Majority Vote Gap + paired-diff 95% CI) ---`);
push(`사용한 N: ${runsUsed}회 (초기 ${INITIAL_N}, ${reachedDecisive ? "초기 N에서 이미 결정적" : `확장하여 최대 ${MAX_N}까지 시도`}), CI 결정적 여부: ${reachedDecisive}`);
push();
push(`[G0 -- 기존/REPAIR 실제 Gate] Coverage: ${(g0.coverage * 100).toFixed(1)}%, Precision: ${(g0.precision * 100).toFixed(1)}%, GapRescue 평균 ${g0.gapRescueStats.mean.toFixed(2)}/run, Regression ${g0.regressionCount}건`);
push(`[G1 -- Relaxed(conflictEdgeCount 제거)] Coverage: ${(g1.coverage * 100).toFixed(1)}%, Precision: ${(g1.precision * 100).toFixed(1)}%, GapRescue 평균 ${g1.gapRescueStats.mean.toFixed(2)}/run, Regression ${g1.regressionCount}건`);
push(`paired-diff(G1 - G0) GapRescue: 평균 ${g1.pairedDiffVsG0Stats.mean.toFixed(3)}, 95% CI [${g1.pairedDiffVsG0Stats.ciLower.toFixed(3)}, ${g1.pairedDiffVsG0Stats.ciUpper.toFixed(3)}]`);
push();

log("STEP4: Failure Classification (77건 target subset) 계산 중...");
const target77 = classifyTarget77(runs);
push(`--- STEP4: Failure Classification (cycleLength 2~4, conflictEdgeCount=0 target subset) ---`);
push(`Target subset 크기(실측): ${target77.totalInTarget}건 (Primitive Discovery Sprint #2 예상: 77건)`);
push(`G0가 이 subset에서 성공한 건수(합산, 구조상 0이어야 함): ${target77.g0SucceededCount}`);
push(`G1이 최소 1회라도 성공한 hash 수: ${target77.g1SucceededAtLeastOnce}/${target77.totalInTarget}`);
push(`G1이 과반수 run에서 안정적으로 성공한 hash 수: ${target77.g1SucceededMajority}/${target77.totalInTarget}`);
push(`G1의 run당 평균 성공률(target subset 대비): ${(target77.avgG1SuccessRate * 100).toFixed(1)}%`);
push();

log("STEP5: Coarsening Trap 검증 중...");
push("--- STEP5: Coarsening Trap 검증 ---");
push(`참고: 단순 blended precision(G0 전체 대비 G1 전체) 비교는 Gate가 상위집합(superset) 관계일 때 오판 소지가 있다 -- G1의 Gate는 G0의 Gate를 항상 포함하므로, conflictEdgeCount=0인 새 모집단의 성공률이 G0의 기존 모집단보다 낮기만 해도 blended precision은 항상 떨어진다(coarsening 여부와 무관하게). 그래서 이 STEP은 (a) G0가 원래 다루던 모집단에서 G1이 정말 성능을 유지하는지와 (b) 새로 열린 모집단이 진짜 유의미한 성공률을 보이는지를 분리해서 본다.`);
const coarsening = checkCoarsening(runs);
push(`(a) 기존(G0-eligible) 모집단에서 Precision 보존 여부(허용 오차 5%p): ${coarsening.originalPopulationPrecisionPreserved}`);
push(`(b) 신규(conflictEdgeCount=0) 모집단에서 G1 성공률: ${(coarsening.newPopulationSuccessRate * 100).toFixed(1)}% (유의미 기준 10% 초과 여부: ${coarsening.newPopulationMeaningful})`);
push(`기존 모집단 내 Regression 증가 여부: ${coarsening.regressionIncreased}`);
push(`판정 -- Coarsening Trap(기존 모집단 자체가 저하됨): ${coarsening.isCoarseningTrap}, 진짜 Capability 증가(기존 유지 + 신규 유의미 + Regression 없음): ${coarsening.isRealCapabilityIncrease}`);
push();

log("Level 1~3 판정 + 최종 결정");
const level1Pass = target77.g1SucceededAtLeastOnce > 0;
const level2Pass = g1.pairedDiffVsG0Stats.ciLower > 0;
const level3Pass = !coarsening.regressionIncreased && coarsening.isRealCapabilityIncrease;

push("--- 성공 기준 판정 ---");
push(`Level 1 (77건 영역에서 새 성공 사례 존재): ${level1Pass ? "PASS" : "FAIL"} (${target77.g1SucceededAtLeastOnce}건)`);
push(`Level 2 (paired-diff CI가 0을 배제): ${level2Pass ? "PASS" : "FAIL"} (95% CI [${g1.pairedDiffVsG0Stats.ciLower.toFixed(3)}, ${g1.pairedDiffVsG0Stats.ciUpper.toFixed(3)}])`);
push(`Level 3 (Regression 없이 Capability 증가, Coarsening Trap 아님): ${level3Pass ? "PASS" : "FAIL"}`);
push();

const decision: "A" | "B" = level1Pass && level2Pass && level3Pass ? "A" : "B";
push(`--- 최종 결정: ${decision} ---`);
if (decision === "A") {
  push(`conflictEdgeCount>0는 불필요한 제약이었다 -- REPAIR의 Gate만 완화해도(cycleLength 2~4로 확장) 통계적으로 유의한 Capability 증가가 확인되었다(paired-diff 95% CI [${g1.pairedDiffVsG0Stats.ciLower.toFixed(3)}, ${g1.pairedDiffVsG0Stats.ciUpper.toFixed(3)}]), Regression 없음, Coarsening Trap 아님. CCR의 범위는 주로 cycleLength 5~6 영역으로 축소된다.`);
} else {
  push(`conflictEdgeCount는 실제로 필요한 조건이거나(Level 2/3 미충족), 77건 영역에서 새 성공 사례가 확인되지 않았다(Level 1 미충족) -- Clean-Cycle Resolution(CCR)이라는 새 Primitive 설계가 정당화된다.`);
}
push();

const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
push(`--- 총 소요 시간: ${totalSec}초 ---`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
log(`리포트 저장: ${reportPath}`);
log(`사용한 N: ${runsUsed}, 최종 결정: ${decision}`);
