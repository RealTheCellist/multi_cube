// Solver Primitive Refinement Sprint #1 -- Bridge Injection Refinement
// Sprint v1 -- driver.
//   npx tsx src/customCube/runBridgeInjectionRefinementV1.ts
//
// No new Primitive designed. Only sweeps the existing Multi-Hop Bridge
// Prototype's (solverPrimitivePrototype/MultiHopBridgePrototype.ts,
// solverV2Prototype/BoundedResolver.ts) Gate and Search Contract
// parameters via disclosed-duplicate parameterized copies (this Sprint's
// own bridgeInjectionRefinementV1/ modules) -- neither original file is
// modified. Fast: direct per-case algorithm calls (~ms), not full solve()
// loops -- no long background run needed.
import * as fs from "fs";
import { buildWingLibrary } from "./fiveByFiveEdges";
import { loadTargetPopulation, splitPopulation } from "./bridgeInjectionRefinementV1/TargetPopulation";
import { GATE_SWEEP_CONFIGS, BASELINE_GATE, tryMultiHopBridgeConfigured, type GateConfig } from "./bridgeInjectionRefinementV1/GateSweepSimulator";
import { SEARCH_CONTRACT_SWEEP_CONFIGS, BASELINE_SEARCH_CONTRACT, type SearchContractConfig } from "./bridgeInjectionRefinementV1/SearchContractSweepSimulator";
import { buildCombinedTrial } from "./bridgeInjectionRefinementV1/CombinedTrial";
import { evaluatePopulation, summarizeOutcomes, type EvaluationSummary, type CaseOutcome } from "./bridgeInjectionRefinementV1/EvaluationRunner";
import { buildPairedComparison, runValidationFramework } from "./bridgeInjectionRefinementV1/StatisticalValidation";

const DATA_DIR = "src/customCube/bridgeInjectionRefinementV1/data";
const REPORT_PATH = `${DATA_DIR}/bridge-injection-refinement-v1-report.txt`;
const RESULT_JSON_PATH = `${DATA_DIR}/bridge-injection-refinement-v1-result.json`;
const DEADLINE_MS = 400; // matches PrototypeBenchmark.ts's own PROTOTYPE_DEADLINE_MS

