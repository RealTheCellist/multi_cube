// --- IncrementalRecoveryPrototype (Incremental Recovery Prototype Sprint
// v1) --------------------------------------------------------------------
// STEP1. Implements the Blueprint's adopted featureBased Trigger exactly
// as specified (INCREMENTAL_RECOVERY_BLUEPRINT.md section 1) -- fires only
// when analyzeCcrGate() (existing, unmodified Gate function) reports
// CCR-Gate (cycleLength 5-6, conflictEdgeCount=0) or REPAIR-Gate
// (cycleLength 2-4) eligibility on the state a no-progress PAIR task left
// behind. No new Trigger condition is explored here -- this is a direct
// reimplementation of the already-decided Blueprint condition, not a
// search for a better one.
//
// Scheduling (STEP3's per-attempt core): REPAIR is tried first, then CCR,
// exactly as the Blueprint's Scheduling section specifies -- mirroring
// production's own genRepair-before-genCCR ordering in
// fiveByFiveEdgeRecovery.ts (read-only precedent, not imported here).
import { type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { analyzeCcrGate } from "../solverPrimitiveCCRPrototype/CCRGate";
import { runCCRPrototype } from "../solverPrimitiveCCRPrototype/CCRPrototype";
import { runSuccessV2, W2_WIDER_HOP } from "../solverPrimitivePrototypeRefinementV2/SuccessOptimizationV2";
import { allocateReservedSlice, measureUsage, type BudgetUsageRecord } from "./IncrementalBudget";

export interface TriggerEvaluation {
  fires: boolean;
  ccrEligible: boolean;
  repairEligible: boolean;
  both: boolean; // structurally expected to measure 0 -- CCR (cycleLength 5-6) and REPAIR (cycleLength 2-4) gates are disjoint cycleLength bands; STEP5 measures this directly rather than assuming it
  excluded: boolean;
}

/** REPAIR's own current Gate (cycleLength 2~4, any conflictEdgeCount) -- identical check to the Blueprint's own repairGateEligible. */
function repairGateEligible(cycleLength: number): boolean {
  return cycleLength >= 2 && cycleLength <= 4;
}

export function evaluateIncrementalTrigger(cubies: Cubie[]): TriggerEvaluation {
  const gate = analyzeCcrGate(cubies);
  const ccrEligible = gate.eligible;
  const repEligible = repairGateEligible(gate.primaryCycleLength);
  return {
    fires: ccrEligible || repEligible,
    ccrEligible,
    repairEligible: repEligible,
    both: ccrEligible && repEligible,
    excluded: !ccrEligible && !repEligible,
  };
}

export type IncrementalPrimitiveUsed = "REPAIR" | "CCR" | null;

export interface IncrementalAttemptResult {
  attempted: boolean; // trigger fired and at least one primitive was tried
  trigger: TriggerEvaluation;
  triedRepair: boolean;
  triedCCR: boolean;
  succeeded: boolean;
  primitiveUsed: IncrementalPrimitiveUsed;
  wrongWingBefore: number;
  wrongWingAfter: number;
  repairUsage: BudgetUsageRecord | null;
  ccrUsage: BudgetUsageRecord | null;
}

/**
 * Single Incremental Recovery attempt at one PAIR no-progress point.
 * Mutates `cubies` in place ONLY on success -- matching how the real
 * executeTask() already mutates its own cubies argument in place on a
 * successful primary-pipeline attempt (fiveByFiveEdgeExecutor.ts's
 * runPrimaryPipeline calls applySeq(cubies, fix) before returning).
 */
export function attemptIncrementalRecovery(cubies: Cubie[], lib: WingLibrary, remainingTimeMs: number): IncrementalAttemptResult {
  const trigger = evaluateIncrementalTrigger(cubies);
  const wrongWingBefore = wrongWingCount5(cubies);
  const base: IncrementalAttemptResult = {
    attempted: false,
    trigger,
    triedRepair: false,
    triedCCR: false,
    succeeded: false,
    primitiveUsed: null,
    wrongWingBefore,
    wrongWingAfter: wrongWingBefore,
    repairUsage: null,
    ccrUsage: null,
  };
  if (!trigger.fires) return base;

  let remaining = remainingTimeMs;

  if (trigger.repairEligible) {
    const { budgetMs, deadline } = allocateReservedSlice(remaining);
    const start = Date.now();
    const result = runSuccessV2(cubies, lib, deadline, W2_WIDER_HOP);
    const usage = measureUsage(budgetMs, Date.now() - start);
    remaining = Math.max(0, remaining - usage.usedMs);
    if (result.moves) {
      applySeq(cubies, result.moves);
      return {
        ...base,
        attempted: true,
        triedRepair: true,
        succeeded: true,
        primitiveUsed: "REPAIR",
        wrongWingAfter: wrongWingCount5(cubies),
        repairUsage: usage,
      };
    }
    base.triedRepair = true;
    base.repairUsage = usage;
  }

  if (trigger.ccrEligible) {
    const { budgetMs, deadline } = allocateReservedSlice(remaining);
    const start = Date.now();
    const result = runCCRPrototype(cubies, lib, deadline, "singleCycle");
    const usage = measureUsage(budgetMs, Date.now() - start);
    if (result.moves) {
      applySeq(cubies, result.moves);
      return {
        ...base,
        attempted: true,
        triedCCR: true,
        succeeded: true,
        primitiveUsed: "CCR",
        wrongWingAfter: wrongWingCount5(cubies),
        ccrUsage: usage,
      };
    }
    base.triedCCR = true;
    base.ccrUsage = usage;
  }

  base.attempted = base.triedRepair || base.triedCCR;
  return base;
}
