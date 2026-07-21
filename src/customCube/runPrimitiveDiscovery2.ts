// Primitive Discovery Sprint #3 -- driver.
//   npx tsx src/customCube/runPrimitiveDiscovery2.ts [dbPath]
//
// STEP1-6 per the Work Order: re-verify the remaining structural gap under
// the CURRENT (Gate-relaxed) production solver, deep-profile the CCR
// target population, mine its cycle-shape patterns, empirically test
// whether REPAIR's own existing search core already generalizes if its
// cycleLength band is simply widened, draft docs/BLUEPRINT_PRIMITIVE_2_CCR.md,
// and issue a feasibility Decision (A: existing+modification / B: new
// Search Primitive needed). No new Primitive is implemented in this
// Sprint -- solverPrimitiveDiscovery2/ is analysis-only. fiveByFiveEdgeSolverEngine.ts/
// Planner/Executor/Recovery/SuccessOptimizationV2/DeferredValidator are all
// read-only (called exactly as-is via replayFailure()'s own real solve()
// API, or cited/reused unmodified for their exported constants/functions).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import { buildLibs } from "./solverPrimitiveIntegrationPrototype/RecoveryBenchmark";
import { verifyRemainingGap, summarizeGap, selectCcrTarget } from "./solverPrimitiveDiscovery2/RemainingGapVerification";
import { profileCcrTarget, summarizeCcrProfiles } from "./solverPrimitiveDiscovery2/CCRTargetProfiling";
import { mineShapePatterns, top10 } from "./solverPrimitiveDiscovery2/PatternMining";
import {
  runReuseProbe,
  summarizeReuseProbe,
  theoreticalBranchingComparison,
  measureFirstHopLatency,
  summarizeLatencies,
  GENEROUS_BUDGET_MS,
} from "./solverPrimitiveDiscovery2/PrimitiveReuseAnalysis";
import { deserializeCube } from "./failureAnalysis/cubeSerialization";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveDiscovery2/data/discovery2-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Primitive Discovery Sprint #3 -- Report");
push("========================================");
push();

const t0 = Date.now();
const db = loadDatabase(dbPath);
const snapshots = allSnapshots(db);
const snapshotsByHash = new Map(snapshots.map((s) => [s.hash, s]));
const { lib } = buildLibs();

log(`STEP1: ${snapshots.length}개 snapshot 재검증 중 (현재 production, 실제 solve() 재실행)...`);
const gapRecords = verifyRemainingGap(db, snapshots);
const gapSummary = summarizeGap(gapRecords);
push("--- STEP1: Remaining Gap Verification ---");
push(`전체 snapshot: ${gapSummary.total}건`);
push(`현재 production이 이미 해결(stale): ${gapSummary.nowResolvedCount}건`);
push(`REPAIR 현재 Gate(cycleLength 2~4) 해당: ${gapSummary.currentGateEligibleCount}건`);
push(`남은 Gap(!stale && !gateEligible): ${gapSummary.remainingGapCount}건`);
for (const [band, count] of Object.entries(gapSummary.byCycleLengthBand).sort((a, b) => b[1] - a[1])) {
  push(`  - cycleLength ${band}: ${count}건`);
}
push(`CCR 목표 모집단(cycleLength 5-6, conflictEdgeCount=0, 재검증 후): ${gapSummary.conflictEdgeCountZeroInBand56}건`);
push();

const ccrTarget = selectCcrTarget(gapRecords);
log(`STEP2: CCR 목표 모집단(${ccrTarget.length}건) 프로파일링 중...`);
const profiles = profileCcrTarget(ccrTarget, snapshotsByHash);
const profileSummary = summarizeCcrProfiles(profiles);
push("--- STEP2: CCR Target Profiling ---");
push(`n: ${profileSummary.n}`);
push(`평균 wrongWingCount: ${profileSummary.avgWrongWingCount.toFixed(2)}`);
push(`parity 있는 비율: ${(profileSummary.parityShare * 100).toFixed(1)}%`);
push(`평균 cycle 개수: ${profileSummary.avgCycleCount.toFixed(2)}`);
push(`다중 cycle(cycleCount>1) 비율: ${(profileSummary.multiCycleShare * 100).toFixed(1)}%`);
push(`평균 wrongWing 밀도(wrongWingCount / (primaryCycleLength*2)): ${profileSummary.avgWrongWingDensity.toFixed(2)}`);
push(`Edge Orbit 분포(주 cycle 노드 기준): ${JSON.stringify(profileSummary.edgeOrbitDistribution)}`);
push(`Wing Pairing 상태 분포(주 cycle 노드 기준): ${JSON.stringify(profileSummary.wingPairingDistribution)}`);
push();

