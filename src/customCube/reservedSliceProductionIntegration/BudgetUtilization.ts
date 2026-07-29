// --- BudgetUtilization (CONFLICT_DEEP_DEPENDENCY Reserved Slice Production
// Integration Sprint v1, STEP5/6) -------------------------------------------
// Reuses the disclosed convention established in the preceding Budget &
// Scheduling Validation Sprint v1's own DoseResponseAnalysis.ts: Reserved
// Budget Utilization = elapsed/reservationMs, Timeout Rate = elapsed >=
// TIMEOUT_FRACTION*reservationMs. Applied here to the REAL Production
// candidateTimeMs whenever SETUP was the CHOSEN candidate (the only
// observable signal available from the Recovery layer's own attemptRecovery()
// call -- attemptRecovery times the WHOLE candidate-generation+retry round
// trip, not genSetup() in isolation, so this is a conservative upper bound
// on SETUP's own reserved-slice utilization, not an exact isolated reading).
import { SETUP_RESERVED_SLICE_MS_FOR_REPORT } from "./ProductionContractConstants";
import type { RunRecord } from "./RecoveryLevelCollector";

export const TIMEOUT_FRACTION = 0.9;

export interface RuntimeDistribution {
  n: number;
  avgMs: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
}

function computeDistribution(values: readonly number[]): RuntimeDistribution {
  if (values.length === 0) return { n: 0, avgMs: 0, medianMs: 0, p95Ms: 0, maxMs: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  const max = sorted[sorted.length - 1];
  return { n: sorted.length, avgMs: avg, medianMs: median, p95Ms: p95, maxMs: max };
}

export interface BudgetUtilizationResult {
  baselineRuntimeDistribution: RuntimeDistribution;
  candidateRuntimeDistribution: RuntimeDistribution;
  setupChosenCandidateTimeMsDistribution: RuntimeDistribution; // only rows where candidateChosenType==="SETUP"
  setupChosenCount: number;
  avgReservedBudgetUtilization: number; // avg(candidateTimeMs when SETUP chosen)/SETUP_RESERVED_SLICE_MS_FOR_REPORT
  timeoutRate: number; // fraction of SETUP-chosen rows where candidateTimeMs >= TIMEOUT_FRACTION*SETUP_RESERVED_SLICE_MS_FOR_REPORT
}

export function computeBudgetUtilization(runs: readonly RunRecord[]): BudgetUtilizationResult {
  const allBaselineTimes: number[] = [];
  const allCandidateTimes: number[] = [];
  const setupChosenTimes: number[] = [];
  for (const run of runs) {
    for (const r of run) {
      allBaselineTimes.push(r.baselineTimeMs);
      allCandidateTimes.push(r.candidateTimeMs);
      if (r.candidateChosenType === "SETUP") setupChosenTimes.push(r.candidateTimeMs);
    }
  }
  const setupChosenCandidateTimeMsDistribution = computeDistribution(setupChosenTimes);
  const avgReservedBudgetUtilization = setupChosenTimes.length ? setupChosenCandidateTimeMsDistribution.avgMs / SETUP_RESERVED_SLICE_MS_FOR_REPORT : 0;
  const timeoutRate = setupChosenTimes.length ? setupChosenTimes.filter((t) => t >= TIMEOUT_FRACTION * SETUP_RESERVED_SLICE_MS_FOR_REPORT).length / setupChosenTimes.length : 0;
  return {
    baselineRuntimeDistribution: computeDistribution(allBaselineTimes),
    candidateRuntimeDistribution: computeDistribution(allCandidateTimes),
    setupChosenCandidateTimeMsDistribution,
    setupChosenCount: setupChosenTimes.length,
    avgReservedBudgetUtilization,
    timeoutRate,
  };
}
