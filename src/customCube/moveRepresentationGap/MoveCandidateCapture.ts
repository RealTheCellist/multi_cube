// --- MoveCandidateCapture (Move Representation Gap Analysis Sprint v1,
// RQ-1/RQ-3, Measurement) ---------------------------------------------------
// Directly calls the existing, unmodified enumerateWingCandidates() at
// every node of a case's cycle (the same real move-generation function
// both BP-1 and CCR call internally) and measures the REAL structural
// effect of each returned candidate -- before/after wrongWingCount,
// cycleCount, componentCount, conflictEdgeCount, and how many wings
// actually changed slot (affectedWingCount) -- rather than assuming what
// kind of move it must be from its name.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { analyzeConstraints } from "../capabilityAnalysis/constraintAnalyzer";

const CANDIDATE_PROBE_MAX_RESULTS = 10;
const CANDIDATE_PROBE_DEADLINE_MS = 150;

export type MoveClass = "COMPONENT_MERGE" | "COMPONENT_SPLIT" | "CYCLE_MERGE" | "CYCLE_SPLIT" | "CYCLE_ROTATION_IMPROVING" | "LATERAL_NO_CHANGE" | "REGRESSIVE";

// Disclosed classification rule, applied in this fixed priority order to
// the MEASURED before/after deltas of a single candidate:
//   1. componentDelta < 0  -> COMPONENT_MERGE (two WANTS-graph components joined)
//   2. componentDelta > 0  -> COMPONENT_SPLIT
//   3. cycleCountDelta < 0 -> CYCLE_MERGE (fewer disjoint cycles remain)
//   4. cycleCountDelta > 0 -> CYCLE_SPLIT
//   5. wrongWingDelta < 0  -> CYCLE_ROTATION_IMPROVING (genuine net progress,
//      structure otherwise unchanged)
//   6. wrongWingDelta === 0 -> LATERAL_NO_CHANGE (rearranges pieces without
//      changing how many are wrong -- the "wrongness" just moves to a
//      different wing)
//   7. wrongWingDelta > 0  -> REGRESSIVE (makes it worse)
function classifyMove(componentDelta: number, cycleCountDelta: number, wrongWingDelta: number): MoveClass {
  if (componentDelta < 0) return "COMPONENT_MERGE";
  if (componentDelta > 0) return "COMPONENT_SPLIT";
  if (cycleCountDelta < 0) return "CYCLE_MERGE";
  if (cycleCountDelta > 0) return "CYCLE_SPLIT";
  if (wrongWingDelta < 0) return "CYCLE_ROTATION_IMPROVING";
  if (wrongWingDelta === 0) return "LATERAL_NO_CHANGE";
  return "REGRESSIVE";
}

export interface CandidateMeasurement {
  label: string;
  hopSlot: string;
  candidateIndex: number;
  moveLength: number;
  affectedWingCount: number; // how many wings actually changed slot
  wrongWingBefore: number;
  wrongWingAfter: number;
  wrongWingDelta: number;
  cycleCountBefore: number;
  cycleCountAfter: number;
  cycleCountDelta: number;
  componentCountBefore: number;
  componentCountAfter: number;
  componentCountDelta: number;
  conflictEdgeCountBefore: number;
  conflictEdgeCountAfter: number;
  conflictEdgeDelta: number;
  moveClass: MoveClass;
}

function countAffectedWings(before: Cubie[], after: Cubie[]): number {
  const beforeSlotById = new Map(before.map((c) => [c.id, slotKey(c)]));
  let affected = 0;
  for (const c of after) {
    if (beforeSlotById.get(c.id) !== slotKey(c)) affected++;
  }
  return affected;
}

export function captureCandidatesForCase(cubies: Cubie[], label: string, cycleNodes: readonly string[], lib: WingLibrary): CandidateMeasurement[] {
  const measurements: CandidateMeasurement[] = [];
  const graphBefore = buildStateGraph(cubies);
  const statsBefore = analyzeConstraints(graphBefore);
  const wrongWingBefore = wrongWingCount5(cubies);

  for (const slot of cycleNodes) {
    const wrongHere = wrongWings5(cubies).find((w) => slotKey(w) === slot);
    if (!wrongHere) continue;
    const deadline = Date.now() + CANDIDATE_PROBE_DEADLINE_MS;
    const candidates = enumerateWingCandidates(cubies, wrongHere, lib, deadline, CANDIDATE_PROBE_MAX_RESULTS);

    candidates.forEach((candidate: Move[], idx: number) => {
      const clone = cloneCubies(cubies);
      applySeq(clone, candidate);
      const graphAfter = buildStateGraph(clone);
      const statsAfter = analyzeConstraints(graphAfter);
      const wrongWingAfter = wrongWingCount5(clone);

      const cycleCountDelta = statsAfter.cycleCount - statsBefore.cycleCount;
      const componentCountDelta = statsAfter.componentCount - statsBefore.componentCount;
      const wrongWingDelta = wrongWingAfter - wrongWingBefore;

      measurements.push({
        label,
        hopSlot: slot,
        candidateIndex: idx,
        moveLength: candidate.length,
        affectedWingCount: countAffectedWings(cubies, clone),
        wrongWingBefore,
        wrongWingAfter,
        wrongWingDelta,
        cycleCountBefore: statsBefore.cycleCount,
        cycleCountAfter: statsAfter.cycleCount,
        cycleCountDelta,
        componentCountBefore: statsBefore.componentCount,
        componentCountAfter: statsAfter.componentCount,
        componentCountDelta,
        conflictEdgeCountBefore: statsBefore.conflictCount,
        conflictEdgeCountAfter: statsAfter.conflictCount,
        conflictEdgeDelta: statsAfter.conflictCount - statsBefore.conflictCount,
        moveClass: classifyMove(componentCountDelta, cycleCountDelta, wrongWingDelta),
      });
    });
  }

  return measurements;
}
