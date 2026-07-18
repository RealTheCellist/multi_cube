// --- DeferredValidator (Solver v2 Primitive Prototype Sprint v1) ----------
// STEP 3: the whole point of "Bounded Multi-Cycle Resolver" vs CycleChase --
// no per-hop WrongWing improvement check (tryFixWing()'s own contract,
// analyzed in Solver Contract Analysis Sprint v1). Instead, the ENTIRE
// cycle traversal happens first, and this is the ONE place a result is
// ever judged, against the ORIGINAL starting state.
import type { Cubie } from "../cubeState";
import { wrongWingCount5 } from "../fiveByFiveEdges";
import { pairCountOf, hasParity } from "../goalPlanner/GoalAnalyzer";

export interface DeferredValidationResult {
  accepted: boolean; // net WrongWing improvement vs the ORIGINAL starting state
  wrongWingBefore: number;
  wrongWingAfter: number;
  pairBefore: number;
  pairAfter: number;
  parityBefore: boolean;
  parityAfter: boolean;
}

export function validateDeferred(before: Cubie[], after: Cubie[]): DeferredValidationResult {
  const wrongWingBefore = wrongWingCount5(before);
  const wrongWingAfter = wrongWingCount5(after);
  const pairBefore = pairCountOf(before);
  const pairAfter = pairCountOf(after);
  const parityBefore = hasParity(before);
  const parityAfter = hasParity(after);

  return {
    accepted: wrongWingAfter < wrongWingBefore,
    wrongWingBefore,
    wrongWingAfter,
    pairBefore,
    pairAfter,
    parityBefore,
    parityAfter,
  };
}
