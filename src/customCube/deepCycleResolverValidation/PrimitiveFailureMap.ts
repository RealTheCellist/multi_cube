// --- PrimitiveFailureMap (Deep Cycle Resolver Validation Sprint v1, RQ-2)
// -------------------------------------------------------------------------
// "Primitive별 expandedStates/terminationReason/maximumDepth/averageBranch/
// searchBudgetUsage" as literally named in the Directive are NOT obtainable
// for BASE/FLIP/CASE/PARITY without instrumenting fiveByFiveEdges.ts itself
// (a protected file this Sprint may not modify) -- disclosed limitation,
// not silently worked around. What IS measurable without touching any
// protected file, using only existing public exports exactly as
// primitiveCapabilityTester.ts and attemptRecovery() already expose them:
//
//   - a BUDGET SWEEP per primitive (this whole research arc's own
//     established convention for distinguishing "budget-starved" from
//     "structurally incapable", used by CycleIsolationSubtypes.ts,
//     NecessityGroundTruth.ts, etc.) -- gives an empirical
//     terminationReason ("never succeeds even at the largest tested
//     budget" vs "succeeds above some measured threshold" vs "already
//     succeeds at production's own smallest budget").
//   - for RECOVERY specifically, attemptRecovery() accepts an optional
//     `trace` array (already an existing parameter, not an addition) --
//     reading it reveals WHICH candidate type (DISRUPT/SETUP/REPAIR/CCR)
//     was chosen, a genuine "which mechanism actually fired" signal.
//   - an N=10 repeat-trial stability check at the largest tested budget
//     (this session's own established repeatability convention, e.g.
//     Production Integration Validation Sprint's System Stability
//     module) -- necessary here because this Sprint's own STEP0 probe
//     found the underlying bounded DFS (CCRPrototype.ts's runBoundedDfs)
//     is NOT purely budget-monotonic: MAX_LEAVES_EXPLORED=64 (a fixed
//     leaf cap, not a time cap) can be reached well before the deadline,
//     making the outcome sensitive to real-world sub-hop timing rather
//     than the nominal budget alone.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, tryFixWing, tryFlipWingsInPlace, tryExactCaseMatch, bestFixOverall, tryEndgameMultiPly, wrongWingCount5, wrongWings5, type Move } from "../fiveByFiveEdges";
import { attemptRecovery } from "../fiveByFiveEdgeRecovery";
import { DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { CapabilityPrimitiveName } from "../capabilityAnalysis/capabilityTypes";
import type { TraceEntry } from "../fiveByFiveEdgeSolverTypes";

export const BUDGET_SWEEP_MS = [140, 250, 500, 1000, 2000, 5000, 10000, 30000];
export const REPEAT_TRIALS = 10;

function tryBaseApplied(clone: Cubie[], lib: ExecutorLibraries["lib"], deadline: number): Move[] {
  for (const w of wrongWings5(clone)) {
    const fix = tryFixWing(clone, w, lib, deadline);
    if (fix && fix.length > 0) {
      applySeq(clone, fix);
      return fix;
    }
  }
  return [];
}

function testAtBudget(cubies: readonly Cubie[], primitive: CapabilityPrimitiveName, libs: ExecutorLibraries, budgetMs: number, trace?: TraceEntry[]): boolean {
  const clone = cloneCubies(cubies as Cubie[]);
  const deadline = Date.now() + budgetMs;
  let moves: Move[] | null = null;
  if (primitive === "BASE") {
    const applied = tryBaseApplied(clone, libs.lib, deadline);
    moves = applied.length > 0 ? applied : null;
  } else if (primitive === "FLIP") {
    for (const w of wrongWings5(clone)) {
      const fix = tryFlipWingsInPlace(clone, w, libs.flipLib, wrongWingCount5(clone));
      if (fix && fix.length > 0) {
        moves = fix;
        break;
      }
    }
  } else if (primitive === "CASE") {
    moves = tryExactCaseMatch(clone, libs.caseLib, deadline);
  } else if (primitive === "PARITY") {
    moves = bestFixOverall(clone, libs.lib, libs.flipLib, deadline);
    if (!moves || moves.length === 0) moves = tryEndgameMultiPly(clone, libs.lib, libs.flipLib, deadline);
  } else if (primitive === "RECOVERY") {
    const recoveryMoves = attemptRecovery(clone, libs, deadline, DEFAULT_EVALUATOR_WEIGHTS, (w, td) => tryBaseApplied(w, libs.lib, td), trace);
    moves = recoveryMoves.length > 0 ? recoveryMoves : null;
  }
  return !!(moves && moves.length > 0);
}

export type TerminationReason = "IMMEDIATE_SUCCESS" | "BUDGET_DEPENDENT_SUCCESS" | "NEVER_SUCCEEDS_AT_TESTED_BUDGETS";

export interface PrimitiveBudgetSweepRow {
  primitive: CapabilityPrimitiveName;
  successByBudget: Record<number, boolean>;
  minSucceedingBudgetMs: number | null; // smallest tested budget at which it succeeded, null if never
  terminationReason: TerminationReason;
}

export interface RecoveryStabilityRow {
  atBudgetMs: number;
  trials: number;
  successCount: number;
  successRate: number;
  chosenCandidateTypes: string[]; // distinct RecoveryStrategy["type"] values seen across successful trials, via trace
}

export interface CaseFailureMap {
  label: string;
  sweeps: PrimitiveBudgetSweepRow[];
  recoveryStability: RecoveryStabilityRow;
}

// generateRecoveryStrategies' own candidate descriptions (fiveByFiveEdgeRecovery.ts,
// read-only reference) uniquely identify which of DISRUPT/SETUP/REPAIR/CCR
// was chosen -- the trace only carries `description`, not the internal
// `type` tag, so this maps description substrings back to type exactly as
// each genXxx() closure names its own candidate.
function classifyCandidateType(detail?: string): string {
  if (!detail) return "unknown";
  if (detail.includes("Clean-Cycle Resolution")) return "CCR";
  if (detail.includes("구조적 Cycle 해결")) return "REPAIR";
  if (detail.includes("Setup")) return "SETUP";
  if (detail.includes("Disruption")) return "DISRUPT";
  return "unknown";
}

function classifyTermination(successByBudget: Record<number, boolean>): TerminationReason {
  if (successByBudget[BUDGET_SWEEP_MS[0]]) return "IMMEDIATE_SUCCESS";
  if (Object.values(successByBudget).some(Boolean)) return "BUDGET_DEPENDENT_SUCCESS";
  return "NEVER_SUCCEEDS_AT_TESTED_BUDGETS";
}

export function buildCaseFailureMap(cubies: Cubie[], label: string, libs: ExecutorLibraries): CaseFailureMap {
  const primitives: CapabilityPrimitiveName[] = ["BASE", "FLIP", "CASE", "PARITY", "RECOVERY"];
  const sweeps: PrimitiveBudgetSweepRow[] = primitives.map((primitive) => {
    const successByBudget: Record<number, boolean> = {};
    for (const budget of BUDGET_SWEEP_MS) successByBudget[budget] = testAtBudget(cubies, primitive, libs, budget);
    const minSucceedingBudgetMs = BUDGET_SWEEP_MS.find((b) => successByBudget[b]) ?? null;
    return { primitive, successByBudget, minSucceedingBudgetMs, terminationReason: classifyTermination(successByBudget) };
  });

  const recoverySweep = sweeps.find((s) => s.primitive === "RECOVERY")!;
  const stabilityBudget = recoverySweep.minSucceedingBudgetMs ?? BUDGET_SWEEP_MS[BUDGET_SWEEP_MS.length - 1];
  let successCount = 0;
  const chosenTypes = new Set<string>();
  for (let i = 0; i < REPEAT_TRIALS; i++) {
    const trace: TraceEntry[] = [];
    const succeeded = testAtBudget(cubies, "RECOVERY", libs, stabilityBudget, trace);
    if (succeeded) {
      successCount++;
      const applied = trace.find((t) => t.label === "recovery-applied" || t.label === "recovery-repair-short-circuit" || t.label === "recovery-retry-success");
      chosenTypes.add(classifyCandidateType(applied?.detail));
    }
  }

  return {
    label,
    sweeps,
    recoveryStability: {
      atBudgetMs: stabilityBudget,
      trials: REPEAT_TRIALS,
      successCount,
      successRate: successCount / REPEAT_TRIALS,
      chosenCandidateTypes: [...chosenTypes],
    },
  };
}
