// Coverage Expansion Sprint v1 -- driver.
//   npx tsx src/customCube/runCoverageExpansion.ts [failuresDbPath] [perAttemptDeadlineMs]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildCaseLibrary, buildFlipLibrary, buildWingLibrary } from "./fiveByFiveEdges";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import { warmupFiveByFiveEdgeLibraries } from "./fiveByFiveEdgeSolverEngine";
import { loadAllReplaySnapshots } from "./primitiveReplay/PrototypeReplay";
import { computeCoverageBreakdown } from "./coverageExpansion/CoverageBreakdown";
import { analyzeExpansionPotential } from "./coverageExpansion/ExpansionAnalysis";
import { BASELINE_OPTIONS, type SimulationOptions } from "./coverageExpansion/CycleChaseSimulator";
import { runSimulationOnSnapshot, summarizeSimulation, type SimulationSummary } from "./coverageExpansion/CoverageExpansionBenchmark";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const perAttemptDeadlineMs = Number(process.argv[3] ?? 300);

const breakdownReportPath = "src/customCube/coverageExpansion/data/coverage-breakdown.txt";
const simulationReportPath = "src/customCube/coverageExpansion/data/coverage-simulation.txt";
const finalReportPath = "src/customCube/coverageExpansion/data/coverage-expansion-report.txt";

// Spec section "성공 기준" / "실패 조건" thresholds.
const LEVEL1_MIN_COVERAGE = 0.3;
const LEVEL2_MAX_REGRESSION_RATE = 0.1;
const BASELINE_AVG_WRONGWING_DELTA = -2.24; // Primitive Invention Sprint v1's own measured baseline

console.log("STEP: 라이브러리 준비");
warmupFiveByFiveEdgeLibraries();
const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

console.log("STEP: Replay 로드 (75건)");
const snapshots = loadAllReplaySnapshots(failuresDbPath);
console.log(`  Replay ${snapshots.length}건`);

// --- STEP 1/2: Coverage Breakdown --------------------------------------------
console.log("STEP 1/2: 비활성 원인 분류 + Coverage Breakdown");
const breakdown = computeCoverageBreakdown(snapshots, libs.lib, perAttemptDeadlineMs);
console.log(`  활성화: ${breakdown.activatedCount}/${breakdown.totalReplays}`);
for (const [cause, count] of Object.entries(breakdown.causeTally)) console.log(`  ${cause}: ${count}`);

const breakdownLines: string[] = [];
const bpush = (s = "") => breakdownLines.push(s);
bpush("========================================");
bpush("Coverage Breakdown Report -- Coverage Expansion Sprint v1");
bpush("========================================");
bpush();
bpush(`전체 Replay: ${breakdown.totalReplays}`);
bpush(`활성화 (CycleChase 실제 발동): ${breakdown.activatedCount}`);
bpush();
bpush("--- 비활성 원인별 분류 ---");
for (const [cause, count] of Object.entries(breakdown.causeTally)) bpush(`  ${cause} : ${count}`);
mkdirSync(dirname(breakdownReportPath), { recursive: true });
writeFileSync(breakdownReportPath, breakdownLines.join("\n"), "utf-8");

// --- STEP 3: Expansion Analysis ----------------------------------------------
console.log("\nSTEP 3: 확장 가능성 분석");
const analyses = analyzeExpansionPotential(breakdown);
for (const a of analyses) console.log(`  ${a.cause} (${a.count}건): ${a.testedInSimulation ? "시뮬레이션 대상" : "제외"}`);

// --- STEP 4/5: Coverage Simulation + Safety Simulation -----------------------
console.log("\nSTEP 4/5: Coverage Simulation + Safety Simulation");
const variants: { label: string; options: SimulationOptions }[] = [
  { label: "baseline (sanity check)", options: BASELINE_OPTIONS },
  { label: "minimumCycleLength 4->3", options: { minimumCycleLength: 3, alternateStart: false, parityPreTry: false } },
  { label: "alternateStart ON", options: { minimumCycleLength: 4, alternateStart: true, parityPreTry: false } },
  { label: "parityPreTry ON", options: { minimumCycleLength: 4, alternateStart: false, parityPreTry: true } },
  { label: "combined (minCycle=3 + alternateStart + parityPreTry)", options: { minimumCycleLength: 3, alternateStart: true, parityPreTry: true } },
];

const summaries: SimulationSummary[] = variants.map(({ label, options }) => {
  const results = snapshots.map((s) => runSimulationOnSnapshot(s, libs, perAttemptDeadlineMs, options));
  const summary = summarizeSimulation(label, results);
  console.log(
    `  ${label}: Coverage=${(summary.coverage * 100).toFixed(1)}% (${summary.activatedCount}/${summary.totalTested})  ` +
      `Regression=${(summary.regressionRateAmongActivated * 100).toFixed(1)}%  avgWrongWingDelta=${summary.avgWrongWingDelta.toFixed(2)}`
  );
  return summary;
});

