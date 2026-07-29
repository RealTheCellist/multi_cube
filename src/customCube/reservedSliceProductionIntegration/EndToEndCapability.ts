// --- EndToEndCapability (CONFLICT_DEEP_DEPENDENCY Reserved Slice Production
// Integration Sprint v1, STEP3) ----------------------------------------------
// Calls the REAL, unmodified FiveByFiveEdgeSolverEngine.solve() (via
// productionIntegrationFinalization/EndToEndSolveProbe.ts, reused byte-
// identical -- no new probe logic) over the full Hole Dataset. Since
// useSetupReservedSlice isn't (and per this Sprint's Directive should not
// be) threaded through solve()/executeTask() -- Executor stays frozen --
// every solve() call here already gets the real, now-integrated SETUP
// Reserved Slice automatically (useSetupReservedSlice defaults to true in
// generateRecoveryStrategies()/attemptRecovery(), and
// fiveByFiveEdgeExecutor.ts's own executeTask() never overrides it). This
// is therefore a single-arm measurement of the REAL production behavior
// end-to-end -- the Baseline-vs-Candidate comparison for Regression
// Validation is done at the Recovery layer instead (RecoveryLevelCollector.ts),
// matching this codebase's own established precedent for a change that
// lives entirely inside generateRecoveryStrategies()'s own scheduling logic.
import { endToEndSolveProbe, ensureWarm, type EndToEndSolveResult } from "../productionIntegrationFinalization/EndToEndSolveProbe";
import { cloneCubies } from "../cubeState";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export interface RuntimeStats {
  n: number;
  avgMs: number;
  medianMs: number;
  p95Ms: number;
  maxMs: number;
}

function computeRuntimeStats(values: readonly number[]): RuntimeStats {
  if (values.length === 0) return { n: 0, avgMs: 0, medianMs: 0, p95Ms: 0, maxMs: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    avgMs: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    medianMs: sorted[Math.floor(sorted.length / 2)],
    p95Ms: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    maxMs: sorted[sorted.length - 1],
  };
}

export interface EndToEndCapabilitySummary {
  n: number;
  improvedCount: number;
  improvedRate: number;
  solvedCount: number;
  solveRate: number;
  setupChosenCount: number;
  setupSucceededCount: number; // SETUP chosen AND overall improved (retry round trip succeeded)
  recoveryTriggeredCount: number;
  recoverySucceededCount: number; // recoveryTriggered AND improved
  deadlineMissedCount: number;
  runtime: RuntimeStats;
}

export function runEndToEndCapability(cases: readonly HoleCase[], repeats: number): { perResult: EndToEndSolveResult[]; summary: EndToEndCapabilitySummary } {
  ensureWarm();
  const perResult: EndToEndSolveResult[] = [];
  for (let rep = 0; rep < repeats; rep++) {
    for (const c of cases) {
      perResult.push(endToEndSolveProbe(cloneCubies(c.cubies), `${c.label}#${rep}`));
    }
  }
  const n = perResult.length;
  const improvedCount = perResult.filter((r) => r.improved).length;
  const solvedCount = perResult.filter((r) => r.solved).length;
  const setupChosen = perResult.filter((r) => r.recoveryOutcome?.chosenType === "SETUP");
  const setupSucceededCount = setupChosen.filter((r) => r.improved).length;
  const recoveryTriggered = perResult.filter((r) => r.recoveryTriggered);
  const recoverySucceededCount = recoveryTriggered.filter((r) => r.improved).length;
  const deadlineMissedCount = perResult.filter((r) => r.deadlineMissed).length;

  const summary: EndToEndCapabilitySummary = {
    n,
    improvedCount,
    improvedRate: n ? improvedCount / n : 0,
    solvedCount,
    solveRate: n ? solvedCount / n : 0,
    setupChosenCount: setupChosen.length,
    setupSucceededCount,
    recoveryTriggeredCount: recoveryTriggered.length,
    recoverySucceededCount,
    deadlineMissedCount,
    runtime: computeRuntimeStats(perResult.map((r) => r.wallMs)),
  };
  return { perResult, summary };
}
