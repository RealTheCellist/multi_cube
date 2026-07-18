// --- DelayedImprovementSimulator (Solver Contract Analysis Sprint v1) ------
// Spec STEP 3/4: Counterfactual -- if a PAIR_CONFLICT Replay's rejected
// candidate is accepted ANYWAY (tolerating the temporary non-improvement
// tryFixWing()'s own contract forbids), does cumulative WrongWing improve
// within a few more steps along the SAME detected WANTS-cycle? Never
// touches the real Solver or CycleChasePrototype.ts -- a new, independent
// simulation using only enumerateWingCandidates() (existing, exported,
// unmodified).
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type WingLibrary } from "../fiveByFiveEdges";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { pickLongestCycle } from "../coverageExpansion/cycleUtil";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";

export interface DelayedImprovementResult {
  replayHash: string;
  before: number;
  improvedAtStep: number | null; // 1-indexed step where cumulative WrongWing first drops below `before`; null if never within maxSteps
  finalWrongWing: number;
  stepsTaken: number;
}

export function simulateDelayedImprovement(snapshot: FailureSnapshot, startSlot: string, lib: WingLibrary, deadlineMs: number, maxSteps: number): DelayedImprovementResult {
  const cubies = deserializeCube(snapshot.cubeState);
  const before = wrongWingCount5(cubies);
  const working = cloneCubies(cubies);

  const cycle = pickLongestCycle(buildStateGraph(working).cycles);
  const orderedSlots = cycle
    ? [...cycle.slice(cycle.indexOf(startSlot) >= 0 ? cycle.indexOf(startSlot) : 0), ...cycle.slice(0, cycle.indexOf(startSlot) >= 0 ? cycle.indexOf(startSlot) : 0)]
    : [startSlot];

  let improvedAtStep: number | null = null;
  let step = 0;
  const deadline = Date.now() + deadlineMs;

  for (const slot of orderedSlots) {
    if (step >= maxSteps) break;
    const wrongHere = wrongWings5(working).find((w: Cubie) => slotKey(w) === slot);
    if (!wrongHere) continue;
    const candidates = enumerateWingCandidates(working, wrongHere, lib, deadline, 1);
    if (candidates.length === 0) break; // truly stuck -- no move at all to accept, even relaxed
    applySeq(working, candidates[0]);
    step++;
    if (improvedAtStep === null && wrongWingCount5(working) < before) improvedAtStep = step;
  }

  return { replayHash: snapshot.hash, before, improvedAtStep, finalWrongWing: wrongWingCount5(working), stepsTaken: step };
}

export function summarizeDelayedImprovement(results: readonly DelayedImprovementResult[]) {
  const total = results.length;
  const improved = results.filter((r) => r.improvedAtStep !== null);
  const byStep = new Map<number, number>();
  for (const r of improved) byStep.set(r.improvedAtStep!, (byStep.get(r.improvedAtStep!) ?? 0) + 1);
  return {
    total,
    improvedCount: improved.length,
    delayedImprovementRatio: total ? improved.length / total : 0,
    byStep: [...byStep.entries()].sort((a, b) => a[0] - b[0]),
  };
}
