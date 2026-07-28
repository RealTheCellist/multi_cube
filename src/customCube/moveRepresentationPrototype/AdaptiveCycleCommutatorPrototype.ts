// --- AdaptiveCycleCommutatorPrototype (Move Representation Prototype
// Sprint v1) ------------------------------------------------------------
// Top-level entry point matching every existing Primitive's exact
// contract: (cubies, lib, deadline) -> Move[] | null. Standalone research
// module -- NOT wired into fiveByFiveEdgeRecovery.ts's
// generateRecoveryStrategies() or any other production call site.
//
// Pipeline: Adaptive Cycle 탐지 (AdaptiveCycleDetection, reuses
// analyzeMultiCycle) -> Commutator 생성 (LowFootprintCoreSearch, a bounded
// DFS across the WHOLE detected cycle, ranking candidates by ascending
// footprint) -> Setup/Undo-Setup 생성 (SetupConjugation, reusing the same
// buildAtomicFragments/invertSequence conjugation
// solverV2PrototypeBP2/ParityEntrySelector.ts already established) ->
// final Deferred Validation gate (only a net-improving, validated
// composition is ever returned).
import { wrongWingCount5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { detectAdaptiveCycle } from "./AdaptiveCycleDetection";
import { searchLowFootprintCore } from "./LowFootprintCoreSearch";
import { findBestConjugation } from "./SetupConjugation";

export interface AdaptiveCycleCommutatorResult {
  moves: Move[] | null;
  cycleLength: number | null;
  leavesExplored: number;
  maxDepthReached: number;
  setupLabel: string | null;
  affectedWingCount: number | null;
  wrongWingBefore: number;
  wrongWingAfter: number | null;
}

export function runAdaptiveCycleCommutator(cubies: Cubie[], lib: WingLibrary, deadline: number): AdaptiveCycleCommutatorResult {
  const wrongWingBefore = wrongWingCount5(cubies);
  const cycle = detectAdaptiveCycle(cubies);
  if (!cycle) {
    return { moves: null, cycleLength: null, leavesExplored: 0, maxDepthReached: 0, setupLabel: null, affectedWingCount: null, wrongWingBefore, wrongWingAfter: null };
  }

  const coreResult = searchLowFootprintCore(cubies, cycle.cycleNodes, lib, deadline);
  if (!coreResult.moves) {
    return {
      moves: null,
      cycleLength: cycle.cycleLength,
      leavesExplored: coreResult.leavesExplored,
      maxDepthReached: coreResult.maxDepthReached,
      setupLabel: null,
      affectedWingCount: null,
      wrongWingBefore,
      wrongWingAfter: null,
    };
  }

  const conjugated = findBestConjugation(cubies, coreResult.moves, deadline);
  if (!conjugated || conjugated.wrongWingAfter >= wrongWingBefore) {
    return {
      moves: null,
      cycleLength: cycle.cycleLength,
      leavesExplored: coreResult.leavesExplored,
      maxDepthReached: coreResult.maxDepthReached,
      setupLabel: conjugated?.setupLabel ?? null,
      affectedWingCount: conjugated?.affectedWingCount ?? null,
      wrongWingBefore,
      wrongWingAfter: conjugated?.wrongWingAfter ?? null,
    };
  }

  return {
    moves: conjugated.moves,
    cycleLength: cycle.cycleLength,
    leavesExplored: coreResult.leavesExplored,
    maxDepthReached: coreResult.maxDepthReached,
    setupLabel: conjugated.setupLabel,
    affectedWingCount: conjugated.affectedWingCount,
    wrongWingBefore,
    wrongWingAfter: conjugated.wrongWingAfter,
  };
}

/** Matches BoundedResolver/CycleChasePrototype/CCRPrototype's own
 * `(cubies, lib, deadline) -> Move[] | null` shape exactly, for any
 * future ReplayBenchmark-style drop-in comparison. */
export function tryAdaptiveCycleCommutator(cubies: Cubie[], lib: WingLibrary, deadline: number): Move[] | null {
  return runAdaptiveCycleCommutator(cubies, lib, deadline).moves;
}
