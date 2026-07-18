// Solver Contract Analysis Sprint v1 -- driver.
//   npx tsx src/customCube/runContractAnalysis.ts [failuresDbPath] [deadlineMs]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildWingLibrary } from "./fiveByFiveEdges";
import { warmupFiveByFiveEdgeLibraries } from "./fiveByFiveEdgeSolverEngine";
import { loadAllReplaySnapshots } from "./primitiveReplay/PrototypeReplay";
import { buildFirstHopTraceDatabase } from "./firstHopAnalysis/FirstHopTraceDB";
import { classifyAllFailureModes } from "./firstHopAnalysis/FailureModeClassifier";
import { buildCaseLibrary, buildFlipLibrary } from "./fiveByFiveEdges";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import { analyzeAllPairConflicts } from "./contractAnalysis/PairConflictAnalyzer";
import { simulateDelayedImprovement, summarizeDelayedImprovement } from "./contractAnalysis/DelayedImprovementSimulator";
import { estimateCost } from "./contractAnalysis/CostEstimator";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const deadlineMs = Number(process.argv[3] ?? 300);

const pairConflictReportPath = "src/customCube/contractAnalysis/data/pair-conflict-analysis.txt";
const delayedImprovementReportPath = "src/customCube/contractAnalysis/data/delayed-improvement-simulation.txt";
const costReportPath = "src/customCube/contractAnalysis/data/cost-estimation.txt";
const decisionReportPath = "src/customCube/contractAnalysis/data/architecture-decision-report.txt";

const LEVEL1_MIN_EXPLAINED_RATE = 0.9;
const LEVEL2_MIN_DELAYED_RATIO = 0.2;
const MAX_STEPS = 4;

console.log("STEP: 라이브러리 준비 + Replay 로드");
warmupFiveByFiveEdgeLibraries();
const lib = buildWingLibrary();
const libs: ExecutorLibraries = { lib, flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };
const snapshots = loadAllReplaySnapshots(failuresDbPath);
console.log(`  Replay ${snapshots.length}건`);

console.log("STEP: FIRST_HOP_FAIL 재확인 + Failure Mode 분류 재사용");
const traceRecords = buildFirstHopTraceDatabase(snapshots, lib, deadlineMs);
const failureModes = classifyAllFailureModes(traceRecords, snapshots, libs, deadlineMs);
const pairConflictHashes = new Set(failureModes.filter((f) => f.mode === "PAIR_CONFLICT").map((f) => f.replayHash));
const pairConflictRecords = traceRecords.filter((r) => pairConflictHashes.has(r.replayHash));
console.log(`  PAIR_CONFLICT: ${pairConflictRecords.length}건`);

// --- STEP 2: Pair Conflict Replay 분석 ---------------------------------------
console.log("\nSTEP 2: Pair Conflict Replay 분석");
const startedAtStep2 = Date.now();
const pairConflictAnalyses = analyzeAllPairConflicts(pairConflictRecords, snapshots, lib, deadlineMs);
const step2ElapsedMs = Date.now() - startedAtStep2;
const totalCandidateChecks = pairConflictAnalyses.reduce((s, a) => s + a.totalCandidates, 0);
const avgMsPerCandidateCheck = totalCandidateChecks ? step2ElapsedMs / totalCandidateChecks : 0;
const avgBranchingFactor = pairConflictAnalyses.length ? pairConflictAnalyses.reduce((s, a) => s + a.totalCandidates, 0) / pairConflictAnalyses.length : 0;
console.log(`  평균 후보 수(분기 계수): ${avgBranchingFactor.toFixed(2)}`);

const pcLines: string[] = [];
const pcpush = (s = "") => pcLines.push(s);
pcpush("========================================");
pcpush("Pair Conflict Analysis -- Solver Contract Analysis Sprint v1");
pcpush("========================================");
pcpush();
for (const a of pairConflictAnalyses) {
  pcpush(`Replay ${a.replayHash}  startSlot=${a.startSlot}  총 후보=${a.totalCandidates}  최선 WrongWing 변화=${a.bestWrongWingDelta}`);
  for (const c of a.rejectedCandidates.slice(0, 3)) {
    pcpush(`  candidate(${c.move.length}수): wrongWing ${c.wrongWingBefore}->${c.wrongWingAfter}, pair ${c.pairBefore}->${c.pairAfter}`);
  }
}
mkdirSync(dirname(pairConflictReportPath), { recursive: true });
writeFileSync(pairConflictReportPath, pcLines.join("\n"), "utf-8");

