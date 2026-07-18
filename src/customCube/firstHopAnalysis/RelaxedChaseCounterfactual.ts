// --- RelaxedChaseCounterfactual (First-Hop Failure Analysis Sprint v1) -----
// Spec STEP 5's second counterfactual, targeting PAIR_CONFLICT (the
// dominant failure mode -- see root-cause-report.txt: candidates exist for
// 40/46 FIRST_HOP_FAIL Replays, but none of them net-improve WrongWing
// immediately, which is exactly tryFixWing()'s own documented contract:
// "only ever returns a fix that helps right now"). This tests "what if a
// hop is accepted even when it doesn't help immediately, betting that the
// NEXT hop recovers the loss" -- using enumerateWingCandidates() (existing,
// exported, unmodified) instead of tryFixWing(), never touching
// CycleChasePrototype.ts or any protected file. Purely a new, parallel
// simulation living in firstHopAnalysis/.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, enumerateWingCandidates, slotKey, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { pickLongestCycle } from "../coverageExpansion/cycleUtil";

const MIN_CYCLE_LENGTH_TO_CHASE = 4;

export function relaxedCycleChase(cubies: Cubie[], lib: WingLibrary, deadline: number): Move[] | null {
  const before = wrongWingCount5(cubies);
  const working = cloneCubies(cubies);

  const cycle = pickLongestCycle(buildStateGraph(working).cycles);
  if (!cycle || cycle.length < MIN_CYCLE_LENGTH_TO_CHASE) return null;

  const applied: Move[] = [];
  for (const slot of cycle) {
    if (Date.now() > deadline) break;
    const wrongHere = wrongWings5(working).find((w) => slotKey(w) === slot);
    if (!wrongHere) continue;
    const candidates = enumerateWingCandidates(working, wrongHere, lib, deadline, 1);
    if (candidates.length === 0) break; // genuinely no valid move at all (NO_VALID_PATH) -- nothing to accept
    applySeq(working, candidates[0]);
    applied.push(...candidates[0]);
  }

  if (applied.length === 0) return null;
  const after = wrongWingCount5(working);
  if (after >= before) return null;
  return applied;
}
