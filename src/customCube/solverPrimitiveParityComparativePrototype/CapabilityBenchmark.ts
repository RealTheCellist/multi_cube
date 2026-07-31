// --- CapabilityBenchmark (Parity-Gated Cycle Comparative Prototype
// Sprint v1, STEP3) -----------------------------------------------------------
// Real replay, 3 arms, over the FULL 142-case Hole Dataset (not just the
// 41 failure cases -- the Directive explicitly calls for "Hole Dataset
// 전체 Replay"): Baseline (no rescue attempt), Dual Wing Bridge, and
// Multi-Component Merge. Both Prototype arms are the SAME real
// implementations from STEP1/STEP2, called identically for every case.
import { wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { runDualWingBridgePipeline, type DualWingBridgePipelineResult } from "./DualWingBridgePrototype";
import { runMultiComponentMergePipeline, type MultiComponentMergePipelineResult } from "./MultiComponentMergePrototype";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export interface CaseBenchmarkResult {
  label: string;
  startingWrong: number;
  baselineWrong: number;
  dual: DualWingBridgePipelineResult;
  multi: MultiComponentMergePipelineResult;
  dualImproved: boolean;
  dualRegression: boolean;
  multiImproved: boolean;
  multiRegression: boolean;
}

export function benchmarkCase(hole: HoleCase, lib: WingLibrary): CaseBenchmarkResult {
  const startingWrong = wrongWingCount5(hole.cubies);
  const dual = runDualWingBridgePipeline(hole.cubies, lib);
  const multi = runMultiComponentMergePipeline(hole.cubies, lib);
  return {
    label: hole.label,
    startingWrong,
    baselineWrong: startingWrong,
    dual,
    multi,
    dualImproved: dual.finalWrong < startingWrong,
    dualRegression: dual.finalWrong > startingWrong,
    multiImproved: multi.finalWrong < startingWrong,
    multiRegression: multi.finalWrong > startingWrong,
  };
}

export function benchmarkPopulation(holes: readonly HoleCase[], lib: WingLibrary): CaseBenchmarkResult[] {
  return holes.map((h) => benchmarkCase(h, lib));
}

export interface BenchmarkSummary {
  n: number;
  dualImprovedCount: number;
  dualRegressionCount: number;
  multiImprovedCount: number;
  multiRegressionCount: number;
  dualAvgRuntimeMs: number;
  multiAvgRuntimeMs: number;
  dualAvgTraversalLeaves: number;
  multiAvgTraversalLeaves: number;
  dualMergeSuccessCount: number; // bridge-level merge (pre-traversal)
  multiMergeStepsSucceededTotal: number;
  multiComponentReductionTotal: number; // sum(componentCountBefore - componentCountAfter)
}

export function summarizeBenchmark(perCase: readonly CaseBenchmarkResult[]): BenchmarkSummary {
  const n = perCase.length;
  const sum = (f: (c: CaseBenchmarkResult) => number) => perCase.reduce((s, c) => s + f(c), 0);
  return {
    n,
    dualImprovedCount: perCase.filter((c) => c.dualImproved).length,
    dualRegressionCount: perCase.filter((c) => c.dualRegression).length,
    multiImprovedCount: perCase.filter((c) => c.multiImproved).length,
    multiRegressionCount: perCase.filter((c) => c.multiRegression).length,
    dualAvgRuntimeMs: n > 0 ? sum((c) => c.dual.runtimeMs) / n : 0,
    multiAvgRuntimeMs: n > 0 ? sum((c) => c.multi.runtimeMs) / n : 0,
    dualAvgTraversalLeaves: n > 0 ? sum((c) => c.dual.traversalLeavesExplored) / n : 0,
    multiAvgTraversalLeaves: n > 0 ? sum((c) => c.multi.traversalLeavesExplored) / n : 0,
    dualMergeSuccessCount: perCase.filter((c) => c.dual.mergeSuccess).length,
    multiMergeStepsSucceededTotal: sum((c) => c.multi.mergeStepsSucceeded),
    multiComponentReductionTotal: sum((c) => c.multi.componentCountBefore - c.multi.componentCountAfter),
  };
}
