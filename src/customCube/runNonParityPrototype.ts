// Solver v2 Primitive Prototype Sprint v3 (BP-3) -- driver.
//   npx tsx src/customCube/runNonParityPrototype.ts [failuresDbPath] [deadlineMs]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildWingLibrary } from "./fiveByFiveEdges";
import { warmupFiveByFiveEdgeLibraries } from "./fiveByFiveEdgeSolverEngine";
import { profileAllReplays } from "./solverV2Research/GapDetector";
import {
  loadAll75,
  runBoundedResolverOn,
  runCycleChaseOn,
  runNonParityStructuralOn,
  runParityAwareOn,
  summarize,
} from "./solverV2PrototypeBP3/ReplayBenchmark";
import { formatComparisonTable, formatNonParityOutcomes, formatRequiredSummaryTable } from "./solverV2PrototypeBP3/StructuralReporter";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const deadlineMs = Number(process.argv[3] ?? 500);

const structuralReportPath = "src/customCube/solverV2PrototypeBP3/data/structural-report.txt";
const finalReportPath = "src/customCube/solverV2PrototypeBP3/data/prototype-benchmark-report.txt";

const LEVEL1_MIN_IMPROVED = 8;
const LEVEL2_MAX_REGRESSION_RATE = 0.1;
const LEVEL3_MIN_COVERAGE = 0.35;
const FAIL_MAX_AVG_TIME_MS = 500;

console.log("STEP: 라이브러리 준비");
warmupFiveByFiveEdgeLibraries();
const lib = buildWingLibrary();

console.log("\nSTEP: Hard Gap Replay 재확인 (solverV2Research 재사용)");
const profiles = profileAllReplays(failuresDbPath, 300);
const hardGapHashes = new Set(profiles.filter((p) => p.isHardGap).map((p) => p.replayHash));
console.log(`  Hard Gap: ${hardGapHashes.size}건`);

const all75 = loadAll75(failuresDbPath);
const hardGapSnapshots = all75.filter((s) => hardGapHashes.has(s.hash));

console.log("\nSTEP 4: Replay Benchmark -- CycleChase / BP-1 / BP-2 / BP-3");
console.log("  (a) Hard Gap 대상");
const cycleChaseOnGap = runCycleChaseOn(hardGapSnapshots, lib, deadlineMs);
const boundedOnGap = runBoundedResolverOn(hardGapSnapshots, lib, deadlineMs);
const parityOnGap = runParityAwareOn(hardGapSnapshots, lib, deadlineMs);
const structuralOnGap = runNonParityStructuralOn(hardGapSnapshots, lib, deadlineMs);
const cycleChaseGapSummary = summarize(`CycleChase (Hard Gap ${hardGapSnapshots.length}건)`, cycleChaseOnGap);
const bp1GapSummary = summarize(`BP-1 Bounded Resolver (Hard Gap ${hardGapSnapshots.length}건)`, boundedOnGap);
const bp2GapSummary = summarize(`BP-2 Parity-Aware (Hard Gap ${hardGapSnapshots.length}건)`, parityOnGap);
const bp3GapSummary = summarize(`BP-3 Non-Parity Structural Fix (Hard Gap ${hardGapSnapshots.length}건)`, structuralOnGap);
console.log(`    CycleChase:  개선 ${cycleChaseGapSummary.improvedCount}건`);
console.log(`    BP-1:        개선 ${bp1GapSummary.improvedCount}건`);
console.log(`    BP-2:        개선 ${bp2GapSummary.improvedCount}건`);
console.log(`    BP-3:        개선 ${bp3GapSummary.improvedCount}건`);

console.log("  (b) 전체 75건 대상 (Level 3 Coverage 비교용)");
const cycleChaseOn75 = runCycleChaseOn(all75, lib, deadlineMs);
const boundedOn75 = runBoundedResolverOn(all75, lib, deadlineMs);
const parityOn75 = runParityAwareOn(all75, lib, deadlineMs);
const structuralOn75 = runNonParityStructuralOn(all75, lib, deadlineMs);
const cycleChase75Summary = summarize("CycleChase (전체 75건)", cycleChaseOn75);
const bp1_75Summary = summarize("BP-1 Bounded Resolver (전체 75건)", boundedOn75);
const bp2_75Summary = summarize("BP-2 Parity-Aware (전체 75건)", parityOn75);
const bp3_75Summary = summarize("BP-3 Non-Parity Structural Fix (전체 75건)", structuralOn75);
console.log(`    CycleChase Coverage: ${(cycleChase75Summary.coverage * 100).toFixed(1)}%`);
console.log(`    BP-1 Coverage:       ${(bp1_75Summary.coverage * 100).toFixed(1)}%`);
console.log(`    BP-2 Coverage:       ${(bp2_75Summary.coverage * 100).toFixed(1)}%`);
console.log(`    BP-3 Coverage:       ${(bp3_75Summary.coverage * 100).toFixed(1)}%`);

