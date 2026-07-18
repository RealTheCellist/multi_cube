// Solver Dataset Expansion Research Sprint v1 (Dataset Roadmap) -- driver.
//   npx tsx src/customCube/runSolverDatasetResearch.ts [failuresDbPath]
// No new Failures are generated, no Solver/Primitive/product code touched.
// Every measurement here reads the EXISTING 75-replay DB; every growth
// number beyond N=75 is an explicitly-labeled model estimate.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { analyzeDatasetBias } from "./solverDatasetResearch/DatasetBiasReport";
import { analyzeReplayDiversity } from "./solverDatasetResearch/ReplayDiversityAnalysis";
import { estimateDatasetGrowth } from "./solverDatasetResearch/DatasetGrowthEstimator";
import { SAMPLING_STRATEGIES } from "./solverDatasetResearch/ReplaySamplingStrategy";
import { computeDatasetMetrics } from "./solverDatasetResearch/DatasetMetrics";
import { buildDatasetRoadmap } from "./solverDatasetResearch/SolverDatasetRoadmap";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const gapDeadlineMs = 300;
const reportPath = "src/customCube/solverDatasetResearch/data/dataset-research-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Solver Dataset Expansion Research Sprint v1 -- Dataset Roadmap Report");
push("========================================");
push();

log("STEP1: Dataset Bias Analysis");
const bias = analyzeDatasetBias(failuresDbPath, gapDeadlineMs);
log("STEP1 완료");

push("--- 1. Dataset 편향 분석 ---");
for (const f of bias.findings) {
  push(`[${f.dimension}] ${f.summary}`);
  push(`  대표성 부족 영역 (${f.underrepresentedRegions.length}개): ${f.underrepresentedRegions.slice(0, 10).join(", ")}${f.underrepresentedRegions.length > 10 ? " ..." : ""}`);
}
push();

log("STEP2: Replay Diversity Analysis");
const diversity = analyzeReplayDiversity(failuresDbPath, gapDeadlineMs);
log("STEP2 완료");

push("--- 2. Dataset 다양성 분석 (Shannon Entropy) ---");
for (const m of diversity.metrics) {
  push(`[${m.dimension}] 고유=${m.uniqueCount}/${m.totalCount} (비율 ${(m.diversityRatio * 100).toFixed(1)}%) 엔트로피=${m.shannonEntropyBits.toFixed(2)}bits (정규화 ${m.normalizedEntropy.toFixed(2)})`);
  push(`  해석: ${m.interpretation}`);
}
push(`종합: ${diversity.overallInformationSummary}`);
push();

log("STEP3: Dataset Growth Estimator (CRP 시뮬레이션)");
const growth = estimateDatasetGrowth(failuresDbPath);
log("STEP3 완료");

push("--- 3. Dataset 규모 증가 효과 추정 (모델 기반 추정, 실측 아님 -- N=75 행만 실측) ---");
push(`방법론: ${growth.methodologyNote}`);
push();
for (const rep of [growth.exact, growth.coarse]) {
  push(`[${rep.representation}] 보정된 CRP alpha=${rep.calibratedAlpha.toFixed(2)}`);
  push(`  N=75 실측: 고유=${rep.observedAt75.uniqueCount}, Singleton비율=${(rep.observedAt75.singletonRate * 100).toFixed(1)}%, 재등장률=${(rep.observedAt75.reentryRate * 100).toFixed(1)}%`);
  for (const p of rep.projections) {
    push(
      `  N=${p.targetN}${p.isObserved ? "(실측)" : "(추정)"}: 고유=${p.expectedUniqueCount.toFixed(1)}, Singleton비율=${(p.expectedSingletonRate * 100).toFixed(1)}%, 재등장률=${(p.expectedReentryRate * 100).toFixed(1)}%, 평균그룹크기=${p.expectedAvgGroupSize.toFixed(2)}`,
    );
  }
  push();
}
push(`Cluster 안정성 참고: ${growth.clusterStabilityNote}`);
push();
push(`Lookup 가능성 참고: ${growth.lookupFeasibilityNote}`);
push();

