// --- RecoveryFlowMeasurement (Gate Production Integration Sprint v1,
// RQ-3, Deliverable "Recovery Report") ----------------------------------------
// Calls the REAL, now-updated generateRecoveryStrategies()/
// chooseBestRecovery() (fiveByFiveEdgeRecovery.ts's genMixedCommutator now
// wired with Gate C: cycleCount===1 AND componentCount===1, conflictCount
// condition removed per Gate Refinement Sprint v1) directly -- production
// code, not a shadow reconstruction. A second call with
// includeMixedCommutator=false reconstructs "no Mixed Commutator at all"
// for the Regression Check (mirrors Mixed Commutator Production
// Integration Sprint v1's own established methodology exactly).
import { cloneCubies, type Cubie } from "../cubeState";
import { generateRecoveryStrategies, chooseBestRecovery, type SchedulingEvent } from "../fiveByFiveEdgeRecovery";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import type { RecoveryStrategy } from "../fiveByFiveEdgeSolverTypes";

export type PopulationTag = "PRIMARY" | "SECONDARY_ONLY" | "REGRESSION";

export interface FlowMeasurementRow {
  label: string;
  populationTag: PopulationTag;
  gatePhase: "generated" | "empty" | "skipped" | "not_started";
  withMixedBestType: string | null;
  withoutMixedBestType: string | null;
  mixedWasChosen: boolean;
  outcomeChangedByMixed: boolean;
  wrongWingBefore: number;
  wrongWingAfterWithMixed: number | null;
  wrongWingAfterWithoutMixed: number | null;
  threw: boolean;
  mixedCandidate: RecoveryStrategy | null;
  // Isolated MIXED_COMMUTATOR-only wall time (onEvent "start" -> "generated"/
  // "empty"/"skipped" timestamps), NOT the whole generateRecoveryStrategies()
  // call duration -- the whole call is dominated by DISRUPT/SETUP/REPAIR/CCR's
  // own budget mechanics (RECOVERY_GEN_BUDGET_MS shared slice + REPAIR's own
  // reserved slice + CCR's own search), all UNCHANGED by this Sprint's Gate
  // edit, and would misattribute their pre-existing cost to this change (the
  // same measurement mistake this arc's Production Validation Sprint v1
  // already caught and fixed once -- see that Sprint's own
  // RecoveryLayerCounterfactual.ts comment).
  mixedOwnMs: number | null;
}

export function measureRecoveryFlow(cubies: Cubie[], label: string, populationTag: PopulationTag, libs: ExecutorLibraries, budgetMs: number): FlowMeasurementRow {
  let gatePhase: FlowMeasurementRow["gatePhase"] = "not_started";
  let mixedStartMs: number | null = null;
  let mixedOwnMs: number | null = null;
  const onEvent = (e: SchedulingEvent) => {
    if (e.candidateType !== "MIXED_COMMUTATOR") return;
    if (e.phase === "start") mixedStartMs = e.atMs;
    else if ((e.phase === "generated" || e.phase === "empty" || e.phase === "skipped")) {
      gatePhase = e.phase;
      if (mixedStartMs !== null) mixedOwnMs = e.atMs - mixedStartMs;
    }
  };

  const wrongWingBefore = wrongWingCount5(cubies);
  let threw = false;
  let withMixedBestType: string | null = null;
  let withoutMixedBestType: string | null = null;
  let wrongWingAfterWithMixed: number | null = null;
  let wrongWingAfterWithoutMixed: number | null = null;
  let mixedCandidate: RecoveryStrategy | null = null;

  try {
    const withMixed = generateRecoveryStrategies(cloneCubies(cubies), libs, Date.now() + budgetMs, undefined, true, "reservedBudget", onEvent, true, true);
    mixedCandidate = withMixed.find((c) => c.type === "MIXED_COMMUTATOR") ?? null;
    const withMixedBest = chooseBestRecovery(withMixed);
    withMixedBestType = withMixedBest?.type ?? null;
    if (withMixedBest) {
      const clone = cloneCubies(cubies);
      applySeq(clone, withMixedBest.moves);
      wrongWingAfterWithMixed = wrongWingCount5(clone);
    }

    const withoutMixed = generateRecoveryStrategies(cloneCubies(cubies), libs, Date.now() + budgetMs, undefined, true, "reservedBudget", undefined, true, false);
    const withoutMixedBest = chooseBestRecovery(withoutMixed);
    withoutMixedBestType = withoutMixedBest?.type ?? null;
    if (withoutMixedBest) {
      const clone = cloneCubies(cubies);
      applySeq(clone, withoutMixedBest.moves);
      wrongWingAfterWithoutMixed = wrongWingCount5(clone);
    }
  } catch {
    threw = true;
  }

  return {
    label,
    populationTag,
    gatePhase,
    withMixedBestType,
    withoutMixedBestType,
    mixedWasChosen: withMixedBestType === "MIXED_COMMUTATOR",
    outcomeChangedByMixed: withMixedBestType !== withoutMixedBestType,
    wrongWingBefore,
    wrongWingAfterWithMixed,
    wrongWingAfterWithoutMixed,
    threw,
    mixedCandidate,
    mixedOwnMs,
  };
}
