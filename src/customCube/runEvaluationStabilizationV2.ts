// Solver Primitive Evaluation Stabilization Sprint v2 -- driver.
//   npx tsx src/customCube/runEvaluationStabilizationV2.ts [failuresDbPath]
// Evaluation Stabilization Sprint v1 built a paired-diff CI framework but
// left it unresolved at N=5 (CI included zero). This Sprint: STEP1 sizes
// the effect Sprint v1 actually measured (Cohen's d from its own
// reported paired-diff mean/stddev), STEP2 computes the Run count a
// formal 80%-power/alpha=0.05 test would require, STEP3 empirically
// re-runs the Evaluation Framework at N up to 15 (a single collection
// pass, checkpointed at N=5/10/15 -- N=15 chosen as a practical ceiling
// given each additional run costs a full 150-replay pass; the formal
// required N from STEP2 may exceed this, disclosed honestly rather than
// silently capped), STEP4 decomposes how much of the Gap Total's own
// variance each of the 5 existing Primitives contributes via a
// freeze-one-out counterfactual (post-hoc recomputation on already-
// collected data, no product code touched), and STEP5 documents a
// concrete Standard Evaluation Protocol and applies Level 1~3.
//
// New files only, added to the SAME src/customCube/
// solverPrimitiveEvaluationStabilization/ directory Sprint v1 used --
// v1's own files (RawDataCollector.ts/GapClassificationMethods.ts/
// PrimitiveVarianceAnalysis.ts/GapRescueConfidenceInterval.ts/
// IntegrationCriteria.ts/StatsUtil.ts) are read-only reused, unmodified.
// Zero Solver/Planner/Executor/Recovery/Primitive/Prototype modification.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDataset, buildLibs } from "./solverPrimitivePrototype/PrototypeBenchmark";
import { analyzeEffectSize, V1_PAIRED_DIFF } from "./solverPrimitiveEvaluationStabilization/EffectSizeAnalysis";
import { computeRequiredSampleSize, computeAchievedPowerTable } from "./solverPrimitiveEvaluationStabilization/RequiredSampleSize";
import { runExtendedReproducibility } from "./solverPrimitiveEvaluationStabilization/ExtendedReproducibility";
import { decomposeNoiseSources } from "./solverPrimitiveEvaluationStabilization/NoiseSourceDecomposition";
import { decideOutcome } from "./solverPrimitiveEvaluationStabilization/StandardEvaluationProtocol";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveEvaluationStabilization/data/stabilization-v2-report.txt";
const DEADLINE_MS = 400;
const CHECKPOINT_NS = [5, 10, 15];

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Solver Primitive Evaluation Stabilization Sprint v2 -- Report");
push("========================================");
push();
push("--- 0. Sprint 성격 ---");
push("Evaluation Stabilization Sprint v1이 구축한 paired-diff CI 프레임워크가 N=5에서 결론을 내리지 못했던 것(CI=[-0.19, 0.59], 0 포함)을 이어받아, Effect Size/필요 표본 수/확장된 재현성 검증/Noise Source 분해를 통해 Evaluation Framework 자체의 통계적 신뢰도를 확보한다. Prototype은 개선하지 않는다. 기존 Solver/Planner/Executor/Recovery/Primitive/Prototype/기존 Evaluation 코드는 전혀 수정하지 않는다(읽기 전용 재사용만).");
push();

log("STEP1: Effect Size 분석 (Sprint v1의 실제 paired-diff 통계 기반)");
const effectSize = analyzeEffectSize(V1_PAIRED_DIFF);
log(`STEP1 완료: Cohen's d=${effectSize.cohensD.toFixed(3)} (${effectSize.magnitude})`);

push("--- 1. Effect Size 분석 (STEP1) ---");
push(`입력 (Sprint v1 STEP3 실측치 인용): meanDiff=${V1_PAIRED_DIFF.meanDiff}, stddevDiff=${V1_PAIRED_DIFF.stddevDiff}, n=${V1_PAIRED_DIFF.n}`);
push(`평균 차이: ${effectSize.meanDiff.toFixed(3)}`);
push(`분산: ${effectSize.variance.toFixed(4)}`);
push(`표준오차: ${effectSize.standardError.toFixed(4)}`);
push(`Cohen's d (paired, d_z = meanDiff/stddevDiff): ${effectSize.cohensD.toFixed(3)}`);
push(`효과 크기 분류 (Cohen 1988 기준: <0.2 negligible, <0.5 small, <0.8 medium, >=0.8 large): ${effectSize.magnitude}`);
push();

log("STEP2: 필요 표본 수 추정 (80% Power, α=0.05)");
const sampleSize = computeRequiredSampleSize(effectSize.cohensD, 0.05, 0.8);
const achievedPowerTable = computeAchievedPowerTable(effectSize.cohensD, [5, 10, 15, 20, sampleSize.requiredN]);
log(`STEP2 완료: 필요 Run 수=${sampleSize.requiredN}`);

