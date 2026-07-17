// --- CycleChasePrototype (Primitive Invention Sprint v1) --------------------
// The new Primitive itself (spec sections 6-7). See
// primitiveResearch/data/primitive-design.txt for the full design
// rationale: tryFixWing() (existing, unmodified, called read-only) already
// handles a "genuine 3-cycle" (p1->p2->p3->p1) in ONE call, but nothing in
// the existing pipeline chases a WANTS-cycle of length 4+ as a single
// coordinated unit -- and 71-100% of the 3 target Clusters' real Replays
// contain exactly such a cycle (see StructuralAnalyzer.ts's findings).
//
// This Prototype invents no new geometric move sequence: it calls
// buildStateGraph() (capabilityAnalysis, existing, unmodified) to DETECT
// the cycle, then re-applies tryFixWing() (existing, unmodified) to each
// cycle member IN CYCLE ORDER -- a genuinely new ORCHESTRATION strategy
// over an existing, already-safe building block, not a new algorithm at
// the move level. Disclosed honestly rather than overclaimed.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, slotKey, tryFixWing, wrongWingCount5, wrongWings5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";

// tryFixWing() already natively handles cycles up to this length (see the
// design doc's section 3, quoting its own "genuine 3-cycle" comment) --
// CycleChase only activates on the genuinely uncovered case, longer than
// this.
const MIN_CYCLE_LENGTH_TO_CHASE = 4;

/** Picks the single longest detected WANTS-cycle, breaking ties by the
 * cycle's own starting slot key (already lexicographically normalized by
 * buildStateGraph's own findCycles/normalize) -- fully deterministic, no
 * randomness anywhere in this selection. */
function pickLongestCycle(cycles: readonly string[][]): string[] | null {
  if (cycles.length === 0) return null;
  let best = cycles[0];
  for (const c of cycles) {
    if (c.length > best.length || (c.length === best.length && c[0] < best[0])) best = c;
  }
  return best;
}

/**
 * Detects the current state's longest WANTS-cycle; if it's at least
 * MIN_CYCLE_LENGTH_TO_CHASE long, chases it slot-by-slot IN THE CYCLE'S OWN
 * FIXED ORDER (decided once, up front, from the ORIGINAL state -- never
 * re-picks a different cycle mid-chase), calling the existing tryFixWing()
 * on whichever wrong wing currently sits at each targeted slot. Stops the
 * instant a hop fails (partial progress is kept, not discarded) or the
 * deadline passes. Returns the concatenated Move[] only if wrongWingCount
 * genuinely decreased; otherwise null (a true no-op, matching every other
 * `tryX` function in this codebase's own contract).
 */
export function tryCycleChase(cubies: Cubie[], lib: WingLibrary, deadline: number): Move[] | null {
  const before = wrongWingCount5(cubies);
  const working = cloneCubies(cubies);

  const cycle = pickLongestCycle(buildStateGraph(working).cycles);
  if (!cycle || cycle.length < MIN_CYCLE_LENGTH_TO_CHASE) return null;

  const applied: Move[] = [];
  for (const slot of cycle) {
    if (Date.now() > deadline) break;
    const wrongHere = wrongWings5(working).find((w) => slotKey(w) === slot);
    if (!wrongHere) continue; // already resolved as collateral of an earlier hop in this same chase
    const fix = tryFixWing(working, wrongHere, lib, deadline);
    if (!fix || fix.length === 0) break; // chain broke here -- keep whatever progress was already made
    applySeq(working, fix);
    applied.push(...fix);
  }

  if (applied.length === 0) return null;
  const after = wrongWingCount5(working);
  if (after >= before) return null;
  return applied;
}
