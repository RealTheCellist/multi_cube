// --- BudgetCompliance (Incremental Recovery Architecture Prototype
// Sprint v1, STEP2) --------------------------------------------------------
// Measures whether a real deadline passed into bfsMoveWingToPosition()
// actually bounds its wall-clock cost, using the EXACT overrun definition
// Prototype Refinement Sprint v1's own BudgetRefinement.ts used (target
// 40ms reservedSlice budget + 5ms tolerance -- see RESERVED_SLICE_TARGET_MS/
// OVERRUN_TOLERANCE_MS there), so this Sprint's Overrun Rate is directly
// comparable to that Sprint's own measured 54.5% baseline. Granularity
// choice ("queuePop") is STEP1's own empirical finding from
// TraversalInterruptibilityCore.compareGranularities: lowest avg overshoot
// (0.92ms) across 146 real test cases vs nodeCount (1.82ms) and
// levelTransition (2.18ms).
import { bfsMoveWingToPosition } from "../fiveByFiveEdges";
import { REAL_MAX_DEPTH, type InterruptibilityTestCase } from "./TraversalInterruptibilityCore";

export const RESERVED_SLICE_TARGET_MS = 40; // identical to Refinement Sprint v1's own constant
export const OVERRUN_TOLERANCE_MS = 5; // identical to Refinement Sprint v1's own constant
export const BEST_GRANULARITY = "queuePop" as const;
export const CHECK_EVERY_NODES = 50;

export interface BudgetProbeRecord {
  hash: string;
  pieceId: number;
  runtimeMs: number;
  foundPath: boolean; // did the budget-constrained call return a path
  overrun: boolean; // runtimeMs > target + tolerance, same definition as Refinement Sprint v1
}

/** Runs every case with a REAL 40ms deadline (this Sprint's Production change actually enforcing it), using the STEP1-chosen queuePop granularity. */
export function runBudgetProbe(cases: readonly InterruptibilityTestCase[]): BudgetProbeRecord[] {
  return cases.map((c) => {
    const start = Date.now();
    const deadline = start + RESERVED_SLICE_TARGET_MS;
    const result = bfsMoveWingToPosition(
      c.edges,
      c.pieceId,
      c.targetPosKey,
      REAL_MAX_DEPTH,
      c.pins,
      deadline,
      BEST_GRANULARITY,
      CHECK_EVERY_NODES
    );
    const runtimeMs = Date.now() - start;
    return {
      hash: c.hash,
      pieceId: c.pieceId,
      runtimeMs,
      foundPath: result !== null,
      overrun: runtimeMs > RESERVED_SLICE_TARGET_MS + OVERRUN_TOLERANCE_MS,
    };
  });
}

export interface BudgetComplianceSummary {
  n: number;
  avgRuntimeMs: number;
  overrunRate: number; // fraction with overrun === true -- comparable to Refinement Sprint v1's own 54.5%/80.0% figures
  overrunCount: number;
}

export function summarizeBudgetCompliance(records: readonly BudgetProbeRecord[]): BudgetComplianceSummary {
  const n = records.length;
  const overrunCount = records.filter((r) => r.overrun).length;
  return {
    n,
    avgRuntimeMs: n ? records.reduce((a, r) => a + r.runtimeMs, 0) / n : 0,
    overrunRate: n ? overrunCount / n : 0,
    overrunCount,
  };
}

/** Baseline (no deadline) run of the SAME cases, for the Runtime/Overrun comparison this STEP's own Integration metric needs. */
export function runBaselineProbe(cases: readonly InterruptibilityTestCase[]): BudgetProbeRecord[] {
  return cases.map((c) => {
    const start = Date.now();
    const result = bfsMoveWingToPosition(c.edges, c.pieceId, c.targetPosKey, REAL_MAX_DEPTH, c.pins);
    const runtimeMs = Date.now() - start;
    return {
      hash: c.hash,
      pieceId: c.pieceId,
      runtimeMs,
      foundPath: result !== null,
      overrun: runtimeMs > RESERVED_SLICE_TARGET_MS + OVERRUN_TOLERANCE_MS,
    };
  });
}
