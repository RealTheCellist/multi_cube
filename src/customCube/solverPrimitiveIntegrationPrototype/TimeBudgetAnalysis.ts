// --- TimeBudgetAnalysis (Solver Primitive Integration Prototype Sprint
// v1) -- STEP4: measures REPAIR's OWN isolated cost, using the REAL
// production slice budget (RECOVERY_GEN_BUDGET_MS/4, i.e. genDeadline/4
// -- see fiveByFiveEdgeRecovery.ts's own slice() after this Sprint's
// STEP1 divisor change) as the deadline passed to runSuccessV2 directly.
// This isolates REPAIR's own timing from DISRUPT/SETUP's costs, which
// generateRecoveryStrategies' own whole-function timing would otherwise
// conflate -- Integration Blueprint Sprint v1's flagged Risk ("Time
// budget 초과": slice ~75ms vs W2's measured avg 157.9ms) is about
// REPAIR's OWN cost specifically, not the combined candidate-generation
// step.
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { WingLibrary } from "../fiveByFiveEdges";
import { RECOVERY_GEN_BUDGET_MS } from "../fiveByFiveEdgeRecovery";
import { runSuccessV2, W2_WIDER_HOP } from "../solverPrimitivePrototypeRefinementV2/SuccessOptimizationV2";

// Mirrors fiveByFiveEdgeRecovery.ts's own slice() exactly: genDeadline is
// itself Math.min(deadline, Date.now()+RECOVERY_GEN_BUDGET_MS), and slice
// divides whatever's left of THAT by 4 (now that REPAIR is the 4th
// generation step) -- when Recovery is entered with a fresh budget (the
// common case, since RECOVERY_GEN_BUDGET_MS=300ms is itself far smaller
// than the ~700ms of deadline typically still remaining when Recovery
// triggers), the realistic slice REPAIR actually gets is close to
// RECOVERY_GEN_BUDGET_MS/4.
const REALISTIC_REPAIR_SLICE_MS = Math.floor(RECOVERY_GEN_BUDGET_MS / 4);

export interface RepairTimingRecord {
  hash: string;
  gateMatched: boolean; // runSuccessV2's own analyzeMultiCycle+conflictEdgeCount Gate
  timeMs: number;
  timedOut: boolean; // hit the slice deadline without a leaf found (Date.now() >= deadline at return)
  budgetExceeded: boolean; // timeMs > REALISTIC_REPAIR_SLICE_MS
  foundMoves: boolean;
}

export interface TimeBudgetSummary {
  sliceMs: number;
  n: number;
  gateMatchedCount: number;
  avgTimeMsAmongMatched: number;
  maxTimeMsAmongMatched: number;
  budgetExceededCount: number; // among gate-matched only -- ungated snapshots return near-instantly (analyzeMultiCycle short-circuits) and were never the Risk's subject
  budgetExceededRateAmongMatched: number;
  records: RepairTimingRecord[];
}

export function analyzeTimeBudget(snapshots: readonly FailureSnapshot[], lib: WingLibrary): TimeBudgetSummary {
  const records: RepairTimingRecord[] = snapshots.map((s) => {
    const cubies = deserializeCube(s.cubeState);
    const start = Date.now();
    const deadline = start + REALISTIC_REPAIR_SLICE_MS;
    const result = runSuccessV2(cubies, lib, deadline, W2_WIDER_HOP);
    const timeMs = Date.now() - start;
    return {
      hash: s.hash,
      gateMatched: result.matched,
      timeMs,
      timedOut: result.matched && result.moves === null && Date.now() >= deadline,
      budgetExceeded: timeMs > REALISTIC_REPAIR_SLICE_MS,
      foundMoves: result.matched && result.moves !== null,
    };
  });

  const matched = records.filter((r) => r.gateMatched);
  const n = records.length;
  return {
    sliceMs: REALISTIC_REPAIR_SLICE_MS,
    n,
    gateMatchedCount: matched.length,
    avgTimeMsAmongMatched: matched.length > 0 ? matched.reduce((a, r) => a + r.timeMs, 0) / matched.length : 0,
    maxTimeMsAmongMatched: matched.length > 0 ? Math.max(...matched.map((r) => r.timeMs)) : 0,
    budgetExceededCount: matched.filter((r) => r.budgetExceeded).length,
    budgetExceededRateAmongMatched: matched.length > 0 ? matched.filter((r) => r.budgetExceeded).length / matched.length : 0,
    records,
  };
}
