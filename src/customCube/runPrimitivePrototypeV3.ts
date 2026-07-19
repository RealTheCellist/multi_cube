// Solver Primitive Prototype Sprint v3 -- driver.
//   npx tsx src/customCube/runPrimitivePrototypeV3.ts [failuresDbPath]
// Implements the Blueprint confirmed by Solver Primitive Blueprint Sprint
// v2 (cycleLength 2~3 AND conflictEdgeCount>0) as a new, independently
// implemented Prototype (MultiHopBridgePrototypeV3.ts), then verifies:
// STEP1 how often the gate fires, STEP2 whether the Blueprint's Expected
// Mechanism (Conflict Edge presence raising bounded-backtracking search
// diversity) is actually observed, STEP3 real Success/Deferred-Reject/
// Gate-Rejected breakdown, STEP4 regression + Coverage-narrowing-vs-v2 +
// rescued-from-Gap, STEP5 execution cost. No existing Prototype/Solver/
// Planner/Executor/Recovery modification, no Hard Coding, no Planner
// Integration, no product code integration.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDataset, buildLibs } from "./solverPrimitivePrototype/PrototypeBenchmark";
import { measurePreconditionCoverage } from "./solverPrimitivePrototype/PreconditionCoverage";
import { verifyMechanism } from "./solverPrimitivePrototype/MechanismVerification";
import { classifyOutcomes } from "./solverPrimitivePrototype/SuccessFailureClassification";
import { analyzeRegression } from "./solverPrimitivePrototype/RegressionAnalysis";
import { analyzeCost } from "./solverPrimitivePrototype/CostAnalysis";
import { decideOutcome } from "./solverPrimitivePrototype/PrototypeV3Decision";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitivePrototype/data/prototype-v3-report.txt";
const DEADLINE_MS = 400;

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Solver Primitive Prototype Sprint v3 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("Solver Primitive Blueprint Sprint v2가 확정한 Blueprint(cycleLength 2~3 AND conflictEdgeCount>0)를 새 Prototype(MultiHopBridgePrototypeV3.ts, 독립 구현)으로 실제 구현하고, Blueprint의 Expected Mechanism이 실측으로 확인되는지, 기존 5개 Primitive 대비 의미 있는 신규 Capability를 추가하는지를 검증한다. 새 Prototype은 solverPrimitivePrototype/에서만 구현, 기존 Prototype/Solver/Planner/Executor/Recovery 수정 금지, Hard Coding/Planner Integration 없음, 제품 코드 미통합.");
push();

const snapshots = loadDataset(failuresDbPath);
const { lib, libs } = buildLibs();

log(`STEP1: Blueprint Preconditions 호출 빈도 측정 (전체 ${snapshots.length} Replay)`);
const coverage = measurePreconditionCoverage(snapshots, lib, DEADLINE_MS);
log(`STEP1 완료: gate_matched=${coverage.gateMatchedCount}/${coverage.totalReplays} (${(coverage.gateMatchedCoverage * 100).toFixed(1)}%)`);

push("--- 1. Precondition 호출 빈도 (STEP1) ---");
for (const t of coverage.tallies) push(`[${t.outcome}] ${t.count}건 (${(t.ratio * 100).toFixed(1)}%)`);
push(`Blueprint Sprint v2 STEP4 실측 Coverage(6.7%)와 비교: 이번 측정 ${(coverage.gateMatchedCoverage * 100).toFixed(1)}%`);
push();

log("STEP2: Expected Mechanism 실측 검증 (conflictEdgeCount>0 vs ==0, cycleLength 2~3 대역)");
const mechanism = verifyMechanism(snapshots, lib, DEADLINE_MS);
log(`STEP2 완료: mechanismConfirmed=${mechanism.mechanismConfirmed}`);

push("--- 2. Expected Mechanism 검증 (STEP2) ---");
for (const g of [mechanism.withConflict, mechanism.withoutConflict]) {
  push(`[${g.label}] n=${g.sampleCount} 평균nodesVisited=${g.avgNodesVisited.toFixed(2)} 평균candidatesGenerated=${g.avgCandidatesGenerated.toFixed(2)} 평균leavesExplored=${g.avgLeavesExplored.toFixed(2)} 평균netImprovingLeaves=${g.avgNetImprovingLeaves.toFixed(2)} 평균netImprovingLeafRatio=${(g.avgNetImprovingLeafRatio * 100).toFixed(1)}%`);
}
push(`탐색 다양성(candidatesGenerated AND leavesExplored 모두)이 conflictEdgeCount>0에서 더 높은가: ${mechanism.diversityHigherWithConflict ? "예" : "아니오"}`);
push(`net-improving leaf 비율이 conflictEdgeCount>0에서 더 높은가: ${mechanism.netImprovingRatioHigherWithConflict ? "예" : "아니오"}`);
push();

