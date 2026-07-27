// --- CycleAnalysis (Coverage Hole Discovery Sprint v1, Phase 1 STEP3) -----
// Directive Goal 2 ("Zero-Move Loop 제거") is a claim about repeated
// behavior at a FIXED cube state: "Planner -> 0 Move -> Planner -> 0 Move".
// The just-completed Solver Completeness Verification Sprint's report
// claimed this was "결정론적으로 고정된 잔여 상태" (deterministically fixed)
// based on a SINGLE 50-iteration run per case. Since solve() is genuinely
// stochastic (shuffle()-driven, confirmed by this whole research arc), that
// claim deserves its own direct confirmation test rather than being taken
// on faith -- this module re-invokes the real, unmodified
// FiveByFiveEdgeSolverEngine.solve() N times against an UNCHANGED clone of
// each hole state (never applying the returned moves back), and tallies how
// many of those N calls return an empty moveQueue. If all N are empty, the
// zero-move loop is confirmed as a genuine per-state property, not an
// artifact of a single unlucky draw.
import { cloneCubies, type Cubie } from "../cubeState";
import { FiveByFiveEdgeSolverEngine } from "../fiveByFiveEdgeSolverEngine";
import type { HoleCase } from "./HoleDatasetBuilder";

export const ZERO_MOVE_REPEAT_TRIALS = 10; // matches this research arc's own N=10 repeatability convention (Worst Case Library STEP2)

export interface ZeroMoveLoopResult {
  label: string;
  trials: number;
  emptyMoveQueueCount: number;
  nonEmptyMoveQueueCount: number;
  emptyMoveQueueRate: number;
  confirmedZeroMoveLoop: boolean; // all N trials returned empty -- Goal 2's literal definition satisfied
  nonEmptyMoveLengths: number[]; // move-queue lengths on the trials that WERE non-empty (diagnostic: were they small/ineffective or large/plausible?)
  wingPairingNoProgressStreak: number; // carried over from the original 50-iteration run that produced this hole (STEP1)
}

export function testZeroMoveLoop(cubies: Cubie[], trials = ZERO_MOVE_REPEAT_TRIALS): {
  emptyMoveQueueCount: number;
  nonEmptyMoveQueueCount: number;
  nonEmptyMoveLengths: number[];
} {
  let emptyMoveQueueCount = 0;
  let nonEmptyMoveQueueCount = 0;
  const nonEmptyMoveLengths: number[] = [];
  for (let i = 0; i < trials; i++) {
    const clone = cloneCubies(cubies); // fresh unchanged clone every trial -- the returned moves are NEVER applied back
    const engine = new FiveByFiveEdgeSolverEngine();
    const plan = engine.solve(clone);
    if (plan.moveQueue.length === 0) {
      emptyMoveQueueCount++;
    } else {
      nonEmptyMoveQueueCount++;
      nonEmptyMoveLengths.push(plan.moveQueue.length);
    }
  }
  return { emptyMoveQueueCount, nonEmptyMoveQueueCount, nonEmptyMoveLengths };
}

export function analyzeZeroMoveLoop(hole: HoleCase, trials = ZERO_MOVE_REPEAT_TRIALS): ZeroMoveLoopResult {
  const { emptyMoveQueueCount, nonEmptyMoveQueueCount, nonEmptyMoveLengths } = testZeroMoveLoop(hole.cubies, trials);
  return {
    label: hole.label,
    trials,
    emptyMoveQueueCount,
    nonEmptyMoveQueueCount,
    emptyMoveQueueRate: emptyMoveQueueCount / trials,
    confirmedZeroMoveLoop: nonEmptyMoveQueueCount === 0,
    nonEmptyMoveLengths,
    wingPairingNoProgressStreak: hole.wingPairingNoProgressStreak,
  };
}

export interface ZeroMoveLoopSummary {
  totalCases: number;
  confirmedZeroMoveLoopCount: number;
  confirmedZeroMoveLoopShare: number;
  partiallyStochasticCount: number; // >=1 trial non-empty but not all -- moves exist but are rare/ineffective at this exact state
  avgEmptyMoveQueueRate: number;
}

export function summarizeZeroMoveLoop(results: ZeroMoveLoopResult[]): ZeroMoveLoopSummary {
  const total = results.length;
  const confirmed = results.filter((r) => r.confirmedZeroMoveLoop).length;
  const partiallyStochastic = results.filter((r) => !r.confirmedZeroMoveLoop && r.nonEmptyMoveQueueCount > 0).length;
  const avgEmptyMoveQueueRate = total > 0 ? results.reduce((s, r) => s + r.emptyMoveQueueRate, 0) / total : 0;
  return {
    totalCases: total,
    confirmedZeroMoveLoopCount: confirmed,
    confirmedZeroMoveLoopShare: total > 0 ? confirmed / total : 0,
    partiallyStochasticCount: partiallyStochastic,
    avgEmptyMoveQueueRate,
  };
}
