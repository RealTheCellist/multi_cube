// Solver Primitive Blueprint Sprint v2 -- driver.
//   npx tsx src/customCube/runPrimitiveBlueprintV2.ts [failuresDbPath]
// Validates the reproducibility of Primitive Blueprint Reanalysis Sprint
// v1's new candidate ("cycleLength 2~3 AND conflictEdgeCount>0", 50.0%/
// 5-of-10 in a single run) across 5 independent re-runs of the real
// Multi-Hop Bridge Prototype (unmodified) on the full 150-replay Dataset,
// sweeps thresholds and additional Feature conjuncts, measures Coverage/
// Precision/Recall/False-Positive-Rate, and confirms (or rejects) a final,
// Prototype-ready Blueprint. No new Prototype, no Prototype/Solver/
// Planner/Executor modification, no Hard Coding, no Planner Integration.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { runMultiHopBridgeMultipleTimes, evaluateReproducibility, NEW_CANDIDATE, OLD_BLUEPRINT, REPRODUCIBILITY_RUNS } from "./solverPrimitiveBlueprintV2/ReproducibilityCheck";
import { evaluateThresholdSensitivity, THRESHOLD_CANDIDATES } from "./solverPrimitiveBlueprintV2/ThresholdSensitivity";
import { evaluateFeatureAdditions, FEATURE_ADDITION_CANDIDATES } from "./solverPrimitiveBlueprintV2/FeatureAdditionEvaluation";
import { computeAllPrecisionRecall } from "./solverPrimitiveBlueprintV2/CoveragePrecisionRecallAnalysis";
import { evaluateCandidate, decideOutcome, buildBlueprintSpec } from "./solverPrimitiveBlueprintV2/FinalBlueprintDefinition";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveBlueprintV2/data/blueprint-v2-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Solver Primitive Blueprint Sprint v2 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("Primitive Blueprint Reanalysis Sprint v1이 표본 10건으로 찾은 새 후보(cycleLength 2~3 AND conflictEdgeCount>0)의 재현성을 5회 독립 실행으로 검증하고, Threshold/Feature 추가 민감도와 Coverage/Precision/Recall/False Positive를 측정해 Prototype 구현 가능한 최종 Blueprint를 확정한다. 새 Prototype 구현 금지, 기존 Prototype/Solver/Planner/Executor 수정 금지, Hard Coding/Planner Integration 없음.");
push();

log(`STEP1: Multi-Hop Bridge를 150 Replay 전체에서 ${REPRODUCIBILITY_RUNS}회 독립 재실행 (Prototype 코드 미수정, 수십 분 소요 가능)`);
const multiRun = runMultiHopBridgeMultipleTimes(failuresDbPath, REPRODUCIBILITY_RUNS);
const newCandidateRepro = evaluateReproducibility(multiRun, NEW_CANDIDATE);
const oldBlueprintRepro = evaluateReproducibility(multiRun, OLD_BLUEPRINT);
log(`STEP1 완료: 신규 후보 평균 성공률=${(newCandidateRepro.avgSuccessRate * 100).toFixed(1)}% (범위 ${(newCandidateRepro.minSuccessRate * 100).toFixed(1)}~${(newCandidateRepro.maxSuccessRate * 100).toFixed(1)}%)`);

push("--- 1. 재현성 검증 (5회 독립 실행) ---");
for (const r of [newCandidateRepro, oldBlueprintRepro]) {
  push(`[${r.candidateName}]`);
  for (const run of r.perRun) push(`  Run ${run.runIndex}: ${run.successCount}/${run.matchedCount}건 (성공률=${(run.successRate * 100).toFixed(1)}%)`);
  push(`  평균=${(r.avgSuccessRate * 100).toFixed(1)}%, 범위=${(r.minSuccessRate * 100).toFixed(1)}~${(r.maxSuccessRate * 100).toFixed(1)}%, 표준편차=${(r.stdDev * 100).toFixed(1)}%p, 평균매칭수=${r.avgMatchedCount.toFixed(1)}`);
}
push();

log("STEP2: Threshold 민감도 측정 (conflictEdgeCount>0/>=2/>=3)");
const thresholdResults = evaluateThresholdSensitivity(multiRun);
log("STEP2 완료");

push("--- 2. Threshold 민감도 ---");
for (const r of thresholdResults) push(`[${r.candidateName}] 평균 성공률=${(r.avgSuccessRate * 100).toFixed(1)}% (범위 ${(r.minSuccessRate * 100).toFixed(1)}~${(r.maxSuccessRate * 100).toFixed(1)}%), 평균매칭수=${r.avgMatchedCount.toFixed(1)}`);
push();