push("--- 4. Sampling 전략 비교 ---");
for (const s of SAMPLING_STRATEGIES) {
  push(`[${s.strategy}] ${s.description}`);
  push(`  장점: ${s.pros.join(" / ")}`);
  push(`  단점: ${s.cons.join(" / ")}`);
  push(`  예상 효과: ${s.expectedEffect}`);
}
push();

log("STEP5: Dataset Metrics (기준선 측정)");
const metrics = computeDatasetMetrics(failuresDbPath, gapDeadlineMs);
log("STEP5 완료");

push("--- 5. Dataset 품질 기준 (Standard Dataset Metrics) -- 현재 기준선(N=75) ---");
push(`Shape 재등장률 (Coarse): ${(metrics.shapeReentryRate * 100).toFixed(1)}%`);
push(`Singleton 비율 (Coarse): ${(metrics.singletonRate * 100).toFixed(1)}%`);
push(`Replay 다양성 (WrongWing 분포 엔트로피): ${metrics.replayDiversityShannonBits.toFixed(2)} bits`);
push(`Cluster 안정성: 이번 Sprint에서 재측정하지 않음 (비용 때문) -- Solver v3 Kickoff 실측치 인용: ${(metrics.clusterStabilityCitedValue * 100).toFixed(1)}%`);
push(`Hard Gap 비율: ${(metrics.hardGapRate * 100).toFixed(1)}%`);
push(`Coverage 분포:`);
for (const c of metrics.coverageDistribution) {
  push(`  [${c.primitive}] ${(c.coverage * 100).toFixed(1)}% ${c.measuredThisSprint ? "(이번 Sprint 재측정)" : "(이전 Sprint 실측치 인용)"} -- ${c.source}`);
}
push();

log("STEP6: Dataset Roadmap 종합");
const roadmap = buildDatasetRoadmap(bias, growth, metrics);
log(`STEP6 완료: 결론 ${roadmap.outcome}`);

push("--- 6. Dataset Roadmap ---");
push(`목표 Dataset 규모: ${roadmap.targetSize}건 (중간 체크포인트: ${roadmap.interimCheckpoint}건)`);
push(`권장 Representation: ${roadmap.recommendedRepresentation}`);
push(`권장 Sampling 전략: ${roadmap.recommendedSamplingStrategy}`);
push(`권장 수집 순서:`);
for (const c of roadmap.collectionOrder) push(`  - ${c}`);
push(`우선 확보 대상 (${roadmap.priorityTargets.length}개 중 일부):`);
for (const t of roadmap.priorityTargets.slice(0, 15)) push(`  - ${t}`);
push(`중단 조건:`);
for (const s of roadmap.stopConditions) push(`  - ${s}`);
push(`연구 종료 조건:`);
for (const e of roadmap.researchEndConditions) push(`  - ${e}`);
push();

// --- Success criteria -----------------------------------------------------
const level1 = bias.findings.every((f) => f.histogram.length > 0);
const level2 = growth.exact.projections.some((p) => !p.isObserved) && growth.coarse.projections.some((p) => !p.isObserved);
const level3 = roadmap.targetSize > 0 && roadmap.collectionOrder.length > 0 && roadmap.stopConditions.length > 0 && roadmap.researchEndConditions.length > 0;

push("--- 7. 성공 기준 (Level 1~3) ---");
push(`Level 1 (편향이 실측 근거와 함께 정량화됨): ${level1 ? "PASS" : "FAIL"}`);
push(`Level 2 (규모 증가 기대효과가 근거와 함께 제시됨, 실측/추정 구분 명시): ${level2 ? "PASS" : "FAIL"}`);
push(`Level 3 (확보 전략이 즉시 실행 가능한 수준): ${level3 ? "PASS" : "FAIL"}`);
push();

push("--- 8. 최종 권고 ---");
push(`=== 결론: ${roadmap.outcome}. ${roadmap.outcomeLabel} ===`);
push(roadmap.reasoning);
push();

const overall = level1 && level2 && level3;
push(`=== Sprint 종료: ${overall ? "성공" : "실패"} ===`);
push("제품 코드 통합 여부: 미통합 (spec -- 새 Primitive/Prototype/제품 코드 수정/Replay 생성기 수정/새 Failure 생성 전부 금지)");

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
log("\n" + lines.join("\n"));

if (!overall) process.exitCode = 1;
