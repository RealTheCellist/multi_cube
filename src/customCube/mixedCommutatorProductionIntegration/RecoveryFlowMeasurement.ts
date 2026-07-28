// --- RecoveryFlowMeasurement (Mixed Commutator Production Integration
// Sprint v1, RQ-3, Deliverable #3 "Recovery Flow") ---------------------------
// Calls the NOW-WIRED-IN generateRecoveryStrategies()/chooseBestRecovery()
// directly (real production code, post-integration) to measure the ACTUAL
// Recovery Flow behavior with MIXED_COMMUTATOR present -- candidate
// generation, Gate pass/skip rate, which type wins selection, and (via a
// second baseline call with includeMixedCommutator=false) whether its
// presence changes the outcome for any case (conflict/regression check).
import { cloneCubies, type Cubie } from "../cubeState";
import {
  generateRecoveryStrategies,
  chooseBestRecovery,
  type SchedulingEvent,
} from "../fiveByFiveEdgeRecovery";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import type { RecoveryStrategy } from "../fiveByFiveEdgeSolverTypes";

export interface FlowMeasurementRow {
  label: string;
  populationTag: "PRIMARY" | "SECONDARY_ONLY" | "REGRESSION";
  gatePhase: "generated" | "empty" | "skipped" | "not_started";
  withMixedBestType: string | null;
  withoutMixedBestType: string | null;
  mixedWasChosen: boolean;
  outcomeChangedByMixed: boolean; // withMixedBestType !== withoutMixedBestType
  wrongWingBefore: number;
  wrongWingAfterChosen: number | null; // if a candidate was chosen (with Mixed included), wrongWingCount after applying it
  wouldShortCircuit: boolean; // mixedWasChosen && wrongWingAfterChosen < wrongWingBefore (mirrors attemptRecovery's real short-circuit condition)
  mixedCandidate: RecoveryStrategy | null; // raw candidate object, for Primitive Contract Verification
}

export function measureRecoveryFlow(cubies: Cubie[], label: string, populationTag: FlowMeasurementRow["populationTag"], libs: ExecutorLibraries, deadline: number): FlowMeasurementRow {
  let gatePhase: FlowMeasurementRow["gatePhase"] = "not_started";
  const onEvent = (e: SchedulingEvent) => {
    if (e.candidateType === "MIXED_COMMUTATOR" && (e.phase === "generated" || e.phase === "empty" || e.phase === "skipped")) {
      gatePhase = e.phase;
    }
  };

  const withMixed = generateRecoveryStrategies(cloneCubies(cubies), libs, deadline, undefined, true, "reservedBudget", onEvent, true, true);
  const withMixedBest = chooseBestRecovery(withMixed);

  const withoutMixed = generateRecoveryStrategies(cloneCubies(cubies), libs, deadline, undefined, true, "reservedBudget", undefined, true, false);
  const withoutMixedBest = chooseBestRecovery(withoutMixed);

  const wrongWingBefore = wrongWingCount5(cubies);
  let wrongWingAfterChosen: number | null = null;
  if (withMixedBest) {
    const clone = cloneCubies(cubies);
    applySeq(clone, withMixedBest.moves);
    wrongWingAfterChosen = wrongWingCount5(clone);
  }

  const mixedWasChosen = withMixedBest?.type === "MIXED_COMMUTATOR";
  const wouldShortCircuit = mixedWasChosen && wrongWingAfterChosen !== null && wrongWingAfterChosen < wrongWingBefore;
  const mixedCandidate = withMixed.find((c) => c.type === "MIXED_COMMUTATOR") ?? null;

  return {
    label,
    populationTag,
    gatePhase,
    withMixedBestType: withMixedBest?.type ?? null,
    withoutMixedBestType: withoutMixedBest?.type ?? null,
    mixedWasChosen,
    outcomeChangedByMixed: (withMixedBest?.type ?? null) !== (withoutMixedBest?.type ?? null),
    wrongWingBefore,
    wrongWingAfterChosen,
    wouldShortCircuit,
    mixedCandidate,
  };
}
