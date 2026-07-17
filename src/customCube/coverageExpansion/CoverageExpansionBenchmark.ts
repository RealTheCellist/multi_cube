// --- CoverageExpansionBenchmark (Coverage Expansion Sprint v1) --------------
// Spec STEP 5/6: runs one SimulationOptions variant against a Replay,
// measuring the same fields Primitive Invention Sprint v1's own
// PrototypeEvaluator.ts measured, so results are directly comparable.
import { applySeq, wrongWingCount5 } from "../fiveByFiveEdges";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { pairCountOf } from "../goalPlanner/GoalAnalyzer";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { simulateCycleChase, type SimulationOptions } from "./CycleChaseSimulator";

export interface SimulatedRunResult {
  hash: string;
  activated: boolean;
  wrongWingBefore: number;
  wrongWingAfter: number;
  pairBefore: number;
  pairAfter: number;
  moveCount: number;
  timeMs: number;
  regression: boolean;
}

export function runSimulationOnSnapshot(snapshot: FailureSnapshot, libs: ExecutorLibraries, deadlineMs: number, options: SimulationOptions): SimulatedRunResult {
  const cubies = deserializeCube(snapshot.cubeState);
  const wrongWingBefore = wrongWingCount5(cubies);
  const pairBefore = pairCountOf(cubies);

  const startedAt = Date.now();
  const deadline = startedAt + deadlineMs;
  const fix = simulateCycleChase(cubies, libs, deadline, options);
  const timeMs = Date.now() - startedAt;

  if (!fix) {
    return { hash: snapshot.hash, activated: false, wrongWingBefore, wrongWingAfter: wrongWingBefore, pairBefore, pairAfter: pairBefore, moveCount: 0, timeMs, regression: false };
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

export interface SimulationSummary {
  variantLabel: string;
  totalTested: number;
  activatedCount: number;
  coverage: number;
  regressionCount: number;
  regressionRateAmongActivated: number;
  avgWrongWingDelta: number;
  avgPairDelta: number;
  avgMoveCount: number;
  avgTimeMs: number;
  improvedCount: number;
}

export function summarizeSimulation(variantLabel: string, results: readonly SimulatedRunResult[]): SimulationSummary {
  const totalTested = results.length;
  const activated = results.filter((r) => r.activated);
  const activatedCount = activated.length;
  const regressionCount = activated.filter((r) => r.regression).length;
  const improvedCount = results.filter((r) => r.wrongWingAfter < r.wrongWingBefore).length;
  const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

  return {
    variantLabel,
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
