// Parity-Gated Cycle Comparative Prototype Sprint v1 -- driver.
//   npx tsx src/customCube/runParityGatedCycleComparativePrototypeV1.ts
//
// Real implementation Sprint (unlike the prior Blueprint Sprint, which
// was design-only): implements the two Pareto-Frontier-tied candidates
// from Alternative Blueprint Sprint v1 (Dual Wing Bridge, Multi-Component
// Merge) as real Prototypes, benchmarks them (3 arms: Baseline/Dual/
// Multi) over the FULL 142-case Hole Dataset, runs Statistical
// Validation (95% CI, Cohen's d, all 3 pairwise comparisons), compares
// real Architecture Impact, and selects ONE candidate to converge the
// research line -- or concludes neither candidate is worth carrying
// forward. NO Production Solver file is touched. See
// docs/PARITY_GATED_CYCLE_COMPARATIVE_PROTOTYPE_V1.md for the full
// STEP1-6 narrative and Level1-3 + Decision A/B/C verdict.
import * as fs from "fs";
import { buildWingLibrary, buildFlipLibrary, buildCaseLibrary } from "./fiveByFiveEdges";
import { loadRawHoleDataset } from "./mechanismAnalysis/RawDatasetLoader";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
import { benchmarkPopulation, summarizeBenchmark } from "./solverPrimitiveParityComparativePrototype/CapabilityBenchmark";
import { runStatisticalValidation } from "./solverPrimitiveParityComparativePrototype/StatisticalValidation";
import { buildArchitectureImpactSummary } from "./solverPrimitiveParityComparativePrototype/ArchitectureImpact";
import { selectPrototype } from "./solverPrimitiveParityComparativePrototype/PrototypeSelection";

