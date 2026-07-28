// --- RecoveryLayerCounterfactual (Mixed Commutator Production Validation
// Sprint v1, RQ-1/RQ-2/RQ-3/RQ-5) --------------------------------------------
// Calls the REAL, unmodified generateRecoveryStrategies()/chooseBestRecovery()
// (fiveByFiveEdgeRecovery.ts, untouched this Sprint) directly, twice per
// case: once with includeMixedCommutator=true (Integrated -- the real
// production default) and once with includeMixedCommutator=false (Baseline
// -- byte-identical reconstruction of pre-Integration-Sprint behavior,
// already proven in docs/MIXED_COMMUTATOR_PRODUCTION_INTEGRATION.md: the
// diff is purely additive and gated behind this exact flag, so disabling it
// reproduces the pre-integration code path exactly, not an approximation).
//
// This is the ONE place in the real, exported production API where a
// Baseline/Integrated toggle for Mixed Commutator specifically exists --
// executeTask()/solve() have no such passthrough (see
// EndToEndValidationProbe.ts's own comment), so end-to-end Solve Rate can
// only diverge between the two arms at exactly this layer, for exactly the
// cases where MIXED_COMMUTATOR's own candidate wins chooseBestRecovery.
// Every other case is proven identical between arms by the same additive-
// diff argument, without needing to re-run a second real solve() pass.
import { cloneCubies, type Cubie } from "../cubeState";
import { generateRecoveryStrategies, chooseBestRecovery, type SchedulingEvent } from "../fiveByFiveEdgeRecovery";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import type { RecoveryStrategy, RecoveryType } from "../fiveByFiveEdgeSolverTypes";

export const RECOVERY_TYPES: RecoveryType[] = ["DISRUPT", "SETUP", "REPAIR", "CCR", "MIXED_COMMUTATOR"];

export interface CounterfactualRow {
  label: string;
  populationTag: "PRIMARY" | "SECONDARY_ONLY" | "REGRESSION";
  repeat: number;
  wrongWingBefore: number;
  integratedChosenType: RecoveryType | null;
  integratedWrongWingAfter: number | null;
  baselineChosenType: RecoveryType | null;
  baselineWrongWingAfter: number | null;
  outcomeChanged: boolean;
  perTypeImproving: Record<RecoveryType, boolean>; // from the withMixed (full) candidate list
  // Isolated MIXED_COMMUTATOR-only wall time (onEvent "start" -> "generated"/
  // "empty"/"skipped" timestamps), NOT a whole-call before/after diff -- a
  // whole-call diff is confounded by DISRUPT/SETUP's own independent
  // shuffle()-driven search timing varying between the two separate calls,
  // which would misattribute their noise to MIXED_COMMUTATOR. null only if
  // the onEvent hook never fired (should not happen when includeMixedCommutator=true).
  mixedOwnMs: number | null;
}

function improvingByType(candidates: readonly RecoveryStrategy[]): Record<RecoveryType, boolean> {
  const out = {} as Record<RecoveryType, boolean>;
  for (const t of RECOVERY_TYPES) out[t] = candidates.some((c) => c.type === t && c.expectedWrongWingDelta < 0);
  return out;
}

export function measureCounterfactual(
  cubies: Cubie[],
  label: string,
  populationTag: CounterfactualRow["populationTag"],
  repeat: number,
  libs: ExecutorLibraries,
  budgetMs: number
): CounterfactualRow {
  const wrongWingBefore = wrongWingCount5(cubies);

  let mixedStartMs: number | null = null;
  let mixedOwnMs: number | null = null;
  const onEvent = (e: SchedulingEvent) => {
    if (e.candidateType !== "MIXED_COMMUTATOR") return;
    if (e.phase === "start") mixedStartMs = e.atMs;
    else if ((e.phase === "generated" || e.phase === "empty" || e.phase === "skipped") && mixedStartMs !== null) {
      mixedOwnMs = e.atMs - mixedStartMs;
    }
  };

  // Each arm gets its OWN fresh deadline computed off Date.now() at the
  // moment of ITS OWN call, never a single value shared across both calls.
  // Sharing one precomputed deadline here would reproduce the exact
  // "pre-computed shared deadline" bug this research arc already hit and
  // fixed once (Production Integration Blueprint Sprint v1's
  // measureInteraction bug): since REPAIR/CCR/MIXED_COMMUTATOR's own
  // reserved slices are each measured off the OUTER deadline and are
  // additive on top of DISRUPT/SETUP's shared genDeadline, the FIRST call
  // (withMixed) can itself consume real wall-clock time approaching the
  // outer budget, which would silently squeeze the SECOND call's
  // (withoutMixed) own window if both shared one fixed deadline --
  // systematically handicapping whichever arm runs second, with nothing to
  // do with MIXED_COMMUTATOR itself. Giving each call its own fresh
  // Date.now()+budgetMs window makes the two calls a fair, independent A/B
  // comparison.
  const withMixed = generateRecoveryStrategies(cloneCubies(cubies), libs, Date.now() + budgetMs, undefined, true, "reservedBudget", onEvent, true, true);
  const withMixedBest = chooseBestRecovery(withMixed);

  const withoutMixed = generateRecoveryStrategies(cloneCubies(cubies), libs, Date.now() + budgetMs, undefined, true, "reservedBudget", undefined, true, false);
  const withoutMixedBest = chooseBestRecovery(withoutMixed);

  let integratedWrongWingAfter: number | null = null;
  if (withMixedBest) {
    const clone = cloneCubies(cubies);
    applySeq(clone, withMixedBest.moves);
    integratedWrongWingAfter = wrongWingCount5(clone);
  }
  let baselineWrongWingAfter: number | null = null;
  if (withoutMixedBest) {
    const clone = cloneCubies(cubies);
    applySeq(clone, withoutMixedBest.moves);
    baselineWrongWingAfter = wrongWingCount5(clone);
  }

  return {
    label,
    populationTag,
    repeat,
    wrongWingBefore,
    integratedChosenType: withMixedBest?.type ?? null,
    integratedWrongWingAfter,
    baselineChosenType: withoutMixedBest?.type ?? null,
    baselineWrongWingAfter,
    outcomeChanged: (withMixedBest?.type ?? null) !== (withoutMixedBest?.type ?? null),
    perTypeImproving: improvingByType(withMixed),
    mixedOwnMs,
  };
}