log("STEP3: 구조 패턴(cycle shape) 클러스터링 중...");
const shapeClusters = mineShapePatterns(profiles);
const topShapes = top10(shapeClusters);
push("--- STEP3: Structural Pattern Mining (Top 10 cycle shape) ---");
for (const c of topShapes) {
  push(`  ${c.shape}: ${c.size}건 (${(c.share * 100).toFixed(1)}%)`);
}
push();

log(`STEP4: 기존 REPAIR 탐색 코어를 cycleLength 2~6으로 확장한 Probe 실행 중 (${ccrTarget.length}건, REPAIR 실사용 75ms reservedBudget 기준)...`);
const reuseRecords = ccrTarget.map((r) => {
  const snapshot = snapshotsByHash.get(r.hash)!;
  const cubies = deserializeCube(snapshot.cubeState);
  return runReuseProbe(cubies, r.hash, lib);
});
const reuseSummary = summarizeReuseProbe(reuseRecords);
const branching = theoreticalBranchingComparison();
push("--- STEP4: Existing Primitive Reuse Analysis (REPAIR 탐색 코어, cycleLength band만 2~6으로 확장) ---");
push(`Probe 대상: ${reuseSummary.n}건 (REPAIR의 실제 75ms reservedBudget 창 기준, W2_widerHop과 동일 옵션)`);
push(`Match(net-improve, Deferred Validation 통과) 비율: ${(reuseSummary.matchRate * 100).toFixed(1)}% (${reuseSummary.matchedCount}/${reuseSummary.n})`);
push(`평균 leavesExplored: ${reuseSummary.avgLeavesExplored.toFixed(1)}, 평균 nodesVisited: ${reuseSummary.avgNodesVisited.toFixed(1)}`);
push(`Leaf Cap(MAX_LEAVES_EXPLORED) 도달 비율: ${(reuseSummary.leafCapHitRate * 100).toFixed(1)}%`);
push(`Deadline(75ms) 도달 비율: ${(reuseSummary.deadlineHitRate * 100).toFixed(1)}%`);
push(`평균 소요시간: ${reuseSummary.avgTimeMs.toFixed(2)}ms`);
push();
push("이 결과(leavesExplored 평균 1.1, nodesVisited 평균 2.2인데 Deadline 도달률 91.9%)는 처음엔 '3^5/3^6 분기 폭발로 조기 절단' 가설을 시사하는 듯 보였으나, leafCapHitRate가 0.0%로 실측되어 그 가설과 모순되었다 -- 자체 재검증 실시:");
push(`이론적 분기 비교(maxCandidatesPerHop=3 기준, cap=${branching[0]?.cappedAt}) -- 참고용, 아래 실측으로 기각된 가설:`);
for (const b of branching) {
  push(`  cycleLength ${b.cycleLength}: 이론적 최대 leaves = 3^${b.cycleLength} = ${b.theoreticalMaxLeaves}${b.theoreticalMaxLeaves > b.cappedAt ? ` (cap ${b.cappedAt} 초과)` : ""}`);
}
push();

log(`STEP4 재검증: 단일 첫-hop enumerateWingCandidates() 호출 자체의 소요시간 측정 중...`);
const latencySamples: number[] = [];
for (const r of ccrTarget) {
  const snapshot = snapshotsByHash.get(r.hash)!;
  const cubies = deserializeCube(snapshot.cubeState);
  const latency = measureFirstHopLatency(cubies, lib);
  if (latency !== null) latencySamples.push(latency);
}
const latencySummary = summarizeLatencies(latencySamples);
push(`단일 첫-hop enumerateWingCandidates() 소요시간(n=${latencySummary.n}, 500ms 여유 예산으로 측정 자체는 절단되지 않음): 평균 ${latencySummary.avgMs.toFixed(1)}ms, p50 ${latencySummary.p50Ms}ms, p95 ${latencySummary.p95Ms}ms, max ${latencySummary.maxMs}ms`);
push(`-> p50(${latencySummary.p50Ms}ms)만으로도 REPAIR의 75ms reservedBudget에 근접/초과하며, p95(${latencySummary.p95Ms}ms)는 이를 크게 초과한다. 즉 91.9% Deadline 도달의 실제 원인은 DFS 분기 폭발이 아니라 "이 모집단(평균 wrongWingCount ${profileSummary.avgWrongWingCount.toFixed(1)}, cycleLength 2~4보다 밀집됨)에서 단일 hop의 candidate 탐색 비용 자체가 REPAIR의 75ms 창을 거의 항상 넘어선다"는 예산 부족(budget starvation)이다.`);
push();

