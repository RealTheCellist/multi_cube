// --- BudgetSweep (Parity-Gated Cycle Production Integration Planning
// Sprint v1, STEP4) ----------------------------------------------------------
// Sweeps the Prototype's own per-case deadline across 40/80/120/160/200ms
// (Directive's own values -- realistic Recovery-layer slice sizes, unlike
// Prototype Sprint v1's own 2000ms research budget) on the real 53-case
// Unknown Population. Reuses parityGatedCyclePrototypeV1/
// CapabilityMeasurement.ts's evaluatePopulation/summarizeOutcomes
// (unmodified) directly -- same metric vocabulary as the Prototype Sprint
// itself, so results are directly comparable to that Sprint's own
// avgRuntimeMs=1271.2ms finding.
import type { WingLibrary } from "../fiveByFiveEdges";
import type { UnknownCase } from "../parityGatedCycleBlueprintV1/UnknownPopulationProfiling";
import { evaluatePopulation, summarizeOutcomes, type CaseOutcome, type EvaluationSummary } from "../parityGatedCyclePrototypeV1/CapabilityMeasurement";
import { tryCrossComponentBridgeCycleResolverConfigured, FULL_CONFIG } from "../parityGatedCyclePrototypeV1/CrossComponentBridgeCycleResolver";

export const SWEEP_BUDGETS_MS = [40, 80, 120, 160, 200];

export interface BudgetResult {
  budgetMs: number;
  outcomes: CaseOutcome[];
  summary: EvaluationSummary;
  deadlineMissCount: number; // wallMs > budgetMs (BFS bounded sub-steps overran the nominal deadline)
}

export function runBudgetSweep(cases: readonly UnknownCase[], lib: WingLibrary): BudgetResult[] {
  return SWEEP_BUDGETS_MS.map((budgetMs) => {
    const outcomes = evaluatePopulation(cases, lib, budgetMs, (cubies, l, deadline) => tryCrossComponentBridgeCycleResolverConfigured(cubies, l, deadline, FULL_CONFIG));
    const summary = summarizeOutcomes(`budget=${budgetMs}ms`, outcomes);
    const deadlineMissCount = outcomes.filter((o) => o.wallMs > budgetMs).length;
    return { budgetMs, outcomes, summary, deadlineMissCount };
  });
}
