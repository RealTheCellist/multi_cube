// --- FailureDatasetAdequacy (Solver v3 Research Kickoff Sprint v1) --------
// STEP0: the Gate. Measures whether the 75-replay Failure DB itself has
// enough diversity/repetition to support Solver v3-level research, BEFORE
// any new State Representation or Primitive work is attempted.
//
// Gate metrics (3, per the confirmed Research Charter):
//   - Shape 재등장률 (Shape re-entry rate): reuses BP-4's own
//     computeCycleShape() (solverV2PrototypeBP4/CycleShapeHasher.ts,
//     existing/unmodified) -- the fraction of the 75 replays that share
//     their Shape Key with at least one other replay.
//   - Cluster 안정성 (cluster stability): "동일 replay가 동일 cluster에
//     배정된 비율" -- operationalized using GapDetector.ts's own Hard-Gap
//     classification (existing/unmodified) as the concrete "cluster" (Hard
//     Gap vs Not), run N times. GoalClusterer.ts's own clustering key
//     (`stateSignature`) is a deterministic string derived purely from the
//     state, so it would trivially always show 100% stability and measure
//     nothing -- the REAL, already-repeatedly-observed instability in this
//     codebase (Hard Gap counts fluctuating 29~33 across runs throughout
//     this whole research track) comes from Math.random()-based internal
//     tie-breaking inside the capability search itself, which
//     GapDetector.profileAllReplays exercises directly. This substitution
//     is a disclosed design decision, not a silent one.
//   - Replay 다양성 (replay diversity): unique Shape Key count / 75.
//
// Hard Gap 빈도 is recorded as a REFERENCE statistic only (Problem
// Difficulty, not Dataset Adequacy per the Charter's own v3 correction)
// and never affects the Gate verdict.
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import { computeCycleShape } from "../solverV2PrototypeBP4/CycleShapeHasher";
import { profileAllReplays } from "../solverV2Research/GapDetector";

export type Tier = "FAIL" | "CONDITIONAL" | "PASS";

export interface DatasetAdequacyMetrics {
  totalReplays: number;
  uniqueShapeCount: number;
  shapeReentryRate: number; // Gate metric 1
  clusterStabilityRate: number; // Gate metric 2
  replayDiversityRate: number; // Gate metric 3 (unique shapes / total, lower is better)
  hardGapCountsAcrossRuns: number[]; // reference only
  hardGapFrequency: number; // reference only -- avg(hardGapCounts) / totalReplays
}

export interface GateVerdict {
  metrics: DatasetAdequacyMetrics;
  shapeReentryTier: Tier;
  clusterStabilityTier: Tier;
  replayDiversityTier: Tier;
  overall: Tier;
}

const CLUSTER_STABILITY_RUNS = 5;
const GAP_DEADLINE_MS = 300;

function tierHigherIsBetter(value: number, failBelow: number, passAbove: number): Tier {
  if (value < failBelow) return "FAIL";
  if (value > passAbove) return "PASS";
  return "CONDITIONAL";
}

function tierLowerIsBetter(value: number, passBelow: number, failAbove: number): Tier {
  if (value > failAbove) return "FAIL";
  if (value < passBelow) return "PASS";
  return "CONDITIONAL";
}

export function evaluateDatasetAdequacy(failuresDbPath: string): GateVerdict {
  const all75 = loadAll75(failuresDbPath);

  // Shape 재등장률 + Replay 다양성
  const shapeKeys = all75.map((s) => computeCycleShape(deserializeCube(s.cubeState)).shapeKey);
  const counts = new Map<string, number>();
  for (const k of shapeKeys) counts.set(k, (counts.get(k) ?? 0) + 1);
  const uniqueShapeCount = counts.size;
  const multiMemberReplayCount = shapeKeys.filter((k) => (counts.get(k) ?? 0) >= 2).length;
  const shapeReentryRate = all75.length ? multiMemberReplayCount / all75.length : 0;
  const replayDiversityRate = all75.length ? uniqueShapeCount / all75.length : 0;

  // Cluster 안정성 (Hard-Gap classification agreement across N independent runs)
  const runResults: Map<string, boolean>[] = [];
  const hardGapCountsAcrossRuns: number[] = [];
  for (let i = 0; i < CLUSTER_STABILITY_RUNS; i++) {
    const profiles = profileAllReplays(failuresDbPath, GAP_DEADLINE_MS);
    runResults.push(new Map(profiles.map((p) => [p.replayHash, p.isHardGap])));
    hardGapCountsAcrossRuns.push(profiles.filter((p) => p.isHardGap).length);
  }
  let agreementSum = 0;
  let countedReplays = 0;
  for (const snapshot of all75) {
    const votes = runResults.map((r) => r.get(snapshot.hash)).filter((v): v is boolean => v !== undefined);
    if (votes.length === 0) continue;
    const trueCount = votes.filter(Boolean).length;
    const modeCount = Math.max(trueCount, votes.length - trueCount);
    agreementSum += modeCount / votes.length;
    countedReplays++;
  }
  const clusterStabilityRate = countedReplays ? agreementSum / countedReplays : 0;
  const hardGapFrequency = all75.length ? hardGapCountsAcrossRuns.reduce((a, b) => a + b, 0) / hardGapCountsAcrossRuns.length / all75.length : 0;

  const metrics: DatasetAdequacyMetrics = {
    totalReplays: all75.length,
    uniqueShapeCount,
    shapeReentryRate,
    clusterStabilityRate,
    replayDiversityRate,
    hardGapCountsAcrossRuns,
    hardGapFrequency,
  };

  const shapeReentryTier = tierHigherIsBetter(shapeReentryRate, 0.1, 0.25);
  const clusterStabilityTier = tierHigherIsBetter(clusterStabilityRate, 0.4, 0.7);
  const replayDiversityTier = tierLowerIsBetter(replayDiversityRate, 0.75, 0.9);

  const tiers = [shapeReentryTier, clusterStabilityTier, replayDiversityTier];
  const passCount = tiers.filter((t) => t === "PASS").length;
  const failCount = tiers.filter((t) => t === "FAIL").length;
  const overall: Tier = passCount >= 2 ? "PASS" : failCount >= 2 ? "FAIL" : "CONDITIONAL";

  return { metrics, shapeReentryTier, clusterStabilityTier, replayDiversityTier, overall };
}