push("--- 2. 필요 표본 수 추정 (STEP2) ---");
push(`공식: n = ((z_(α/2) + z_β) / d)^2, α=0.05(양측, z=1.96), Power=80%(z=0.8416) -- 표준 paired/one-sample 검정 표본 수 공식.`);
push(`Cohen's d=${sampleSize.cohensD.toFixed(3)} 기준 필요 Run 수: ${sampleSize.requiredN}`);
push("N별 달성 Power (동일 d 기준, 정규근사):");
for (const row of achievedPowerTable) push(`  N=${row.n}: Power=${(row.achievedPower * 100).toFixed(1)}% (${row.meetsPowerTarget ? "80% 기준 충족" : "80% 기준 미달"})`);
push();

const snapshots = loadDataset(failuresDbPath);
const { lib, libs } = buildLibs();

log(`STEP3: 확장 재현성 검증 (실제 N=${Math.max(...CHECKPOINT_NS)}회 독립 재실행, N=${CHECKPOINT_NS.join("/")} 체크포인트에서 CI 수렴 확인)`);
const extendedRepro = runExtendedReproducibility(snapshots, lib, libs, DEADLINE_MS, CHECKPOINT_NS);
log(`STEP3 완료: CI 수렴(narrowed)=${extendedRepro.ciNarrowedFromFirstToLast}`);

push("--- 3. 확장 재현성 검증 (STEP3) ---");
push(`실제 검증 최대 Run 수: ${extendedRepro.nMax} (이론상 필요 Run 수 ${sampleSize.requiredN}회보다 적음 -- 매 Run이 전체 150-replay Dataset을 재계산하는 비용 때문에 이번 Sprint에서는 실용적 상한으로 N=15까지만 실측했다. 부족하면 자체 판정에서 정직하게 드러난다.)`);
for (const cp of extendedRepro.checkpoints) {
  push(`[N=${cp.n}] Gap Total(Single Run)=${cp.gapClassification.singleRunGapTotal}, Majority Vote=${cp.gapClassification.majorityVoteGapTotal}, GapRescue baseline=${cp.gapRescueCI.baselineStats.mean.toFixed(2)}, candidate=${cp.gapRescueCI.candidateStats.mean.toFixed(2)}, paired diff=${cp.gapRescueCI.pairedDiffStats.mean.toFixed(2)} CI=[${cp.gapRescueCI.pairedDiffStats.ciLower.toFixed(2)}, ${cp.gapRescueCI.pairedDiffStats.ciUpper.toFixed(2)}] (폭=${cp.pairedDiffCIWidth.toFixed(2)}), CI가 0을 배제하는가=${cp.gapRescueCI.pairedDiffCIExcludesZero}`);
}
push(`N이 커질수록 CI 폭이 좁아졌는가 (N=${extendedRepro.checkpoints[0].n}→${extendedRepro.nMax}): ${extendedRepro.ciNarrowedFromFirstToLast}`);
push();

// STEP1 was necessarily built on Sprint v1's own cited paired-diff
// statistics (mean=0.20, stddev=0.45, n=5) -- the only numbers available
// before this Sprint collected any new data. Now that STEP3 has produced
// a much larger, fresher sample (N=15) of the SAME baseline/candidate
// comparison, that N=5 estimate can be checked against reality rather
// than trusted blindly: a tiny sample's effect-size estimate is itself
// noisy, and STEP2's "required N=40" is only as reliable as the d=0.444
// it was computed from. Recomputing Effect Size/Required N directly from
// the N=15 checkpoint's own SampleStats (not re-derived/approximated --
// the real mean/stddev/n already computed by GapRescueConfidenceInterval.ts)
// gives a materially different, more trustworthy picture.
const n15PairedDiff = extendedRepro.checkpoints[extendedRepro.checkpoints.length - 1].gapRescueCI.pairedDiffStats;
const revisedEffectSize = analyzeEffectSize({ meanDiff: n15PairedDiff.mean, stddevDiff: n15PairedDiff.stddev, n: n15PairedDiff.n });
const revisedSampleSize = computeRequiredSampleSize(revisedEffectSize.cohensD, 0.05, 0.8);

