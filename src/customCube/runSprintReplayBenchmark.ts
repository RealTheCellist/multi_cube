// Solver Core Improvement Sprint v1 -- STEP 3: Replay Benchmark.
// Runs RawBaseline (existing tryFixWing) vs PairPreserving (tryFixWingPP)
// against the representative Failure Replay Dataset, plus ExistingSolver/
// Empty for context, via the Algorithm Experiment Framework.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ExperimentRegistry } from "./algorithmExperiment/ExperimentRegistry";
import { ExistingSolverExperiment } from "./algorithmExperiment/experiments/ExistingSolverExperiment";
import { EmptyExperiment } from "./algorithmExperiment/experiments/EmptyExperiment";
import { RawBaselineExperiment } from "./algorithmExperiment/experiments/RawBaselineExperiment";
import { PairPreservingExperiment } from "./algorithmExperiment/experiments/PairPreservingExperiment";
import { runBenchmark } from "./algorithmExperiment/BenchmarkRunner";
import { generateReport, summarizeBenchmark } from "./algorithmExperiment/ExperimentReport";

const dbPath = "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/algorithmExperiment/data/sprint-replay-report.txt";

const registry = new ExperimentRegistry();
registry.register(new ExistingSolverExperiment());
registry.register(new EmptyExperiment());
registry.register(new RawBaselineExperiment());
registry.register(new PairPreservingExperiment());

const benchmark = runBenchmark(registry, { dbPath, datasetSize: 75, autoGrow: false });
const report = generateReport(benchmark);
console.log(report);

const summaries = summarizeBenchmark(benchmark);
const raw = summaries.find((s) => s.name === "RawBaseline")!;
const pp = summaries.find((s) => s.name === "PairPreserving")!;

console.log("\n=== STEP 3 판정 (RawBaseline vs PairPreserving) ===");
console.log(`Replay 성공 (완전 해결): RawBaseline ${raw.solvedCount}/${raw.totalRuns}  vs  PairPreserving ${pp.solvedCount}/${pp.totalRuns}`);
console.log(`평균 WrongWing:         RawBaseline ${raw.avgWrongWingAfter.toFixed(2)}  vs  PairPreserving ${pp.avgWrongWingAfter.toFixed(2)}`);
const wrongWingChangePct = ((raw.avgWrongWingAfter - pp.avgWrongWingAfter) / raw.avgWrongWingAfter) * 100;
console.log(`  -> ${wrongWingChangePct >= 0 ? "감소" : "증가"} ${Math.abs(wrongWingChangePct).toFixed(1)}%`);
console.log(`평균 Pair:              RawBaseline ${raw.avgPairAfter.toFixed(2)}  vs  PairPreserving ${pp.avgPairAfter.toFixed(2)}`);
console.log(`평균 Move:              RawBaseline ${raw.avgMoveCount.toFixed(1)}  vs  PairPreserving ${pp.avgMoveCount.toFixed(1)}`);
console.log(`평균 시간:              RawBaseline ${raw.avgElapsedMs.toFixed(0)}ms  vs  PairPreserving ${pp.avgElapsedMs.toFixed(0)}ms`);

const solvedImproved = pp.solvedCount > raw.solvedCount;
const wrongWingImproved5pct = wrongWingChangePct >= 5;
const pairImprovedSameTime = pp.avgPairAfter > raw.avgPairAfter && pp.avgElapsedMs <= raw.avgElapsedMs * 1.05;
const anySuccess = solvedImproved || wrongWingImproved5pct || pairImprovedSameTime;

console.log(`\n① 더 많은 Failure 해결: ${solvedImproved ? "YES" : "no"}`);
console.log(`② 평균 WrongWing 5%+ 감소: ${wrongWingImproved5pct ? "YES" : "no"} (${wrongWingChangePct.toFixed(1)}%)`);
console.log(`③ 완전 해결률 증가: ${solvedImproved ? "YES" : "no"}`);
console.log(`④ 동일 시간 내 Pair 유지율 개선: ${pairImprovedSameTime ? "YES" : "no"}`);
console.log(`\n=> Replay 결과: ${anySuccess ? "개선 확인 -- STEP 4 (100 Scramble Benchmark) 진행" : "개선 없음 -- 즉시 폐기 (필수 규칙)"}`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, report, "utf-8");
