// Solver Primitive Evaluation Stabilization Sprint v1 -- driver.
//   npx tsx src/customCube/runEvaluationStabilization.ts [failuresDbPath]
// Refinement Sprint v1 found that BASE's disclosed Math.random()-seeded
// search makes the existing-Gap ground truth itself vary between
// independent runs (Gap Total 55~68 across 3 runs), which is why decision
// A didn't reproduce (A, A, B). This Sprint builds and validates an
// Evaluation Framework for measuring that variability directly, rather
// than continuing to improve the Prototype without knowing whether an
// apparent gain is real or just ground-truth noise. Evaluation code only
// -- zero Prototype/Solver/Planner/Executor/Recovery/Primitive
// modification (this driver only READS existing Prototype/Refinement
// Sprint v1 code via GateExpansionVariants.ts, unmodified).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDataset, buildLibs } from "./solverPrimitivePrototype/PrototypeBenchmark";
import { collectMultipleRuns } from "./solverPrimitiveEvaluationStabilization/RawDataCollector";
import { compareGapClassificationMethods } from "./solverPrimitiveEvaluationStabilization/GapClassificationMethods";
import { analyzePrimitiveVariance } from "./solverPrimitiveEvaluationStabilization/PrimitiveVarianceAnalysis";
import { computeGapRescueCI } from "./solverPrimitiveEvaluationStabilization/GapRescueConfidenceInterval";
import { decideOutcome } from "./solverPrimitiveEvaluationStabilization/IntegrationCriteria";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveEvaluationStabilization/data/stabilization-v1-report.txt";
const DEADLINE_MS = 400;
const RUNS = 5;

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Solver Primitive Evaluation Stabilization Sprint v1 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("Prototype Refinement Sprint v1이 남긴 문제(BASE의 Math.random() 변동성 때문에 existing-Gap 판정 자체가 실행마다 달라지고, 3회 재현성 검증에서 A/A/B로 갈렸던 것)를 이어받아, Gap 평가 자체를 안정화하는 Evaluation Framework를 구축하고 검증한다. 평가 코드만 신규 작성하며, 기존 Prototype/Solver/Planner/Executor/Recovery/Primitive는 전혀 수정하지 않는다(읽기 전용 재사용만).");
push();

const snapshots = loadDataset(failuresDbPath);
const { lib, libs } = buildLibs();

log(`데이터 수집: ${RUNS}회 독립 재실행 (전체 ${snapshots.length} Replay, 매 회 기존 5개 Primitive + baseline(A0)/candidate(A1_wideCycle) 실행)`);
const runs = collectMultipleRuns(snapshots, lib, libs, DEADLINE_MS, RUNS);
log("데이터 수집 완료");

log("STEP1: Gap Classification 방법 비교 (Single Run / Majority Vote / N회 평균 / Confidence Interval)");
const gapClassification = compareGapClassificationMethods(runs);
log("STEP1 완료");

push("--- 1. Gap Classification 방법 비교 (STEP1) ---");
push(`Single Run Gap Total: ${gapClassification.singleRunGapTotal}`);
push(`Majority Vote Gap Total (N=${RUNS}, 과반수): ${gapClassification.majorityVoteGapTotal}`);
push(`N회 평균(soft, 연속값) Gap Total: ${gapClassification.softAverageGapTotal.toFixed(2)}`);
push(
  `Run별 Gap Total 분포: 평균=${gapClassification.confidenceInterval.mean.toFixed(2)}, 표준편차=${gapClassification.confidenceInterval.stddev.toFixed(2)}, 변동계수=${gapClassification.confidenceInterval.coefficientOfVariation.toFixed(3)}, 95% CI=[${gapClassification.confidenceInterval.ciLower.toFixed(2)}, ${gapClassification.confidenceInterval.ciUpper.toFixed(2)}]`,
);
push(`Single Run ↔ Majority Vote Jaccard 유사도(replay 집합 일치도): ${(gapClassification.singleVsMajorityJaccard * 100).toFixed(1)}%`);
push();

log("STEP2: Primitive별 변동성 분석");
const primitiveVariance = analyzePrimitiveVariance(runs);
log("STEP2 완료");

