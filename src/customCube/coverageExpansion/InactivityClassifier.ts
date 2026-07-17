// --- InactivityClassifier (Coverage Expansion Sprint v1) --------------------
// Spec STEP 1: classifies WHY CycleChase (primitivePrototype/CycleChasePrototype.ts,
// imported read-only, NEVER modified) fails to activate on a given Replay.
//
// Ground truth for "did it activate" is the REAL, unmodified `tryCycleChase`
// itself (called here exactly as any other caller would) -- this file only
// adds a DIAGNOSTIC walk that mirrors that function's own internal decision
// steps (cycle detection -> length gate -> hop-by-hop chase) to explain a
// null result, never a second, divergent implementation that could disagree
// with the real one about whether a given Replay activates.
import { cloneCubies } from "../cubeState";
import { applySeq, slotKey, tryFixWing, wrongWingCount5, wrongWings5, type WingLibrary } from "../fiveByFiveEdges";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { hasParity } from "../goalPlanner/GoalAnalyzer";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { tryCycleChase } from "../primitivePrototype/CycleChasePrototype";
import { pickLongestCycle } from "./cycleUtil";

export type InactivityCause = "NO_WANTS_CYCLE" | "ONLY_3_CYCLE" | "FIRST_HOP_FAIL" | "BROKEN_BY_PARITY" | "INSUFFICIENT_PAIR" | "UNKNOWN";

export interface InactivityClassification {
  hash: string;
  activated: boolean; // ground truth from the real tryCycleChase
  cause: InactivityCause | null; // null when activated -- there's nothing to explain
  longestCycleLength: number;
  hopsSucceeded: number;
}

// Mirrors CycleChasePrototype.ts's own MIN_CYCLE_LENGTH_TO_CHASE constant --
// duplicated here ONLY for this diagnostic walk (that file itself is never
// imported for its internals, only called as a black box for ground truth
// above). If that Prototype's own threshold ever changes, this constant
// would need updating too -- disclosed rather than silently assumed in sync.
const MIN_CYCLE_LENGTH_TO_CHASE = 4;

export function classifyReplay(snapshot: FailureSnapshot, lib: WingLibrary, deadlineMs: number): InactivityClassification {
  const groundTruthCubies = deserializeCube(snapshot.cubeState);
  const activatedResult = tryCycleChase(groundTruthCubies, lib, Date.now() + deadlineMs);
  if (activatedResult) {
    return { hash: snapshot.hash, activated: true, cause: null, longestCycleLength: 0, hopsSucceeded: 0 };
  }

  // Diagnostic-only re-walk (fresh clone, same starting state) to explain
  // the null result above.
  const cubies = deserializeCube(snapshot.cubeState);
  const before = wrongWingCount5(cubies);
  const originalHasParity = hasParity(cubies);
  const working = cloneCubies(cubies);

  const cycle = pickLongestCycle(buildStateGraph(working).cycles);
  if (!cycle) {
    return { hash: snapshot.hash, activated: false, cause: "NO_WANTS_CYCLE", longestCycleLength: 0, hopsSucceeded: 0 };
  }
  if (cycle.length < MIN_CYCLE_LENGTH_TO_CHASE) {
    return { hash: snapshot.hash, activated: false, cause: "ONLY_3_CYCLE", longestCycleLength: cycle.length, hopsSucceeded: 0 };
  }

  let hopsSucceeded = 0;
  const deadline = Date.now() + deadlineMs;
  for (const slot of cycle) {
    if (Date.now() > deadline) break;
    const wrongHere = wrongWings5(working).find((w) => slotKey(w) === slot);
    if (!wrongHere) continue;
    const fix = tryFixWing(working, wrongHere, lib, deadline);
    if (!fix || fix.length === 0) break;
    applySeq(working, fix);
    hopsSucceeded++;
  }

  if (hopsSucceeded === 0) {
    return { hash: snapshot.hash, activated: false, cause: "FIRST_HOP_FAIL", longestCycleLength: cycle.length, hopsSucceeded };
  }

  const after = wrongWingCount5(working);
  if (after < before) {
    // The diagnostic walk found an improvement that the ground-truth call
    // above did not (e.g. a timing-sensitive edge case) -- flag honestly
    // rather than claim a cause that contradicts the real function's own
    // null result.
    return { hash: snapshot.hash, activated: false, cause: "UNKNOWN", longestCycleLength: cycle.length, hopsSucceeded };
  }

  return {
    hash: snapshot.hash,
    activated: false,
    cause: originalHasParity ? "BROKEN_BY_PARITY" : "INSUFFICIENT_PAIR",
    longestCycleLength: cycle.length,
    hopsSucceeded,
  };
}
