// --- MultiHopBridgePrototype (Solver Primitive Prototype Sprint v2) ------
// Priority 1 Primitive from Primitive Blueprint Refinement Sprint v1
// (51.8% precondition-match Coverage on the Gap). Implements what that
// Sprint's own design text specified: "BP-1의 접근 방식을 재사용하되 4+
// Cycle 게이트 없이 저구조 상태에도 적용" -- reuses BoundedResolver.ts's
// own EXPORTED analyzeMultiCycle/resolveBoundedMultiCycle (unmodified)
// directly, never on a protected file, never a new low-level
// move-generation algorithm.
//
// Disclosed correction made during this Sprint: the first version of this
// file called resolveBoundedMultiCycle whenever ANY cycle existed, with no
// upper bound on length -- an empirical check (150-replay probe) showed
// 45/51 (88%) of its real successes were on cycleLength>=4, i.e. BP-1's
// OWN territory, calling the IDENTICAL underlying function with the same
// library and a similar deadline. Since BP-1 is already one of the 5
// EXISTING allowed Primitives this Sprint's own "was this already Gap"
// check tests, a success there is not new coverage -- it's just a second,
// independent Math.random()-seeded roll of BP-1 itself (this whole project
// has repeatedly disclosed that BoundedResolver's search has real
// run-to-run variance from internal tie-breaking). The 3-Sprint design
// narrative for this Primitive (Representation/Primitive Blueprint Sprints)
// always described "2~3-hop" / "짧은 Cycle 대역" -- the LENGTH band BP-1's
// own MIN_CYCLE_LENGTH=4 gate excludes -- so this Prototype now enforces
// that length band explicitly, closing the gap between what was designed
// and what the code actually gated on.
//
// Contract (matches BP-1's own "unapplied candidate" convention): the
// input `cubies` is never mutated -- the caller must applySeq() the
// returned moves themselves.
import type { Cubie } from "../cubeState";
import type { Move, WingLibrary } from "../fiveByFiveEdges";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";
import { resolveBoundedMultiCycle } from "../solverV2Prototype/BoundedResolver";

// The genuinely-uncovered band this Primitive targets: a real cycle exists
// (>=2, findCycles' own minimum -- stateGraphBuilder.ts) but is shorter
// than BP-1's own MIN_CYCLE_LENGTH=4 gate (BoundedResolver.ts, unexported,
// cited by value).
const MIN_BRIDGE_CYCLE_LENGTH = 2;
const MAX_BRIDGE_CYCLE_LENGTH = 3;

export interface MultiHopBridgeResult {
  moves: Move[] | null;
  hadCycle: boolean;
  cycleLength: number;
  inBand: boolean; // cycle length was within [2,3] -- the genuinely new territory
  leavesExplored: number;
}

export function tryMultiHopBridge(cubies: Cubie[], lib: WingLibrary, deadline: number): MultiHopBridgeResult {
  const analysis = analyzeMultiCycle(cubies);
  if (!analysis) return { moves: null, hadCycle: false, cycleLength: 0, inBand: false, leavesExplored: 0 };

  const inBand = analysis.cycleLength >= MIN_BRIDGE_CYCLE_LENGTH && analysis.cycleLength <= MAX_BRIDGE_CYCLE_LENGTH;
  if (!inBand) return { moves: null, hadCycle: true, cycleLength: analysis.cycleLength, inBand: false, leavesExplored: 0 };

  const result = resolveBoundedMultiCycle(cubies, analysis.cycleNodes, lib, deadline);
  return { moves: result.moves, hadCycle: true, cycleLength: result.cycleLength, inBand: true, leavesExplored: result.leavesExplored };
}
