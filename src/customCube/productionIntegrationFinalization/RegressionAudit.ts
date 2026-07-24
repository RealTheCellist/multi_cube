// --- RegressionAudit (Production Integration Finalization Sprint v1,
// STEP5) --------------------------------------------------------------------
// Full-population census (all 335 real snapshots, one real solve() pass per
// arm -- not sampled) of every way the Integrated arm (new 250ms default)
// could be worse than Baseline (reconstructed pre-Finalization 450ms):
// success decrease, runtime spike, Deadline Miss increase, or Budget
// Violation (recovery triggered AND the whole solve still blew its 1s
// budget -- see PrimitiveInteractionAnalysis.ts's own BudgetConflictSummary,
// reused here per-snapshot rather than aggregated).
import type { EndToEndSolveResult } from "./EndToEndSolveProbe";

export interface RegressionAuditRow {
  hash: string;
  trueRegression: boolean; // Integrated wrongWingAfter strictly worse than Baseline's
  gapRescue: boolean; // Integrated strictly better
  runtimeSpike: boolean; // Integrated wallMs meaningfully worse (see RUNTIME_SPIKE_THRESHOLD_MS)
  newDeadlineMiss: boolean; // Baseline did NOT miss deadline, Integrated DID
  newBudgetViolation: boolean; // Baseline had no recovery-triggered-deadline-miss conflict, Integrated does
}

const RUNTIME_SPIKE_THRESHOLD_MS = 100; // disclosed threshold: a >100ms per-solve increase is flagged, not a hard failure by itself

export interface RegressionAuditSummary {
  n: number;
  trueRegressionCount: number;
  trueRegressionRate: number;
  gapRescueCount: number;
  gapRescueRate: number;
  runtimeSpikeCount: number;
  runtimeSpikeRate: number;
  newDeadlineMissCount: number;
  newDeadlineMissRate: number;
  newBudgetViolationCount: number;
  newBudgetViolationRate: number;
  rows: RegressionAuditRow[];
}

export function auditRegressions(baseline: readonly EndToEndSolveResult[], integrated: readonly EndToEndSolveResult[]): RegressionAuditSummary {
  const n = baseline.length;
  const rows: RegressionAuditRow[] = [];
  for (let i = 0; i < n; i++) {
    const b = baseline[i];
    const g = integrated[i];
    const bBudgetConflict = b.recoveryTriggered && b.deadlineMissed;
    const gBudgetConflict = g.recoveryTriggered && g.deadlineMissed;
    rows.push({
      hash: b.hash,
      trueRegression: g.wrongWingAfter > b.wrongWingAfter,
      gapRescue: g.wrongWingAfter < b.wrongWingAfter,
      runtimeSpike: g.wallMs - b.wallMs > RUNTIME_SPIKE_THRESHOLD_MS,
      newDeadlineMiss: !b.deadlineMissed && g.deadlineMissed,
      newBudgetViolation: !bBudgetConflict && gBudgetConflict,
    });
  }
  return {
    n,
    trueRegressionCount: rows.filter((r) => r.trueRegression).length,
    trueRegressionRate: n ? rows.filter((r) => r.trueRegression).length / n : 0,
    gapRescueCount: rows.filter((r) => r.gapRescue).length,
    gapRescueRate: n ? rows.filter((r) => r.gapRescue).length / n : 0,
    runtimeSpikeCount: rows.filter((r) => r.runtimeSpike).length,
    runtimeSpikeRate: n ? rows.filter((r) => r.runtimeSpike).length / n : 0,
    newDeadlineMissCount: rows.filter((r) => r.newDeadlineMiss).length,
    newDeadlineMissRate: n ? rows.filter((r) => r.newDeadlineMiss).length / n : 0,
    newBudgetViolationCount: rows.filter((r) => r.newBudgetViolation).length,
    newBudgetViolationRate: n ? rows.filter((r) => r.newBudgetViolation).length / n : 0,
    rows,
  };
}
