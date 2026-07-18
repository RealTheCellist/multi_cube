// Solver v2 Primitive Prototype Sprint v2 -- driver.
//   npx tsx src/customCube/runParityAwarePrototype.ts [failuresDbPath] [deadlineMs]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildWingLibrary } from "./fiveByFiveEdges";
import { warmupFiveByFiveEdgeLibraries } from "./fiveByFiveEdgeSolverEngine";
import { profileAllReplays } from "./solverV2Research/GapDetector";
import { loadAll75, runBoundedResolverOn, runCycleChaseOn, runParityAwareOn, summarize } from "./solverV2PrototypeBP2/ReplayBenchmark";
import { formatComparisonTable, formatParityOutcomes } from "./solverV2PrototypeBP2/StructuralReporter";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const deadlineMs = Number(process.argv[3] ?? 500);

const structuralReportPath = "src/customCube/solverV2PrototypeBP2/data/structural-report.txt";
const finalReportPath = "src/customCube/solverV2PrototypeBP2/data/prototype-benchmark-report.txt";

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

console.log("\nSTEP 4: Replay Benchmark -- 3-way 비교");
console.log("  (a) Hard Gap 대상");
const cycleChaseOnGap = runCycleChaseOn(hardGapSnapshots, lib, deadlineMs);
const boundedOnGap = runBoundedResolverOn(hardGapSnapshots, lib, deadlineMs);
const parityOnGap = runParityAwareOn(hardGapSnapshots, lib, deadlineMs);
const cycleChaseGapSummary = summarize(`CycleChase (Hard Gap ${hardGapSnapshots.length}건)`, cycleChaseOnGap);
const boundedGapSummary = summarize(`Bounded Resolver (Hard Gap ${hardGapSnapshots.length}건)`, boundedOnGap);
const parityGapSummary = summarize(`Parity-Aware Cycle Breaker (Hard Gap ${hardGapSnapshots.length}건)`, parityOnGap);
console.log(`    CycleChase: 개선 ${cycleChaseGapSummary.improvedCount}건`);
console.log(`    Bounded:    개선 ${boundedGapSummary.improvedCount}건`);
console.log(`    ParityAware: 개선 ${parityGapSummary.improvedCount}건`);

console.log("  (b) 전체 75건 대상 (Level 3 Coverage 비교용)");
const cycleChaseOn75 = runCycleChaseOn(all75, lib, deadlineMs);
const boundedOn75 = runBoundedResolverOn(all75, lib, deadlineMs);
const parityOn75 = runParityAwareOn(all75, lib, deadlineMs);
const cycleChase75Summary = summarize("CycleChase (전체 75건)", cycleChaseOn75);
const bounded75Summary = summarize("Bounded Resolver (전체 75건)", boundedOn75);
const parity75Summary = summarize("Parity-Aware Cycle Breaker (전체 75건)", parityOn75);
console.log(`    CycleChase Coverage: ${(cycleChase75Summary.coverage * 100).toFixed(1)}%`);
console.log(`    Bounded Coverage:    ${(bounded75Summary.coverage * 100).toFixed(1)}%`);
console.log(`    ParityAware Coverage: ${(parity75Summary.coverage * 100).toFixed(1)}%`);

// --- STEP 5: Structural Report ------------------------------------------
const structuralLines: string[] = [];
const spush = (...s: string[]) => structuralLines.push(...(s.length ? s : [""]));
spush("========================================");
spush("Structural Report -- Solver v2 Primitive Prototype Sprint v2");
spush("========================================");
spush();
spush(...formatParityOutcomes(parityOnGap));
mkdirSync(dirname(structuralReportPath), { recursive: true });
writeFileSync(structuralReportPath, structuralLines.join("\n"), "utf-8");

// --- Success criteria -----------------------------------------------------
const level1 = parityGapSummary.improvedCount >= LEVEL1_MIN_IMPROVED;
const level2 = parityGapSummary.regressionRateAmongActivated <= LEVEL2_MAX_REGRESSION_RATE;
const level3 = parity75Summary.coverage >= LEVEL3_MIN_COVERAGE;

const failHardGapTooFew = parityGapSummary.improvedCount < LEVEL1_MIN_IMPROVED;
const failRegression = parityGapSummary.regressionRateAmongActivated > LEVEL2_MAX_REGRESSION_RATE;
const failNoCoverageIncrease = parity75Summary.coverage <= cycleChase75Summary.coverage;
const failAvgTimeTooHigh = parityGapSummary.avgTimeMs > FAIL_MAX_AVG_TIME_MS;
const failDestroysCycleMoreOften = parityGapSummary.cycleStructurePreservedRate < cycleChaseGapSummary.cycleStructurePreservedRate;

// --- Final Report -----------------------------------------------------------
const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
push("========================================");
push("Prototype Benchmark Report -- Solver v2 Primitive Prototype Sprint v2");
push("========================================");
push();
push(...formatComparisonTable([cycleChaseGapSummary, boundedGapSummary, parityGapSummary, cycleChase75Summary, bounded75Summary, parity75Summary]));
push("--- 성공 기준 판정 ---");
push(`Level 1 (Hard Gap 중 8건+ WrongWing 감소): ${level1 ? "PASS" : "FAIL"} (실제 ${parityGapSummary.improvedCount}건)`);
push(`Level 2 (Regression 10% 이하): ${level2 ? "PASS" : "FAIL"} (실제 ${(parityGapSummary.regressionRateAmongActivated * 100).toFixed(1)}%)`);
push(`Level 3 (Coverage 35% 이상): ${level3 ? "PASS" : "FAIL"} (실제 ${(parity75Summary.coverage * 100).toFixed(1)}%)`);
push();
push("--- 실패 조건 판정 ---");
push(`Hard Gap 개선 8건 미만: ${failHardGapTooFew ? "해당" : "해당없음"}`);
push(`Regression 10% 초과: ${failRegression ? "해당" : "해당없음"}`);
push(`Coverage 증가 없음 (CycleChase 대비): ${failNoCoverageIncrease ? "해당" : "해당없음"}`);
push(`평균 실행시간 500ms 초과: ${failAvgTimeTooHigh ? "해당" : "해당없음"} (실제 ${parityGapSummary.avgTimeMs.toFixed(1)}ms)`);
push(`Cycle 구조를 더 자주 파괴함 (CycleChase 대비 구조 보존율 낮음): ${failDestroysCycleMoreOften ? "해당" : "해당없음"} (ParityAware ${(parityGapSummary.cycleStructurePreservedRate * 100).toFixed(1)}% vs CycleChase ${(cycleChaseGapSummary.cycleStructurePreservedRate * 100).toFixed(1)}%)`);
push();
const overall = level1 && level2 && level3;
push(`=== 종합 판정: ${overall ? "성공 -- BP-2를 Solver v2 Candidate Primitive로 승격, BP-1과 A/B 진행" : "실패 -- BP-2 보류, 다음 Sprint에서 BP-3 검증"} ===`);
push(`제품 코드 통합 여부: 미통합 (spec -- 이번 Sprint는 Prototype 검증만 수행)`);

mkdirSync(dirname(finalReportPath), { recursive: true });
writeFileSync(finalReportPath, lines.join("\n"), "utf-8");
console.log("\n" + lines.join("\n"));