// --- STEP 3/4: Delayed Improvement Simulation -------------------------------
console.log("\nSTEP 3/4: Multi-step Improvement Simulation (최대 4 step)");
const byHash = new Map(snapshots.map((s) => [s.hash, s]));
const delayedResults = pairConflictRecords.map((r) => simulateDelayedImprovement(byHash.get(r.replayHash)!, r.startSlot, lib, deadlineMs, MAX_STEPS));
const delayedSummary = summarizeDelayedImprovement(delayedResults);
console.log(`  Delayed Improvement Ratio: ${(delayedSummary.delayedImprovementRatio * 100).toFixed(1)}% (${delayedSummary.improvedCount}/${delayedSummary.total})`);
for (const [step, count] of delayedSummary.byStep) console.log(`    step ${step}: ${count}건`);

const diLines: string[] = [];
const dipush = (s = "") => diLines.push(s);
dipush("========================================");
dipush("Delayed Improvement Simulation -- Solver Contract Analysis Sprint v1");
dipush("========================================");
dipush();
dipush(`PAIR_CONFLICT 전체: ${delayedSummary.total}건`);
dipush(`Delayed Improvement (4 step 이내 순 개선): ${delayedSummary.improvedCount}건 (${(delayedSummary.delayedImprovementRatio * 100).toFixed(1)}%)`);
dipush();
dipush("--- Step별 최초 개선 분포 ---");
for (const [step, count] of delayedSummary.byStep) dipush(`  step ${step}: ${count}건`);
dipush();
dipush("--- 개별 결과 ---");
for (const r of delayedResults) {
  dipush(`  Replay ${r.replayHash}: before=${r.before}, improvedAtStep=${r.improvedAtStep ?? "없음"}, finalWrongWing=${r.finalWrongWing}, stepsTaken=${r.stepsTaken}`);
}
mkdirSync(dirname(delayedImprovementReportPath), { recursive: true });
writeFileSync(delayedImprovementReportPath, diLines.join("\n"), "utf-8");
console.log("\n" + diLines.slice(0, 8).join("\n"));

// --- STEP 5: Cost Estimation -------------------------------------------------
console.log("\nSTEP 5: Cost Estimation (실측 분기 계수 + 실측 호출 시간 기반)");
const costDepth2 = estimateCost(avgBranchingFactor, avgMsPerCandidateCheck, 2);
const costDepth4 = estimateCost(avgBranchingFactor, avgMsPerCandidateCheck, 4);
console.log(`  depth=2: nodes=${costDepth2.estimatedNodesExplored.toFixed(0)}, time=${costDepth2.estimatedTimeMs.toFixed(1)}ms, taskBudget내=${costDepth2.feasibleWithinTaskBudget}`);
console.log(`  depth=4: nodes=${costDepth4.estimatedNodesExplored.toFixed(0)}, time=${costDepth4.estimatedTimeMs.toFixed(1)}ms, taskBudget내=${costDepth4.feasibleWithinTaskBudget}`);

