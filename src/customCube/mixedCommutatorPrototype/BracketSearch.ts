// --- BracketSearch (Mixed Commutator Prototype Sprint v1, Architecture
// STEP 2-4: Mixed Pattern Selection + Setup Search + Bracket
// Construction) --------------------------------------------------------------
// Self-contained Prototype implementation of the exact mechanism Mixed
// Commutator Design Space Validation Sprint v1 validated: a genuine
// 4-part bracket commutator [A,B] = A B A' B' of two independently
// conjugated copies of a known pattern (BASE_ALG/FLIP_ALG/PARITY_ALG),
// A = setupA + knownA + setupA', B = setupB + knownB + setupB'. Reuses
// only existing, unmodified exports (buildAtomicFragments, invertSequence,
// applySeq, cloneCubies, slotKey, wrongWingCount5, BASE_ALG/FLIP_ALG/
// PARITY_ALG) -- no new low-level move-generation algorithm. Deadline-
// bounded: tries pattern pairs in PATTERN_PAIR_PRIORITY order, 49x49
// (IDENTITY included) setup combos per pair, stopping the instant the
// deadline passes and returning whatever is best-so-far.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, slotKey, wrongWingCount5, BASE_ALG, FLIP_ALG, PARITY_ALG, type Move } from "../fiveByFiveEdges";
import { buildAtomicFragments, type MoveFragment } from "../primitiveDiscovery/PrimitiveSearch";
import { invertSequence } from "../primitiveDiscovery/PrimitiveEvaluator";
import { PATTERN_PAIR_PRIORITY } from "./PatternPairPriority";

const IDENTITY_FRAGMENT: MoveFragment = { type: "quarter", moves: [], label: "IDENTITY" };

const NAMED_PATTERNS: Record<string, readonly Move[]> = {
  BASE_ALG,
  FLIP_ALG,
  PARITY_ALG,
};

function countAffectedWings(before: Cubie[], after: Cubie[]): number {
  const beforeSlotById = new Map(before.map((c) => [c.id, slotKey(c)]));
  let affected = 0;
  for (const c of after) if (beforeSlotById.get(c.id) !== slotKey(c)) affected++;
  return affected;
}

function conjugate(setupMoves: readonly Move[], known: readonly Move[]): Move[] {
  return setupMoves.length > 0 ? [...setupMoves, ...known, ...invertSequence(setupMoves)] : [...known];
}

export interface BracketSearchResult {
  moves: Move[] | null;
  patternA: string | null;
  patternB: string | null;
  setupALabel: string | null;
  setupBLabel: string | null;
  attemptsEvaluated: number;
  moveLength: number | null;
  wrongWingBefore: number;
  wrongWingAfter: number | null;
  affectedWingCount: number | null;
  exhaustedSearchSpace: boolean; // true if every pattern pair/setup combo was tried before the deadline
}

export function searchBracketCommutators(cubies: Cubie[], deadline: number): BracketSearchResult {
  const fragments: MoveFragment[] = [IDENTITY_FRAGMENT, ...buildAtomicFragments()];
  const wrongWingBefore = wrongWingCount5(cubies);

  let attemptsEvaluated = 0;
  let bestMoves: Move[] | null = null;
  let bestPatternA: string | null = null;
  let bestPatternB: string | null = null;
  let bestSetupALabel: string | null = null;
  let bestSetupBLabel: string | null = null;
  let bestWrongWingAfter = Infinity;
  let bestAffected = Infinity;
  let deadlineHit = false;

  outer: for (const [nameA, nameB] of PATTERN_PAIR_PRIORITY) {
    const knownA = NAMED_PATTERNS[nameA];
    const knownB = NAMED_PATTERNS[nameB];

    for (const setupA of fragments) {
      const A = conjugate(setupA.moves, knownA);
      const Ainv = invertSequence(A);

      for (const setupB of fragments) {
        if (Date.now() > deadline) {
          deadlineHit = true;
          break outer;
        }
        attemptsEvaluated++;
        const B = conjugate(setupB.moves, knownB);
        const total: Move[] = [...A, ...B, ...Ainv, ...invertSequence(B)];

        const clone = cloneCubies(cubies);
        applySeq(clone, total);
        const wrongWingAfter = wrongWingCount5(clone);

        if (wrongWingAfter < wrongWingBefore) {
          const affectedWingCount = countAffectedWings(cubies, clone);
          if (wrongWingAfter < bestWrongWingAfter || (wrongWingAfter === bestWrongWingAfter && affectedWingCount < bestAffected)) {
            bestMoves = total;
            bestPatternA = nameA;
            bestPatternB = nameB;
            bestSetupALabel = setupA.label;
            bestSetupBLabel = setupB.label;
            bestWrongWingAfter = wrongWingAfter;
            bestAffected = affectedWingCount;
          }
        }
      }
    }
  }

  return {
    moves: bestMoves,
    patternA: bestPatternA,
    patternB: bestPatternB,
    setupALabel: bestSetupALabel,
    setupBLabel: bestSetupBLabel,
    attemptsEvaluated,
    moveLength: bestMoves?.length ?? null,
    wrongWingBefore,
    wrongWingAfter: bestMoves ? bestWrongWingAfter : null,
    affectedWingCount: bestMoves ? bestAffected : null,
    exhaustedSearchSpace: !deadlineHit,
  };
}
