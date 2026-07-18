// First-Hop Failure Analysis Sprint v1 -- driver.
//   npx tsx src/customCube/runFirstHopAnalysis.ts [failuresDbPath] [deadlineMs]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { applySeq, buildCaseLibrary, buildFlipLibrary, buildWingLibrary, wrongWingCount5 } from "./fiveByFiveEdges";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import { warmupFiveByFiveEdgeLibraries } from "./fiveByFiveEdgeSolverEngine";
import { pairCountOf } from "./goalPlanner/GoalAnalyzer";
import { loadAllReplaySnapshots } from "./primitiveReplay/PrototypeReplay";
import { classifyReplay } from "./coverageExpansion/InactivityClassifier";
import { deserializeCube } from "./failureAnalysis/cubeSerialization";
import { buildFirstHopTraceDatabase, selectFirstHopFailReplays } from "./firstHopAnalysis/FirstHopTraceDB";
import { diagnoseNoValidPath } from "./firstHopAnalysis/FirstHopBFSDiagnostic";
import { classifyAllFailureModes, tallyFailureModes } from "./firstHopAnalysis/FailureModeClassifier";
import { computeActivatedGroupStats, computeFailedGroupStats } from "./firstHopAnalysis/SuccessFailureComparison";
import { relaxedCycleChase } from "./firstHopAnalysis/RelaxedChaseCounterfactual";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const deadlineMs = Number(process.argv[3] ?? 300);

const traceDbPath = "src/customCube/firstHopAnalysis/data/first-hop-trace.txt";
const bfsTraceReportPath = "src/customCube/firstHopAnalysis/data/bfs-trace-report.txt";
const comparisonReportPath = "src/customCube/firstHopAnalysis/data/success-vs-failure.txt";
const counterfactualReportPath = "src/customCube/firstHopAnalysis/data/counterfactual-simulation.txt";
const rootCauseReportPath = "src/customCube/firstHopAnalysis/data/root-cause-report.txt";

// Spec success/failure thresholds.
const LEVEL1_MIN_CLASSIFIED_RATE = 0.8;
const LEVEL2_MIN_DOMINANT_MODE_RATE = 0.5;
const LEVEL3_MIN_COVERAGE = 0.3;
const FAIL_MAX_UNKNOWN_RATE = 0.2;

console.log("STEP: 라이브러리 준비 + Replay 로드");
warmupFiveByFiveEdgeLibraries();
const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };
const snapshots = loadAllReplaySnapshots(failuresDbPath);
console.log(`  Replay ${snapshots.length}건`);

console.log("STEP: 활성화 (17) vs FIRST_HOP_FAIL (46) 재확인");
const classifications = snapshots.map((s) => ({ snapshot: s, classification: classifyReplay(s, libs.lib, deadlineMs) }));
const activatedSnapshots = classifications.filter((c) => c.classification.activated).map((c) => c.snapshot);
const firstHopFailSnapshots = selectFirstHopFailReplays(snapshots, libs.lib, deadlineMs);
console.log(`  활성화: ${activatedSnapshots.length}, FIRST_HOP_FAIL: ${firstHopFailSnapshots.length}`);

// --- STEP 1: FIRST_HOP_FAIL Trace Database ----------------------------------
console.log("\nSTEP 1: First-Hop Trace Database 구축");
const traceRecords = buildFirstHopTraceDatabase(snapshots, libs.lib, deadlineMs);
console.log(`  Trace Record ${traceRecords.length}개`);
const zeroCandidateRecords = traceRecords.filter((r) => r.candidateCount === 0);
const someCandidateRecords = traceRecords.filter((r) => r.candidateCount > 0);
console.log(`  candidateCount=0 (NO_VALID_PATH 후보): ${zeroCandidateRecords.length}`);
console.log(`  candidateCount>0 (경로는 있으나 순 개선 없음): ${someCandidateRecords.length}`);

const traceLines: string[] = [];
const tpush = (s = "") => traceLines.push(s);
tpush("========================================");
tpush("First-Hop Trace Database -- First-Hop Failure Analysis Sprint v1");
tpush("========================================");
tpush();
for (const r of traceRecords) {
  tpush(
    `Replay ${r.replayHash}  cycleLength=${r.cycleLength}  startSlot=${r.startSlot}  targetSlot=${r.targetSlot}  ` +
      `wantedColorKey=${r.wantedColorKey}  candidateCount=${r.candidateCount}  wrongWing=${r.wrongWingCount}  pair=${r.pairCount}  parity=${r.parity}`
  );
}
mkdirSync(dirname(traceDbPath), { recursive: true });
writeFileSync(traceDbPath, traceLines.join("\n"), "utf-8");

