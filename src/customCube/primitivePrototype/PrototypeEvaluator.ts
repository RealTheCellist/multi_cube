// --- PrototypeEvaluator (Primitive Invention Sprint v1) ---------------------
// Replay Benchmark (spec section 8): applies the CycleChase Prototype to a
// FRESH clone of each real Replay snapshot (never mutating stored data,
// matching every prior Evaluator in this series), measuring WrongWing Δ /
// Pair Δ / Move / Time, and classifying Regression / Coverage.
import { applySeq, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { tryCycleChase } from "./CycleChasePrototype";

export interface PrototypeRunResult {
  hash: string;
  activated: boolean; // the Prototype detected a chaseable (4+ length) cycle AND produced a net WrongWing improvement
  wrongWingBefore: number;
  wrongWingAfter: number;
  pairBefore: number;
  pairAfter: number;
  moveCount: number;
  timeMs: number;
  regression: boolean; // activated, but Pair count went DOWN despite WrongWing improving (a real, disclosed trade-off case)
}

export function runPrototypeOnSnapshot(snapshot: FailureSnapshot, lib: WingLibrary, deadlineMs: number): PrototypeRunResult {
  const cubies = deserializeCube(snapshot.cubeState);
  const wrongWingBefore = wrongWingCount5(cubies);
  const pairBefore = pairCountOf(cubies);

  const startedAt = Date.now();
  const deadline = startedAt + deadlineMs;
  const fix = tryCycleChase(cubies, lib, deadline);
  const timeMs = Date.now() - startedAt;

  if (!fix) {
    return {
      hash: snapshot.hash,
      activated: false,
      wrongWingBefore,
      wrongWingAfter: wrongWingBefore,
      pairBefore,
      pairAfter: pairBefore,
      moveCount: 0,
      timeMs,
      regression: false,
    };
  }

  applySeq(cubies, fix);
  const wrongWingAfter = wrongWingCount5(cubies);
  const pairAfter = pairCountOf(cubies);

  return {
    hash: snapshot.hash,
    activated: true,
    wrongWingBefore,
    wrongWingAfter,
    pairBefore,
    pairAfter,
    moveCount: fix.length,
    timeMs,
    regression: pairAfter < pairBefore,
  };
}

export interface PrototypeBenchmarkSummary {
  totalTested: number;
  activatedCount: number;
  coverage: number; // activatedCount / totalTested -- spec section 10 Level 3's metric
  regressionCount: number;
  regressionRateAmongActivated: number;
  avgWrongWingDelta: number; // among ACTIVATED
  avgPairDelta: number; // among ACTIVATED
  avgMoveCount: number; // among ACTIVATED
  avgTimeMs: number; // across ALL (activation-check itself costs time even when it declines)
  improvedCount: number; // spec section 10 Level 1's metric: WrongWing genuinely decreased
}

export function summarizeBenchmark(results: readonly PrototypeRunResult[]): PrototypeBenchmarkSummary {
  const totalTested = results.length;
  const activated = results.filter((r) => r.activated);
  const activatedCount = activated.length;
  const regressionCount = activated.filter((r) => r.regression).length;
  const improvedCount = results.filter((r) => r.wrongWingAfter < r.wrongWingBefore).length;

  const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

  return {
    totalTested,
    activatedCount,
    coverage: totalTested ? activatedCount / totalTested : 0,
    regressionCount,
    regressionRateAmongActivated: activatedCount ? regressionCount / activatedCount : 0,
    avgWrongWingDelta: avg(activated.map((r) => r.wrongWingAfter - r.wrongWingBefore)),
    avgPairDelta: avg(activated.map((r) => r.pairAfter - r.pairBefore)),
    avgMoveCount: avg(activated.map((r) => r.moveCount)),
    avgTimeMs: avg(results.map((r) => r.timeMs)),
    improvedCount,
  };
}
