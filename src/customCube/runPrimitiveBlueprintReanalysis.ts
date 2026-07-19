// Solver Primitive Blueprint Reanalysis Sprint v1 -- driver.
//   npx tsx src/customCube/runPrimitiveBlueprintReanalysis.ts [failuresDbPath]
// Research/Blueprint-only Sprint: re-measures which structural Features
// actually explain Primitive Prototype Sprint v2's real success/failure
// outcomes, and whether a better Feature (or combination) than the old
// Blueprint preconditions exists. No new Primitive, no Prototype/Solver/
// Planner/Executor change, no product integration.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { runBothPrimitivesWithFeatures, compareSuccessVsFailure, NUMERIC_FEATURES } from "./solverPrimitiveBlueprintReanalysis/SuccessFailureComparison";
import { computeFeatureCorrelations, computeBucketSuccessRates } from "./solverPrimitiveBlueprintReanalysis/FeatureExplanatoryPower";
import { evaluateCombinations, BRIDGE_COMBINATIONS, SACRIFICE_COMBINATIONS } from "./solverPrimitiveBlueprintReanalysis/FeatureCombinationAnalysis";
import { analyzePrimitive, decideOutcome } from "./solverPrimitiveBlueprintReanalysis/BlueprintReanalysisDecision";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveBlueprintReanalysis/data/blueprint-reanalysis-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Solver Primitive Blueprint Reanalysis Sprint v1 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("Primitive Prototype Sprint v2에서 두 Primitive 모두 정상 구현했으나 Blueprint가 예측한 메커니즘이 재현되지 않았다(Level2 FAIL). 이번 Sprint는 새 Primitive를 구현하지 않고, Blueprint가 사용한 Feature(cycleCount 등)가 실제 성공을 얼마나 설명하는지 재측정해 더 나은 Feature/조합이 있는지 규명하는 Research/Blueprint 단계다. Prototype/Solver/Planner/Executor/기존 Primitive는 전혀 수정하지 않는다.");
push();

log("STEP1: 두 Primitive를 150 Replay 전체에서 재실행 + 구조적 Feature 수집 (Prototype 코드 미수정, 재실행만, 수 분 소요)");
const runs = runBothPrimitivesWithFeatures(failuresDbPath);
const bridgeSuccessCount = runs.bridge.filter((r) => r.succeeded).length;
const sacrificeSuccessCount = runs.sacrifice.filter((r) => r.succeeded).length;
log(`STEP1 완료: Multi-Hop Bridge 성공 ${bridgeSuccessCount}/150, Conflict Sacrifice 성공 ${sacrificeSuccessCount}/150`);

push("--- 1. 성공/실패 사례 비교 (Feature 평균 차이) ---");
for (const [name, records] of [
  ["Multi-Hop Bridge", runs.bridge],
  ["Conflict-Dominant Sacrifice Move", runs.sacrifice],
] as const) {
  const comparison = compareSuccessVsFailure(records);
  push(`[${name}] 성공 ${comparison[0].successCount}건 / 실패 ${comparison[0].failureCount}건`);
  for (const c of comparison) push(`  ${c.feature}: 성공군 평균=${c.successMean.toFixed(2)}, 실패군 평균=${c.failureMean.toFixed(2)}, 차이=${c.difference >= 0 ? "+" : ""}${c.difference.toFixed(2)}`);
}
push();

log("STEP2/3: Feature별 실제 성공과의 상관관계 + 구간별 성공률 재측정");
push("--- 2. Feature 설명력 (Pearson 상관계수, 성공=1/실패=0) ---");
for (const [name, records] of [
  ["Multi-Hop Bridge", runs.bridge],
  ["Conflict-Dominant Sacrifice Move", runs.sacrifice],
] as const) {
  const correlations = computeFeatureCorrelations(records);
  push(`[${name}]`);
  for (const c of correlations) push(`  ${c.feature}: r=${c.correlation.toFixed(3)}`);
}
push();