// --- STEP 2 + half of STEP 5: BFS diagnostic on the NO_VALID_PATH subset ---
console.log("\nSTEP 2: BFS 내부 진단 (NO_VALID_PATH 후보만, 실제 8000-node 예산과 동일하게)");
const bfsLines: string[] = [];
const bpush = (s = "") => bfsLines.push(s);
bpush("========================================");
bpush("BFS Trace Report -- First-Hop Failure Analysis Sprint v1");
bpush("========================================");
bpush("(bfsMoveWingToPosition은 private이라 직접 계측 불가 -- 동일 구조의 독립 재구현(ShadowBFS)으로 진단.");
bpush(" 실제 시스템과 동일한 8000-node 예산을 사용해 depth 6(원본) vs depth 8(+2) vs 30000-node를 비교.)");
bpush();

let noValidPathRescuedByDepth = 0;
for (const record of zeroCandidateRecords) {
  const snapshot = snapshots.find((s) => s.hash === record.replayHash)!;
  const depth6 = diagnoseNoValidPath(snapshot, record.startSlot, libs.lib);
  bpush(`Replay ${record.replayHash}: donorExists=${depth6.hasColorMatchingDonor}`);
  if (depth6.depth6) {
    bpush(`  depth=6 (실제와 동일 8000-node 예산 재구현): ${depth6.depth6.terminationReason}, found=${depth6.depth6.found}, nodesVisited=${depth6.depth6.nodesVisited}, maxDepthReached=${depth6.depth6.maxDepthReached}`);
  }
  if (depth6.depth8) {
    bpush(`  depth=8 (+2 counterfactual, 동일 8000-node 예산): ${depth6.depth8.terminationReason}, found=${depth6.depth8.found}, nodesVisited=${depth6.depth8.nodesVisited}`);
    if (depth6.depth8.found && !depth6.depth6.found) noValidPathRescuedByDepth++;
  }
  console.log(`  ${record.replayHash}: donorExists=${depth6.hasColorMatchingDonor}, depth6=${depth6.depth6?.terminationReason}, depth8=${depth6.depth8?.terminationReason}`);
}
bpush();
bpush(`Depth+2로 새로 구제된 Replay 수: ${noValidPathRescuedByDepth}/${zeroCandidateRecords.length}`);
mkdirSync(dirname(bfsTraceReportPath), { recursive: true });
writeFileSync(bfsTraceReportPath, bfsLines.join("\n"), "utf-8");
console.log(`  Depth+2로 새로 구제된 Replay 수: ${noValidPathRescuedByDepth}/${zeroCandidateRecords.length}`);

// --- STEP 3: Failure Mode Classification ------------------------------------
console.log("\nSTEP 3: Failure Mode 자동 분류 (WRONG_START는 alternateStart 재사용으로 교차검증)");
const failureModeResults = classifyAllFailureModes(traceRecords, snapshots, libs, deadlineMs);
const modeTally = tallyFailureModes(failureModeResults);
for (const [mode, count] of Object.entries(modeTally)) console.log(`  ${mode}: ${count}`);

// --- STEP 4: Success vs Failure Comparison ----------------------------------
console.log("\nSTEP 4: 활성화(17) vs FIRST_HOP_FAIL(46) 비교");
const activatedStats = computeActivatedGroupStats(activatedSnapshots);
const failedStats = computeFailedGroupStats(traceRecords);
console.log(`  ${activatedStats.label}: avgCycleLength=${activatedStats.avgCycleLength.toFixed(2)}, avgWrongWing=${activatedStats.avgWrongWingCount.toFixed(2)}, avgPair=${activatedStats.avgPairCount.toFixed(2)}`);
console.log(`  ${failedStats.label}: avgCycleLength=${failedStats.avgCycleLength.toFixed(2)}, avgWrongWing=${failedStats.avgWrongWingCount.toFixed(2)}, avgPair=${failedStats.avgPairCount.toFixed(2)}, avgCandidateCount=${failedStats.avgCandidateCount?.toFixed(2)}`);