log("STEP3: Success/Deferred Reject/Gate Rejected 분류");
const { summary: successFailure } = classifyOutcomes(snapshots, lib, DEADLINE_MS);
log(`STEP3 완료: success=${successFailure.successCount}, deferredReject=${successFailure.deferredRejectCount}, gateRejected=${successFailure.gateRejectedCount}`);

push("--- 3. Success/Failure 분류 (STEP3) ---");
push(`Success: ${successFailure.successCount}건 (전체 대비 ${(successFailure.successRateOverall * 100).toFixed(1)}%, gate_matched 대비 ${(successFailure.successRateAmongMatched * 100).toFixed(1)}%)`);
push(`Deferred Reject: ${successFailure.deferredRejectCount}건`);
push(`Gate Rejected: ${successFailure.gateRejectedCount}건`);
push();

log("STEP4: Regression 분석 (기존 5개 Primitive 대비 Rescue, v2 대비 Coverage 축소, True Regression)");
const { summary: regression } = analyzeRegression(snapshots, lib, libs, DEADLINE_MS);
log(`STEP4 완료: rescuedByV3=${regression.rescuedByV3Count}, v2OnlySuccess=${regression.v2OnlySuccessCount}, trueRegression=${regression.trueRegressionCount}`);

push("--- 4. Regression 분석 (STEP4) ---");
push(`True Regression (net-improvement 없이 채택, 발생하면 안 됨): ${regression.trueRegressionCount}건`);
push(`Coverage 축소 (v2는 성공했으나 v3 게이트가 더 이상 시도하지 않는 replay, Regression 아님): ${regression.v2OnlySuccessCount}건`);
push(`기존 5개 Primitive(BASE/FLIP/CASE/PARITY/BP-1)가 전부 실패하는 Gap: ${regression.gapTotal}건`);
push(`v3가 그 Gap 중 실제로 구제한 건수: ${regression.rescuedByV3Count}건`);
push();

log("STEP5: 실행 비용 분석");
const cost = analyzeCost(snapshots, lib, DEADLINE_MS);
log("STEP5 완료");

push("--- 5. 실행 비용 (STEP5, gate_matched 대상) ---");
push(`매칭 수: ${cost.matchedCount}건`);
push(`평균 실행 시간: ${cost.avgTimeMs.toFixed(2)}ms`);
push(`평균 탐색 깊이(cycleLength): ${cost.avgSearchDepth.toFixed(2)}`);
push(`평균 분기 수(candidatesGenerated/nodesVisited): ${cost.avgBranchingFactor.toFixed(2)}`);
push(`평균 leavesExplored: ${cost.avgLeavesExplored.toFixed(2)}`);
push(`평균 nodesVisited: ${cost.avgNodesVisited.toFixed(2)}`);
push();

const outcome = decideOutcome(mechanism, regression, successFailure);
log(`최종 결정=${outcome.decision}`);

push("--- 6. 성공 기준 (Level 1~3) ---");
push(`Level 1 (Prototype 정상 구현): ${outcome.level1Pass ? "PASS" : "FAIL"}`);
push(`Level 2 (Blueprint 메커니즘이 실측으로 확인됨): ${outcome.level2Pass ? "PASS" : "FAIL"}`);
push(`Level 3 (기존 Prototype 대비 의미 있는 Capability 추가): ${outcome.level3Pass ? "PASS" : "FAIL"}`);
push();

push("--- 7. 최종 결론 ---");
push(`결정: ${outcome.decision}`);
push(outcome.rationale);
push();

const nextStep =
  outcome.decision === "A"
    ? "다음 단계: Solver Primitive Integration Blueprint Sprint v1."
    : outcome.decision === "B"
      ? "다음 단계: Solver Primitive Prototype Refinement Sprint v1."
      : "다음 단계: Solver Primitive Mechanism Research Sprint v1.";
push(`=== Sprint 종료: ${outcome.decision === "A" ? "성공" : "추가 조치 필요"} ===`);
push(nextStep);
push("보호 파일: fiveByFiveEdges.ts/Planner.ts/Executor.ts/Recovery.ts, MultiHopBridgePrototype.ts(v2)/ConflictDominantSacrificePrototype.ts/ContractValidator.ts/PrototypeBenchmark.ts/PrototypeReport.ts, solverV2Prototype/(BoundedResolver.ts/MultiCycleAnalyzer.ts/DeferredValidator.ts) 전부 미수정(읽기 전용 재사용만). Planner Integration/Hard Coding 없음. 제품 코드 미통합.");

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
log("\n" + lines.join("\n"));

if (outcome.decision !== "A") process.exitCode = 1;