push("--- 2. Primitive별 Gap 판정 변동성 (STEP2) ---");
for (const p of primitiveVariance) {
  push(`[${p.primitive}] 평균 성공 수=${p.stats.mean.toFixed(2)}/${snapshots.length} 표준편차=${p.stats.stddev.toFixed(2)} 변동계수=${p.stats.coefficientOfVariation.toFixed(3)} FlipRate(${RUNS}회 중 비일관 replay 비율)=${(p.flipRate * 100).toFixed(1)}%`);
}
push();

log("STEP3: Gap Rescue 신뢰구간 계산 (baseline A0 vs candidate A1_wideCycle, Refinement Sprint v1의 worked example)");
const gapRescueCI = computeGapRescueCI(runs);
log("STEP3 완료");

push("--- 3. Gap Rescue 신뢰구간 (STEP3) ---");
push(`baseline(A0): 평균=${gapRescueCI.baselineStats.mean.toFixed(2)} 표준편차=${gapRescueCI.baselineStats.stddev.toFixed(2)} 95% CI=[${gapRescueCI.baselineStats.ciLower.toFixed(2)}, ${gapRescueCI.baselineStats.ciUpper.toFixed(2)}]`);
push(`candidate(A1_wideCycle): 평균=${gapRescueCI.candidateStats.mean.toFixed(2)} 표준편차=${gapRescueCI.candidateStats.stddev.toFixed(2)} 95% CI=[${gapRescueCI.candidateStats.ciLower.toFixed(2)}, ${gapRescueCI.candidateStats.ciUpper.toFixed(2)}]`);
push(`paired diff(candidate−baseline, 동일 Run 내에서 짝지음): 평균=${gapRescueCI.pairedDiffStats.mean.toFixed(2)} 표준편차=${gapRescueCI.pairedDiffStats.stddev.toFixed(2)} 95% CI=[${gapRescueCI.pairedDiffStats.ciLower.toFixed(2)}, ${gapRescueCI.pairedDiffStats.ciUpper.toFixed(2)}]`);
push(`baseline·candidate CI가 서로 겹치지 않는가 (강한 신호): ${gapRescueCI.candidateCIExceedsBaselineCI}`);
push(`paired diff CI가 0을 배제하는가 (통계적으로 유의미한 개선, 이 Sprint가 채택한 기준): ${gapRescueCI.pairedDiffCIExcludesZero}`);
push();

log("STEP4: Integration 판단 기준 재정의 + 적용");
const outcome = decideOutcome(gapClassification, primitiveVariance, gapRescueCI);
log(`STEP4 완료: 결정=${outcome.decision}`);

push("--- 4. 새 Integration 판단 기준 (STEP4) ---");
push(outcome.recommendedCriterion);
push();

push("--- 5. 성공 기준 (Level 1~3) ---");
push(`Level 1 (Gap 평가의 변동성을 정량화한다): ${outcome.level1Pass ? "PASS" : "FAIL"}`);
push(`Level 2 (재현 가능한 Evaluation 기준을 제안한다): ${outcome.level2Pass ? "PASS" : "FAIL"}`);
push(`Level 3 (Prototype Sprint에서 사용할 표준 Evaluation 절차를 확정한다): ${outcome.level3Pass ? "PASS" : "FAIL"}`);
push();

push("--- 6. 최종 결론 ---");
push(`결정: ${outcome.decision}`);
push(outcome.rationale);
push();

const nextStep =
  outcome.decision === "A"
    ? "다음 단계: Solver Primitive Prototype Refinement Sprint v2 (새 표준 Evaluation 절차 -- Majority Vote 분류 + paired-diff 95% CI -- 를 적용해 재개)."
    : outcome.decision === "B"
      ? "다음 단계: Solver Primitive Evaluation Stabilization Sprint v2 (Run 수 확대 또는 추가 안정화 기법 검토)."
      : "다음 단계: Solver Primitive Strategy Review Sprint (평가 체계 자체 재설계).";
push(`=== Sprint 종료: ${outcome.decision === "A" ? "성공" : "추가 조치 필요"} ===`);
push(nextStep);
push("보호 파일: 기존 Prototype/Solver/Planner/Executor/Recovery/Primitive 전부 미수정(읽기 전용 재사용만, GateExpansionVariants.ts 포함). 평가 코드만 신규 작성. Planner Integration/Hard Coding 없음. 제품 코드 미통합.");

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
log("\n" + lines.join("\n"));

if (outcome.decision !== "A") process.exitCode = 1;
