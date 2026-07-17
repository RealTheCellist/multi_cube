// --- PrimitiveSearch (Capability Expansion Sprint v2) -----------------------
// The Sequence Generator + Search Pipeline (spec sections 7-9). Every
// generated sequence is composed ENTIRELY of real Quarter/Half/Wide/Inner-
// layer turns (raw [axis, layer, sign] Move tuples, applied via the
// existing, unmodified applySeq()) -- no abstract Pair Swap, no direct
// Cubie mutation, no forced coordinates. Deliberately NOT a random walk
// (spec section 9's explicit prohibition): every sequence is either a
// commutator [A, B, A', B'] (the classic technique for deriving a NEW
// algorithm with a restricted, predictable effect -- exactly how a real
// speedcuber or cubing theorist would go about this by hand) or a
// conjugate of an EXISTING, already-validated library algorithm
// (BASE_ALG/FLIP_ALG/PARITY_ALG) by a short real setup ("Known Cube
// Pattern 변형").
import { cloneCubies, type Cubie } from "../cubeState";
import type { Axis } from "../cubeMath";
import { BASE_ALG, FLIP_ALG, PARITY_ALG, type Move } from "../fiveByFiveEdges";
import { evaluateSequence, invertSequence } from "./PrimitiveEvaluator";
import { computeAffectedSlots, computeChangedLayers, computeTransitionHash } from "./TransitionAnalyzer";
import type { PrimitiveCandidate } from "./PrimitiveCandidate";
import type { RepresentativeCluster } from "./PrimitiveReplay";

export type FragmentType = "quarter" | "half" | "wide" | "inner";

export interface MoveFragment {
  type: FragmentType;
  moves: Move[];
  label: string;
}

const AXES: Axis[] = ["x", "y", "z"];
const OUTER_LAYERS = [-2, 2] as const;
const INNER_LAYERS = [-1, 0, 1] as const;

/** ~48 real move fragments spanning all 4 required turn types (spec
 * section 6's "필수 조건"), used as the building blocks for commutators
 * and setup/conjugate sequences below. */
export function buildAtomicFragments(): MoveFragment[] {
  const fragments: MoveFragment[] = [];

  for (const axis of AXES) {
    for (const layer of OUTER_LAYERS) {
      for (const sign of [1, -1] as const) {
        fragments.push({ type: "quarter", moves: [[axis, layer, sign]], label: `Q(${axis}${layer}${sign > 0 ? "+" : "-"})` });
      }
      fragments.push({ type: "half", moves: [[axis, layer, 1], [axis, layer, 1]], label: `H(${axis}${layer})` });
      for (const sign of [1, -1] as const) {
        const inner = layer > 0 ? 1 : -1;
        fragments.push({
          type: "wide",
          moves: [
            [axis, layer, sign],
            [axis, inner, sign],
          ],
          label: `W(${axis}${layer}${sign > 0 ? "+" : "-"})`,
        });
      }
    }
    for (const layer of INNER_LAYERS) {
      for (const sign of [1, -1] as const) {
        fragments.push({ type: "inner", moves: [[axis, layer, sign]], label: `I(${axis}${layer}${sign > 0 ? "+" : "-"})` });
      }
    }
  }
  return fragments;
}

/** [A, B, A', B'] -- the classic commutator shape: applying A then B then
 * undoing A then undoing B. Guaranteed to be a real, legal move sequence
 * (every component is itself real moves), and -- unlike an arbitrary
 * sequence -- a commutator's effect is inherently RESTRICTED (many pieces
 * untouched by construction), which is exactly the kind of narrow, useful
 * transformation a new Primitive should be. */
function commutator(a: MoveFragment, b: MoveFragment): Move[] {
  return [...a.moves, ...b.moves, ...invertSequence(a.moves), ...invertSequence(b.moves)];
}

/** [Setup, KnownPattern, Setup'] -- "Known Cube Pattern 변형" (spec section
 * 9): reuses an EXISTING, already-validated library algorithm as the
 * trigger, conjugated by a short new setup the existing library's own
 * buildWingLibrary/buildFlipLibrary/buildCaseLibrary never tried (those
 * only conjugate by WHOLE-CUBE rotations, never a single real outer/inner
 * turn) -- a genuinely different family of variation from what's already
 * in the library. */
function conjugateKnownPattern(setup: MoveFragment, knownPattern: readonly Move[]): Move[] {
  return [...setup.moves, ...knownPattern, ...invertSequence(setup.moves)];
}

export interface GeneratedSequence {
  sequence: Move[];
  family: "commutator" | "conjugate";
  description: string;
}

/** Everything the Sequence Generator can produce for one search pass --
 * built once (fragments/known patterns don't depend on the Replay state
 * being tested), then reused across every representative cluster. */
