// --- GateExpansionVariants (Solver Primitive Prototype Refinement Sprint
// v1) -- STEP1 (Strategy A -- Gate Expansion): tests whether widening the
// confirmed Blueprint gate (cycleLength 2~3 AND conflictEdgeCount>0,
// MultiHopBridgePrototypeV3.ts, UNMODIFIED -- this Sprint never touches v2
// or v3) captures more replays without losing the mechanism's real
// benefit. The underlying search (runInstrumentedBoundedSearch,
// countConflictEdges) is reused UNMODIFIED from v3 -- only the gate
// predicate changes between variants.
//
// A1 (wideCycle) extends the cycle-length band by 1 (2~4 instead of
// 2~3). This edges into BP-1's own MIN_CYCLE_LENGTH=4 territory, but
// that is not automatically redundant here: BP-1 is one of the 5
// "existing Primitives" this Sprint's own Gap definition already
// accounts for (testAllAllowedSingleShot includes "BP1"), so a
// cycleLength==4 replay only counts as a genuine Gap Rescue if BP-1
// ALSO fails there -- the same non-circular check Prototype Sprint v2
// disclosed fixing after its own "88% redundant with BP-1" finding.
//
// A2 (noConflictGate) drops the conflictEdgeCount requirement entirely
// (the whole of v2's own territory) -- included not because it is
// expected to win, but as the loosest honest boundary case: if Recall/
// Precision here are close to A0's, the conflictEdgeCount distinction
// would not actually matter, which is itself a finding worth reporting
// (RefinementDecision.ts's Level1 check is built on this comparison).
import type { Cubie } from "../cubeState";
import type { WingLibrary, Move } from "../fiveByFiveEdges";
import { analyzeMultiCycle } from "../solverV2Prototype/MultiCycleAnalyzer";
import { countConflictEdges, runInstrumentedBoundedSearch, type InstrumentedSearchResult } from "../solverPrimitivePrototype/MultiHopBridgePrototypeV3";

export interface GateVariant {
  name: string;
  matches: (cycleLength: number, conflictEdgeCount: number) => boolean;
  // True only for A2: it does not add a new axis, it DROPS the Blueprint's
  // own validated conflictEdgeCount>0 precondition (falling back to v2's
  // entire un-gated territory). Any resulting Coverage/GapRescue gain is
  // definitionally a strict-superset widening, not a genuinely new
  // capability -- the exact "coarsening trap" this project's methodology
  // has repeatedly caught and excluded before (see Blueprint Reanalysis
  // Sprint's isOldBlueprint/isBareGate flags). RefinementDecision.ts must
  // not let a flagged variant satisfy Level2/Level3 as a legitimate win --
  // its numbers are still reported, never hidden, just not eligible.
  isCoarseningBoundary?: boolean;
}

export const GATE_VARIANTS: GateVariant[] = [
  { name: "A0_baseline (v3, cycleLength 2~3 AND conflictEdgeCount>0)", matches: (cl, ce) => cl >= 2 && cl <= 3 && ce > 0 },
  { name: "A1_wideCycle (cycleLength 2~4 AND conflictEdgeCount>0)", matches: (cl, ce) => cl >= 2 && cl <= 4 && ce > 0 },
  { name: "A2_noConflictGate (cycleLength 2~3, conflictEdgeCount 무관 -- v2 전체 영역, 경계 참고용)", matches: (cl) => cl >= 2 && cl <= 3, isCoarseningBoundary: true },
];

export interface GateVariantRunResult {
  matched: boolean;
  moves: Move[] | null;
  search: InstrumentedSearchResult | null;
  cycleLength: number;
  conflictEdgeCount: number;
}

export function runGateVariant(cubies: Cubie[], lib: WingLibrary, deadline: number, variant: GateVariant): GateVariantRunResult {
  const analysis = analyzeMultiCycle(cubies);
  if (!analysis) return { matched: false, moves: null, search: null, cycleLength: 0, conflictEdgeCount: 0 };

  const conflictEdgeCount = countConflictEdges(cubies);
  if (!variant.matches(analysis.cycleLength, conflictEdgeCount)) {
    return { matched: false, moves: null, search: null, cycleLength: analysis.cycleLength, conflictEdgeCount };
  }

  const search = runInstrumentedBoundedSearch(cubies, analysis.cycleNodes, lib, deadline);
  return { matched: true, moves: search.moves, search, cycleLength: analysis.cycleLength, conflictEdgeCount };
}
