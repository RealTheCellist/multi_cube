// --- BudgetRefinement (Incremental Recovery Prototype Refinement Sprint
// v1) -------------------------------------------------------------------
// STEP1. Prototype Sprint v1 found reservedSlice's nominal 40ms cap is
// overrun by ~3.5x on average (real usage ~140ms) because
// runCCRPrototype/runSuccessV2 only check their deadline between DFS hops,
// not inside a hop's own enumerateWingCandidates() call. This compares 4
// Budget policies -- all implemented as Prototype-Wrapper-level choices of
// WHAT deadline/node-list to pass INTO the shared instrumented DFS core
// (InstrumentedSearch.ts), never as a change to the search's own internal
// deadline-check logic (that logic lives in the protected existing
// Prototypes and is reused unmodified via the same real dfs() STRUCTURE).
import { runInstrumentedDfs, type InstrumentedSearchResult, type InstrumentedAttempt, type IncrementalPrimitiveKind } from "./InstrumentedSearch";
import type { Cubie } from "../cubeState";
import type { WingLibrary } from "../fiveByFiveEdges";
import { analyzeCcrGate } from "../solverPrimitiveCCRPrototype/CCRGate";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";

export type BudgetPolicyId = "reservedSlice" | "strictDeadline" | "softDeadline" | "budgetAwareTraversal";

const RESERVED_SLICE_TARGET_MS = 40; // Prototype v1's own adopted nominal cap
// Prototype v1 measured avg actual usage ~140ms against a ~31ms average
// budget -- an empirical overrun factor of ~3.8x on this dataset (varies
// slightly run to run; STEP1 below re-measures the CURRENT run's own
// factor rather than hardcoding Prototype v1's number, since the fix
// needs to react to real, current data).
const SOFT_DEADLINE_TARGET_MS = 140; // budgets for the REAL observed average usage instead of the aspirational nominal cap

export interface BudgetPolicyContext {
  remainingTimeMs: number;
  observedOverrunFactor: number; // from a prior measurement pass -- used by strictDeadline/budgetAwareTraversal to compensate
  avgHopCostMs: number; // from DeadlineGranularityAnalysis -- used by budgetAwareTraversal to size the node list
}

export interface BudgetAllocation {
  nodes: string[]; // possibly truncated (budgetAwareTraversal only)
  deadline: number;
  targetBudgetMs: number; // the policy's own nominal target, for reporting
}

export function allocateBudget(policy: BudgetPolicyId, fullNodes: readonly string[], ctx: BudgetPolicyContext): BudgetAllocation {
  const now = Date.now();
  if (policy === "reservedSlice") {
    const targetBudgetMs = Math.max(0, Math.min(ctx.remainingTimeMs, RESERVED_SLICE_TARGET_MS));
    return { nodes: [...fullNodes], deadline: now + targetBudgetMs, targetBudgetMs };
  }
  if (policy === "strictDeadline") {
    // Shrink the INPUT deadline by the observed overrun factor so the
    // search's own (coarse) deadline checks land closer to the real
    // 40ms ceiling -- can't preempt a synchronous call mid-flight, so the
    // only lever a wrapper has is what it passes in.
    const compensated = ctx.observedOverrunFactor > 1 ? RESERVED_SLICE_TARGET_MS / ctx.observedOverrunFactor : RESERVED_SLICE_TARGET_MS;
    const targetBudgetMs = Math.max(0, Math.min(ctx.remainingTimeMs, compensated));
    return { nodes: [...fullNodes], deadline: now + targetBudgetMs, targetBudgetMs };
  }
  if (policy === "softDeadline") {
    const targetBudgetMs = Math.max(0, Math.min(ctx.remainingTimeMs, SOFT_DEADLINE_TARGET_MS));
    return { nodes: [...fullNodes], deadline: now + targetBudgetMs, targetBudgetMs };
  }
  // budgetAwareTraversal: keep the 40ms nominal cap, but truncate the node
  // list to how many hops are realistically affordable given the measured
  // avg-hop-cost, instead of handing the search an unbounded traversal it
  // will overshoot trying to finish.
  const targetBudgetMs = Math.max(0, Math.min(ctx.remainingTimeMs, RESERVED_SLICE_TARGET_MS));
  const affordableHops = ctx.avgHopCostMs > 0 ? Math.max(1, Math.floor(targetBudgetMs / ctx.avgHopCostMs)) : fullNodes.length;
  return { nodes: fullNodes.slice(0, Math.min(fullNodes.length, affordableHops)), deadline: now + targetBudgetMs, targetBudgetMs };
}