const comparisonLines: string[] = [];
const cpush = (s = "") => comparisonLines.push(s);
cpush("========================================");
cpush("Success vs Failure Comparison -- First-Hop Failure Analysis Sprint v1");
cpush("========================================");
cpush();
for (const stats of [activatedStats, failedStats]) {
  cpush(`--- ${stats.label} ---`);
  cpush(`  건수: ${stats.count}`);
  cpush(`  평균 Cycle Length: ${stats.avgCycleLength.toFixed(2)}`);
  cpush(`  평균 WrongWing: ${stats.avgWrongWingCount.toFixed(2)}`);
  cpush(`  평균 Pair Count: ${stats.avgPairCount.toFixed(2)}`);
  if (stats.avgCandidateCount !== null) cpush(`  평균 Candidate 수: ${stats.avgCandidateCount.toFixed(2)}`);
  cpush();
}
mkdirSync(dirname(comparisonReportPath), { recursive: true });
writeFileSync(comparisonReportPath, comparisonLines.join("\n"), "utf-8");

// --- STEP 5: Counterfactual Simulation (relaxed net-improvement requirement) ---
console.log("\nSTEP 5: Counterfactual Simulation -- 순 개선 요구 완화 (PAIR_CONFLICT 대상)");
interface CFResult {
  activated: boolean;
  wrongWingBefore: number;
  wrongWingAfter: number;
  pairBefore: number;
  pairAfter: number;
}
function runRelaxed(snapshot: (typeof snapshots)[number]): CFResult {
  const cubies = deserializeCube(snapshot.cubeState);
  const wrongWingBefore = wrongWingCount5(cubies);
  const pairBefore = pairCountOf(cubies);
  const fix = relaxedCycleChase(cubies, libs.lib, Date.now() + deadlineMs);
  if (!fix) return { activated: false, wrongWingBefore, wrongWingAfter: wrongWingBefore, pairBefore, pairAfter: pairBefore };
  applySeq(cubies, fix);
  return { activated: true, wrongWingBefore, wrongWingAfter: wrongWingCount5(cubies), pairBefore, pairAfter: pairCountOf(cubies) };
}
const relaxedResults = snapshots.map(runRelaxed);
const relaxedActivated = relaxedResults.filter((r) => r.activated);
const relaxedRegressions = relaxedActivated.filter((r) => r.pairAfter < r.pairBefore || r.wrongWingAfter > r.wrongWingBefore);
const relaxedCoverage = relaxedActivated.length / snapshots.length;
const relaxedRegressionRate = relaxedActivated.length ? relaxedRegressions.length / relaxedActivated.length : 0;
const BASELINE_COVERAGE = 0.227;
const BASELINE_REGRESSION = 0.0;
console.log(`  relaxedCycleChase: Coverage=${(relaxedCoverage * 100).toFixed(1)}% (${relaxedActivated.length}/${snapshots.length})  Regression=${(relaxedRegressionRate * 100).toFixed(1)}%`);

const counterfactualLines: string[] = [];
const cfpush = (s = "") => counterfactualLines.push(s);
cfpush("========================================");
cfpush("Counterfactual Simulation -- First-Hop Failure Analysis Sprint v1");
cfpush("========================================");
cfpush();
cfpush(`Baseline (Primitive Invention/Coverage Expansion Sprint 재현): Coverage ${(BASELINE_COVERAGE * 100).toFixed(1)}%, Regression ${(BASELINE_REGRESSION * 100).toFixed(1)}%`);
cfpush();
cfpush("--- Counterfactual A: Depth+2 (NO_VALID_PATH 대상, STEP 2 결과 재사용) ---");
cfpush(`  6건 중 ${noValidPathRescuedByDepth}건이 depth+2로 새로 구제됨`);
cfpush();
cfpush("--- Counterfactual B: 순 개선 요구 완화 (PAIR_CONFLICT 대상, relaxedCycleChase) ---");
cfpush(`  Coverage: ${(relaxedCoverage * 100).toFixed(1)}% (${relaxedActivated.length}/${snapshots.length})`);
cfpush(`  Regression (활성화된 것 중): ${(relaxedRegressionRate * 100).toFixed(1)}% (${relaxedRegressions.length}/${relaxedActivated.length || 0})`);
mkdirSync(dirname(counterfactualReportPath), { recursive: true });
writeFileSync(counterfactualReportPath, counterfactualLines.join("\n"), "utf-8");
console.log("\n" + counterfactualLines.join("\n"));