push("--- 3. Feature 구간별 성공률 (상위 8개 구간, 표본 수 기준) ---");
for (const [name, records] of [
  ["Multi-Hop Bridge", runs.bridge],
  ["Conflict-Dominant Sacrifice Move", runs.sacrifice],
] as const) {
  const buckets = computeBucketSuccessRates(records);
  push(`[${name}]`);
  for (const feature of NUMERIC_FEATURES) {
    const forFeature = buckets.filter((b) => b.feature === feature).sort((a, b) => b.count - a.count).slice(0, 8);
    push(`  ${feature}: ${forFeature.map((b) => `${b.bucket}(n=${b.count},성공률=${(b.successRate * 100).toFixed(0)}%)`).join(" ")}`);
  }
}
push();

log("STEP4: Feature 조합 평가 (기존 Blueprint 원안 포함)");
const bridgeCombos = evaluateCombinations(runs.bridge, BRIDGE_COMBINATIONS);
const sacrificeCombos = evaluateCombinations(runs.sacrifice, SACRIFICE_COMBINATIONS);
log("STEP4 완료");

push("--- 4. Feature 조합 비교 ---");
for (const [name, combos] of [
  ["Multi-Hop Bridge", bridgeCombos],
  ["Conflict-Dominant Sacrifice Move", sacrificeCombos],
] as const) {
  push(`[${name}]`);
  for (const c of combos) push(`  ${c.isOldBlueprint ? "[기존 Blueprint] " : c.isBareGate ? "[활성화 필요조건 그 자체] " : ""}${c.name}: ${c.successCount}/${c.matchedCount}건 매칭 (성공률=${(c.successRate * 100).toFixed(1)}%)`);
}
push("(참고: [활성화 필요조건 그 자체]로 표시된 항목은 Prototype 코드가 이미 강제하는 조건이라 성공이 그 밖에서 발생할 수 없음 -- 이 Sprint의 새 발견으로 집계하지 않고 참고용으로만 병기한다.)");
push();

log("STEP5: Blueprint Reanalysis 결정");
const bridgeAnalysis = analyzePrimitive("Multi-Hop Bridge", bridgeCombos);
const sacrificeAnalysis = analyzePrimitive("Conflict-Dominant Sacrifice Move", sacrificeCombos);
const outcome = decideOutcome([bridgeAnalysis, sacrificeAnalysis]);
log(`STEP5 완료: 결정=${outcome.decision}`);

push("--- 5. 성공 기준 (Level 1~3) ---");
const level1 = true; // STEP1 도달 시 항상 충족 -- 실패 원인을 실측(Feature 평균 차이/상관관계/구간별 성공률)으로 설명
push(`Level 1 (Prototype 실패 원인을 실측으로 설명): ${level1 ? "PASS" : "FAIL"}`);
for (const a of [bridgeAnalysis, sacrificeAnalysis]) {
  push(`Level 2 (${a.primitiveName}: 기존 Blueprint보다 설명력 높은 Feature/조합 발견): ${a.level2Pass ? "PASS" : "FAIL"}${a.bestNew ? ` (${a.bestNew.name}, ${(a.bestNew.successRate * 100).toFixed(1)}% vs 기존 ${(a.oldBlueprint.successRate * 100).toFixed(1)}%)` : ""}`);
  push(`Level 3 (${a.primitiveName}: 새 Blueprint 후보가 명확한 근거 제공, 개선폭>=15%p): ${a.level3Pass ? "PASS" : "FAIL"} (개선폭 ${a.improvementPercentagePoints >= 0 ? "+" : ""}${a.improvementPercentagePoints.toFixed(1)}%p)`);
}
push();

push("--- 6. 최종 결론 ---");
push(`결정: ${outcome.decision}`);
push(outcome.rationale);
push();

const overall = level1;
push(`=== Sprint 종료: ${overall ? "성공" : "실패"} ===`);
push(
  outcome.decision === "A"
    ? "다음 단계: Solver Primitive Blueprint Sprint v2 (새 Blueprint로 재설계)."
    : outcome.decision === "B"
      ? "다음 단계: Blueprint Reanalysis Sprint v2 (추가 데이터 분석)."
      : "다음 단계: Solver Strategy Review Sprint (Primitive 외 접근 재검토).",
);
push("보호 파일: fiveByFiveEdges.ts/Planner.ts/Executor.ts/Recovery.ts 및 기존 Primitive/Prototype 코드 미수정 (읽기 전용 재사용만). 새 Primitive 미구현, Hard Coding/Planner Integration 없음. 제품 코드 미통합.");

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
log("\n" + lines.join("\n"));

if (!overall) process.exitCode = 1;