const costLines: string[] = [];
const cpush = (s = "") => costLines.push(s);
cpush("========================================");
cpush("Cost Estimation -- Solver Contract Analysis Sprint v1");
cpush("========================================");
cpush();
cpush(`실측 평균 분기 계수 (Cluster당 평균 후보 수): ${avgBranchingFactor.toFixed(2)}`);
cpush(`실측 평균 호출 시간 (enumerateWingCandidates 1회): ${avgMsPerCandidateCheck.toFixed(3)}ms`);
cpush();
for (const cost of [costDepth2, costDepth4]) {
  cpush(`--- Lookahead Depth ${cost.lookaheadDepth} (전수 탐색 가정) ---`);
  cpush(`  예상 탐색 노드 수: ${cost.estimatedNodesExplored.toFixed(0)}`);
  cpush(`  예상 소요 시간: ${cost.estimatedTimeMs.toFixed(1)}ms`);
  cpush(`  Task 예산(${cost.taskLocalBudgetMs}ms) 내 가능: ${cost.feasibleWithinTaskBudget ? "예" : "아니오"}`);
  cpush(`  전체 Plan 예산(${cost.planTimeBudgetMs}ms) 내 가능: ${cost.feasibleWithinPlanBudget ? "예" : "아니오"}`);
  cpush();
}
mkdirSync(dirname(costReportPath), { recursive: true });
writeFileSync(costReportPath, costLines.join("\n"), "utf-8");
console.log("\n" + costLines.join("\n"));

// --- STEP 6: Architecture Decision Report ------------------------------------
const explainedRate = pairConflictRecords.length ? pairConflictAnalyses.filter((a) => a.totalCandidates > 0).length / pairConflictRecords.length : 0;
const level1 = explainedRate >= LEVEL1_MIN_EXPLAINED_RATE;
const level2 = delayedSummary.delayedImprovementRatio >= LEVEL2_MIN_DELAYED_RATIO;
const level3 = costDepth2.feasibleWithinTaskBudget; // depth 2 is the realistic product-relevant depth; depth 4 reported for context

const failAlmostNoDelayed = delayedSummary.delayedImprovementRatio < 0.05;
const failNoEffect = delayedSummary.improvedCount === 0;
const failComputeExplosion = !costDepth2.feasibleWithinPlanBudget; // even depth 2 blows the WHOLE plan budget
const failProductInfeasible = !level3;

const decisionLines: string[] = [];
const dpush = (s = "") => decisionLines.push(s);
dpush("========================================");
dpush("Architecture Decision Report -- Solver Contract Analysis Sprint v1");
dpush("========================================");
dpush();
dpush("--- 성공 기준 판정 ---");
dpush(`Level 1 (PAIR_CONFLICT 90%+ 계약으로 설명 가능): ${level1 ? "PASS" : "FAIL"} (실제 ${(explainedRate * 100).toFixed(1)}%, 정의상 PAIR_CONFLICT = enumerateWingCandidates가 후보를 찾았으나 tryFixWing이 거부한 경우이므로 사실상 자명하게 100%)`);
dpush(`Level 2 (Delayed Improvement 20%+ 존재): ${level2 ? "PASS" : "FAIL"} (실제 ${(delayedSummary.delayedImprovementRatio * 100).toFixed(1)}%)`);
dpush(`Level 3 (계약 완화 시 Task 예산 내 현실적): ${level3 ? "PASS" : "FAIL"} (depth=2 예상 ${costDepth2.estimatedTimeMs.toFixed(1)}ms vs Task 예산 ${costDepth2.taskLocalBudgetMs}ms)`);
dpush();
dpush("--- 실패 조건 판정 ---");
dpush(`Delayed Improvement 거의 없음 (<5%): ${failAlmostNoDelayed ? "해당" : "해당없음"}`);
dpush(`계약 완화해도 효과 없음 (개선 0건): ${failNoEffect ? "해당" : "해당없음"}`);
dpush(`계산량 폭증 (depth=2조차 전체 Plan 예산 초과): ${failComputeExplosion ? "해당" : "해당없음"}`);
dpush(`제품 적용 불가능 (Level 3 미달): ${failProductInfeasible ? "해당" : "해당없음"}`);
dpush();
const architectureDecision = level1 && level2 && level3 ? "계약 변경 연구 착수" : "현재 계약 유지";
dpush(`=== 최종 판정: ${architectureDecision} ===`);
dpush(`제품 통합 여부: 미통합 (spec -- 이번 Sprint는 분석 전용)`);

mkdirSync(dirname(decisionReportPath), { recursive: true });
writeFileSync(decisionReportPath, decisionLines.join("\n"), "utf-8");
console.log("\n" + decisionLines.join("\n"));
