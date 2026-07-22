// --- IncrementalBudgetContract (Incremental Recovery Blueprint Sprint
// v1) --------------------------------------------------------------------
// STEP3. Compares 4 Budget Allocation policies for an Incremental Recovery
// attempt fired mid-PAIR-phase, using the REAL, unmodified runCCRPrototype()/
// runSuccessV2() called directly against STEP1's own captured cube states
// (PairFailurePopulationAnalysis.ts) -- no new search algorithm, exactly
// the same probe-a-primitive-directly pattern every Budget Contract
// evaluation in this whole research arc has used.
import { cloneCubies } from "../cubeState";
import { applySeq, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { runCCRPrototype } from "../solverPrimitiveCCRPrototype/CCRPrototype";
import { runSuccessV2, W2_WIDER_HOP } from "../solverPrimitivePrototypeRefinementV2/SuccessOptimizationV2";
import type { PairFailureRecord } from "./PairFailurePopulationAnalysis";

export type BudgetPolicyId = "fixed" | "remainingTime" | "reservedSlice" | "adaptiveSlice";

const FIXED_BUDGET_MS = 50; // deliberately small -- up to 12 PAIR tasks could each want a turn, unlike ENDGAME's own single shot
const RESERVED_SLICE_MS = 40; // mirrors REPAIR's own REPAIR_RESERVED_SLICE_MS philosophy, sized down for a per-PAIR-task reservation

function budgetFor(policy: BudgetPolicyId, record: PairFailureRecord): number {
  if (policy === "fixed") return FIXED_BUDGET_MS;
  if (policy === "remainingTime") return record.remainingTimeAtCaptureMs;
  if (policy === "reservedSlice") return Math.min(record.remainingTimeAtCaptureMs, RESERVED_SLICE_MS);
  // adaptiveSlice: fair share of whatever's left, split across this task
  // plus every task still queued after it (so later PAIR tasks aren't
  // starved by an earlier one claiming everything).
  return Math.max(5, Math.floor(record.remainingTimeAtCaptureMs / (record.tasksRemainingAfter + 1)));
}

function probeOne(record: PairFailureRecord, lib: WingLibrary, budgetMs: number): { matched: boolean; succeeded: boolean; timeMs: number } {
  const start = Date.now();
  const deadline = Date.now() + budgetMs;
  let matched = false;
  let succeeded = false;

  if (record.ccrGateEligible) {
    const result = runCCRPrototype(record.cubies, lib, deadline, "singleCycle");
    matched = result.matched;
    if (result.moves) {
      const clone = cloneCubies(record.cubies);
      applySeq(clone, result.moves);
      succeeded = wrongWingCount5(clone) < record.wrongWingCount;
    }
  } else if (record.repairGateEligible) {
    const result = runSuccessV2(record.cubies, lib, deadline, W2_WIDER_HOP);
    matched = result.matched;
    if (result.moves) {
      const clone = cloneCubies(record.cubies);
      applySeq(clone, result.moves);
      succeeded = wrongWingCount5(clone) < record.wrongWingCount;
    }
  }

  return { matched, succeeded, timeMs: Date.now() - start };
}

export interface BudgetPolicyResult {
  policy: BudgetPolicyId;
  n: number;
  avgBudgetMs: number;
  successRate: number;
  avgTimeMs: number;
}

export function evaluateBudgetPolicies(records: readonly PairFailureRecord[], lib: WingLibrary): BudgetPolicyResult[] {
  const gateEligible = records.filter((r) => r.ccrGateEligible || r.repairGateEligible);
  const policies: BudgetPolicyId[] = ["fixed", "remainingTime", "reservedSlice", "adaptiveSlice"];

  return policies.map((policy) => {
    const budgets: number[] = [];
    let successCount = 0;
    let timeSum = 0;
    for (const r of gateEligible) {
      const budgetMs = budgetFor(policy, r);
      budgets.push(budgetMs);
      const result = probeOne(r, lib, budgetMs);
      if (result.succeeded) successCount++;
      timeSum += result.timeMs;
    }
    const n = gateEligible.length;
    return {
      policy,
      n,
      avgBudgetMs: n ? budgets.reduce((a, b) => a + b, 0) / n : 0,
      successRate: n ? successCount / n : 0,
      avgTimeMs: n ? timeSum / n : 0,
    };
  });
}
