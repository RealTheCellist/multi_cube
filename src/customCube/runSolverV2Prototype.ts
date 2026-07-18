// Solver v2 Primitive Prototype Sprint v1 -- driver.
//   npx tsx src/customCube/runSolverV2Prototype.ts [failuresDbPath] [deadlineMs]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildWingLibrary } from "./fiveByFiveEdges";
import { warmupFiveByFiveEdgeLibraries } from "./fiveByFiveEdgeSolverEngine";
import { profileAllReplays } from "./solverV2Research/GapDetector";
import { deserializeCube } from "./failureAnalysis/cubeSerialization";
import { analyzeMultiCycle } from "./solverV2Prototype/MultiCycleAnalyzer";
import { resolveBoundedMultiCycle } from "./solverV2Prototype/BoundedResolver";
import { loadAll75, runBoundedResolverOn, runCycleChaseOn, summarize } from "./solverV2Prototype/ReplayBenchmark";
import { formatComparisonTable, formatCycleOutcomes, type CycleOutcomeRecord } from "./solverV2Prototype/StructuralReporter";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const deadlineMs = Number(process.argv[3] ?? 500);

const structuralReportPath = "src/customCube/solverV2Prototype/data/structural-report.txt";
const finalReportPath = "src/customCube/solverV2Prototype/data/prototype-benchmark-report.txt";

const LEVEL1_MIN_IMPROVED = 10;
const LEVEL2_MAX_REGRESSION_RATE = 0.1;
const DOCUMENTED_CYCLECHASE_BASELINE = 0.227; // Primitive Invention Sprint v1's own established number
const LEVEL3_MIN_COVERAGE = DOCUMENTED_CYCLECHASE_BASELINE + 0.10;
const FAIL_MAX_AVG_TIME_MS = 500;

console.log("STEP: 라이브러리 준비");
warmupFiveByFiveEdgeLibraries();
const lib = buildWingLibrary();

console.log("\nSTEP: Hard Gap Replay 29건 재확인 (solverV2Research 재사용)");
const profiles = profileAllReplays(failuresDbPath, 300);
const hardGapHashes = new Set(profiles.filter((p) => p.isHardGap).map((p) => p.replayHash));
console.log(`  Hard Gap: ${hardGapHashes.size}건`);

const all75 = loadAll75(failuresDbPath);
const hardGapSnapshots = all75.filter((s) => hardGapHashes.has(s.hash));

// --- STEP 1 (구조 요약) + STEP 2/3 (Bounded Resolver 실행) on Hard Gap set ---
console.log("\nSTEP 1-3: Multi-Cycle Analyzer + Bounded Resolver (Hard Gap 29건)");
const cycleOutcomes: CycleOutcomeRecord[] = hardGapSnapshots.map((s) => {
  const cubies = deserializeCube(s.cubeState);
  const analysis = analyzeMultiCycle(cubies);
  if (!analysis || analysis.cycleLength < 4) {
    return { hash: s.hash, cycleLength: analysis?.cycleLength ?? null, succeeded: false, failureReason: "no chaseable cycle (length<4 or none)", leavesExplored: 0, timeMs: 0 };
  }
  const startedAt = Date.now();
  const result = resolveBoundedMultiCycle(cubies, analysis.cycleNodes, lib, startedAt + deadlineMs);
  const timeMs = Date.now() - startedAt;
  return {
    hash: s.hash,
    cycleLength: analysis.cycleLength,
    succeeded: result.moves !== null,
    failureReason: result.moves !== null ? null : "no explored leaf net-improved WrongWing (Deferred Validation rejected)",
    leavesExplored: result.leavesExplored,
    timeMs,
  };
});
const succeededCount = cycleOutcomes.filter((r) => r.succeeded).length;
console.log(`  성공: ${succeededCount}/${cycleOutcomes.length}`);

// --- STEP 4: Replay Benchmark -----------------------------------------------
console.log("\nSTEP 4: Replay Benchmark -- CycleChase vs Bounded Resolver");
console.log("  (a) Hard Gap 29건 대상");
const cycleChaseOnGap = runCycleChaseOn(hardGapSnapshots, lib, deadlineMs);
const boundedOnGap = runBoundedResolverOn(hardGapSnapshots, lib, deadlineMs);
const cycleChaseGapSummary = summarize("CycleChase (Hard Gap 29건)", cycleChaseOnGap);
const boundedGapSummary = summarize("Bounded Multi-Cycle Resolver (Hard Gap 29건)", boundedOnGap);
console.log(`    CycleChase: 개선 ${cycleChaseGapSummary.improvedCount}건, Coverage ${(cycleChaseGapSummary.coverage * 100).toFixed(1)}%`);
console.log(`    Bounded:    개선 ${boundedGapSummary.improvedCount}건, Coverage ${(boundedGapSummary.coverage * 100).toFixed(1)}%`);

