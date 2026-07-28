// --- PatternPairSearch (Mixed Commutator Design Space Validation Sprint
// v1, RQ-1) --------------------------------------------------------------
// Novel Low-Footprint Move Existence Validation Sprint v1's own
// TrueCommutatorSearch.ts only ever paired a known pattern WITH ITSELF
// (BASE+BASE, FLIP+FLIP, PARITY+PARITY). This module generalizes the SAME
// bracket-commutator construction ([A,B] = A B A' B', A/B each a
// conjugated copy of a known pattern by a single atomic fragment) to
// MIXED pattern pairs (BASE+FLIP, BASE+PARITY, FLIP+PARITY), to test
// whether mixing patterns reduces footprint vs. pairing a pattern with
// itself. Same discipline as the prior Sprint: measurement tool only,
// reuses only existing unmodified exports, never exposed with the
// Primitive contract, never wired into Recovery/Executor/Planner.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, slotKey, wrongWingCount5, BASE_ALG, FLIP_ALG, PARITY_ALG, type Move } from "../fiveByFiveEdges";
import { buildAtomicFragments, type MoveFragment } from "../primitiveDiscovery/PrimitiveSearch";
import { invertSequence } from "../primitiveDiscovery/PrimitiveEvaluator";

const IDENTITY_FRAGMENT: MoveFragment = { type: "quarter", moves: [], label: "IDENTITY" };

export interface NamedPattern {
  name: string;
  seq: readonly Move[];
}

export const KNOWN_PATTERNS: NamedPattern[] = [
  { name: "BASE_ALG", seq: BASE_ALG },
  { name: "FLIP_ALG", seq: FLIP_ALG },
  { name: "PARITY_ALG", seq: PARITY_ALG },
];

// All 6 unordered-with-repetition pairs: 3 same + 3 mixed. [A,B] and [B,A]
// have identical affectedWingCount (inverses of each other), so only one
// direction per unordered pair is tested.
export const PATTERN_PAIRS: readonly [string, string][] = [
  ["BASE_ALG", "BASE_ALG"],
  ["FLIP_ALG", "FLIP_ALG"],
  ["PARITY_ALG", "PARITY_ALG"],
  ["BASE_ALG", "FLIP_ALG"],
  ["BASE_ALG", "PARITY_ALG"],
  ["FLIP_ALG", "PARITY_ALG"],
];

function patternByName(name: string): readonly Move[] {
  return KNOWN_PATTERNS.find((p) => p.name === name)!.seq;
}

function countAffectedWings(before: Cubie[], after: Cubie[]): number {
  const beforeSlotById = new Map(before.map((c) => [c.id, slotKey(c)]));
  let affected = 0;
  for (const c of after) if (beforeSlotById.get(c.id) !== slotKey(c)) affected++;
  return affected;
}

export function conjugate(setupMoves: readonly Move[], known: readonly Move[]): Move[] {
  return setupMoves.length > 0 ? [...setupMoves, ...known, ...invertSequence(setupMoves)] : [...known];
}

export interface CommutatorCandidate {
  patternA: string;
  patternB: string;
  setupALabel: string;
  setupBLabel: string;
  setupALength: number; // number of atomic fragments composing setupA (0 = identity)
  setupBLength: number;
  commutatorLength: number;
  moveLength: number; // alias for commutatorLength, per Measurement spec naming
  wrongWingBefore: number;
  wrongWingAfter: number;
  affectedWingCount: number;
  cycleLength: number;
  footprintRatio: number;
  improvementScore: number; // wrongWingBefore - wrongWingAfter
  samePattern: boolean;
  mixedPattern: boolean;
  setupFragments: number; // setupALength + setupBLength, total fragments used
}

export interface PatternPairSearchResult {
  label: string;
  cycleLength: number;
  attemptsEvaluated: number;
  candidates: CommutatorCandidate[]; // ALL attempts that achieved wrongWingAfter < wrongWingBefore (improving), across all 6 pattern pairs
  bestOverall: CommutatorCandidate | null;
  bestByPatternPair: Map<string, CommutatorCandidate | null>; // key: "patternA|patternB"
}

/**
 * For one case: tries all 6 pattern pairs x 49x49 single-fragment setups
 * (IDENTITY included, matching the prior Sprint's exact convention) =
 * 6 x 2401 = 14406 attempts. Records every IMPROVING candidate (not just
 * the single best) so downstream Design Space Coverage / Structure
 * Classification / Convergence Analysis have real per-candidate data to
 * work with, not just one summary number per case.
 */
export function searchPatternPairs(cubies: Cubie[], label: string, cycleLength: number): PatternPairSearchResult {
  const fragments: MoveFragment[] = [IDENTITY_FRAGMENT, ...buildAtomicFragments()];
  const wrongWingBefore = wrongWingCount5(cubies);

  let attemptsEvaluated = 0;
  const candidates: CommutatorCandidate[] = [];
  let bestOverall: CommutatorCandidate | null = null;
  const bestByPatternPair = new Map<string, CommutatorCandidate | null>();

  for (const [nameA, nameB] of PATTERN_PAIRS) {
    const knownA = patternByName(nameA);
    const knownB = patternByName(nameB);
    const pairKey = `${nameA}|${nameB}`;
    let bestForPair: CommutatorCandidate | null = null;

    for (const setupA of fragments) {
      const A = conjugate(setupA.moves, knownA);
      const Ainv = invertSequence(A);
      const setupALength = setupA.moves.length > 0 ? 1 : 0;

      for (const setupB of fragments) {
        attemptsEvaluated++;
        const B = conjugate(setupB.moves, knownB);
        const Binv = invertSequence(B);
        const total: Move[] = [...A, ...B, ...Ainv, ...Binv];
        const setupBLength = setupB.moves.length > 0 ? 1 : 0;

        const clone = cloneCubies(cubies);
        applySeq(clone, total);
        const wrongWingAfter = wrongWingCount5(clone);
        const affectedWingCount = countAffectedWings(cubies, clone);

        if (wrongWingAfter < wrongWingBefore) {
          const candidate: CommutatorCandidate = {
            patternA: nameA,
            patternB: nameB,
            setupALabel: setupA.label,
            setupBLabel: setupB.label,
            setupALength,
            setupBLength,
            commutatorLength: total.length,
            moveLength: total.length,
            wrongWingBefore,
            wrongWingAfter,
            affectedWingCount,
            cycleLength,
            footprintRatio: affectedWingCount / cycleLength,
            improvementScore: wrongWingBefore - wrongWingAfter,
            samePattern: nameA === nameB,
            mixedPattern: nameA !== nameB,
            setupFragments: setupALength + setupBLength,
          };
          candidates.push(candidate);

          if (!bestForPair || affectedWingCount < bestForPair.affectedWingCount) bestForPair = candidate;
          if (!bestOverall || affectedWingCount < bestOverall.affectedWingCount) bestOverall = candidate;
        }
      }
    }
    bestByPatternPair.set(pairKey, bestForPair);
  }

  return { label, cycleLength, attemptsEvaluated, candidates, bestOverall, bestByPatternPair };
}
