// --- PolicyEvaluator (Policy Generalization Sprint v1) ----------------------
// The Replay Benchmark (spec sections 7/8). Tests a Policy's
// `primitiveSequence` as a portable STRATEGY -- reusing
// goalPlanner/GoalAnalyzer.ts's `runPrimitiveChain` exactly as Solver
// Integration Sprint v1 already established (never the literal recorded
// moves) -- against ALL 75 real Failure Replays, regardless of whether a
// given replay's own starting state matches this Policy's stateSignature
// (spec section 7 tests "75 Replay 전체", the same blanket-testing
// methodology used to reach Solver Integration Sprint v1's conclusion, so
// this Sprint's numbers are directly comparable to that one's).
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import type { FailureSnapshot } from "../failureAnalysis/failureTypes";
import { runPrimitiveChain } from "../goalPlanner/GoalAnalyzer";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { Policy, PolicyBenchmarkResult } from "../policyAnalysis/PolicyTypes";
import { stateSignatureOf } from "./PolicyReplay";

export function benchmarkPolicy(policy: Policy, snapshots: readonly FailureSnapshot[], libs: ExecutorLibraries, perStepDeadlineMs: number): PolicyBenchmarkResult {
  let appliedCount = 0;
  let successCount = 0;
  let regressionCount = 0;
  let noEffectCount = 0;
  let wrongWingDeltaSum = 0;
  let pairDeltaSum = 0;

  for (const snapshot of snapshots) {
    const cubies = deserializeCube(snapshot.cubeState);
    const result = runPrimitiveChain(cubies, policy.primitiveSequence, libs, perStepDeadlineMs);
    if (!result.completed) continue;

    appliedCount++;
    const wrongWingDelta = result.wrongWingAfter - result.wrongWingBefore;
    const pairDelta = result.pairAfter - result.pairBefore;
    wrongWingDeltaSum += wrongWingDelta;
    pairDeltaSum += pairDelta;

    if (wrongWingDelta < 0) successCount++;
    else if (wrongWingDelta > 0 || pairDelta < 0) regressionCount++;
    else noEffectCount++;
  }

  const totalTested = snapshots.length;
  return {
    stateSignature: policy.stateSignature,
    primitiveSequence: policy.primitiveSequence,
    totalTested,
    appliedCount,
    appliedRate: totalTested ? appliedCount / totalTested : 0,
    successCount,
    regressionCount,
    noEffectCount,
    successRateAmongApplied: appliedCount ? successCount / appliedCount : 0,
    regressionRateAmongApplied: appliedCount ? regressionCount / appliedCount : 0,
    avgWrongWingDelta: appliedCount ? wrongWingDeltaSum / appliedCount : 0,
    avgPairDelta: appliedCount ? pairDeltaSum / appliedCount : 0,
  };
}

/** What fraction of `snapshots` even HAVE a Policy defined for their OWN
 * starting state signature -- a property of the whole Policy SET, distinct
 * from any single Policy's own applied/success rate (spec section 11's
 * failure condition: "Coverage < 50%"). */
export function computeCoverage(policies: readonly Policy[], snapshots: readonly FailureSnapshot[]): { coverage: number; coveredCount: number; totalCount: number } {
  const knownSignatures = new Set(policies.map((p) => p.stateSignature));
  let coveredCount = 0;
  for (const snapshot of snapshots) {
    const cubies = deserializeCube(snapshot.cubeState);
    if (knownSignatures.has(stateSignatureOf(cubies))) coveredCount++;
  }
  const totalCount = snapshots.length;
  return { coverage: totalCount ? coveredCount / totalCount : 0, coveredCount, totalCount };
}

/** Primitive 사용 빈도 (spec section 8) -- tallied across every extracted
 * Policy's own primitiveSequence (not weighted by how often each Policy
 * gets used at runtime, since this Sprint never wires anything into a real
 * runtime -- section 12 forbids product integration entirely). */
export function primitiveUsageFrequency(policies: readonly Policy[]): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const p of policies) {
    for (const primitive of p.primitiveSequence) {
      freq[primitive] = (freq[primitive] ?? 0) + 1;
    }
  }
  return freq;
}
