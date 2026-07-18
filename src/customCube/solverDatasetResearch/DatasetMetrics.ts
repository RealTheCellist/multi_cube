// --- DatasetMetrics (Solver Dataset Expansion Research Sprint v1) --------
// STEP5: defines the STANDARD metrics every future Solver research Sprint
// should report against the Failure Dataset, and computes them on the
// CURRENT 75-replay DB as the reference baseline. Reuses
// profileAllReplays (solverV2Research/, unmodified), computeCoarseShapeKey
// (solverV3Research/, unmodified), and this Sprint's own
// DatasetBiasReport.ts/ReplayDiversityAnalysis.ts (STEP1/2, unmodified).
//
// Minimum required set (spec section STEP5): Shape 재등장률, Replay
// 다양성, Cluster 안정성, Singleton 비율, Hard Gap 비율, Coverage 분포.
import { deserializeCube } from "../failureAnalysis/cubeSerialization";
import { loadAll75 } from "../solverV2PrototypeBP4/ReplayBenchmark";
import { computeCoarseShapeKey } from "../solverV3Research/StateRepresentationCandidates";
import { profileAllReplays } from "../solverV2Research/GapDetector";
import { histogramOf } from "./DatasetBiasReport";
import { computeShannonEntropy } from "./ReplayDiversityAnalysis";

export interface CoverageEntry {
  primitive: string;
  coverage: number; // fraction of the 75 replays this primitive net-improves
  measuredThisSprint: boolean; // true for the 6 base capabilities (cheap, re-measured here); false for BP-1~4 (cited from prior Sprint reports, not re-run, to avoid redundant expensive computation)
  source: string;
}

export interface DatasetMetricsSnapshot {
  totalReplays: number;
  shapeReentryRate: number; // Coarse Shape (v3 Kickoff's recommended grain) -- fraction of replays sharing their shape with >=1 other
  singletonRate: number; // Coarse Shape singleton-group fraction
  replayDiversityShannonBits: number; // Shannon entropy over WrongWing distribution (see ReplayDiversityAnalysis.ts)
  clusterStabilityRate: number | null; // requires a multi-run measurement (expensive, ~10min) -- null here, with the last real measured value cited instead
  clusterStabilityCitedValue: number; // Solver v3 Kickoff STEP0's own real measured value (88.5%), cited not re-measured
  hardGapRate: number;
  coverageDistribution: CoverageEntry[];
}

// STEP5's own metric DEFINITIONS -- reusable by any future Sprint, not
// just computed once here.
export function computeShapeReentryRate(coarseShapeKeys: readonly string[]): number {
  const hist = histogramOf(coarseShapeKeys.map((k) => ({ k })), (x) => x.k);
  const multiMember = coarseShapeKeys.filter((k) => (hist.find((h) => h.bucketLabel === k)?.count ?? 0) >= 2).length;
  return coarseShapeKeys.length ? multiMember / coarseShapeKeys.length : 0;
}

export function computeSingletonRate(coarseShapeKeys: readonly string[]): number {
  const hist = histogramOf(coarseShapeKeys.map((k) => ({ k })), (x) => x.k);
  const singletonGroups = hist.filter((h) => h.count === 1).length;
  return hist.length ? singletonGroups / hist.length : 0;
}

export function computeHardGapRate(hardGapFlags: readonly boolean[]): number {
  return hardGapFlags.length ? hardGapFlags.filter(Boolean).length / hardGapFlags.length : 0;
}

export function computeDatasetMetrics(failuresDbPath: string, gapDeadlineMs: number): DatasetMetricsSnapshot {
  const all75 = loadAll75(failuresDbPath);
  const cubiesList = all75.map((s) => deserializeCube(s.cubeState));
  const coarseKeys = cubiesList.map((c) => computeCoarseShapeKey(c));

  const profiles = profileAllReplays(failuresDbPath, gapDeadlineMs);
  const hardGapFlags = profiles.map((p) => p.isHardGap);

  const wrongWingHist = histogramOf(profiles, (p) => String(p.wrongWingCount));
  const entropy = computeShannonEntropy(wrongWingHist);

  const baseCoverage: CoverageEntry[] = (["BASE", "FLIP", "CASE", "PARITY", "RECOVERY", "CYCLECHASE"] as const).map((name) => ({
    primitive: name,
    coverage: profiles.length ? profiles.filter((p) => p.succeeded[name]).length / profiles.length : 0,
    measuredThisSprint: true,
    source: "profileAllReplays() (solverV2Research/GapDetector.ts, 이번 Sprint에서 재실행, 저비용)",
  }));

  // BP-1~4는 이미 여러 Sprint에 걸쳐 다회 측정된 값이 존재 -- 재실행하지 않고 가장 최근 커밋된 실측치를 인용한다 (재실행은 STEP2 금지 사항인 '기존 Sprint 재실행'에 해당하지는 않지만, 불필요한 중복 계산을 피하기 위해 인용으로 대체).
  const citedBpCoverage: CoverageEntry[] = [
    { primitive: "BP-1 (Bounded Multi-Cycle Resolver)", coverage: 0.187, measuredThisSprint: false, source: "solverV3PrototypeBP5/data/prototype-report.txt 직전 실측 실행 기준 (run마다 18.7~32.0% 범위, 가장 최근 값 인용)" },
    { primitive: "BP-2 (Parity-Aware Cycle Breaker)", coverage: 0.093, measuredThisSprint: false, source: "solverV2PrototypeBP4/data/prototype-benchmark-report.txt" },
    { primitive: "BP-3 (Non-Parity Structural Fix)", coverage: 0.227, measuredThisSprint: false, source: "solverV2PrototypeBP4/data/prototype-benchmark-report.txt" },
    { primitive: "BP-4 (Precomputed Cycle-Shape Lookup)", coverage: 0.0, measuredThisSprint: false, source: "solverV2PrototypeBP4/data/prototype-benchmark-report.txt" },
  ];

  return {
    totalReplays: profiles.length,
    shapeReentryRate: computeShapeReentryRate(coarseKeys),
    singletonRate: computeSingletonRate(coarseKeys),
    replayDiversityShannonBits: entropy.bits,
    clusterStabilityRate: null,
    clusterStabilityCitedValue: 0.885,
    hardGapRate: computeHardGapRate(hardGapFlags),
    coverageDistribution: [...baseCoverage, ...citedBpCoverage],
  };
}