export interface BudgetPolicyResult {
  policy: BudgetPolicyId;
  n: number;
  avgTargetBudgetMs: number;
  avgActualUsedMs: number;
  overrunRate: number; // fraction where actual > target + tolerance
  timeoutRate: number; // fraction where actual >= target (ran until its own deadline)
  successRate: number; // fraction where deferredAccepted
}

const OVERRUN_TOLERANCE_MS = 5;

export interface BudgetProbeRecord {
  cubies: Cubie[];
  nodes: string[];
  remainingTimeMs: number;
}

/** REPAIR's own current Gate (cycleLength 2~4, any conflictEdgeCount) -- identical to InstrumentedSearch.ts's own check. */
function repairGateEligible(cycleLength: number): boolean {
  return cycleLength >= 2 && cycleLength <= 4;
}

/**
 * Same REPAIR-then-CCR dispatch as InstrumentedSearch.ts's own
 * runInstrumentedIncrementalAttempt(), but routes the chosen node list AND
 * deadline through allocateBudget(policy, ...) first -- so a policy like
 * budgetAwareTraversal's node-list truncation is actually applied here,
 * not just its numeric budget value. This is the function every Sprint
 * caller (TaskLevelEvaluation.ts's runCandidateMirror, used by both STEP3
 * and the CapabilityBenchmark/VisitedRegistry STEP4/5 runs) should use
 * whenever a specific Budget policy needs to be genuinely exercised, as
 * opposed to runInstrumentedIncrementalAttempt's own fixed, untruncated
 * dispatch (still used standalone by STEP1's evaluateBudgetPolicy above,
 * which needs the RAW per-policy allocation, not a REPAIR/CCR fallback).
 */
export function dispatchWithPolicy(cubies: Cubie[], lib: WingLibrary, policy: BudgetPolicyId, remainingTimeMs: number, ctx: Omit<BudgetPolicyContext, "remainingTimeMs">): InstrumentedAttempt {
  const gate = analyzeCcrGate(cubies);
  const ccrEligible = gate.eligible;
  const repEligible = repairGateEligible(gate.primaryCycleLength);
  let remaining = remainingTimeMs;

  if (repEligible) {
    const analysis = analyzeMultiCycle(cubies);
    if (analysis) {
      const allocation = allocateBudget(policy, analysis.cycleNodes, { ...ctx, remainingTimeMs: remaining });
      const search = runInstrumentedDfs(cubies, allocation.nodes, lib, allocation.deadline);
      remaining = Math.max(0, remaining - search.totalWallMs);
      if (search.deferredAccepted) return { primitiveUsed: "REPAIR", search };
      if (!ccrEligible) return { primitiveUsed: "REPAIR", search };
      // fall through to CCR only if also eligible (structurally rare -- cycleLength bands 2-4 vs 5-6 don't overlap, per Blueprint/Prototype Sprints' own STEP5 findings)
    }
  }
  if (ccrEligible) {
    const allocation = allocateBudget(policy, gate.primaryCycleNodes, { ...ctx, remainingTimeMs: remaining });
    const search = runInstrumentedDfs(cubies, allocation.nodes, lib, allocation.deadline);
    return { primitiveUsed: "CCR" as IncrementalPrimitiveKind, search };
  }
  return { primitiveUsed: null, search: null };
}

export function evaluateBudgetPolicy(
  policy: BudgetPolicyId,
  records: readonly BudgetProbeRecord[],
  lib: WingLibrary,
  ctx: Omit<BudgetPolicyContext, "remainingTimeMs">,
): BudgetPolicyResult {
  const targets: number[] = [];
  const actuals: number[] = [];
  let overrunCount = 0;
  let timeoutCount = 0;
  let successCount = 0;

  for (const r of records) {
    const allocation = allocateBudget(policy, r.nodes, { ...ctx, remainingTimeMs: r.remainingTimeMs });
    targets.push(allocation.targetBudgetMs);
    const result: InstrumentedSearchResult = runInstrumentedDfs(r.cubies, allocation.nodes, lib, allocation.deadline);
    actuals.push(result.totalWallMs);
    if (result.totalWallMs > allocation.targetBudgetMs + OVERRUN_TOLERANCE_MS) overrunCount++;
    if (allocation.targetBudgetMs > 0 && result.totalWallMs >= allocation.targetBudgetMs) timeoutCount++;
    if (result.deferredAccepted) successCount++;
  }

  const n = records.length;
  return {
    policy,
    n,
    avgTargetBudgetMs: n ? targets.reduce((a, b) => a + b, 0) / n : 0,
    avgActualUsedMs: n ? actuals.reduce((a, b) => a + b, 0) / n : 0,
    overrunRate: n ? overrunCount / n : 0,
    timeoutRate: n ? timeoutCount / n : 0,
    successRate: n ? successCount / n : 0,
  };
}
