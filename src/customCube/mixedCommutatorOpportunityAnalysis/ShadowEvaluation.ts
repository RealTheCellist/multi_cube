// --- ShadowEvaluation (Mixed Commutator Opportunity Analysis Sprint v1,
// RQ-2, Required Measurement #3 "Shadow Evaluation") -------------------------
// Calls tryMixedCommutatorPrototype directly on EVERY case, completely
// bypassing the Recovery-layer Gate (analyzeConstraints check in
// genMixedCommutator) -- never wired to Production, never touches
// fiveByFiveEdgeRecovery.ts. This answers "could the Prototype have found
// an improving move here, regardless of whether the Gate would ever let it
// try?" The Prototype's own internal precondition (CycleDetection.ts's
// detectCycle -- any cycleCount>=1 via pickLongestCycle) is looser than the
// Recovery Gate (cycleCount===1 AND componentCount===1 AND conflictCount===0),
// so this can reveal cases the Gate excludes but the Prototype itself could
// still handle.
//
// Deterministic, single pass, no repeats needed: searchBracketCommutators
// (BracketSearch.ts) is a fixed, exhaustive enumeration over
// buildAtomicFragments() x PATTERN_PAIR_PRIORITY -- no shuffle(), no
// randomness anywhere in the mechanism (confirmed by direct source read).
// Given a generous enough budget the search exhausts fully and returns the
// exact same result every time for the same input state.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { runMixedCommutatorPrototype } from "../mixedCommutatorPrototype/MixedCommutatorPrototype";
import type { PopulationTag } from "./GateFunnel";

// Matches this whole research arc's own "extended budget" convention (e.g.
// Mixed Commutator Prototype Sprint v1's own 5000ms arm) -- generous enough
// that exhaustedSearchSpace is expected to be true for essentially every
// case, so "not solvable at this budget" reads as "not solvable by this
// mechanism at all", not "ran out of time".
export const EXTENDED_SHADOW_BUDGET_MS = 5000;

export interface ShadowEvaluationRow {
  label: string;
  populationTag: PopulationTag;
  hasAnyCycle: boolean; // Prototype's OWN precondition (CycleDetection) -- looser than the Recovery Gate
  shadowSolvable: boolean; // tryMixedCommutatorPrototype found a genuinely improving move at the extended budget, Gate entirely bypassed
  exhaustedSearchSpace: boolean; // false would mean the extended budget still wasn't enough -- worth flagging if it ever happens
  wallMs: number;
}

export function measureShadowEvaluation(cubies: Cubie[], label: string, populationTag: PopulationTag, lib: WingLibrary): ShadowEvaluationRow {
  const before = wrongWingCount5(cubies);
  const start = Date.now();
  const result = runMixedCommutatorPrototype(cloneCubies(cubies), lib, Date.now() + EXTENDED_SHADOW_BUDGET_MS);
  const wallMs = Date.now() - start;

  let shadowSolvable = false;
  if (result.moves) {
    const clone = cloneCubies(cubies);
    applySeq(clone, result.moves);
    shadowSolvable = wrongWingCount5(clone) < before;
  }

  return {
    label,
    populationTag,
    hasAnyCycle: result.cycleLength !== null,
    shadowSolvable,
    exhaustedSearchSpace: result.exhaustedSearchSpace,
    wallMs,
  };
}

export interface ShadowEvaluationSummary {
  total: number;
  hasAnyCycleCount: number;
  shadowSolvableCount: number;
  anyDeadlineHit: boolean;
}

export function summarizeShadowEvaluation(rows: readonly ShadowEvaluationRow[]): ShadowEvaluationSummary {
  return {
    total: rows.length,
    hasAnyCycleCount: rows.filter((r) => r.hasAnyCycle).length,
    shadowSolvableCount: rows.filter((r) => r.shadowSolvable).length,
    anyDeadlineHit: rows.some((r) => !r.exhaustedSearchSpace),
  };
}
