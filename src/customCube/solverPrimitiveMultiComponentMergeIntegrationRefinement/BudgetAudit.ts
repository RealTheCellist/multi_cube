// --- BudgetAudit (Multi-Component Merge Production Integration Refinement
// Sprint v1, STEP1) -----------------------------------------------------------
// Independent reproduction of Production Integration Sprint v1's own real
// finding (avgActualBudgetAvailableMs=493.6ms, budgetStarvedCount=9/9) via a
// FRESH real generateRecoveryStrategies() replay (read-only, UNMODIFIED
// usage) rather than reusing the prior Sprint's own result JSON -- the
// Directive's own STEP1 explicitly asks for independent reproduction, not
// a citation. Extends solverPrimitiveMultiComponentMergeProductionIntegration/
// ContractAudit.ts's own measurement (disclosed precedent) with
// `consumedBudgetMs` (how much of the outer deadline earlier steps had
// already used by the time MCM's turn came) and accepts the new
// `multiComponentMergeOrder` parameter so the SAME function measures both
// today's production order (AFTER_CCR) and the Refinement Sprint's own
// reordering experiment (BEFORE_CCR).
import { cloneCubies, type Cubie } from "../cubeState";
import { generateRecoveryStrategies, type SchedulingEvent } from "../fiveByFiveEdgeRecovery";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export const OUTER_DEADLINE_MS = 1000;
const NOMINAL_MCM_BUDGET_MS = 2000; // MULTI_COMPONENT_MERGE_RESERVED_SLICE_MS, cited from fiveByFiveEdgeRecovery.ts

export type MultiComponentMergeOrder = "AFTER_CCR" | "BEFORE_CCR";

export interface BudgetAuditRow {
  label: string;
  order: MultiComponentMergeOrder;
  mcmPhase: "generated" | "empty" | "skipped" | "never_started";
  mcmStartMs: number | null;
  consumedBudgetMs: number | null; // how much of the OUTER deadline was already used by the time MCM's turn started (mcmStartMs - callStartMs)
  actualBudgetAvailableMs: number | null; // min(NOMINAL_MCM_BUDGET_MS, outerDeadline - mcmStartMs) -- the REAL runway MCM got
  starved: boolean | null; // actualBudgetAvailableMs < NOMINAL_MCM_BUDGET_MS
}

export function auditOneCase(cubies: Cubie[], label: string, libs: ExecutorLibraries, order: MultiComponentMergeOrder): BudgetAuditRow {
  const events: SchedulingEvent[] = [];
  const startMs: Partial<Record<string, number>> = {};
  const onEvent = (e: SchedulingEvent) => {
    events.push(e);
    if (e.phase === "start") startMs[e.candidateType] = e.atMs;
  };

  const callStart = Date.now();
  const deadline = callStart + OUTER_DEADLINE_MS;
  generateRecoveryStrategies(cloneCubies(cubies), libs, deadline, undefined, true, "reservedBudget", onEvent, true, true, true, true, true, order);

  const mcmEvent = events.filter((e) => e.candidateType === "MULTI_COMPONENT_MERGE").slice(-1)[0];
  const mcmPhase: BudgetAuditRow["mcmPhase"] = mcmEvent ? (mcmEvent.phase as BudgetAuditRow["mcmPhase"]) : "never_started";
  const mcmStartMs = startMs["MULTI_COMPONENT_MERGE"] ?? null;
  const consumedBudgetMs = mcmStartMs !== null ? mcmStartMs - callStart : null;
  const actualBudgetAvailableMs = mcmStartMs !== null ? Math.min(NOMINAL_MCM_BUDGET_MS, deadline - mcmStartMs) : null;
  const starved = actualBudgetAvailableMs !== null ? actualBudgetAvailableMs < NOMINAL_MCM_BUDGET_MS : null;

  return { label, order, mcmPhase, mcmStartMs, consumedBudgetMs, actualBudgetAvailableMs, starved };
}

export function auditPopulation(holes: readonly HoleCase[], libs: ExecutorLibraries, order: MultiComponentMergeOrder): BudgetAuditRow[] {
  return holes.map((h) => auditOneCase(h.cubies, h.label, libs, order));
}

export interface BudgetAuditSummary {
  order: MultiComponentMergeOrder;
  n: number;
  gateMatchedCount: number; // mcmPhase !== "skipped" && !== "never_started"
  avgConsumedBudgetMs: number;
  avgActualBudgetAvailableMs: number;
  starvedCount: number;
  starvedRate: number;
}

export function summarizeBudgetAudit(rows: readonly BudgetAuditRow[], order: MultiComponentMergeOrder): BudgetAuditSummary {
  const gateMatched = rows.filter((r) => r.mcmPhase !== "skipped" && r.mcmPhase !== "never_started");
  const withBudget = gateMatched.filter((r) => r.actualBudgetAvailableMs !== null);
  const starved = withBudget.filter((r) => r.starved);
  return {
    order,
    n: rows.length,
    gateMatchedCount: gateMatched.length,
    avgConsumedBudgetMs: withBudget.length ? withBudget.reduce((s, r) => s + (r.consumedBudgetMs ?? 0), 0) / withBudget.length : 0,
    avgActualBudgetAvailableMs: withBudget.length ? withBudget.reduce((s, r) => s + (r.actualBudgetAvailableMs ?? 0), 0) / withBudget.length : 0,
    starvedCount: starved.length,
    starvedRate: withBudget.length ? starved.length / withBudget.length : 0,
  };
}