// --- STEP 5: Structural Report ------------------------------------------
const structuralLines: string[] = [];
const spush = (...s: string[]) => structuralLines.push(...(s.length ? s : [""]));
spush("========================================");
spush("Structural Report -- Solver v2 Primitive Prototype Sprint v3 (BP-3)");
spush("========================================");
spush();
spush(...formatNonParityOutcomes(structuralOnGap));
mkdirSync(dirname(structuralReportPath), { recursive: true });
writeFileSync(structuralReportPath, structuralLines.join("\n"), "utf-8");

// --- Success criteria -----------------------------------------------------
const level1 = bp3GapSummary.improvedCount >= LEVEL1_MIN_IMPROVED;
const level2 = bp3GapSummary.regressionRateAmongActivated <= LEVEL2_MAX_REGRESSION_RATE;
const level3 = bp3_75Summary.coverage >= LEVEL3_MIN_COVERAGE;

const failHardGapTooFew = bp3GapSummary.improvedCount < LEVEL1_MIN_IMPROVED;
const failRegression = bp3GapSummary.regressionRateAmongActivated > LEVEL2_MAX_REGRESSION_RATE;
const failNoCoverageIncrease = bp3_75Summary.coverage <= cycleChase75Summary.coverage;
const failAvgTimeTooHigh = bp3GapSummary.avgTimeMs > FAIL_MAX_AVG_TIME_MS;
// "기존 Primitive보다 구조 보존율 악화" -- compared against the AVERAGE of
// the three existing Primitives' own preserved rate (CycleChase/BP-1/BP-2),
// a single disclosed baseline rather than cherry-picking the easiest one.
const existingAvgPreservedRate = (cycleChaseGapSummary.cycleStructurePreservedRate + bp1GapSummary.cycleStructurePreservedRate + bp2GapSummary.cycleStructurePreservedRate) / 3;
const failDestroysStructureMoreOften = bp3GapSummary.cycleStructurePreservedRate < existingAvgPreservedRate;

// --- Final Report -----------------------------------------------------------
const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
push("========================================");
push("Prototype Benchmark Report -- Solver v2 Primitive Prototype Sprint v3 (BP-3)");
push("========================================");
push();
push(...formatRequiredSummaryTable(cycleChaseGapSummary, bp1GapSummary, bp2GapSummary, bp3GapSummary));
push();
push(...formatComparisonTable([cycleChaseGapSummary, bp1GapSummary, bp2GapSummary, bp3GapSummary, cycleChase75Summary, bp1_75Summary, bp2_75Summary, bp3_75Summary]));
push("--- 성공 기준 판정 ---");
push(`Level 1 (Hard Gap 중 8건+ WrongWing 감소): ${level1 ? "PASS" : "FAIL"} (실제 ${bp3GapSummary.improvedCount}건)`);
push(`Level 2 (Regression 10% 이하): ${level2 ? "PASS" : "FAIL"} (실제 ${(bp3GapSummary.regressionRateAmongActivated * 100).toFixed(1)}%)`);
push(`Level 3 (Coverage 35% 이상): ${level3 ? "PASS" : "FAIL"} (실제 ${(bp3_75Summary.coverage * 100).toFixed(1)}%)`);
push();
push("--- 실패 조건 판정 ---");
push(`Hard Gap 개선 8건 미만: ${failHardGapTooFew ? "해당" : "해당없음"}`);
push(`Regression 10% 초과: ${failRegression ? "해당" : "해당없음"}`);
push(`Coverage 증가 없음 (CycleChase 대비): ${failNoCoverageIncrease ? "해당" : "해당없음"} (BP-3 ${(bp3_75Summary.coverage * 100).toFixed(1)}% vs CycleChase ${(cycleChase75Summary.coverage * 100).toFixed(1)}%)`);
push(`평균 실행시간 500ms 초과: ${failAvgTimeTooHigh ? "해당" : "해당없음"} (실제 ${bp3GapSummary.avgTimeMs.toFixed(1)}ms)`);
push(`기존 Primitive보다 구조 보존율 악화: ${failDestroysStructureMoreOften ? "해당" : "해당없음"} (BP-3 ${(bp3GapSummary.cycleStructurePreservedRate * 100).toFixed(1)}% vs 기존 평균 ${(existingAvgPreservedRate * 100).toFixed(1)}%)`);
push();
const overall = level1 && level2 && level3;
push(`=== 종합 판정: ${overall ? "성공 -- BP-3를 Solver v2 Candidate Primitive로 승격" : "실패 -- BP-3는 Prototype 상태로만 유지, 다음 Sprint는 BP-4 검증"} ===`);
push(`제품 코드 통합 여부: 미통합 (spec -- 이번 Sprint는 Prototype 검증만 수행)`);

mkdirSync(dirname(finalReportPath), { recursive: true });
writeFileSync(finalReportPath, lines.join("\n"), "utf-8");
console.log("\n" + lines.join("\n"));