const DATA_DIR = "src/customCube/solverPrimitiveParityComparativePrototype/data";
const REPORT_PATH = `${DATA_DIR}/parity-gated-cycle-comparative-prototype-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/parity-gated-cycle-comparative-prototype-v1-result.json`;

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const libs: ExecutorLibraries = { lib: buildWingLibrary(), flipLib: buildFlipLibrary(), caseLib: buildCaseLibrary() };

  console.log("Loading Hole Dataset (loadRawHoleDataset(), unmodified -- full population, n=142)...");
  const holes = loadRawHoleDataset();

  console.log(`STEP1/2/3: Capability Benchmark (3-arm: Baseline/Dual Wing Bridge/Multi-Component Merge, real replay, n=${holes.length})...`);
  const perCase = benchmarkPopulation(holes, libs.lib);
  const benchmark = summarizeBenchmark(perCase);
  console.log(`  dualImproved=${benchmark.dualImprovedCount}/${benchmark.n}, dualRegression=${benchmark.dualRegressionCount}`);
  console.log(`  multiImproved=${benchmark.multiImprovedCount}/${benchmark.n}, multiRegression=${benchmark.multiRegressionCount}`);
  console.log(`  dualAvgRuntimeMs=${benchmark.dualAvgRuntimeMs.toFixed(1)}, multiAvgRuntimeMs=${benchmark.multiAvgRuntimeMs.toFixed(1)}`);
  console.log(`  dualMergeSuccessCount=${benchmark.dualMergeSuccessCount}, multiMergeStepsSucceededTotal=${benchmark.multiMergeStepsSucceededTotal}, multiComponentReductionTotal=${benchmark.multiComponentReductionTotal}`);

  console.log("STEP4: Statistical Validation (paired-diff, 95% CI, Cohen's d -- Dual vs Baseline, Multi vs Baseline, Dual vs Multi)...");
  const stats = runStatisticalValidation(perCase);
  for (const cmp of [stats.dualVsBaseline, stats.multiVsBaseline, stats.dualVsMulti]) {
    console.log(`  [${cmp.label}] improvedDiff mean=${cmp.improvedDiffStats.mean.toFixed(4)}, 95% CI=[${cmp.improvedDiffStats.ciLower.toFixed(4)}, ${cmp.improvedDiffStats.ciUpper.toFixed(4)}], Cohen's dz=${cmp.improvedDiffEffectSize.cohensD.toFixed(3)}(${cmp.improvedDiffEffectSize.magnitude})`);
  }

  console.log("STEP5: Architecture Impact (real code footprint + measured runtime)...");
  const impact = buildArchitectureImpactSummary(benchmark.dualAvgRuntimeMs, benchmark.multiAvgRuntimeMs);
  for (const i of impact) console.log(`  [${i.mechanismName}] lines=${i.codeFootprint.newFileLineCount}, reusesExistingGenerator=${i.codeFootprint.reusesExistingCandidateGenerator}, avgRuntimeMs=${i.avgRuntimeMs.toFixed(1)}`);

  console.log("STEP6: Prototype Selection...");
  const selection = selectPrototype(stats, benchmark, impact);
  console.log(`  finalDecision=${selection.finalDecision}`);
  console.log(`  rationale: ${selection.finalDecisionRationale}`);

  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push("=== Parity-Gated Cycle Comparative Prototype Sprint v1 -- Report ===");
  push();
  push(`Hole Dataset n=${holes.length} (full population, real replay, 3 arms: Baseline/Dual Wing Bridge/Multi-Component Merge)`);
  push();
  push("STEP1-3. Capability Benchmark");
  push(`  dualImprovedCount=${benchmark.dualImprovedCount}/${benchmark.n}, dualRegressionCount=${benchmark.dualRegressionCount}`);
  push(`  multiImprovedCount=${benchmark.multiImprovedCount}/${benchmark.n}, multiRegressionCount=${benchmark.multiRegressionCount}`);
  push(`  dualAvgRuntimeMs=${benchmark.dualAvgRuntimeMs.toFixed(1)}, multiAvgRuntimeMs=${benchmark.multiAvgRuntimeMs.toFixed(1)}`);
  push(`  dualAvgTraversalLeaves=${benchmark.dualAvgTraversalLeaves.toFixed(1)}, multiAvgTraversalLeaves=${benchmark.multiAvgTraversalLeaves.toFixed(1)}`);
  push(`  dualMergeSuccessCount=${benchmark.dualMergeSuccessCount}, multiMergeStepsSucceededTotal=${benchmark.multiMergeStepsSucceededTotal}, multiComponentReductionTotal=${benchmark.multiComponentReductionTotal}`);
  push();
  push("STEP4. Statistical Validation (paired-diff, 95% CI, Cohen's d)");
  for (const cmp of [stats.dualVsBaseline, stats.multiVsBaseline, stats.dualVsMulti]) {
    push(`  [${cmp.label}]`);
    push(`    improvedCountDiff: mean=${cmp.improvedDiffStats.mean.toFixed(4)}, stddev=${cmp.improvedDiffStats.stddev.toFixed(4)}, 95% CI=[${cmp.improvedDiffStats.ciLower.toFixed(4)}, ${cmp.improvedDiffStats.ciUpper.toFixed(4)}]`);
    push(`    Cohen's dz=${cmp.improvedDiffEffectSize.cohensD.toFixed(3)} (${cmp.improvedDiffEffectSize.magnitude})`);
    push(`    regressionCountDiff: mean=${cmp.regressionDiffStats.mean.toFixed(4)}, 95% CI=[${cmp.regressionDiffStats.ciLower.toFixed(4)}, ${cmp.regressionDiffStats.ciUpper.toFixed(4)}]`);
  }
  push();
  push("STEP5. Architecture Impact");
  for (const i of impact) {
    push(`  [${i.mechanismName}]`);
    push(`    newFileLineCount=${i.codeFootprint.newFileLineCount}, reusesExistingCandidateGenerator=${i.codeFootprint.reusesExistingCandidateGenerator}`);
    push(`    plannerFilesTouched=${i.codeFootprint.plannerFilesTouched}, recoveryFilesTouched=${i.codeFootprint.recoveryFilesTouched}`);
    push(`    avgRuntimeMs=${i.avgRuntimeMs.toFixed(1)}`);
    push(`    ${i.integrationDifficultyNote}`);
  }
  push();
  push("STEP6. Prototype Selection");
  push(`  dualSignificantlyBeatsBaseline=${selection.dualSignificantlyBeatsBaseline}`);
  push(`  multiSignificantlyBeatsBaseline=${selection.multiSignificantlyBeatsBaseline}`);
  push(`  dualVsMultiDistinguishable=${selection.dualVsMultiDistinguishable}`);
  push(`  winner=${selection.winner}`);
  push(`  finalDecision=${selection.finalDecision}`);
  push(`  rationale: ${selection.finalDecisionRationale}`);
  push(`  Level1(두 Prototype 구현 완료)=${selection.level1BothImplemented ? "PASS" : "FAIL"}`);
  push(`  Level2(통계적으로 비교 완료)=${selection.level2StatisticallyCompared ? "PASS" : "FAIL"}`);
  push(`  Level3(Production Integration 대상 하나 확정)=${selection.level3SingleTargetConfirmed ? "PASS" : "PARTIAL/FAIL(단일 후보로 확정되지 않음, rationale 참고)"}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        populationN: holes.length,
        perCase,
        benchmark,
        stats,
        impact,
        selection,
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`report written: ${REPORT_PATH}`);
  console.log(lines.join("\n"));
}

main();