function rankByGapRescue(summaries: EvaluationSummary[]): EvaluationSummary[] {
  return [...summaries].sort((a, b) => b.gapRescueRate - a.gapRescueRate || a.trueRegressionCount - b.trueRegressionCount || a.avgRuntimeMsAmongMatched - b.avgRuntimeMsAmongMatched);
}

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const lib = buildWingLibrary();

  console.log("Loading 142-case Hole Dataset (v4, unmodified, same as Discovery Sprint #4)...");
  const allCases = loadTargetPopulation();
  const { target, rest } = splitPopulation(allCases);
  console.log(`  target(Bridge Injection, disconnectedGraph=true)=${target.length}, rest=${rest.length}, total=${allCases.length}`);

  // STEP1: Baseline reproduction (real v2 prototype: BASELINE_GATE + BASELINE_SEARCH_CONTRACT)
  console.log("STEP1: Baseline reproduction...");
  const baselineTrial = buildCombinedTrial(BASELINE_GATE, BASELINE_SEARCH_CONTRACT);
  const baselineOutcomesTarget = evaluatePopulation(target, lib, DEADLINE_MS, baselineTrial);
  const baselineOutcomesFull = evaluatePopulation(allCases, lib, DEADLINE_MS, baselineTrial);
  const baselineSummaryTarget = summarizeOutcomes(BASELINE_GATE.label, baselineOutcomesTarget);
  const baselineSummaryFull = summarizeOutcomes(BASELINE_GATE.label, baselineOutcomesFull);
  console.log(`  target: Coverage=${(baselineSummaryTarget.coverage * 100).toFixed(1)}%, Precision=${(baselineSummaryTarget.precision * 100).toFixed(1)}%, GapRescue=${(baselineSummaryTarget.gapRescueRate * 100).toFixed(1)}%, avgRuntime=${baselineSummaryTarget.avgRuntimeMsAmongMatched.toFixed(1)}ms`);
  console.log(`  full(142): GapRescue=${(baselineSummaryFull.gapRescueRate * 100).toFixed(1)}%, trueRegression=${baselineSummaryFull.trueRegressionCount}`);

  // STEP2: Gate Sweep (target population, holding Search Contract at baseline)
  console.log("STEP2: Gate Sweep...");
  const gateSweepResults = GATE_SWEEP_CONFIGS.map((cfg: GateConfig) => {
    const trial = tryMultiHopBridgeConfigured;
    const outcomesTarget = evaluatePopulation(target, lib, DEADLINE_MS, (c, l, d) => trial(c, l, d, cfg));
    const outcomesFull = evaluatePopulation(allCases, lib, DEADLINE_MS, (c, l, d) => trial(c, l, d, cfg));
    return { config: cfg, summaryTarget: summarizeOutcomes(cfg.label, outcomesTarget), summaryFull: summarizeOutcomes(cfg.label, outcomesFull) };
  });
  for (const r of gateSweepResults) {
    console.log(`  [${r.config.label}] target GapRescue=${(r.summaryTarget.gapRescueRate * 100).toFixed(1)}%, Coverage=${(r.summaryTarget.coverage * 100).toFixed(1)}%, full trueRegression=${r.summaryFull.trueRegressionCount}`);
  }
  const bestGate = rankByGapRescue(gateSweepResults.map((r) => r.summaryTarget))[0];
  const bestGateConfig = gateSweepResults.find((r) => r.summaryTarget.configLabel === bestGate.configLabel)!.config;
  console.log(`  Best Gate config: ${bestGateConfig.label}`);

  // STEP3: Search Contract Sweep (target population, holding Gate at baseline)
  console.log("STEP3: Search Contract Sweep...");
  const searchSweepResults = SEARCH_CONTRACT_SWEEP_CONFIGS.map((cfg: SearchContractConfig) => {
    const trial = buildCombinedTrial(BASELINE_GATE, cfg);
    const outcomesTarget = evaluatePopulation(target, lib, DEADLINE_MS, trial);
    const outcomesFull = evaluatePopulation(allCases, lib, DEADLINE_MS, trial);
    return { config: cfg, summaryTarget: summarizeOutcomes(cfg.label, outcomesTarget), summaryFull: summarizeOutcomes(cfg.label, outcomesFull) };
  });
  for (const r of searchSweepResults) {
    console.log(`  [${r.config.label}] target GapRescue=${(r.summaryTarget.gapRescueRate * 100).toFixed(1)}%, avgRuntime=${r.summaryTarget.avgRuntimeMsAmongMatched.toFixed(1)}ms, full trueRegression=${r.summaryFull.trueRegressionCount}`);
  }
  const bestSearch = rankByGapRescue(searchSweepResults.map((r) => r.summaryTarget))[0];
  const bestSearchConfig = searchSweepResults.find((r) => r.summaryTarget.configLabel === bestSearch.configLabel)!.config;
  console.log(`  Best Search Contract config: ${bestSearchConfig.label}`);

  // STEP4: Capability Benchmark -- combine best Gate + best Search Contract, compare vs Baseline over FULL population
  console.log("STEP4: Capability Benchmark (combined candidate vs baseline, full 142-case population)...");
  const candidateTrial = buildCombinedTrial(bestGateConfig, bestSearchConfig);
  const candidateOutcomesFull: CaseOutcome[] = evaluatePopulation(allCases, lib, DEADLINE_MS, candidateTrial);
  const candidateSummaryFull = summarizeOutcomes(`combined(${bestGateConfig.label} + ${bestSearchConfig.label})`, candidateOutcomesFull);
  console.log(`  Baseline: GapRescue=${(baselineSummaryFull.gapRescueRate * 100).toFixed(1)}%, Coverage=${(baselineSummaryFull.coverage * 100).toFixed(1)}%, trueRegression=${baselineSummaryFull.trueRegressionCount}`);
  console.log(`  Candidate: GapRescue=${(candidateSummaryFull.gapRescueRate * 100).toFixed(1)}%, Coverage=${(candidateSummaryFull.coverage * 100).toFixed(1)}%, trueRegression=${candidateSummaryFull.trueRegressionCount}`);

  // STEP5: Statistical Validation
  console.log("STEP5: Statistical Validation (paired-diff, n=142, Validation Framework)...");
  const comparison = buildPairedComparison(baselineOutcomesFull, candidateOutcomesFull);
  const validation = runValidationFramework(comparison);
  console.log(`  improvedCountDiff mean=${comparison.improvedCountDiffEvaluation.stats.mean.toFixed(4)}, 95% CI=[${comparison.improvedCountDiffEvaluation.stats.ciLower.toFixed(4)}, ${comparison.improvedCountDiffEvaluation.stats.ciUpper.toFixed(4)}], Cohen's d=${comparison.improvedCountDiffEvaluation.effectSize.cohensD.toFixed(3)}(${comparison.improvedCountDiffEvaluation.effectSize.magnitude})`);
  for (const g of validation.gateResults) console.log(`  [Gate ${g.gate}][${g.status}] ${g.name}: ${g.evidence}`);
  console.log(`  Pipeline Decision: ${validation.pipelineResult.decision} -- ${validation.pipelineResult.decisionRationale}`);

  // STEP6: Refinement Decision
  const level1 = comparison.improvedCountDiffEvaluation.stats.mean > 0;
  const level2 = validation.gateResults.find((g) => g.gate === "A")!.status === "PASS";
  const level3 = comparison.improvedCountDiffEvaluation.stats.ciLower > 0;

  let decision: "A" | "B" | "C";
  if (level1 && level2 && level3) decision = "A";
  else if (level1 && level2) decision = "B";
  else decision = "C";

  const lines: string[] = [];
  const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));

  push("Solver Primitive Refinement Sprint #1 -- Bridge Injection Refinement Sprint v1 -- Report");
  push(`Generated: ${new Date().toISOString()}`);
  push(`Population: 142 cases (v4, unmodified) -- target(Bridge Injection cluster)=${target.length}, rest=${rest.length}`);
  push();

  push("STEP1. Baseline Reproduction (real MultiHopBridgePrototype.ts + BoundedResolver.ts, unmodified)");
  push(`  Target cluster(n=${target.length}): Coverage=${(baselineSummaryTarget.coverage * 100).toFixed(1)}%, Precision=${(baselineSummaryTarget.precision * 100).toFixed(1)}%, Gap Rescue=${(baselineSummaryTarget.gapRescueRate * 100).toFixed(1)}%, avgRuntime=${baselineSummaryTarget.avgRuntimeMsAmongMatched.toFixed(1)}ms, trueRegression=${baselineSummaryTarget.trueRegressionCount}`);
  push(`  Full population(n=${allCases.length}): Coverage=${(baselineSummaryFull.coverage * 100).toFixed(1)}%, Gap Rescue=${(baselineSummaryFull.gapRescueRate * 100).toFixed(1)}%, trueRegression=${baselineSummaryFull.trueRegressionCount}`);
  push();

  push("STEP2. Gate Sweep (target cluster, Search Contract held at baseline)");
  for (const r of gateSweepResults) {
    push(`  [${r.config.label}] Coverage=${(r.summaryTarget.coverage * 100).toFixed(1)}%, Precision=${(r.summaryTarget.precision * 100).toFixed(1)}%, Gap Rescue=${(r.summaryTarget.gapRescueRate * 100).toFixed(1)}%, avgRuntime=${r.summaryTarget.avgRuntimeMsAmongMatched.toFixed(1)}ms | full population trueRegression=${r.summaryFull.trueRegressionCount}`);
  }
  push(`  Best: ${bestGateConfig.label}`);
  push();

  push("STEP3. Search Contract Sweep (target cluster, Gate held at baseline)");
  for (const r of searchSweepResults) {
    push(`  [${r.config.label}] Coverage=${(r.summaryTarget.coverage * 100).toFixed(1)}%, Precision=${(r.summaryTarget.precision * 100).toFixed(1)}%, Gap Rescue=${(r.summaryTarget.gapRescueRate * 100).toFixed(1)}%, avgRuntime=${r.summaryTarget.avgRuntimeMsAmongMatched.toFixed(1)}ms | full population trueRegression=${r.summaryFull.trueRegressionCount}`);
  }
  push(`  Best: ${bestSearchConfig.label}`);
  push();

  push("STEP4. Capability Benchmark (Baseline vs Candidate=Best Gate + Best Search Contract, full 142-population)");
  push(`  Baseline:  Coverage=${(baselineSummaryFull.coverage * 100).toFixed(1)}%, Precision=${(baselineSummaryFull.precision * 100).toFixed(1)}%, Gap Rescue=${(baselineSummaryFull.gapRescueRate * 100).toFixed(1)}%, avgRuntime=${baselineSummaryFull.avgRuntimeMsAmongMatched.toFixed(1)}ms, trueRegression=${baselineSummaryFull.trueRegressionCount}`);
  push(`  Candidate: Coverage=${(candidateSummaryFull.coverage * 100).toFixed(1)}%, Precision=${(candidateSummaryFull.precision * 100).toFixed(1)}%, Gap Rescue=${(candidateSummaryFull.gapRescueRate * 100).toFixed(1)}%, avgRuntime=${candidateSummaryFull.avgRuntimeMsAmongMatched.toFixed(1)}ms, trueRegression=${candidateSummaryFull.trueRegressionCount}`);
  push();

  push("STEP5. Statistical Validation (paired-diff, n=142 -- deterministic mechanism, disclosed: population IS the N, no repeat-count needed)");
  push(
    `  improvedCountDiff(Candidate-Baseline): mean=${comparison.improvedCountDiffEvaluation.stats.mean.toFixed(4)}, 95% CI=[${comparison.improvedCountDiffEvaluation.stats.ciLower.toFixed(4)}, ${comparison.improvedCountDiffEvaluation.stats.ciUpper.toFixed(4)}], Cohen's d_z=${comparison.improvedCountDiffEvaluation.effectSize.cohensD.toFixed(3)}(${comparison.improvedCountDiffEvaluation.effectSize.magnitude})`
  );
  push(`  runtimeDiffMs(Candidate-Baseline): mean=${comparison.runtimeDiffMsEvaluation.stats.mean.toFixed(2)}, 95% CI=[${comparison.runtimeDiffMsEvaluation.stats.ciLower.toFixed(2)}, ${comparison.runtimeDiffMsEvaluation.stats.ciUpper.toFixed(2)}]`);
  push(`  trueRegressionDiff(Candidate-Baseline): mean=${comparison.trueRegressionDiffEvaluation.stats.mean.toFixed(4)}`);
  for (const g of validation.gateResults) push(`  [Gate ${g.gate}][${g.status}] ${g.name}: ${g.evidence}`);
  push(`  Category C(New Primitive)/prototype-stage Pipeline Decision: ${validation.pipelineResult.decision} -- ${validation.pipelineResult.decisionRationale}`);
  push();

  push("STEP6. Refinement Decision");
  push(`  Level1(Capability 증가, improvedCountDiff mean>0): ${level1 ? "PASS" : "FAIL"}`);
  push(`  Level2(Regression 증가 없음, Gate A PASS): ${level2 ? "PASS" : "FAIL"}`);
  push(`  Level3(통계적으로 유의한 개선, CI 하한>0): ${level3 ? "PASS" : "FAIL"}`);
  push(`  Decision: ${decision}`);

  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  fs.writeFileSync(
    RESULT_JSON_PATH,
    JSON.stringify(
      {
        baselineSummaryTarget,
        baselineSummaryFull,
        gateSweepResults: gateSweepResults.map((r) => ({ label: r.config.label, target: r.summaryTarget, full: r.summaryFull })),
        searchSweepResults: searchSweepResults.map((r) => ({ label: r.config.label, target: r.summaryTarget, full: r.summaryFull })),
        bestGateConfig,
        bestSearchConfig,
        candidateSummaryFull,
        comparison,
        gateResults: validation.gateResults,
        pipelineResult: validation.pipelineResult,
        levels: { level1, level2, level3 },
        decision,
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