export function generateSequences(): GeneratedSequence[] {
  const fragments = buildAtomicFragments();
  const knownPatterns: { name: string; seq: readonly Move[] }[] = [
    { name: "BASE_ALG", seq: BASE_ALG },
    { name: "FLIP_ALG", seq: FLIP_ALG },
    { name: "PARITY_ALG", seq: PARITY_ALG },
  ];
  const out: GeneratedSequence[] = [];

  // Family 1: commutators of every ordered pair of 2-move fragments ->
  // length exactly 8 (spec's stated minimum).
  for (const a of fragments) {
    for (const b of fragments) {
      if (a.label === b.label) continue;
      const sequence = commutator(a, b);
      if (sequence.length < 8 || sequence.length > 30) continue;
      out.push({ sequence, family: "commutator", description: `[${a.label}, ${b.label}, ${a.label}', ${b.label}']` });
    }
  }

  // Family 2: conjugates of the 3 existing library algorithms by every
  // fragment as a new setup -- lengths land naturally in the 8-30 range
  // (BASE_ALG/FLIP_ALG/PARITY_ALG are already 3-16 moves; +2..4 for setup).
  for (const setup of fragments) {
    for (const known of knownPatterns) {
      const sequence = conjugateKnownPattern(setup, known.seq);
      if (sequence.length < 8 || sequence.length > 30) continue;
      out.push({ sequence, family: "conjugate", description: `${setup.label} + ${known.name} + ${setup.label}'` });
    }
  }

  return out;
}

/**
 * transitionHash/affectedSlots/changedLayers are all cluster-INDEPENDENT
 * (computed against a solved reference, see TransitionAnalyzer.ts) --
 * precomputing them ONCE per generated sequence here, rather than once per
 * (cluster, sequence) pair inside the search loop, avoids paying for a
 * fresh buildSolvedCube()+applySeq() a redundant 5-10x over (once per
 * representative cluster tested).
 */
export interface PrecomputedSequence extends GeneratedSequence {
  transitionHash: string;
  affectedSlots: string[];
  changedLayers: string[];
}

export function precomputeSequences(generated: readonly GeneratedSequence[]): PrecomputedSequence[] {
  return generated.map((g) => ({
    ...g,
    transitionHash: computeTransitionHash(g.sequence),
    affectedSlots: computeAffectedSlots(g.sequence),
    changedLayers: computeChangedLayers(g.sequence),
  }));
}

/** The 3 EXISTING library algorithms' own Transition Hashes -- the literal
 * baseline spec section 11's 3rd storage condition compares against
 * ("기존 Primitive에서 관찰되지 않은 Transition Hash"). */
export function knownPrimitiveTransitionHashes(): Set<string> {
  return new Set([computeTransitionHash(BASE_ALG), computeTransitionHash(FLIP_ALG), computeTransitionHash(PARITY_ALG)]);
}

export interface SearchOptions {
  /** Candidate storage condition (spec section 11) -- kept configurable so
   * the Discovery Report can state exactly what threshold was used. */
  minWrongWingImprovement: number; // e.g. 1 -- any real decrease counts
}

export interface SearchRunStats {
  sequencesEvaluated: number;
  candidatesFound: number;
}

/**
 * The Search Pipeline itself (spec section 8): Replay State -> Sequence
 * Generator -> apply real moves -> Evaluator -> Undo -> next sequence.
 * Runs the full PRECOMPUTED sequence list against ONE representative
 * cluster's restored state, returning every sequence that meets the
 * storage condition (spec section 11).
 */
export function searchAgainstCluster(
  cluster: RepresentativeCluster,
  precomputed: readonly PrecomputedSequence[],
  options: SearchOptions,
  knownBaselineHashes: ReadonlySet<string>
): { candidates: PrimitiveCandidate[]; stats: SearchRunStats } {
  const cubies: Cubie[] = cloneCubies(cluster.representativeCubies);
  const candidates: PrimitiveCandidate[] = [];
  const stats: SearchRunStats = { sequencesEvaluated: 0, candidatesFound: 0 };

  for (const p of precomputed) {
    stats.sequencesEvaluated++;
    const evaluation = evaluateSequence(cubies, p.sequence);

    const wrongWingImproved = evaluation.wrongWingDelta <= -options.minWrongWingImprovement;
    const pairPreservedWithNewSlotTransition = evaluation.pairDelta >= 0 && p.affectedSlots.length > 0;
    const novelAgainstKnownPrimitives = !knownBaselineHashes.has(p.transitionHash);
    const shouldStore = wrongWingImproved || pairPreservedWithNewSlotTransition || novelAgainstKnownPrimitives;

    if (!shouldStore) continue;

    candidates.push({
      id: `${cluster.cluster.id}-${p.transitionHash}`,
      sequence: p.sequence,
      moveLength: p.sequence.length,
      wrongWingDelta: evaluation.wrongWingDelta,
      pairDelta: evaluation.pairDelta,
      parityDelta: evaluation.parityDelta,
      affectedSlots: p.affectedSlots,
      changedLayers: p.changedLayers,
      beforeHash: evaluation.beforeHash,
      afterHash: evaluation.afterHash,
      transitionHash: p.transitionHash,
      frequency: 1,
      benchmark: null,
      capabilityScore: null,
      discoveredFromClusterKey: cluster.cluster.key,
    });
    stats.candidatesFound++;
  }

  return { candidates, stats };
}