const simulationLines: string[] = [];
const spush = (s = "") => simulationLines.push(s);
spush("========================================");
spush("Coverage Simulation -- Coverage Expansion Sprint v1");
spush("========================================");
spush();
for (const s of summaries) {
  spush(`--- ${s.variantLabel} ---`);
  spush(`  Coverage: ${(s.coverage * 100).toFixed(1)}% (${s.activatedCount}/${s.totalTested})`);
  spush(`  WrongWing 개선 Replay 수: ${s.improvedCount}`);
  spush(`  Regression율 (활성화된 것 중): ${(s.regressionRateAmongActivated * 100).toFixed(1)}% (${s.regressionCount}/${s.activatedCount || 0})`);
  spush(`  평균 WrongWing 변화 (활성화된 것 중): ${s.avgWrongWingDelta.toFixed(2)}`);
  spush(`  평균 Pair 변화 (활성화된 것 중): ${s.avgPairDelta.toFixed(2)}`);
  spush(`  평균 Move 수 (활성화된 것 중): ${s.avgMoveCount.toFixed(1)}`);
  spush(`  평균 실행 시간: ${s.avgTimeMs.toFixed(0)}ms`);
  spush(`  안전성 (Regression <= 10%): ${s.regressionRateAmongActivated <= LEVEL2_MAX_REGRESSION_RATE ? "유지됨" : "상실됨 -- 이 조건은 폐기"}`);
  spush();
}
mkdirSync(dirname(simulationReportPath), { recursive: true });
writeFileSync(simulationReportPath, simulationLines.join("\n"), "utf-8");
console.log("\n" + simulationLines.join("\n"));

// --- STEP 6: pick the best SAFE variant, treat its already-computed 75-Replay run as the Benchmark ---
const baselineSummary = summaries[0];
const safeSummaries = summaries.filter((s) => s.regressionRateAmongActivated <= LEVEL2_MAX_REGRESSION_RATE);
const bestSafe = safeSummaries.reduce((best, s) => (s.coverage > best.coverage ? s : best), safeSummaries[0]);

// --- Success criteria ---------------------------------------------------------
const level1 = bestSafe.coverage >= LEVEL1_MIN_COVERAGE;
const level2 = bestSafe.regressionRateAmongActivated <= LEVEL2_MAX_REGRESSION_RATE;
const level3 = bestSafe.avgWrongWingDelta <= BASELINE_AVG_WRONGWING_DELTA;

// --- Failure conditions (spec, OR logic) --------------------------------------
const anySafeVariantIncreasedCoverage = safeSummaries.some((s) => s.coverage > baselineSummary.coverage);
const failNoCoverageIncrease = !anySafeVariantIncreasedCoverage;
const failWorseImprovement = bestSafe.avgWrongWingDelta > BASELINE_AVG_WRONGWING_DELTA;
const failRegression = bestSafe.regressionRateAmongActivated > LEVEL2_MAX_REGRESSION_RATE; // true only if even the "best safe" pick somehow violates -- structurally shouldn't happen given the filter above
const failSafetyLost = safeSummaries.length === 0; // every variant that raises Coverage also breaks the Regression bar

const finalLines: string[] = [];
const fpush = (s = "") => finalLines.push(s);
fpush("========================================");
fpush("Coverage Expansion Report -- Coverage Expansion Sprint v1");
fpush("========================================");
fpush();
fpush(`Baseline (Primitive Invention Sprint v1 재현): Coverage ${(baselineSummary.coverage * 100).toFixed(1)}%, Regression ${(baselineSummary.regressionRateAmongActivated * 100).toFixed(1)}%, avgWrongWingDelta ${baselineSummary.avgWrongWingDelta.toFixed(2)}`);
fpush(`가장 좋은 안전한(Regression<=10%) 조건: ${bestSafe.variantLabel}`);
fpush(`  Coverage: ${(bestSafe.coverage * 100).toFixed(1)}%  Regression: ${(bestSafe.regressionRateAmongActivated * 100).toFixed(1)}%  avgWrongWingDelta: ${bestSafe.avgWrongWingDelta.toFixed(2)}`);
fpush();
fpush("--- 성공 기준 판정 ---");
fpush(`Level 1 (Coverage 30% 이상): ${level1 ? "PASS" : "FAIL"} (실제 ${(bestSafe.coverage * 100).toFixed(1)}%)`);
fpush(`Level 2 (Regression 10% 이하): ${level2 ? "PASS" : "FAIL"} (실제 ${(bestSafe.regressionRateAmongActivated * 100).toFixed(1)}%)`);
fpush(`Level 3 (평균 WrongWing 감소 기존(-2.24) 이상 유지): ${level3 ? "PASS" : "FAIL"} (실제 ${bestSafe.avgWrongWingDelta.toFixed(2)})`);
fpush();
fpush("--- 실패 조건 판정 ---");
fpush(`Regression > 10%: ${failRegression ? "해당" : "해당없음"}`);
fpush(`Coverage 증가 없음 (안전한 변형 중 baseline보다 높은 것 없음): ${failNoCoverageIncrease ? "해당" : "해당없음"}`);
fpush(`평균 개선 감소 (baseline -2.24보다 나쁨): ${failWorseImprovement ? "해당" : "해당없음"}`);
fpush(`CycleChase 안전성 상실 (Coverage를 늘리는 모든 조건이 Regression 기준을 깸): ${failSafetyLost ? "해당" : "해당없음"}`);
fpush();
const overallSuccess = level1 && level2 && level3;
fpush(`종합 판정: ${overallSuccess ? "성공 -- CycleChase는 제품 통합 후보가 된다" : "실패 -- 그러나 CycleChase의 적용 한계를 정의하는 연구 결과"}`);
fpush(`제품 통합 여부: 미통합 (spec -- 이번 Sprint는 항상 통합하지 않는다)`);

mkdirSync(dirname(finalReportPath), { recursive: true });
writeFileSync(finalReportPath, finalLines.join("\n"), "utf-8");
console.log("\n" + finalLines.join("\n"));