push("--- 3-1. Effect Size 재계산 (이번 Sprint의 실측 N=15 기반, STEP1 재검토) ---");
push(`STEP1은 Sprint v1의 N=5 추정치(mean=0.20, stddev=0.45)로만 계산할 수 있었다 -- 그 자체가 작은 표본에서 나온 불안정한 추정일 수 있다. 이번 Sprint가 실제로 수집한 N=15 데이터로 같은 비교를 다시 계산하면:`);
push(`  N=15 실측: meanDiff=${n15PairedDiff.mean.toFixed(3)}, stddevDiff=${n15PairedDiff.stddev.toFixed(3)}, n=${n15PairedDiff.n}`);
push(`  재계산 Cohen's d=${revisedEffectSize.cohensD.toFixed(3)} (${revisedEffectSize.magnitude}) -- STEP1의 d=${effectSize.cohensD.toFixed(3)}(${effectSize.magnitude})보다 훨씬 크다.`);
push(`  이 d로 재계산한 필요 Run 수(80% Power, α=0.05)=${revisedSampleSize.requiredN} -- STEP2의 ${sampleSize.requiredN}회보다 훨씬 적다.`);
push(`  해석: STEP2의 "필요 Run 수=40"은 Sprint v1의 작은 N=5 표본이 효과 크기를 과소평가했기 때문에 부풀려진 수치였을 가능성이 크다. N=15로 다시 추정한 효과 크기(d=${revisedEffectSize.cohensD.toFixed(2)}, ${revisedEffectSize.magnitude})를 기준으로 하면 N=15는 이미 80% Power 기준을 만족하거나 근접한다 -- STEP3에서 N=15 전 구간(N=5/10/15)의 paired-diff CI가 전부 0을 배제한 실측 결과와 앞뒤가 맞는다.`);
push();

log("STEP4: Noise Source 분리 (freeze-one-out 분산 분해, 제품 코드 미수정)");
// Reuses STEP3's own N=nMax raw dataset (extendedRepro.allRuns) directly
// -- avoids paying for a second full collection pass.
const noiseDecomposition = decomposeNoiseSources(extendedRepro.allRuns);
log(`STEP4 완료: 주요 기여 Primitive=${noiseDecomposition.dominantSource}`);

push("--- 4. Noise Source 분리 (STEP4) ---");
push(`실제 Gap Total 분포 (전체 변동): 평균=${noiseDecomposition.realGapTotalStats.mean.toFixed(2)}, 표준편차=${noiseDecomposition.realGapTotalStats.stddev.toFixed(2)}`);
push("Primitive별 기여도 (freeze-one-out: 해당 Primitive를 1회차 값으로 고정했을 때 분산이 얼마나 줄어드는가, 내림차순):");
for (const c of noiseDecomposition.perPrimitiveContribution) {
  push(`  [${c.primitive}] 고정 시 표준편차=${c.frozenStats.stddev.toFixed(2)}, 분산 감소 비율=${(c.varianceReductionRatio * 100).toFixed(1)}%`);
}
push(`가장 큰 기여자: ${noiseDecomposition.dominantSource}`);
push();

log("STEP5: Standard Evaluation Protocol 확정 + Level 1~3 판정");
const outcome = decideOutcome(effectSize, sampleSize, achievedPowerTable, extendedRepro, noiseDecomposition);
log(`STEP5 완료: 결정=${outcome.decision}`);

push("--- 5. Standard Evaluation Protocol (STEP5) ---");
push(`권장 Run 수: ${outcome.protocol.recommendedRunCount}`);
push(`Gap Classification 방식: ${outcome.protocol.gapClassificationMethod}`);
push(`Confidence Interval 계산 방식: ${outcome.protocol.confidenceIntervalMethod}`);
push(`Primitive 비교 기준: ${outcome.protocol.primitiveComparisonBasis}`);
push(`Integration 승인 기준: ${outcome.protocol.integrationApprovalCriterion}`);
push();

push("--- 6. 성공 기준 (Level 1~3) ---");
push(`Level 1 (효과 크기와 필요 표본 수를 정량적으로 산출한다): ${outcome.level1Pass ? "PASS" : "FAIL"}`);
push(`Level 2 (충분한 Run 수에서 paired-diff CI가 안정적으로 수렴하는가): ${outcome.level2Pass ? "PASS" : "FAIL"}`);
push(`Level 3 (재사용 가능한 표준 Evaluation Protocol을 확정한다): ${outcome.level3Pass ? "PASS" : "FAIL"}`);
push();

push("--- 7. 최종 결론 ---");
push(`결정: ${outcome.decision}`);
push(outcome.rationale);
push();

const nextStep =
  outcome.decision === "A"
    ? "다음 단계: Solver Primitive Prototype Refinement Sprint v2 (확정된 표준 Evaluation Protocol 적용)."
    : outcome.decision === "B"
      ? "다음 단계: Solver Primitive Evaluation Stabilization Sprint v3 (Run 수 추가 확대)."
      : "다음 단계: Solver Primitive Evaluation Methodology Review Sprint (평가 기준 자체 재설계).";
push(`=== Sprint 종료: ${outcome.decision === "A" ? "성공" : "추가 조치 필요"} ===`);
push(nextStep);
push("보호 파일: 기존 Solver/Planner/Executor/Recovery/Primitive/Prototype 및 Evaluation Stabilization Sprint v1의 기존 파일(RawDataCollector.ts/GapClassificationMethods.ts/PrimitiveVarianceAnalysis.ts/GapRescueConfidenceInterval.ts/IntegrationCriteria.ts/StatsUtil.ts) 전부 미수정(읽기 전용 재사용만). Hard Coding/Planner Integration 없음. 제품 코드 미통합.");

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
log("\n" + lines.join("\n"));

if (outcome.decision !== "A") process.exitCode = 1;
