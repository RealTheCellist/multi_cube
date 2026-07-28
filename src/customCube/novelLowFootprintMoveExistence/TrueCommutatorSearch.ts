// --- TrueCommutatorSearch (Novel Low-Footprint Move Existence Validation
// Sprint v1, RQ-1/RQ-2, core measurement) ------------------------------------
// This Sprint's central research question is existence, not
// implementation: does a low-footprint move for a PURE_CYCLE_ISOLATION
// cycle exist AT ALL, independent of enumerateWingCandidates()? Move
// Representation Prototype Sprint v1 already tested (and found failing)
// a SINGLE conjugation (Setup + Core + Undo-Setup) of a search-derived
// Core. That is algebraically just "A Core A'" -- it can relocate WHICH
// pieces a move disturbs, never reduce HOW MANY (that Sprint's own
// disclosed root cause).
//
// What was never tried anywhere in this research arc is a genuine
// GROUP-THEORETIC COMMUTATOR of two INDEPENDENTLY CONJUGATED copies of the
// one known "clean isolated swap" (BASE_ALG, or FLIP_ALG/PARITY_ALG for
// completeness): [A, B] = A B A' B'. Standard group theory: if A and B are
// each a transposition of two slots sharing exactly one slot, [A,B] is a
// genuine 3-cycle on the union of their 3 slots, and -- critically -- if
// A's and B's OWN collateral disturbance ("rigid safe groups", per
// BASE_ALG's own documented structure) touch DISJOINT regions, that
// collateral cancels exactly (A' undoes A's own collateral, B' undoes
// B's own), leaving ONLY the 3-cycle. This is the actual mechanism real
// big-cube speedcubers use for wing-cycle algorithms -- never tested here
// until now.
//
// Reuses ONLY existing, unmodified exports: buildAtomicFragments() (the
// same 48+1 conjugation candidates SetupConjugation.ts/ParityEntrySelector.ts
// already use), invertSequence(), applySeq(), cloneCubies(), slotKey(),
// wrongWingCount5(), BASE_ALG/FLIP_ALG/PARITY_ALG. No new move-generation
// algorithm -- this is a MEASUREMENT tool (existence probe), not a
// Primitive: it is never exposed with the (Cubie[], WingLibrary,
// deadline) -> Move[] | null contract, and is never wired into
// Recovery/Executor/Planner.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, slotKey, wrongWingCount5, BASE_ALG, FLIP_ALG, PARITY_ALG, type Move } from "../fiveByFiveEdges";
import { buildAtomicFragments, type MoveFragment } from "../primitiveDiscovery/PrimitiveSearch";
import { invertSequence } from "../primitiveDiscovery/PrimitiveEvaluator";

const IDENTITY_FRAGMENT: MoveFragment = { type: "quarter", moves: [], label: "IDENTITY" };
const KNOWN_PATTERNS: { name: string; seq: readonly Move[] }[] = [
  { name: "BASE_ALG", seq: BASE_ALG },
  { name: "FLIP_ALG", seq: FLIP_ALG },
  { name: "PARITY_ALG", seq: PARITY_ALG },
];

function countAffectedWings(before: Cubie[], after: Cubie[]): number {
  const beforeSlotById = new Map(before.map((c) => [c.id, slotKey(c)]));
  let affected = 0;
  for (const c of after) if (beforeSlotById.get(c.id) !== slotKey(c)) affected++;
  return affected;
}

function conjugate(setup: MoveFragment, known: readonly Move[]): Move[] {
  return setup.moves.length > 0 ? [...setup.moves, ...known, ...invertSequence(setup.moves)] : [...known];
}

export interface CommutatorAttempt {
  knownPattern: string;
  setupALabel: string;
  setupBLabel: string;
  moveLength: number;
  wrongWingBefore: number;
  wrongWingAfter: number;
  affectedWingCount: number;
}

export interface CommutatorSearchResult {
  label: string;
  cycleLength: number;
  attemptsEvaluated: number;
  best: CommutatorAttempt | null; // lowest wrongWingAfter, tie-break lowest affectedWingCount
  improvingCount: number; // attempts where wrongWingAfter < wrongWingBefore
  improvingAffectedWingCounts: number[]; // for distribution purposes (RQ-2)
}

/**
 * For one case, tries every ordered pair of (setupA, setupB) atomic
 * fragments (49x49, IDENTITY included) as [A,B,A',B'] where
 * A = setupA + knownPattern + setupA', B = setupB + knownPattern + setupB',
 * for each of the 3 known patterns separately (never mixed, kept simple
 * and disclosed) -- 3 x 49 x 49 = 7203 attempts, all cheap array
 * composition/application, no new search algorithm.
 */
export function searchTrueCommutators(cubies: Cubie[], label: string, cycleLength: number): CommutatorSearchResult {
  const fragments: MoveFragment[] = [IDENTITY_FRAGMENT, ...buildAtomicFragments()];
  const wrongWingBefore = wrongWingCount5(cubies);

  let attemptsEvaluated = 0;
  let best: CommutatorAttempt | null = null;
  let improvingCount = 0;
  const improvingAffectedWingCounts: number[] = [];

  for (const { name: knownPattern, seq: known } of KNOWN_PATTERNS) {
    for (const setupA of fragments) {
      const A = conjugate(setupA, known);
      const Ainv = invertSequence(A);
      for (const setupB of fragments) {
        attemptsEvaluated++;
        const B = conjugate(setupB, known);
        const Binv = invertSequence(B);
        const total: Move[] = [...A, ...B, ...Ainv, ...Binv];

        const clone = cloneCubies(cubies);
        applySeq(clone, total);
        const wrongWingAfter = wrongWingCount5(clone);
        const affectedWingCount = countAffectedWings(cubies, clone);

        if (wrongWingAfter < wrongWingBefore) {
          improvingCount++;
          improvingAffectedWingCounts.push(affectedWingCount);
        }

        if (
          !best ||
          wrongWingAfter < best.wrongWingAfter ||
          (wrongWingAfter === best.wrongWingAfter && affectedWingCount < best.affectedWingCount)
        ) {
          best = {
            knownPattern,
            setupALabel: setupA.label,
            setupBLabel: setupB.label,
            moveLength: total.length,
            wrongWingBefore,
            wrongWingAfter,
            affectedWingCount,
          };
        }
      }
    }
  }

  return { label, cycleLength, attemptsEvaluated, best, improvingCount, improvingAffectedWingCounts };
}
