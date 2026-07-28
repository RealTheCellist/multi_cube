// --- MixedCommutatorPrototype (Mixed Commutator Prototype Sprint v1)
// -----------------------------------------------------------------------
// Top-level entry point matching every existing Primitive's exact
// contract: (cubies, lib, deadline) -> Move[] | null. Standalone research
// Prototype -- NOT wired into fiveByFiveEdgeRecovery.ts's
// generateRecoveryStrategies(), the Planner, or the Executor. `lib`
// (WingLibrary) is accepted only to match the Primitive contract shape
// exactly -- the bracket-commutator mechanism itself never calls
// enumerateWingCandidates() or touches the library, exactly as validated
// in Mixed Commutator Design Space Validation Sprint v1.
//
// Pipeline: Cycle Detection (precondition gate + cycleLength bookkeeping)
// -> Mixed Pattern Selection + Setup Search + Bracket Construction
// (BracketSearch, deadline-bounded, priority-ordered) -> Validation
// (validateDeferred, unmodified) -> Return.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { detectCycle } from "./CycleDetection";
import { searchBracketCommutators } from "./BracketSearch";
import { validateResult } from "./Validation";

export interface MixedCommutatorPrototypeResult {
  moves: Move[] | null;
  cycleLength: number | null;
  patternA: string | null;
  patternB: string | null;
  setupALabel: string | null;
  setupBLabel: string | null;
  attemptsEvaluated: number;
  moveLength: number | null;
  wrongWingBefore: number;
  wrongWingAfter: number | null;
  affectedWingCount: number | null;
  footprintRatio: number | null;
  exhaustedSearchSpace: boolean;
  validated: boolean;
  returnedNull: boolean;
}

export function runMixedCommutatorPrototype(cubies: Cubie[], lib: WingLibrary, deadline: number): MixedCommutatorPrototypeResult {
  void lib; // accepted only to match the Primitive contract shape -- unused, matching Design Space Sprint v1's own validated mechanism
  const wrongWingBefore = wrongWingCount5(cubies);
  const cycle = detectCycle(cubies);
  if (!cycle) {
    return {
      moves: null,
      cycleLength: null,
      patternA: null,
      patternB: null,
      setupALabel: null,
      setupBLabel: null,
      attemptsEvaluated: 0,
      moveLength: null,
      wrongWingBefore,
      wrongWingAfter: null,
      affectedWingCount: null,
      footprintRatio: null,
      exhaustedSearchSpace: true,
      validated: false,
      returnedNull: true,
    };
  }

  const search = searchBracketCommutators(cubies, deadline);
  if (!search.moves) {
    return {
      moves: null,
      cycleLength: cycle.cycleLength,
      patternA: null,
      patternB: null,
      setupALabel: null,
      setupBLabel: null,
      attemptsEvaluated: search.attemptsEvaluated,
      moveLength: null,
      wrongWingBefore,
      wrongWingAfter: null,
      affectedWingCount: null,
      footprintRatio: null,
      exhaustedSearchSpace: search.exhaustedSearchSpace,
      validated: false,
      returnedNull: true,
    };
  }

  const after = cloneCubies(cubies);
  applySeq(after, search.moves);
  const validation = validateResult(cubies, after);

  if (!validation.accepted) {
    return {
      moves: null,
      cycleLength: cycle.cycleLength,
      patternA: search.patternA,
      patternB: search.patternB,
      setupALabel: search.setupALabel,
      setupBLabel: search.setupBLabel,
      attemptsEvaluated: search.attemptsEvaluated,
      moveLength: search.moveLength,
      wrongWingBefore,
      wrongWingAfter: validation.wrongWingAfter,
      affectedWingCount: search.affectedWingCount,
      footprintRatio: search.affectedWingCount !== null ? search.affectedWingCount / cycle.cycleLength : null,
      exhaustedSearchSpace: search.exhaustedSearchSpace,
      validated: false,
      returnedNull: true,
    };
  }

  return {
    moves: search.moves,
    cycleLength: cycle.cycleLength,
    patternA: search.patternA,
    patternB: search.patternB,
    setupALabel: search.setupALabel,
    setupBLabel: search.setupBLabel,
    attemptsEvaluated: search.attemptsEvaluated,
    moveLength: search.moveLength,
    wrongWingBefore,
    wrongWingAfter: validation.wrongWingAfter,
    affectedWingCount: search.affectedWingCount,
    footprintRatio: search.affectedWingCount !== null ? search.affectedWingCount / cycle.cycleLength : null,
    exhaustedSearchSpace: search.exhaustedSearchSpace,
    validated: true,
    returnedNull: false,
  };
}

/** Matches BoundedResolver/CycleChasePrototype/CCRPrototype/
 * AdaptiveCycleCommutatorPrototype's own `(cubies, lib, deadline) ->
 * Move[] | null` shape exactly. */
export function tryMixedCommutatorPrototype(cubies: Cubie[], lib: WingLibrary, deadline: number): Move[] | null {
  return runMixedCommutatorPrototype(cubies, lib, deadline).moves;
}
