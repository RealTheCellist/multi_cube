// --- ParityEntrySelector (Solver v2 Primitive Prototype Sprint v2) --------
// STEP 2: "Parity를 항상 즉시 수행하지 않는다 -- Cycle 전체를 분석한 후
// 가장 유리한 Entry Point를 결정적으로 선택한다."
//
// A candidate Entry = PARITY_ALG (existing, exported, UNMODIFIED) conjugated
// by a single real setup move -- exactly Capability Expansion Sprint v2's
// own already-established "Family 2: Known-Pattern Conjugate" technique
// (Setup + KnownPattern + Setup'), reusing that Sprint's own
// buildAtomicFragments() (exported) for the setup candidates and
// invertSequence() (exported) for the undo-setup half. No new rotation
// algorithm is written here -- conjugation is 3 lines of composition over
// already-exported pieces, the same composition Sprint v2 already used and
// disclosed.
//
// This is a BOUNDED, deterministic enumeration (currently 48 fixed
// fragments, iterated in buildAtomicFragments()'s own fixed order -- never
// randomized, never combinatorially expanded), not brute force: each
// candidate is tried exactly once, scored by its SIMULATED effect on Cycle
// length, and the best-scoring one is selected -- no search, no retry
// loops, no growing candidate set.
import type { Cubie } from "../cubeState";
import { cloneCubies } from "../cubeState";
import { applySeq, PARITY_ALG, wrongWingCount5, type Move } from "../fiveByFiveEdges";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { pickLongestCycle } from "../coverageExpansion/cycleUtil";
import { buildAtomicFragments, type MoveFragment } from "../primitiveDiscovery/PrimitiveSearch";
import { invertSequence } from "../primitiveDiscovery/PrimitiveEvaluator";

export interface ParityEntryCandidate {
  setupLabel: string;
  moves: Move[];
  cycleLengthBefore: number;
  cycleLengthAfter: number;
  wrongWingAfter: number;
}

function conjugateParity(setup: MoveFragment): Move[] {
  return [...setup.moves, ...PARITY_ALG, ...invertSequence(setup.moves)];
}

/**
 * Tries PARITY_ALG conjugated by EACH of the 48 atomic fragments (fixed,
 * deterministic order), simulates every one on its own scratch clone, and
 * returns whichever candidate leaves the LOWEST WrongWing afterward.
 *
 * Disclosed design correction made during this Sprint: an earlier version
 * of this selector ranked candidates PRIMARILY by shortest resulting Cycle
 * length ("Cycle 구조를 깨는 방향"), on the theory that breaking the Cycle
 * is what unblocks progress. Measured directly against real Hard Gap
 * replays, that theory did not hold: PARITY_ALG conjugated at an arbitrary
 * single-move setup is not tailored to the specific colors sitting at that
 * position (unlike BASE_ALG's generic isolated swap), so a conjugate that
 * happens to shorten the detected Cycle just as often scrambles OTHER
 * wings and makes WrongWing worse (e.g. one real case: Cycle 5->3 but
 * WrongWing 13->15). WrongWing -- the thing Deferred Validation actually
 * judges -- is the real target, so it is now the PRIMARY sort key;
 * resulting Cycle length is kept as the tie-break (still giving the
 * Cycle-structure hypothesis a voice when two candidates tie on WrongWing),
 * then the fragment's own fixed enumeration order for full determinism.
 */
export function selectBestParityEntry(cubies: Cubie[], cycleLengthBefore: number, deadline: number): ParityEntryCandidate | null {
  const fragments = buildAtomicFragments();
  let best: ParityEntryCandidate | null = null;

  for (const fragment of fragments) {
    if (Date.now() > deadline) break;
    const moves = conjugateParity(fragment);
    const clone = cloneCubies(cubies);
    applySeq(clone, moves);

    const cycleAfter = pickLongestCycle(buildStateGraph(clone).cycles);
    const cycleLengthAfter = cycleAfter ? cycleAfter.length : 0;
    const wrongWingAfter = wrongWingCount5(clone);

    const candidate: ParityEntryCandidate = { setupLabel: fragment.label, moves, cycleLengthBefore, cycleLengthAfter, wrongWingAfter };

    if (!best || wrongWingAfter < best.wrongWingAfter || (wrongWingAfter === best.wrongWingAfter && cycleLengthAfter < best.cycleLengthAfter)) {
      best = candidate;
    }
  }

  return best;
}
