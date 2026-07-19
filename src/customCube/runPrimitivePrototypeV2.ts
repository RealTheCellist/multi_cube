// Solver Primitive Prototype Sprint v2 -- driver.
//   npx tsx src/customCube/runPrimitivePrototypeV2.ts [failuresDbPath]
// Implements and validates the two Prototype-ready candidates from
// Primitive Blueprint Refinement Sprint v1 (Multi-Hop Bridge / Conflict-
// Dominant Sacrifice Move) as standalone, independent Prototype functions
// -- no Planner integration, no auto-selection, no product wiring. Solver/
// Planner/Executor/Recovery and the existing Primitive libraries
// (BASE_ALG/FLIP_ALG/PARITY_ALG/CASE Library/CycleChasePrototype) are
// never touched.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { checkPreconditions, loadDataset, buildLibs, runMultiHopBridgeOn, runConflictSacrificeOn } from "./solverPrimitivePrototype/PrototypeBenchmark";
import { summarize, decideOutcome, type PrototypeSummary } from "./solverPrimitivePrototype/PrototypeReport";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitivePrototype/data/primitive-prototype-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Solver Primitive Prototype Sprint v2 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("Primitive Blueprint Refinement Sprint v1의 결론(A. Prototype 진행 가능)을 이어받아, Priority 1(Multi-Hop Bridge)과 Priority 2(Conflict-Dominant Sacrifice Move)를 실제로 구현하고 150-replay Dataset 전체에서 검증한다. 단일 Primitive/최소 기능/독립 실행 원칙을 따르며, Planner 통합/자동 선택/Hard Coding을 하지 않는다. Solver/Planner/Executor/Recovery 및 기존 Primitive는 전혀 수정하지 않는다.");
push();

log("STEP1: Precondition 검증 (150 Replay Contract 매칭)");
const preconditions = checkPreconditions(failuresDbPath);
const dataset = loadDataset(failuresDbPath);
log(`STEP1 완료: Multi-Hop Bridge 매칭=${preconditions.filter((p) => p.matchesMultiHopBridge).length}건, Conflict Sacrifice 매칭=${preconditions.filter((p) => p.matchesConflictSacrifice).length}건`);

push("--- 1. Contract 검증 ---");
push(`Multi-Hop Bridge Preconditions 매칭: ${preconditions.filter((p) => p.matchesMultiHopBridge).length}/${dataset.length}건`);
push(`Conflict-Dominant Sacrifice Move Preconditions 매칭: ${preconditions.filter((p) => p.matchesConflictSacrifice).length}/${dataset.length}건`);
push();

log("STEP2: Prototype 실행 (150 Replay x 2개 Primitive, 기존 5개 Primitive 재테스트 포함, 수 분 소요)");
const { lib, libs } = buildLibs();
const bridgeResults = runMultiHopBridgeOn(dataset, preconditions, lib, libs);
const sacrificeResults = runConflictSacrificeOn(dataset, preconditions, lib, libs);
log("STEP2 완료");

const bridgeSummary: PrototypeSummary = summarize("Multi-Hop Bridge", bridgeResults, "avgLeavesExplored", (r) => r.costLeavesExplored ?? 0);
const sacrificeSummary: PrototypeSummary = summarize("Conflict-Dominant Sacrifice Move", sacrificeResults, "avgConflictEdgesTried", (r) => r.costConflictEdgesTried ?? 0);

push("--- 2. Success Rate / Failure Pattern / Regression / 실행 비용 ---");
for (const summary of [bridgeSummary, sacrificeSummary]) {
  push(`[${summary.primitiveName}]`);
  push(
    `  Contract: 전체 ${summary.contract.totalReplays}건 중 매칭 ${summary.contract.matchingCount}건, 매칭 replay 성공 ${summary.contract.succeededOnMatching}건(${(summary.contract.matchingSuccessRate * 100).toFixed(1)}%), 매칭 밖에서 성공 ${summary.contract.succeededOffMatching}건`,
  );
  push(`  전체 Success Rate: ${(summary.overallSuccessRate * 100).toFixed(1)}% (${summary.overallSuccessCount}/${summary.contract.totalReplays}건)`);
  push(`  기존 Gap(5개 Primitive 전부 실패) 중 이 Dataset에서 재확인된 건수: ${summary.gapTotal}건, 그중 이 Prototype이 구제한 건수: ${summary.rescuedFromGapCount}건`);
  push(`  Regression: ${summary.regressionCount}건`);
  push(`  실행 비용: 평균 ${summary.cost.avgTimeMs.toFixed(1)}ms/replay, 평균 ${summary.cost.costMetricName}=${summary.cost.avgCostMetric.toFixed(2)}`);
  push("  Failure Pattern:");
  for (const f of summary.failurePattern) push(`    ${f.reason}: ${f.count}건`);
  push();
}

log("STEP3: 성공 기준 판정 + 최종 결론");
push("--- 3. 성공 기준 (Level 1~3, Primitive별) ---");
for (const summary of [bridgeSummary, sacrificeSummary]) {
  push(`[${summary.primitiveName}]`);
  push(`  Level 1 (Prototype 정상 구현): ${summary.level1Pass ? "PASS" : "FAIL"}`);
  push(`  Level 2 (Blueprint 예측 메커니즘이 실제 동작): ${summary.level2Pass ? "PASS" : "FAIL"} (매칭 replay 성공률 ${(summary.contract.matchingSuccessRate * 100).toFixed(1)}%)`);
  push(`  Level 3 (기존 Primitive 대비 의미 있는 Capability 추가): ${summary.level3Pass ? "PASS" : "FAIL"} (Gap 구제 ${summary.rescuedFromGapCount}건)`);
}
push();

const outcome = decideOutcome([bridgeSummary, sacrificeSummary]);
log(`STEP3 완료: 결정=${outcome.decision}`);

push("--- 4. 최종 결론 ---");
push(`결정: ${outcome.decision}`);
push(outcome.rationale);
push();

const overall = outcome.decision === "A";
push(`=== Sprint 종료: ${overall ? "성공" : "추가 조치 필요"} ===`);
push(
  outcome.decision === "A"
    ? "다음 단계: Solver Integration Sprint 진행."
    : outcome.decision === "B"
      ? "다음 단계: Prototype Refinement Sprint 진행."
      : "다음 단계: Blueprint 단계로 환류.",
);
push("보호 파일: fiveByFiveEdges.ts/Planner.ts/Executor.ts/Recovery.ts 및 BASE_ALG/FLIP_ALG/PARITY_ALG/CASE Library/CycleChasePrototype 미수정 (읽기 전용 재사용만). Planner 통합/자동 선택/Hard Coding 없음. 제품 코드 미통합.");

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
log("\n" + lines.join("\n"));

if (!overall) process.exitCode = 1;