// --- STEP 6: Root Cause Report + 성공 기준 판정 ------------------------------
const totalFailures = traceRecords.length;
const classifiedCount = totalFailures - modeTally.UNKNOWN;
const classifiedRate = totalFailures ? classifiedCount / totalFailures : 0;
const dominantMode = (Object.entries(modeTally) as [string, number][]).reduce((best, cur) => (cur[1] > best[1] ? cur : best));
const dominantModeRate = totalFailures ? dominantMode[1] / totalFailures : 0;
const unknownRate = totalFailures ? modeTally.UNKNOWN / totalFailures : 0;

const level1 = classifiedRate >= LEVEL1_MIN_CLASSIFIED_RATE;
const level2 = dominantModeRate >= LEVEL2_MIN_DOMINANT_MODE_RATE;
const bestCounterfactualCoverage = Math.max(relaxedCoverage, BASELINE_COVERAGE + noValidPathRescuedByDepth / snapshots.length);
const level3 = bestCounterfactualCoverage >= LEVEL3_MIN_COVERAGE;

const failUnknownTooHigh = unknownRate > FAIL_MAX_UNKNOWN_RATE;
const failTooDispersed = dominantModeRate < 0.3;
const failNoSimulationIncrease = relaxedCoverage <= BASELINE_COVERAGE && noValidPathRescuedByDepth === 0;
const failNoBottleneckFound = dominantModeRate < 0.3;

const rootCauseLines: string[] = [];
const rpush = (s = "") => rootCauseLines.push(s);
rpush("========================================");
rpush("Root Cause Report -- First-Hop Failure Analysis Sprint v1");
rpush("========================================");
rpush();
rpush(`FIRST_HOP_FAIL 전체: ${totalFailures}건`);
rpush();
rpush("--- Failure Mode 분포 ---");
for (const [mode, count] of Object.entries(modeTally)) {
  rpush(`  ${mode} : ${count} (${totalFailures ? ((count / totalFailures) * 100).toFixed(1) : "0.0"}%)`);
}
rpush();
rpush(`가장 큰 Failure Mode: ${dominantMode[0]} (${(dominantModeRate * 100).toFixed(1)}%)`);
rpush();
rpush("--- 성공 기준 판정 ---");
rpush(`Level 1 (80%+ 구체적 원인으로 분류): ${level1 ? "PASS" : "FAIL"} (실제 ${(classifiedRate * 100).toFixed(1)}%)`);
rpush(`Level 2 (최대 Failure Mode 50%+ 차지): ${level2 ? "PASS" : "FAIL"} (실제 ${dominantMode[0]} ${(dominantModeRate * 100).toFixed(1)}%)`);
rpush(`Level 3 (Counterfactual Coverage 30%+ 달성 가능): ${level3 ? "PASS" : "FAIL"} (최고 ${(bestCounterfactualCoverage * 100).toFixed(1)}%)`);
rpush();
rpush("--- 실패 조건 판정 ---");
rpush(`UNKNOWN > 20%: ${failUnknownTooHigh ? "해당" : "해당없음"} (실제 ${(unknownRate * 100).toFixed(1)}%)`);
rpush(`Failure Mode가 지나치게 분산됨 (최대 Mode < 30%): ${failTooDispersed ? "해당" : "해당없음"}`);
rpush(`Simulation에서도 Coverage 증가 없음: ${failNoSimulationIncrease ? "해당" : "해당없음"}`);
rpush(`병목 원인을 특정하지 못함: ${failNoBottleneckFound ? "해당" : "해당없음"}`);
rpush();
const overall = level1 && level2 && level3;
rpush(`종합 판정: ${overall ? "Level 3까지 달성 -- CycleChase v2 Prototype Sprint 검토" : level1 && level2 ? "Level 1~2만 달성 -- 구조적 원인은 규명, 실질적 개선안 없음 (기술적 한계로 문서화)" : "실패 -- CycleChase 계열 연구 종료 검토"}`);
rpush(`제품 통합 여부: 미통합 (spec -- 이번 Sprint는 분석 전용)`);

mkdirSync(dirname(rootCauseReportPath), { recursive: true });
writeFileSync(rootCauseReportPath, rootCauseLines.join("\n"), "utf-8");
console.log("\n" + rootCauseLines.join("\n"));