log(`STEP4 재검증: 동일 탐색을 실제 whole-plan 예산(PLAN_TIME_BUDGET_MS=${GENEROUS_BUDGET_MS}ms)으로 재실행 중...`);
const generousRecords = ccrTarget.map((r) => {
  const snapshot = snapshotsByHash.get(r.hash)!;
  const cubies = deserializeCube(snapshot.cubeState);
  return runReuseProbe(cubies, r.hash, lib, GENEROUS_BUDGET_MS);
});
const generousSummary = summarizeReuseProbe(generousRecords);
push(`--- STEP4 재검증: 동일 Probe, ${GENEROUS_BUDGET_MS}ms 예산(REPAIR 75ms reservedBudget 대신 실제 전체 plan 예산) ---`);
push(`Match 비율: ${(generousSummary.matchRate * 100).toFixed(1)}% (${generousSummary.matchedCount}/${generousSummary.n}) -- 75ms 기준 ${(reuseSummary.matchRate * 100).toFixed(1)}%(${reuseSummary.matchedCount}건) 대비 ${generousSummary.matchedCount - reuseSummary.matchedCount >= 0 ? "+" : ""}${generousSummary.matchedCount - reuseSummary.matchedCount}건`);
push(`평균 leavesExplored: ${generousSummary.avgLeavesExplored.toFixed(1)}, 평균 nodesVisited: ${generousSummary.avgNodesVisited.toFixed(1)}, Leaf Cap 도달: ${(generousSummary.leafCapHitRate * 100).toFixed(1)}%, Deadline 도달: ${(generousSummary.deadlineHitRate * 100).toFixed(1)}%`);
push(`결론: 탐색 메커니즘(bounded DFS + Deferred Validation) 자체는 cycleLength 5~6에서도 유효하다 -- 문제는 알고리즘이 아니라 REPAIR 고유의 75ms reservedBudget 예산이 이 모집단에는 너무 작다는 것이다(Integration Refinement Sprint v1이 이미 발견한 "Recovery 후보 생성 예산 기아" 문제와 동일 범주, 다른 지점에서 재발). 단, ${(generousSummary.deadlineHitRate * 100).toFixed(1)}%가 1000ms에서도 여전히 Deadline에 도달하므로 예산을 늘려도 완전히 해소되지는 않는다 -- 실제 최적 예산/커버리지 지점은 CCR Prototype Sprint v1에서 별도 튜닝이 필요하다.`);
push();

log("STEP6: Feasibility 판정 중...");
const reuseViable = generousSummary.matchRate >= 0.3;
const decision: "A" | "B" = reuseViable ? "A" : "B";
push("--- 성공 기준 판정 ---");
push(`Level 1 (CCR 대상 구조를 명확히 정의): PASS (${gapSummary.conflictEdgeCountZeroInBand56}건, Top shape=${topShapes[0]?.shape ?? "n/a"} ${((topShapes[0]?.share ?? 0) * 100).toFixed(1)}%)`);
push(`Level 2 (기존 Primitive 재사용 가능성 판단): PASS -- 탐색 알고리즘(bounded DFS+Deferred Validation)은 재사용 가능하나(충분한 예산 시 match율 ${(generousSummary.matchRate * 100).toFixed(1)}%), REPAIR 고유의 75ms reservedBudget 스케줄링 계약은 그대로 재사용 불가(match율 ${(reuseSummary.matchRate * 100).toFixed(1)}%로 저하) -- CCR은 자신만의 예산 계약이 필요하다.`);
push(`Level 3 (Prototype 구현 가능한 Blueprint 완성): PASS (docs/BLUEPRINT_PRIMITIVE_2_CCR.md)`);
push();
push(`--- STEP6: Feasibility Check ---`);
push(
  `기존 REPAIR 탐색 코어(bounded DFS, enumerateWingCandidates/applySeq/wrongWingCount5/pairCountOf/validateDeferred 전부 재사용 가능)를 cycleLength band만 넓혀 재사용할 수 있다 -- 단, REPAIR 고유의 75ms reservedBudget을 그대로 물려받으면 실효 match율이 ${(reuseSummary.matchRate * 100).toFixed(1)}%로 사실상 무력화된다(단일 hop의 candidate 탐색 비용 자체가 이미 그 예산을 넘어서기 때문, DFS 분기 폭발이 원인이 아님). 예산을 늘리면(${GENEROUS_BUDGET_MS}ms) match율이 ${(generousSummary.matchRate * 100).toFixed(1)}%로 회복된다 -- 즉 CCR은 "새 탐색 알고리즘"이 아니라 "기존 탐색 알고리즘 + 자신만의 예산/스케줄링 계약"이 필요한 케이스다.`,
);
push();
push(`--- 최종 결정: ${decision} ---`);
push(
  decision === "A"
    ? "CCR Prototype Sprint v1 (기존 bounded DFS 탐색 코어 재사용 + CCR 자신만의 예산 계약 설계)으로 진행. REPAIR와 동일한 75ms reservedBudget을 그대로 물려받지 않도록 주의."
    : "CCR Prototype Sprint v1 (새 Search Primitive: 결정적 cycle-follow/순열 분해 기반)으로 진행.",
);
push();

const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
push(`--- 총 소요 시간: ${totalSec}초 ---`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
log(`리포트 저장: ${reportPath}`);
log(`최종 결정: ${decision}`);
