// Policy Generalization Sprint v1 -- driver.
//   npx tsx src/customCube/runPolicyGeneralization.ts [goalsDbPath] [failuresDbPath] [perStepDeadlineMs]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildCaseLibrary, buildFlipLibrary, buildWingLibrary } from "./fiveByFiveEdges";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import { warmupFiveByFiveEdgeLibraries } from "./fiveByFiveEdgeSolverEngine";
import { extractNormalizedRecords } from "./policyAnalysis/PolicyExtractor";
import { clusterByStateSignature } from "./policyAnalysis/GoalClusterer";
import { normalizeAllClusters } from "./policyAnalysis/PolicyNormalizer";
import { createEmptyPolicyDatabase, savePolicyDatabase } from "./policyPlanner/PolicyDatabase";
import { loadAllReplaySnapshots } from "./policyPlanner/PolicyReplay";
import { benchmarkPolicy, computeCoverage, primitiveUsageFrequency } from "./policyPlanner/PolicyEvaluator";
import { formatBenchmarkSection, formatCoverageSection, formatPolicyDatabaseSection } from "./policyPlanner/PolicyReport";

const goalsDbPath = process.argv[2] ?? "src/customCube/goalPlanner/data/goals.json";
const failuresDbPath = process.argv[3] ?? "src/customCube/failureAnalysis/data/failures.json";
const perStepDeadlineMs = Number(process.argv[4] ?? 80);

const policyDbPath = "src/customCube/policyPlanner/data/policies.json";
const reportPath = "src/customCube/policyPlanner/data/policy-report.txt";

// Spec section 10's own thresholds.
const LEVEL1_APPLIED_RATE = 0.7;
const LEVEL2_SUCCESS_RATE = 0.6;
const LEVEL3_MAX_REGRESSION_RATE = 0.2;
const FAILURE_COVERAGE_MIN = 0.5;

console.log("STEP: 라이브러리 준비");
warmupFiveByFiveEdgeLibraries();
const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

console.log("STEP: 32 Goal Candidate에서 Replay 의존 정보 제거");
const records = extractNormalizedRecords(goalsDbPath);
console.log(`  Normalized Record ${records.length}개`);

console.log("STEP: 상태 시그니처(w{wrongWing}|p{parity})로 Clustering");
const clusters = clusterByStateSignature(records);
for (const c of clusters) console.log(`  ${c.stateSignature}: distinct Replay ${c.distinctReplayCount}개, Goal Candidate ${c.records.length}개`);

console.log("STEP: Cluster별 Policy 추출 (Replay 단위 과반 투표)");
const policies = normalizeAllClusters(clusters);
for (const p of policies) console.log(`  ${p.stateSignature} -> [${p.primitiveSequence.join(">")}] (지지 Replay: ${p.agreementCounts.join(",")})`);
if (policies.length === 0) console.log("  (Policy 없음 -- 어떤 Cluster도 첫 단계부터 과반 동의 없음)");

const policyDb = createEmptyPolicyDatabase();
savePolicyDatabase(policyDbPath, policyDb, policies);
console.log(`STEP: ${policyDbPath} 저장`);

console.log("STEP: Replay 로드 (75건, 전체)");
const snapshots = loadAllReplaySnapshots(failuresDbPath);
console.log(`  Replay ${snapshots.length}건`);

console.log("STEP: Policy별 Replay Benchmark (75건 전체, blanket test)");
const benchmarkResults = policies.map((p) => {
  const result = benchmarkPolicy(p, snapshots, libs, perStepDeadlineMs);
  console.log(
    `  ${p.stateSignature} [${p.primitiveSequence.join(">")}]  적용가능=${(result.appliedRate * 100).toFixed(1)}%  ` +
      `성공(적용중)=${(result.successRateAmongApplied * 100).toFixed(1)}%  regression(적용중)=${(result.regressionRateAmongApplied * 100).toFixed(1)}%`
  );
  return result;
});

console.log("STEP: Coverage + Primitive 사용 빈도 계산");
const coverage = computeCoverage(policies, snapshots);
const usageFreq = primitiveUsageFrequency(policies);
console.log(`  Coverage: ${(coverage.coverage * 100).toFixed(1)}% (${coverage.coveredCount}/${coverage.totalCount})`);

// --- Success criteria per Policy (spec section 10 -- Level 1 AND 2 AND 3 for the SAME Policy) ---
const perPolicyVerdicts = benchmarkResults.map((r) => {
  const level1 = r.appliedRate >= LEVEL1_APPLIED_RATE;
  const level2 = r.successRateAmongApplied >= LEVEL2_SUCCESS_RATE;
  const level3 = r.regressionRateAmongApplied <= LEVEL3_MAX_REGRESSION_RATE;
  return { stateSignature: r.stateSignature, level1, level2, level3, passesAll: level1 && level2 && level3 };
});
const anyPolicyPasses = perPolicyVerdicts.some((v) => v.passesAll);

// --- Failure conditions (spec section 11, OR logic) ---
const everyClusterSingleReplay = clusters.every((c) => c.distinctReplayCount <= 1);
const anyPolicyOverRegression = benchmarkResults.some((r) => r.appliedCount > 0 && r.regressionRateAmongApplied > LEVEL3_MAX_REGRESSION_RATE);
const coverageTooLow = coverage.coverage < FAILURE_COVERAGE_MIN;

// --- Reports ------------------------------------------------------------
const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
push("========================================");
push("Policy Report -- Policy Generalization Sprint v1");
push("========================================");
push();
push(...formatPolicyDatabaseSection(clusters, policies));
push();
push(...formatBenchmarkSection(benchmarkResults));
push(...formatCoverageSection(coverage, usageFreq));
push();
push("--- 성공 기준 판정 (Policy별, Level 1 AND 2 AND 3 모두 충족해야 통과) ---");
for (const v of perPolicyVerdicts) {
  push(
    `  ${v.stateSignature}: Level1(적용가능 70%+)=${v.level1 ? "PASS" : "FAIL"}  Level2(성공 60%+)=${v.level2 ? "PASS" : "FAIL"}  ` +
      `Level3(regression 20%↓)=${v.level3 ? "PASS" : "FAIL"}  종합=${v.passesAll ? "PASS" : "FAIL"}`
  );
}
push(`전체 Sprint 성공 여부 (Policy 하나라도 3개 Level 전부 통과): ${anyPolicyPasses ? "PASS" : "FAIL"}`);
push();
push("--- 실패 조건 판정 (하나라도 해당하면 Sprint 종료) ---");
push(`Replay마다 Policy가 전부 달라짐 (모든 Cluster의 distinct Replay <= 1): ${everyClusterSingleReplay ? "해당" : "해당없음"}`);
push(`Regression > 20% (어떤 Policy든): ${anyPolicyOverRegression ? "해당" : "해당없음"}`);
push(`Coverage < 50%: ${coverageTooLow ? `해당 (${(coverage.coverage * 100).toFixed(1)}%)` : `해당없음 (${(coverage.coverage * 100).toFixed(1)}%)`}`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
console.log("\n" + lines.join("\n"));

console.log("\n=== 제품 통합 여부 ===");
console.log("미통합 (spec section 12: 이번 Sprint는 항상 제품 코드 통합을 금지한다. Policy는 policyPlanner/ 안에서만 검증됨)");
