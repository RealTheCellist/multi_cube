// --- PriorityReorderShadow (Mixed Commutator Opportunity Analysis Sprint
// v1, RQ-4) -------------------------------------------------------------------
// A disclosed SHADOW copy of BracketSearch.ts's own search loop
// (mixedCommutatorPrototype/BracketSearch.ts is NOT modified -- forbidden
// this Sprint), parameterized by an injectable pattern-pair priority order
// instead of the real, fixed PATTERN_PAIR_PRIORITY. This measures whether
// changing WHICH pattern pair is tried first changes what a
// deadline-BOUNDED search finds (at the real production-realistic 300ms
// budget) WITHOUT touching the Gate at all -- exactly this Sprint's RQ-4
// question. Every underlying primitive reused is the same unmodified
// export BracketSearch.ts itself uses (buildAtomicFragments, invertSequence,
// applySeq, cloneCubies, slotKey, wrongWingCount5, BASE_ALG/FLIP_ALG/
// PARITY_ALG) -- only the loop's own priority-order parameter differs, not
// the mechanism. This mirrors this whole research arc's own established
// "simulator" precedent (e.g. primitivePrototype/CycleChaseSimulator.ts)
// for measuring parameterized variants without touching the real Prototype.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, slotKey, wrongWingCount5, BASE_ALG, FLIP_ALG, PARITY_ALG, type Move } from "../fiveByFiveEdges";
import { buildAtomicFragments, type MoveFragment } from "../primitiveDiscovery/PrimitiveSearch";
import { invertSequence } from "../primitiveDiscovery/PrimitiveEvaluator";

const IDENTITY_FRAGMENT: MoveFragment = { type: "quarter", moves: [], label: "IDENTITY" };
const NAMED_PATTERNS: Record<string, readonly Move[]> = { BASE_ALG, FLIP_ALG, PARITY_ALG };

function countAffectedWings(before: Cubie[], after: Cubie[]): number {
  const beforeSlotById = new Map(before.map((c) => [c.id, slotKey(c)]));
  let affected = 0;
  for (const c of after) if (beforeSlotById.get(c.id) !== slotKey(c)) affected++;
  return affected;
}

function conjugate(setupMoves: readonly Move[], known: readonly Move[]): Move[] {
  return setupMoves.length > 0 ? [...setupMoves, ...known, ...invertSequence(setupMoves)] : [...known];
}

/** Same exhaustive search as searchBracketCommutators, but the pattern-pair
 * iteration order is an explicit parameter instead of the fixed
 * PATTERN_PAIR_PRIORITY import -- returns only whether a genuinely
 * improving move was found within `deadline` (that's all this Sprint's
 * RQ-4 needs). */
function shadowSearchWithOrder(cubies: Cubie[], deadline: number, order: readonly [string, string][]): boolean {
  const fragments: MoveFragment[] = [IDENTITY_FRAGMENT, ...buildAtomicFragments()];
  const wrongWingBefore = wrongWingCount5(cubies);

  outer: for (const [nameA, nameB] of order) {
    const knownA = NAMED_PATTERNS[nameA];
    const knownB = NAMED_PATTERNS[nameB];
    for (const setupA of fragments) {
      const A = conjugate(setupA.moves, knownA);
      const Ainv = invertSequence(A);
      for (const setupB of fragments) {
        if (Date.now() > deadline) break outer;
        const B = conjugate(setupB.moves, knownB);
        const total: Move[] = [...A, ...B, ...Ainv, ...invertSequence(B)];
        const clone = cloneCubies(cubies);
        applySeq(clone, total);
        if (wrongWingCount5(clone) < wrongWingBefore) return true;
      }
    }
  }
  return false;
}

export const REORDER_VARIANTS: { name: string; order: readonly [string, string][] }[] = [
  {
    name: "REVERSED",
    order: [
      ["BASE_ALG", "PARITY_ALG"],
      ["FLIP_ALG", "PARITY_ALG"],
      ["BASE_ALG", "BASE_ALG"],
      ["FLIP_ALG", "FLIP_ALG"],
      ["PARITY_ALG", "PARITY_ALG"],
      ["BASE_ALG", "FLIP_ALG"],
    ],
  },
  {
    name: "PARITY_FIRST",
    order: [
      ["PARITY_ALG", "PARITY_ALG"],
      ["BASE_ALG", "FLIP_ALG"],
      ["FLIP_ALG", "FLIP_ALG"],
      ["BASE_ALG", "BASE_ALG"],
      ["FLIP_ALG", "PARITY_ALG"],
      ["BASE_ALG", "PARITY_ALG"],
    ],
  },
];

export interface ReorderTestRow {
  label: string;
  variantName: string;
  solvableAtRealisticBudget: boolean; // 300ms, matching production
}

export function runPriorityReorderTest(cubies: Cubie[], label: string, realisticBudgetMs: number): ReorderTestRow[] {
  return REORDER_VARIANTS.map((v) => ({
    label,
    variantName: v.name,
    solvableAtRealisticBudget: shadowSearchWithOrder(cloneCubies(cubies), Date.now() + realisticBudgetMs, v.order),
  }));
}
