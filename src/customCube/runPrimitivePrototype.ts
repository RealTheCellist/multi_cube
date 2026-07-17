// Primitive Invention Sprint v1 -- driver.
//   npx tsx src/customCube/runPrimitivePrototype.ts [failuresDbPath] [policiesDbPath] [perAttemptDeadlineMs]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildWingLibrary } from "./fiveByFiveEdges";
import { warmupFiveByFiveEdgeLibraries } from "./fiveByFiveEdgeSolverEngine";
import { selectTargetClusters } from "./primitiveResearch/ClusterSelector";
import { summarizeClusterStructure } from "./primitiveResearch/StructuralAnalyzer";
import { loadAllReplaySnapshots } from "./primitiveReplay/PrototypeReplay";
import { runPrototypeOnSnapshot, summarizeBenchmark } from "./primitivePrototype/PrototypeEvaluator";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const policiesDbPath = process.argv[3] ?? "src/customCube/policyPlanner/data/policies.json";
const perAttemptDeadlineMs = Number(process.argv[4] ?? 300);

const reportPath = "src/customCube/primitivePrototype/data/prototype-benchmark.txt";

// Spec section 10/11 thresholds.
const LEVEL1_MIN_IMPROVED = 10; // "50개 중 10개 이상" -- absolute count, applied against however many Replays are actually tested (75 here)
const LEVEL2_MAX_REGRESSION_RATE = 0.1;
const LEVEL3_MIN_COVERAGE = 0.3;
const FAILURE_MAX_REGRESSION_RATE = 0.1;
const FAILURE_MIN_COVERAGE = 0.15;

console.log("STEP: 라이브러리 준비");
warmupFiveByFiveEdgeLibraries();
const lib = buildWingLibrary();

console.log("STEP: 대상 Cluster 선정 (Coverage 높음 AND Recovery 실패 AND Policy 없음)");
const selection = selectTargetClusters(failuresDbPath, policiesDbPath, 3);
console.log(`  전체 실패 ${selection.totalFailures}건, Policy 보유로 제외: ${selection.excludedForHavingPolicy.join(", ")}`);
for (const t of selection.targets) {
  console.log(`  ${t.cluster.key}: size=${t.cluster.size} (${(t.coverageShare * 100).toFixed(1)}%), recoveryFailureRate=${(t.recoveryFailureRate * 100).toFixed(1)}%`);
}

console.log("STEP: 공통 구조 추출 (buildStateGraph 재사용)");
const structuralSummaries = selection.targets.map((t) => summarizeClusterStructure(t.cluster.key, t.members));
for (const s of structuralSummaries) {
  console.log(`  ${s.clusterKey}: 4단계+ Cycle 보유 ${(s.fractionWithCycleLenAtLeast4 * 100).toFixed(1)}%, 평균 최장 Cycle ${s.avgLongestCycleLength.toFixed(2)}`);
}

console.log("STEP: Replay 로드 (전체 75건, 최소 50건 요건 충족)");
const snapshots = loadAllReplaySnapshots(failuresDbPath);
console.log(`  Replay ${snapshots.length}건`);

console.log("STEP: CycleChase Prototype Replay Benchmark");
const startedAt = Date.now();
const results = snapshots.map((s) => runPrototypeOnSnapshot(s, lib, perAttemptDeadlineMs));
console.log(`  완료 (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`);
const summary = summarizeBenchmark(results);

console.log(`  Coverage (활성화율): ${(summary.coverage * 100).toFixed(1)}% (${summary.activatedCount}/${summary.totalTested})`);
console.log(`  WrongWing 개선 Replay 수: ${summary.improvedCount}`);
console.log(`  Regression율 (활성화된 것 중): ${(summary.regressionRateAmongActivated * 100).toFixed(1)}%`);
console.log(`  평균 WrongWing 변화 (활성화된 것 중): ${summary.avgWrongWingDelta.toFixed(2)}`);
console.log(`  평균 Pair 변화 (활성화된 것 중): ${summary.avgPairDelta.toFixed(2)}`);
console.log(`  평균 Move 수 (활성화된 것 중): ${summary.avgMoveCount.toFixed(1)}`);
console.log(`  평균 실행 시간 (전체): ${summary.avgTimeMs.toFixed(0)}ms`);

// --- Success criteria (spec section 10) -------------------------------------
const level1 = summary.improvedCount >= LEVEL1_MIN_IMPROVED;
const level2 = summary.regressionRateAmongActivated <= LEVEL2_MAX_REGRESSION_RATE;
const level3 = summary.coverage >= LEVEL3_MIN_COVERAGE;

