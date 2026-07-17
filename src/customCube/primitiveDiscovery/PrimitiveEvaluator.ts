// --- PrimitiveEvaluator (Capability Expansion Sprint v2) --------------------
// Applies ONE real move sequence to a scratch clone of a Replay state,
// measures the spec-required fields, then undoes it via the sequence's own
// exact inverse (spec section 8's "Undo" pipeline step) -- mathematically
// guaranteed correct for any real move sequence (reverse the move order,
// negate each turn's sign), so the SAME clone can be reused across many
// candidates in a row without re-cloning per candidate.
import type { Cubie } from "../cubeState";
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import type { Move } from "../fiveByFiveEdges";
import { analyzeEdgeSlots, detectEdgeSlotPattern } from "../fiveByFiveHumanEdges";
import { computeStateHash } from "./TransitionAnalyzer";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { PrimitiveCandidate, ReplayBenchmarkTally, ReplayOutcome } from "./PrimitiveCandidate";

export function invertSequence(sequence: readonly Move[]): Move[] {
  return [...sequence].reverse().map(([axis, layer, sign]) => [axis, layer, (-sign) as 1 | -1]);
}

function pairCountOf(cubies: Cubie[]): number {
  return analyzeEdgeSlots(cubies).filter((s) => s.pairedCount === 2).length;
}

function hasParity(cubies: Cubie[]): boolean {
  return analyzeEdgeSlots(cubies).some((s) => s.pairedCount < 2 && detectEdgeSlotPattern(s) === "unpaired");
}

export interface EvaluationResult {
  wrongWingBefore: number;
  wrongWingAfter: number;
  wrongWingDelta: number; // negative = improvement
  pairBefore: number;
  pairAfter: number;
  pairDelta: number;
  parityBefore: boolean;
  parityAfter: boolean;
  parityDelta: number; // -1 resolved, 0 unchanged, 1 introduced
  beforeHash: string;
  afterHash: string;
}

/** Applies `sequence` to `cubies` IN PLACE, measures the before/after
 * delta, then immediately undoes it -- `cubies` is guaranteed to be back
 * in its EXACT starting state when this returns, so callers can iterate
 * many candidates against the same clone. */
export function evaluateSequence(cubies: Cubie[], sequence: readonly Move[]): EvaluationResult {
  const wrongWingBefore = wrongWingCount5(cubies);
  const pairBefore = pairCountOf(cubies);
  const parityBefore = hasParity(cubies);
  const beforeHash = computeStateHash(cubies);

  applySeq(cubies, sequence);

  const wrongWingAfter = wrongWingCount5(cubies);
  const pairAfter = pairCountOf(cubies);
  const parityAfter = hasParity(cubies);
  const afterHash = computeStateHash(cubies);

  applySeq(cubies, invertSequence(sequence)); // Undo -- restores `cubies` exactly

  return {
    wrongWingBefore,
    wrongWingAfter,
    wrongWingDelta: wrongWingAfter - wrongWingBefore,
    pairBefore,
    pairAfter,
    pairDelta: pairAfter - pairBefore,
    parityBefore,
    parityAfter,
    parityDelta: parityBefore === parityAfter ? 0 : parityAfter ? 1 : -1,
    beforeHash,
    afterHash,
  };
}

function classifyOutcome(evaluation: EvaluationResult): ReplayOutcome {
  if (evaluation.wrongWingDelta < 0) return "success";
  if (evaluation.wrongWingDelta > 0 || evaluation.pairDelta < 0) return "regression";
  return "no-effect";
}

/**
 * Replay Benchmark (spec section 14): validates ONE candidate sequence
 * against >=50 real Failure Replay states (never a fresh scramble), a
 * fresh `deserializeCube` per snapshot (never mutating stored data),
 * recording Success/No Effect/Regression per Replay.
 */
export function runReplayBenchmark(candidate: PrimitiveCandidate, snapshots: readonly FailureSnapshot[]): ReplayBenchmarkTally {
  let success = 0;
  let noEffect = 0;
  let regression = 0;
  let wrongWingDeltaSum = 0;
  let pairDeltaSum = 0;

  for (const snapshot of snapshots) {
    const cubies = deserializeCube(snapshot.cubeState);
    const evaluation = evaluateSequence(cubies, candidate.sequence);
    const outcome = classifyOutcome(evaluation);
    if (outcome === "success") success++;
    else if (outcome === "no-effect") noEffect++;
    else regression++;
    wrongWingDeltaSum += evaluation.wrongWingDelta;
    pairDeltaSum += evaluation.pairDelta;
  }

  const totalTested = snapshots.length;
  return {
    success,
    noEffect,
    regression,
    totalTested,
    avgWrongWingDelta: totalTested ? wrongWingDeltaSum / totalTested : 0,
    avgPairDelta: totalTested ? pairDeltaSum / totalTested : 0,
  };
}

// Capability Score formula (spec section 15 -- "수식은 자유롭게 정의한다.
// 단, 계산식을 문서화한다."), documented here rather than left implicit:
//
//   score = W_WRONGWING  * (-avgWrongWingDelta)              [WrongWing Improvement -- positive when delta is negative]
//         + W_NOVELTY    * (isNovelAgainstKnownPrimitives ? 1 : 0)  [Transition Novelty]
//         + W_SUCCESSRATE* (successCount / totalTested)      [Replay Success Rate]
//         - W_PAIRDAMAGE * max(0, -avgPairDelta)             [Pair Damage -- only penalizes NET pair loss]
//
// Weights below are chosen so WrongWing improvement and Replay Success Rate
// dominate (this Sprint's actual goal), Novelty contributes a modest fixed
// bonus (it's nearly always true by construction against only 3 baseline
// hashes, so it can't be allowed to dominate ranking), and Pair Damage is a
// strict penalty capped to never exceed what a real improvement can offset.
export const CAPABILITY_SCORE_WEIGHTS = {
  wrongWingImprovement: 20,
  transitionNovelty: 5,
  replaySuccessRate: 100,
  pairDamage: 15,
};

export function computeCapabilityScore(candidate: PrimitiveCandidate, isNovelAgainstKnownPrimitives: boolean): number {
  const benchmark = candidate.benchmark;
  if (!benchmark) return 0;
  const w = CAPABILITY_SCORE_WEIGHTS;
  const wrongWingImprovement = Math.max(0, -benchmark.avgWrongWingDelta);
  const successRate = benchmark.totalTested ? benchmark.success / benchmark.totalTested : 0;
  const pairDamage = Math.max(0, -benchmark.avgPairDelta);

  return (
    w.wrongWingImprovement * wrongWingImprovement +
    w.transitionNovelty * (isNovelAgainstKnownPrimitives ? 1 : 0) +
    w.replaySuccessRate * successRate -
    w.pairDamage * pairDamage
  );
}
