// --- PreconditionCoverage (Solver Primitive Prototype Sprint v3) ---------
// STEP1: measures how often the confirmed Blueprint gate
// (cycleLength 2~3 AND conflictEdgeCount>0) actually triggers a v3
// Primitive call across the full 150-replay Dataset, breaking down every
// non-match by WHICH gate stage rejected it -- lets the report cross-check
// the resulting Coverage against Blueprint Sprint v2's own STEP4
// measurement (avgCoverage=6.7%) as an independent consistency check.
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import type { WingLibrary } from "../fiveByFiveEdges";
import { tryMultiHopBridgeV3, type GateOutcome } from "./MultiHopBridgePrototypeV3";

export interface GateOutcomeTally {
  outcome: GateOutcome;
  count: number;
  ratio: number;
}

export interface PreconditionCoverageResult {
  totalReplays: number;
  tallies: GateOutcomeTally[];
  gateMatchedCount: number;
  gateMatchedCoverage: number;
}

const ALL_OUTCOMES: GateOutcome[] = ["no_cycle", "out_of_band", "no_conflict", "gate_matched"];

export function measurePreconditionCoverage(snapshots: readonly FailureSnapshot[], lib: WingLibrary, deadlineMs: number): PreconditionCoverageResult {
  const outcomes: GateOutcome[] = snapshots.map((s) => {
    const cubies = deserializeCube(s.cubeState);
    return tryMultiHopBridgeV3(cubies, lib, Date.now() + deadlineMs).gateOutcome;
  });

  const counts = new Map<GateOutcome, number>();
  for (const o of outcomes) counts.set(o, (counts.get(o) ?? 0) + 1);
  const total = outcomes.length;
  const tallies = ALL_OUTCOMES.map((outcome) => ({ outcome, count: counts.get(outcome) ?? 0, ratio: total ? (counts.get(outcome) ?? 0) / total : 0 }));

  const gateMatchedCount = counts.get("gate_matched") ?? 0;
  return { totalReplays: total, tallies, gateMatchedCount, gateMatchedCoverage: total ? gateMatchedCount / total : 0 };
}
