// --- RuntimeContractEvaluation (ENDGAME Optimization Prototype Sprint v1,
// STEP3) ------------------------------------------------------------------
// Runtime Contract measurement over the FULL 335-snapshot population (a
// single real solve() pass per arm per snapshot -- population
// characterization, not a repeated stochastic comparison, matching this
// whole research arc's own established "full population for deterministic/
// population-level measurement, N=30-repeated subsample for stochastic
// comparison" split, e.g. Bottleneck Attribution Refinement Sprint v1's own
// Saturation Curve). Reuses ThreeArmBenchmark's own runOneTrial/summarizeTrial
// -- this Sprint's Runtime Contract IS a TrialAggregate, just computed once
// over the full population instead of a 75-snapshot subsample.
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { runOneTrial, summarizeTrial, type TrialAggregate, type ArmAggregate } from "./ThreeArmBenchmark";
import { FINAL_CONTRACT_RUNTIME_MS } from "./RuntimeContractConstants";

export interface RuntimeContractRow {
  armName: string;
  avgRuntimeMs: number;
  deadlineMissRate: number;
  endgameInvocationCount: number;
  avgEndgameRuntimeMs: number;
  withinRuntimeContract: boolean; // avgRuntimeMs <= expected max (562.4ms, Blueprint Sprint v1's own cited figure)
}

export interface RuntimeContractResult {
  populationSize: number;
  trial: TrialAggregate;
  rows: RuntimeContractRow[];
}

function toRow(armName: string, agg: ArmAggregate): RuntimeContractRow {
  return {
    armName,
    avgRuntimeMs: agg.avgWallMs,
    deadlineMissRate: agg.deadlineMissRate,
    endgameInvocationCount: agg.endgameInvokedCount,
    avgEndgameRuntimeMs: agg.avgEndgameRuntimeMs,
    withinRuntimeContract: agg.avgWallMs <= FINAL_CONTRACT_RUNTIME_MS,
  };
}

export function evaluateRuntimeContract(fullPopulation: readonly FailureSnapshot[]): RuntimeContractResult {
  const results = runOneTrial(fullPopulation);
  const trial = summarizeTrial(results);
  return {
    populationSize: fullPopulation.length,
    trial,
    rows: [toRow("Baseline", trial.baseline), toRow("ReservedSlice", trial.reservedSlice), toRow("Absorb", trial.absorb)],
  };
}