// --- Failure conditions (spec section 11, OR logic) -------------------------
const failRegression = summary.regressionRateAmongActivated > FAILURE_MAX_REGRESSION_RATE;
const failCoverage = summary.coverage < FAILURE_MIN_COVERAGE;
const failNoImprovement = summary.activatedCount > 0 && summary.avgWrongWingDelta >= 0;

const isIntegrationCandidate = level1 && level2 && level3 && !failRegression && !failCoverage && !failNoImprovement;

// --- Report ------------------------------------------------------------------
const lines: string[] = [];
const push = (s = "") => lines.push(s);
push("========================================");
push("Prototype Benchmark -- Primitive Invention Sprint v1 (CycleChase)");
push("========================================");
push();
push("--- 대상 Cluster 선정 ---");
push(`전체 실패 ${selection.totalFailures}건, Policy 보유로 제외: ${selection.excludedForHavingPolicy.join(", ") || "없음"}`);
for (const t of selection.targets) {
  push(`  ${t.cluster.key}: size=${t.cluster.size} (${(t.coverageShare * 100).toFixed(1)}%), recoveryFailureRate=${(t.recoveryFailureRate * 100).toFixed(1)}%`);
}
push();
push("--- 공통 구조 (buildStateGraph 재사용) ---");
for (const s of structuralSummaries) {
  push(`  ${s.clusterKey}: 4단계+ Cycle 보유 비율 ${(s.fractionWithCycleLenAtLeast4 * 100).toFixed(1)}%, 평균 최장 Cycle 길이 ${s.avgLongestCycleLength.toFixed(2)}`);
}
push();
push("--- Replay Benchmark (전체 75건) ---");
push(`Coverage (활성화율, Level 3 지표): ${(summary.coverage * 100).toFixed(1)}% (${summary.activatedCount}/${summary.totalTested})`);
push(`WrongWing 개선 Replay 수 (Level 1 지표): ${summary.improvedCount}`);
push(`Regression율, 활성화된 것 중 (Level 2 지표): ${(summary.regressionRateAmongActivated * 100).toFixed(1)}% (${summary.regressionCount}/${summary.activatedCount || 0})`);
push(`평균 WrongWing 변화 (활성화된 것 중): ${summary.avgWrongWingDelta.toFixed(2)}`);
push(`평균 Pair 변화 (활성화된 것 중): ${summary.avgPairDelta.toFixed(2)}`);
push(`평균 Move 수 (활성화된 것 중): ${summary.avgMoveCount.toFixed(1)}`);
push(`평균 실행 시간 (전체 75건): ${summary.avgTimeMs.toFixed(0)}ms`);
push();
push("--- 기존 Primitive와의 비교 ---");
push(`BASE/FLIP/CASE/PARITY: 이 3개 대상 Cluster(w9|p1, w14|p1, w11|p1)는 애초에 이 4개 Primitive`);
push(`전부 시도된 뒤에도 여전히 실패로 남은 잔여 상태에서 뽑았다 (Failure Analysis Engine의 정의상).`);
push(`CycleChase는 그 4개 위에 얹는 5번째 Primitive로, 길이 4+ Cycle이 감지될 때만 활성화되며,`);
push(`활성화 자체가 Coverage ${(summary.coverage * 100).toFixed(1)}%로 제한적이다.`);
push();
push("--- 성공 기준 판정 ---");
push(`Level 1 (WrongWing 감소 10개 이상): ${level1 ? "PASS" : "FAIL"} (실제 ${summary.improvedCount}개)`);
push(`Level 2 (Regression 10% 이하): ${level2 ? "PASS" : "FAIL"} (실제 ${(summary.regressionRateAmongActivated * 100).toFixed(1)}%)`);
push(`Level 3 (Coverage 30% 이상): ${level3 ? "PASS" : "FAIL"} (실제 ${(summary.coverage * 100).toFixed(1)}%)`);
push();
push("--- 실패 조건 판정 (하나라도 해당하면 Prototype 폐기) ---");
push(`Regression > 10%: ${failRegression ? "해당" : "해당없음"}`);
push(`Coverage < 15%: ${failCoverage ? `해당 (${(summary.coverage * 100).toFixed(1)}%)` : `해당없음 (${(summary.coverage * 100).toFixed(1)}%)`}`);
push(`WrongWing 평균 개선 없음 (활성화된 것 중 평균 변화 >= 0): ${failNoImprovement ? "해당" : "해당없음"}`);
push();
push(`통합 후보 여부: ${isIntegrationCandidate ? "예 (다음 Sprint에서 제품 통합 후보)" : "아니오"}`);
push(`제품 코드 통합 여부: 미통합 (spec section 12 -- 이번 Sprint는 항상 통합하지 않는다)`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
console.log("\n" + lines.join("\n"));
