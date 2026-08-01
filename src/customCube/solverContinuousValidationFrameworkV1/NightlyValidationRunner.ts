// --- NightlyValidationRunner (Continuous Validation Framework Sprint
// v1, STEP2) --------------------------------------------------------------
// Real, runnable single "Nightly Validation" pass: one full 142-case real
// solve() E2E population replay (disclosed reuse of
// solverLongTermReliabilityValidationV1/PopulationReplay.ts, not
// duplicated), reduced to the metric set the Dashboard(STEP3) accumulates.
// This module does NOT itself schedule anything -- it is the unit of work
// a real scheduler (this Sprint's own STEP2 design note, or an actual
// cron/Routine set up separately with explicit user confirmation) would
// invoke once per period.
import { runPopulationReplay, type ReplayRow } from "../solverLongTermReliabilityValidationV1/PopulationReplay";
import { summarizeRuntimeDistribution } from "../solverLongTermReliabilityValidationV1/RuntimeDistribution";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export interface NightlyValidationRunResult {
  runId: string;
  startedAt: string;
  finishedAt: string;
  rows: ReplayRow[];
  solveCount: number; // n
  improvedCount: number;
  solvedCount: number;
  runtimeMeanMs: number;
  runtimeP50Ms: number;
  runtimeP95Ms: number;
  runtimeMaxMs: number;
  deadlineMissCount: number;
}

export function runNightlyValidation(holes: readonly HoleCase[], runId: string): NightlyValidationRunResult {
  const startedAt = new Date().toISOString();
  const rows = runPopulationReplay(holes);
  const finishedAt = new Date().toISOString();
  const runtime = summarizeRuntimeDistribution(rows);

  return {
    runId,
    startedAt,
    finishedAt,
    rows,
    solveCount: rows.length,
    improvedCount: rows.filter((r) => r.result.improved).length,
    solvedCount: rows.filter((r) => r.result.solved).length,
    runtimeMeanMs: runtime.meanMs,
    runtimeP50Ms: runtime.p50Ms,
    runtimeP95Ms: runtime.p95Ms,
    runtimeMaxMs: runtime.maxMs,
    deadlineMissCount: runtime.deadlineMissCount,
  };
}