log("STEP3: Feature 추가 평가 (wrongWingCount/pairCount/swapEdgeCount/cycleEdgeCount)");
const featureAdditionResults = evaluateFeatureAdditions(multiRun);
log("STEP3 완료");

push("--- 3. Feature 추가 평가 ---");
for (const r of featureAdditionResults) push(`[${r.candidateName}] 평균 성공률=${(r.avgSuccessRate * 100).toFixed(1)}% (범위 ${(r.minSuccessRate * 100).toFixed(1)}~${(r.maxSuccessRate * 100).toFixed(1)}%), 평균매칭수=${r.avgMatchedCount.toFixed(1)}`);
push();

log("STEP4: Coverage/Precision/Recall/False Positive 측정");
const allCandidates = [NEW_CANDIDATE, OLD_BLUEPRINT, ...THRESHOLD_CANDIDATES, ...FEATURE_ADDITION_CANDIDATES.filter((c) => c.name !== NEW_CANDIDATE.name)];
const precisionRecallResults = computeAllPrecisionRecall(multiRun, allCandidates);
log("STEP4 완료");

push("--- 4. Coverage / Precision / Recall / False Positive ---");
for (const r of precisionRecallResults) {
  push(`[${r.candidateName}] Coverage=${(r.avgCoverage * 100).toFixed(1)}% Precision=${(r.avgPrecision * 100).toFixed(1)}% Recall=${(r.avgRecall * 100).toFixed(1)}% FalsePositiveRate=${(r.avgFalsePositiveRate * 100).toFixed(1)}%`);
}
push();

log("STEP5: 최종 Blueprint 결정");
const allReproResults = [newCandidateRepro, ...thresholdResults, ...featureAdditionResults.filter((r) => r.candidateName !== newCandidateRepro.candidateName)];
const evaluations = allReproResults.map((repro) => {
  const pr = precisionRecallResults.find((p) => p.candidateName === repro.candidateName)!;
  return evaluateCandidate(repro, pr, oldBlueprintRepro);
});
const outcome = decideOutcome(evaluations, oldBlueprintRepro);
log(`STEP5 완료: 결정=${outcome.decision}`);

push("--- 5. 성공 기준 (Level 1~3) ---");
push(`Level 1 (새 Blueprint가 재현 가능함을 확인): ${outcome.level1Pass ? "PASS" : "FAIL"}`);
push(`Level 2 (기존 Blueprint보다 일관되게 높은 설명력, 5회 전부): ${outcome.level2Pass ? "PASS" : "FAIL"}`);
push(`Level 3 (Prototype 구현 가능한 수준으로 구체화): ${outcome.level3Pass ? "PASS" : "FAIL"}`);
push();

push("--- 6. 최종 결론 ---");
push(`결정: ${outcome.decision}`);
push(outcome.rationale);
push();

if (outcome.winner) {
  const spec = buildBlueprintSpec(outcome.winner.reproducibility.candidateName);
  push("--- 7. 최종 Blueprint 명세 ---");
  push(`Representation: ${spec.representationName}`);
  push(`Preconditions: ${spec.preconditions}`);
  push(`Allowed Operations: ${spec.allowedOperations}`);
  push(`Expected Mechanism: ${spec.expectedMechanism}`);
  push(`예상 적용 범위: ${spec.expectedScope}`);
  push(`제외 조건: ${spec.exclusions}`);
  push();
}

const overall = outcome.decision === "A";
push(`=== Sprint 종료: ${overall ? "성공" : "추가 조치 필요"} ===`);
push(
  outcome.decision === "A"
    ? "다음 단계: Solver Primitive Prototype Sprint v3 (확정된 Blueprint로 Prototype 재구현/재검증)."
    : outcome.decision === "B"
      ? "다음 단계: Solver Primitive Blueprint Refinement Sprint v2 (추가 보완)."
      : "다음 단계: Primitive 접근 재검토 Sprint.",
);
push("보호 파일: fiveByFiveEdges.ts/Planner.ts/Executor.ts/Recovery.ts 및 기존 Primitive/Prototype 코드 미수정 (읽기 전용 재사용만). 새 Prototype 미구현, Hard Coding/Planner Integration 없음. 제품 코드 미통합.");

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
log("\n" + lines.join("\n"));

if (!overall) process.exitCode = 1;