console.log("  (b) 전체 75건 대상 (Level 3 Coverage 비교용)");
const cycleChaseOn75 = runCycleChaseOn(all75, lib, deadlineMs);
const boundedOn75 = runBoundedResolverOn(all75, lib, deadlineMs);
const cycleChase75Summary = summarize("CycleChase (전체 75건)", cycleChaseOn75);
const bounded75Summary = summarize("Bounded Multi-Cycle Resolver (전체 75건)", boundedOn75);
console.log(`    CycleChase: Coverage ${(cycleChase75Summary.coverage * 100).toFixed(1)}%`);
console.log(`    Bounded:    Coverage ${(bounded75Summary.coverage * 100).toFixed(1)}%`);

// --- STEP 5: Structural Report -----------------------------------------------
const structuralLines: string[] = [];
const spush = (...s: string[]) => structuralLines.push(...(s.length ? s : [""]));
spush("========================================");
spush("Structural Report -- Solver v2 Primitive Prototype Sprint v1");
spush("========================================");
spush();
spush(...formatCycleOutcomes(cycleOutcomes));
spush();
const avgCycleLength = cycleOutcomes.filter((r) => r.cycleLength !== null).reduce((s, r) => s + (r.cycleLength ?? 0), 0) / (cycleOutcomes.filter((r) => r.cycleLength !== null).length || 1);
const avgTimeMs = cycleOutcomes.reduce((s, r) => s + r.timeMs, 0) / (cycleOutcomes.length || 1);
spush(`평균 Cycle 길이: ${avgCycleLength.toFixed(2)}`);
spush(`평균 시간: ${avgTimeMs.toFixed(1)}ms`);
mkdirSync(dirname(structuralReportPath), { recursive: true });
writeFileSync(structuralReportPath, structuralLines.join("\n"), "utf-8");

// --- Success criteria --------------------------------------------------------
const level1 = boundedGapSummary.improvedCount >= LEVEL1_MIN_IMPROVED;
const level2 = boundedGapSummary.regressionRateAmongActivated <= LEVEL2_MAX_REGRESSION_RATE;
const level3 = bounded75Summary.coverage >= LEVEL3_MIN_COVERAGE;

const failRegression = boundedGapSummary.regressionRateAmongActivated > LEVEL2_MAX_REGRESSION_RATE;
const failHardGapImprovedTooFew = boundedGapSummary.improvedCount < LEVEL1_MIN_IMPROVED;
const failAvgTimeTooHigh = boundedGapSummary.avgTimeMs > FAIL_MAX_AVG_TIME_MS;
const failNoCoverageIncrease = bounded75Summary.coverage <= cycleChase75Summary.coverage;
const failNoRealImprovement = boundedGapSummary.improvedCount <= cycleChaseGapSummary.improvedCount && bounded75Summary.coverage <= DOCUMENTED_CYCLECHASE_BASELINE;

// --- Final Report --------------------------------------------------------
const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
push("========================================");
push("Prototype Benchmark Report -- Solver v2 Primitive Prototype Sprint v1");
push("========================================");
push();
push(...formatComparisonTable([cycleChaseGapSummary, boundedGapSummary, cycleChase75Summary, bounded75Summary]));
push("--- 성공 기준 판정 ---");
push(`Level 1 (Hard Gap 29건 중 10건+ WrongWing 감소): ${level1 ? "PASS" : "FAIL"} (실제 ${boundedGapSummary.improvedCount}건)`);
push(`Level 2 (Regression 10% 이하): ${level2 ? "PASS" : "FAIL"} (실제 ${(boundedGapSummary.regressionRateAmongActivated * 100).toFixed(1)}%)`);
push(`Level 3 (Coverage 22.7% -> 32.7%+): ${level3 ? "PASS" : "FAIL"} (실제 ${(bounded75Summary.coverage * 100).toFixed(1)}%, CycleChase 재측정 ${(cycleChase75Summary.coverage * 100).toFixed(1)}%)`);
push();
push("--- 실패 조건 판정 ---");
push(`Regression > 10%: ${failRegression ? "해당" : "해당없음"}`);
push(`Hard Gap 개선 10건 미만: ${failHardGapImprovedTooFew ? "해당" : "해당없음"}`);
push(`평균 실행시간 500ms 초과: ${failAvgTimeTooHigh ? "해당" : "해당없음"} (실제 ${boundedGapSummary.avgTimeMs.toFixed(1)}ms)`);
push(`Coverage 증가 없음 (전체 75건 기준, CycleChase 재측정 대비): ${failNoCoverageIncrease ? "해당" : "해당없음"}`);
push(`기존 Primitive보다 실질적 개선 없음: ${failNoRealImprovement ? "해당" : "해당없음"}`);
push();
const overall = level1 && level2 && level3;
push(`=== 종합 판정: ${overall ? "성공 -- Bounded Multi-Cycle Resolver를 Solver v2 Candidate Primitive로 승격" : "실패 -- BP-1 폐기/보류, BP-2~BP-4 순차 검증"} ===`);
push(`제품 코드 통합 여부: 미통합 (spec -- 이번 Sprint는 Prototype 검증만 수행)`);

mkdirSync(dirname(finalReportPath), { recursive: true });
writeFileSync(finalReportPath, lines.join("\n"), "utf-8");
console.log("\n" + lines.join("\n"));
