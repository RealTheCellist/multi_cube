// --- ReplayBenchmark (Solver v2 Primitive Prototype Sprint v2) -----------
// STEP 4: CycleChase vs Bounded Multi-Cycle Resolver (Prototype Sprint v1,
// unmodified) vs Parity-Aware Cycle Breaker, measured on the exact same
// real states.
import { cloneCubies } from "../cubeState";
import { applySeq, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { pairCountOf, hasParity } from "../goalPlanner/GoalAnalyzer";
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { allSnapshots, loadDatabase } from "../failureAnalysis/failureDatabase";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { tryCycleChase } from "../primitivePrototype/CycleChasePrototype";
import { tryBoundedMultiCycleResolver } from "../solverV2Prototype/BoundedResolver";
import { tryParityAwareCycleBreaker } from "./ParityAwareResolver";

export interface SingleRunResult {
  hash: string;
  activated: boolean;
  wrongWingBefore: number;
  wrongWingAfter: number;
  pairBefore: number;
  pairAfter: number;
  parityBefore: boolean;
  parityAfter: boolean;
  timeMs: number;
  regression: boolean;
}

type Resolver = (cubies: ReturnType<typeof deserializeCube>, lib: WingLibrary, deadline: number) => ReturnType<typeof tryCycleChase>;

function runOne(snapshot: FailureSnapshot, resolver: Resolver, lib: WingLibrary, deadlineMs: number): SingleRunResult {
  const cubies = deserializeCube(snapshot.cubeState);
  const wrongWingBefore = wrongWingCount5(cubies);
  const pairBefore = pairCountOf(cubies);
  const parityBefore = hasParity(cubies);

  const startedAt = Date.now();
  const fix = resolver(cubies, lib, startedAt + deadlineMs);
  const timeMs = Date.now() - startedAt;

  if (!fix) {
    return { hash: snapshot.hash, activated: false, wrongWingBefore, wrongWingAfter: wrongWingBefore, pairBefore, pairAfter: pairBefore, parityBefore, parityAfter: parityBefore, timeMs, regression: false };
  }

  applySeq(cubies, fix);
  const wrongWingAfter = wrongWingCount5(cubies);
  const pairAfter = pairCountOf(cubies);
  const parityAfter = hasParity(cubies);

  return {
    hash: snapshot.hash,
    activated: true,
    wrongWingBefore,
    wrongWingAfter,
    pairBefore,
    pairAfter,
    parityBefore,
    parityAfter,
    timeMs,
    regression: pairAfter < pairBefore || wrongWingAfter > wrongWingBefore,
  };
}

export function runCycleChaseOn(snapshots: readonly FailureSnapshot[], lib: WingLibrary, deadlineMs: number): SingleRunResult[] {
  return snapshots.map((s) => runOne(s, (c, l, d) => tryCycleChase(cloneCubies(c), l, d), lib, deadlineMs));
}

export function runBoundedResolverOn(snapshots: readonly FailureSnapshot[], lib: WingLibrary, deadlineMs: number): SingleRunResult[] {
  return snapshots.map((s) => runOne(s, (c, l, d) => tryBoundedMultiCycleResolver(cloneCubies(c), l, d), lib, deadlineMs));
}

export function runParityAwareOn(snapshots: readonly FailureSnapshot[], lib: WingLibrary, deadlineMs: number): SingleRunResult[] {
  return snapshots.map((s) => runOne(s, (c, l, d) => tryParityAwareCycleBreaker(cloneCubies(c), l, d), lib, deadlineMs));
}

export interface BenchmarkSummary {
  label: string;
  totalTested: number;
  activatedCount: number;
  coverage: number;
  improvedCount: number;
  regressionCount: number;
  regressionRateAmongActivated: number;
  avgWrongWingDelta: number;
  avgPairDelta: number;
  avgTimeMs: number;
  cycleStructurePreservedRate: number; // spec's own failure condition ("Cycle 구조를 더 자주 파괴함") needs a real signal: fraction of activated runs where Pair did NOT decrease
}

export function summarize(label: string, results: readonly SingleRunResult[]): BenchmarkSummary {
  const totalTested = results.length;
  const activated = results.filter((r) => r.activated);
  const improvedCount = results.filter((r) => r.wrongWingAfter < r.wrongWingBefore).length;
  const regressionCount = activated.filter((r) => r.regression).length;
  const preserved = activated.filter((r) => r.pairAfter >= r.pairBefore).length;
  const avg = (nums: number[]) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);

  return {
    label,
    totalTested,
    activatedCount: activated.length,
    coverage: totalTested ? activated.length / totalTested : 0,
    improvedCount,
    regressionCount,
    regressionRateAmongActivated: activated.length ? regressionCount / activated.length : 0,
    avgWrongWingDelta: avg(activated.map((r) => r.wrongWingAfter - r.wrongWingBefore)),
    avgPairDelta: avg(activated.map((r) => r.pairAfter - r.pairBefore)),
    avgTimeMs: avg(results.map((r) => r.timeMs)),
    cycleStructurePreservedRate: activated.length ? preserved / activated.length : 1,
  };
}

export function loadAll75(failuresDbPath: string): FailureSnapshot[] {
  return allSnapshots(loadDatabase(failuresDbPath));
}
